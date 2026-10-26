const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, getDocs, collection, updateDoc } = require('firebase/firestore');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
let env, backend, base, output = '';
const identities = {};
const projectId = 'demo-pathway-security';
const seed = (table, id, data) => env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), table, id), data));
async function rows(table) {
  let result;
  await env.withSecurityRulesDisabled(async c => { result = (await getDocs(collection(c.firestore(), table))).docs.map(d => ({ id: d.id, ...d.data() })); });
  return result;
}
async function request(who, route, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}${route}`, { method, headers: { authorization: `Bearer ${identities[who]?.token || ''}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  return { status: response.status, data: text.startsWith('{') ? JSON.parse(text) : text };
}
const event = (id, requestId, expectedVersion, action, extra = {}, who = 'coordinator') => request(who, `/coordinator/workplace-support/${id}/events`, { requestId, expectedVersion, action, ...extra });
async function submit(key) {
  const r = await request('student', '/student/workplace-support', { requestId: key, description: 'SECRET_DESCRIPTION', immediateSafety: true });
  assert.ok([200, 201].includes(r.status)); return r.data.id;
}
before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Emulators required');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.clearFirestore();
  for (const [who, role] of Object.entries({ student: 'student', other: 'student', coordinator: 'coordinator', next: 'coordinator', admin: 'admin', cursorCoordinator: 'coordinator', cursorStudent: 'student' })) {
    const app = initializeApp({ projectId, apiKey: 'synthetic' }, `workflow-${who}-${Date.now()}`);
    const auth = getAuth(app); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const { user } = await createUserWithEmailAndPassword(auth, `${who}-${Date.now()}@workflow.invalid`, 'Synthetic!123');
    identities[who] = { app, uid: user.uid, token: await user.getIdToken(), profile: { role, accountApproved: true, department: 'D', sectionId: 'workflow-section', firstName: 'Fresh', lastName: who, companyName: 'Fresh Company', idNumber: 'SYNTH-123', email: 'PRIVATE_EMAIL', phone: 'PRIVATE_PHONE' } };
    await seed('users', user.uid, identities[who].profile);
  }
  await seed('sections', 'workflow-section', { department: 'D', coordinatorId: identities.coordinator.uid });
  backend = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), windowsHide: true, env: { ...process.env, GOOGLE_CLOUD_PROJECT: projectId, PATHWAY_LOCAL_WORKFLOW: '1', PORT: '3195', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stdout.on('data', c => output += c); backend.stderr.on('data', c => output += c);
  base = 'http://127.0.0.1:3195';
  for (let i = 0; i < 200; i++) { if (backend.exitCode !== null) throw Error(output); try { await fetch(`${base}/healthz`); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw Error(output);
});
after(async () => {
  backend?.kill(); await Promise.all(Object.values(identities).map(i => deleteApp(i.app))); await env?.cleanup();
  await Promise.all(require('firebase-admin/app').getApps().map(app => require('firebase-admin/app').deleteApp(app)));
});

test('workflow requires review, successful contact, action and reason; private event replay is idempotent and stale writes fail', async () => {
  const id = await submit('workflow');
  assert.equal((await event(id, 'early', 1, 'resolve', { reason: 'SECRET_REASON' })).status, 409);
  assert.equal((await event(id, 'ack', 1, 'acknowledge', { note: 'SECRET_NOTE' })).data.status, 'Under review');
  assert.equal((await event(id, 'stale', 1, 'contact', { contactOutcome: 'successful' })).status, 409);
  assert.equal((await event(id, 'unreachable', 2, 'contact', { contactOutcome: 'unreachable' })).data.status, 'Following up');
  assert.equal((await event(id, 'denied', 3, 'resolve', { reason: 'SECRET_REASON' })).status, 409);
  assert.equal((await event(id, 'contact', 3, 'contact', { contactOutcome: 'successful' })).data.version, 4);
  assert.equal((await event(id, 'act', 4, 'record_action', { note: 'SECRET_ACTION' })).data.version, 5);
  assert.equal((await event(id, 'no-reason', 5, 'resolve')).status, 400);
  const resolved = await event(id, 'resolve', 5, 'resolve', { reason: 'SECRET_REASON' });
  assert.deepEqual(resolved.data, { id, status: 'Resolved', version: 6 });
  assert.deepEqual((await event(id, 'resolve', 5, 'resolve', { reason: 'SECRET_REASON' })).data, resolved.data);
  assert.equal((await event(id, 'resolve', 5, 'resolve', { reason: 'changed' })).status, 409);
  assert.equal((await event(id, 'later', 6, 'acknowledge')).status, 409);
  const student = await request('student', `/student/workplace-support/${id}`);
  assert.equal(student.data.status, 'Resolved'); assert.ok(!JSON.stringify(student).includes('SECRET_NOTE'));
  const history = await request('coordinator', `/coordinator/workplace-support/${id}/events`);
  assert.equal(history.status, 200); assert.equal(history.data.records.length, 5);
  assert.ok(JSON.stringify(history).includes('SECRET_NOTE'));
});

test('concurrent identical events commit once and notice read is independent of acknowledgment', async () => {
  const id = await submit('concurrent');
  const results = await Promise.all([event(id, 'ack', 1, 'acknowledge'), event(id, 'ack', 1, 'acknowledge')]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  const notices = await request('coordinator', '/coordinator/workplace-support-notices');
  assert.equal(notices.status, 200);
  const notice = notices.data.records.find(n => n.reportId === id); assert.ok(notice);
  assert.ok(!notice.id.includes(id), 'notice IDs used as filtered-page cursors must not embed a revoked report ID');
  assert.equal((await request('coordinator', `/coordinator/workplace-support-notices/${notice.id}/read`, {})).status, 200);
  assert.equal((await request('coordinator', `/coordinator/workplace-support/${id}`)).data.version, 2);
  assert.equal((await rows(`workplaceSupportReports/${id}/events`)).length, 1);
  for (const table of ['workplaceSupportNotices', 'auditLogs']) {
    assert.ok(!/SECRET_|PRIVATE_|Fresh Company|SYNTH-123/.test(JSON.stringify(await rows(table))));
  }
  assert.ok(!/SECRET_|PRIVATE_/.test(output));
  assert.equal((await rows('notifications')).filter(n => n.type === 'workplace_support').length, 0);
});

test('fresh coordinator summaries expose only explicit display fields, never student private fields', async () => {
  const id = await submit('summary');
  await seed('users', identities.student.uid, { ...identities.student.profile, firstName: 'Updated', companyName: 'Updated Company' });
  const detail = (await request('coordinator', `/coordinator/workplace-support/${id}`)).data;
  assert.equal(detail.studentName, 'Updated student'); assert.equal(detail.companyName, 'Updated Company'); assert.equal(detail.idNumber, 'SYNTH-123');
  assert.ok(!/PRIVATE_/.test(JSON.stringify(detail)));
  const list = (await request('coordinator', '/coordinator/workplace-support')).data.records.find(r => r.id === id);
  assert.equal(list.studentName, 'Updated student');
  assert.equal((await request('student', `/student/workplace-support/${id}`)).data.studentName, undefined);
  await seed('users', identities.student.uid, identities.student.profile);
});

test('direct support notice access is denied even for historical recipient and admin; clients cannot reassign', async () => {
  const id = await submit('rules');
  for (const who of ['student', 'coordinator', 'admin']) {
    const db = env.authenticatedContext(identities[who].uid).firestore();
    await assertFails(getDocs(collection(db, 'workplaceSupportNotices')));
    await assertFails(getDoc(doc(db, 'workplaceSupportReports', id, 'events', 'ack')));
    await assertFails(updateDoc(doc(db, 'users', identities.student.uid), { sectionId: 'another', department: 'Other' }));
  }
  for (const who of ['other', 'admin']) {
    assert.equal((await event(id, 'denied', 1, 'acknowledge', {}, who)).status, 403);
    assert.equal((await request(who, `/coordinator/workplace-support/${id}/events`)).status, 403);
  }
});

test('bounded reconciliation transfers across departments once; old sessions immediately lose all historical notice/event access', async () => {
  const id = await submit('transfer');
  const oldPage = await request('coordinator', '/coordinator/workplace-support-notices');
  assert.equal(oldPage.status, 200);
  const old = oldPage.data.records.find(n => n.reportId === id);
  assert.ok(old);
  try {
    await seed('users', identities.student.uid, { ...identities.student.profile, department: 'Other', sectionId: 'new-section' });
    await seed('users', identities.next.uid, { ...identities.next.profile, department: 'Other' });
    await seed('sections', 'new-section', { department: 'Other', coordinatorId: identities.next.uid });
    assert.equal((await request('coordinator', `/coordinator/workplace-support/${id}`)).status, 403);
    assert.equal((await event(id, 'old-session', 1, 'acknowledge')).status, 403);
    assert.equal((await request('coordinator', `/coordinator/workplace-support/${id}/events`)).status, 403);
    assert.equal((await request('coordinator', `/coordinator/workplace-support-notices/${old.id}/read`, {})).status, 403);
    const revokedPage = await request('coordinator', '/coordinator/workplace-support-notices');
    assert.equal(revokedPage.status, 200);
    assert.ok(!revokedPage.data.records.some(n => n.reportId === id));
    // Invoke the real bounded worker with real emulator transactions, without opening a coordinator page.
    const db = require('firebase-admin/firestore').getFirestore(require('../firebaseAdmin'));
    const { reconcileSupport } = require('../workplaceSupportNotifications');
    const audit = (tx, row) => tx.create(db.collection('auditLogs').doc(), row);
    await Promise.all([reconcileSupport({ db, audit, limit: 2 }), reconcileSupport({ db, audit, limit: 2 })]);
    for (let i = 0; i < 8; i++) await reconcileSupport({ db, audit, limit: 2 });
    const noticePage = await request('next', '/coordinator/workplace-support-notices');
    assert.equal(noticePage.status, 200);
    const incoming = noticePage.data.records.filter(n => n.reportId === id);
    assert.equal(incoming.length, 1);
    assert.equal((await request('next', `/coordinator/workplace-support/${id}`)).status, 200);
    const transfers = (await rows('auditLogs')).filter(r => r.action === 'workplace_support.transferred' && r.targetId === id);
    assert.equal(transfers.length, 1);
    await env.withSecurityRulesDisabled(c => require('firebase/firestore').deleteDoc(doc(c.firestore(), 'sections', 'new-section')));
    assert.equal((await request('next', `/coordinator/workplace-support-notices/${incoming[0].id}/read`, {})).status, 403);
    assert.equal((await request('next', `/coordinator/workplace-support/${id}`)).status, 403);
    for (let i = 0; i < 12; i++) await reconcileSupport({ db, audit, limit: 2 });
    assert.equal((await rows('auditLogs')).filter(r => r.action === 'workplace_support.transferred' && r.targetId === id).length, 2, 'missing assignment must audit once, not every sweep');
  } finally {
    await seed('users', identities.student.uid, identities.student.profile);
    await seed('users', identities.next.uid, identities.next.profile);
  }
});

test('report and generic notice roll back together on commit failure; retries and lost responses never duplicate either', async t => {
  const db = require('firebase-admin/firestore').getFirestore(require('../firebaseAdmin'));
  const app = require('express')(); app.use(require('express').json());
  let broken = true;
  const logged = []; t.mock.method(console, 'error', (...args) => logged.push(args));
  const authenticate = (req, _res, next) => { req.user = { uid: identities.student.uid, role: 'student', data: identities.student.profile }; next(); };
  require('../workplaceSupport').installWorkplaceSupport({ app, db, requireUser: authenticate, requireStaff: authenticate, allowRate: () => true,
    audit: () => { if (broken) throw Error('SECRET_NOTE provider/asset/reference'); },
  });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r));
  try {
    const send = () => fetch(`http://127.0.0.1:${server.address().port}/student/workplace-support`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: 'atomic-failure', description: 'SECRET_DESCRIPTION', immediateSafety: false }) });
    const beforeReports = (await rows('workplaceSupportReports')).length;
    const beforeNotices = (await rows('workplaceSupportNotices')).length;
    assert.equal((await send()).status, 500);
    assert.equal((await rows('workplaceSupportReports')).length, beforeReports);
    assert.equal((await rows('workplaceSupportNotices')).length, beforeNotices);
    broken = false;
    assert.equal((await send()).status, 201); assert.equal((await send()).status, 200);
    assert.equal((await rows('workplaceSupportReports')).length, beforeReports + 1);
    assert.equal((await rows('workplaceSupportNotices')).length, beforeNotices + 1);
    assert.deepEqual(logged, [['Workplace support request failed', { operation: 'student.create', code: 'internal' }]]);
  } finally { await new Promise(r => server.close(r)); }
});

test('periodic reconciliation handles console-style assignment bypass without opening a support page', async () => {
  const id = await submit('periodic');
  // Earlier small-page scans can leave the cursor beyond this newly inserted ID.
  await seed('workplaceSupportMaintenance', 'reconciliation', { cursor: null });
  try {
    await seed('sections', 'workflow-section', { department: 'D', coordinatorId: identities.next.uid });
    const deadline = Date.now() + 70000;
    let notice;
    while (Date.now() < deadline) {
      notice = (await rows('workplaceSupportNotices')).find(n => n.reportId === id && n.recipientId === identities.next.uid);
      if (notice) break;
      await new Promise(r => setTimeout(r, 500));
    }
    assert.ok(notice, 'server periodic worker must deliver independently of page opens');
    const transfers = (await rows('auditLogs')).filter(r => r.targetId === id && r.action === 'workplace_support.transferred');
    assert.equal(transfers.length, 1);
  } finally { await seed('sections', 'workflow-section', { department: 'D', coordinatorId: identities.coordinator.uid }); }
});

test('assignment writer commits a bounded reconciliation queue marker and the worker consumes it', async () => {
  await seed('users', identities.other.uid, { ...identities.other.profile, sectionId: '' });
  await seed('sections', 'workflow-section', { department: 'D', coordinatorId: identities.coordinator.uid, hoursRequired: 486 });
  const assigned = await request('coordinator', '/coordinator/assign-student', { studentId: identities.other.uid, sectionId: 'workflow-section' });
  assert.equal(assigned.status, 200);
  const marker = (await rows('workplaceSupportAssignmentQueue')).find(r => r.id === identities.other.uid);
  assert.ok(marker);
  const db = require('firebase-admin/firestore').getFirestore(require('../firebaseAdmin'));
  await require('../workplaceSupportNotifications').reconcileSupport({ db, audit: () => {}, queued: true, limit: 2 });
  assert.ok(!(await rows('workplaceSupportAssignmentQueue')).some(r => r.id === identities.other.uid));
});

test('filtered notice continuation encrypts denied boundaries, rejects other scopes/tampering and loses no visible records', async t => {
  await seed('sections', 'cursor-section', { department: 'D', coordinatorId: identities.cursorCoordinator.uid });
  await seed('users', identities.cursorStudent.uid, { ...identities.cursorStudent.profile, sectionId: 'cursor-section' });
  await seed('workplaceSupportReports', 'denied-cursor-report', { studentId: identities.student.uid, status: 'Submitted', version: 1 });
  await seed('workplaceSupportReports', 'visible-cursor-report', { studentId: identities.cursorStudent.uid, status: 'Submitted', version: 1 });
  const deniedIds = Array.from({ length: 26 }, (_, i) => `denied-notice-${String(i).padStart(2, '0')}`);
  const visibleIds = ['visible-notice-00', 'visible-notice-01', 'visible-notice-02'];
  for (const id of [...deniedIds, ...visibleIds]) await seed('workplaceSupportNotices', id, {
    recipientId: identities.cursorCoordinator.uid, reportId: id.startsWith('denied') ? 'denied-cursor-report' : 'visible-cursor-report',
    type: 'workplace_support', title: 'Workplace support update', priority: 'normal', read: false, createdAt: '2026-01-01T00:00:00Z',
  });
  const prefix = '/coordinator/workplace-support-notices';
  const first = await request('cursorCoordinator', prefix);
  assert.equal(first.status, 200); assert.deepEqual(first.data.records, []); assert.equal(first.data.hasMore, true); assert.ok(first.data.cursor);
  const cursor = first.data.cursor;
  await t.test('neither cursor nor raw base64 bytes exposes a denied notice/report identifier', () => {
    const decoded = Buffer.from(cursor, 'base64url');
    for (const secret of [...deniedIds, 'denied-cursor-report']) {
      assert.ok(!cursor.includes(secret), 'cursor exposes a denied identifier');
      assert.ok(!decoded.includes(Buffer.from(secret)), 'base64 decoding exposes a denied identifier');
    }
  });
  await t.test('cursor cannot be reused by another user/list or modified', async () => {
    const route = `${prefix}?cursor=${encodeURIComponent(cursor)}`;
    assert.equal((await request('coordinator', route)).status, 400);
    assert.equal((await request('cursorCoordinator', `/coordinator/workplace-support?cursor=${encodeURIComponent(cursor)}`)).status, 400);
    const tampered = `${cursor[0] === 'A' ? 'B' : 'A'}${cursor.slice(1)}`;
    assert.equal((await request('cursorCoordinator', `${prefix}?cursor=${encodeURIComponent(tampered)}`)).status, 400);
  });
  await t.test('authorized continuation passes denied candidates without loss or duplicates', async () => {
    const next = await request('cursorCoordinator', `${prefix}?cursor=${encodeURIComponent(cursor)}`);
    assert.equal(next.status, 200); assert.deepEqual(next.data.records.map(n => n.id), visibleIds);
    assert.equal(next.data.hasMore, false); assert.equal(next.data.cursor, null);
  });
});

test('private event continuation is opaque and scoped to the user, list and report', async () => {
  for (const id of ['cursor-history-one', 'cursor-history-two']) await seed('workplaceSupportReports', id, { studentId: identities.cursorStudent.uid, status: 'Following up', version: 28 });
  for (let version = 1; version <= 27; version++) await seed('workplaceSupportReports/cursor-history-one/events', `event-${version}`, {
    action: 'contact', version, actorId: identities.cursorCoordinator.uid, createdAt: '2026-01-01T00:00:00Z', note: 'PRIVATE_CURSOR_NOTE', contactOutcome: 'successful', reason: null,
  });
  const prefix = '/coordinator/workplace-support/cursor-history-one/events';
  const first = await request('cursorCoordinator', prefix);
  assert.equal(first.status, 200); assert.equal(first.data.records.length, 25); assert.equal(first.data.hasMore, true);
  const cursor = first.data.cursor;
  assert.ok(cursor && !/^\d+$/.test(cursor), 'event continuation exposes the plaintext version');
  assert.ok(!Buffer.from(cursor, 'base64url').includes(Buffer.from('PRIVATE_CURSOR_NOTE')));
  assert.equal((await request('coordinator', `${prefix}?cursor=${encodeURIComponent(cursor)}`)).status, 400);
  assert.equal((await request('cursorCoordinator', `/coordinator/workplace-support/cursor-history-two/events?cursor=${encodeURIComponent(cursor)}`)).status, 400);
  assert.equal((await request('cursorCoordinator', `/coordinator/workplace-support-notices?cursor=${encodeURIComponent(cursor)}`)).status, 400);
  const tampered = `${cursor[0] === 'A' ? 'B' : 'A'}${cursor.slice(1)}`;
  assert.equal((await request('cursorCoordinator', `${prefix}?cursor=${encodeURIComponent(tampered)}`)).status, 400);
  const next = await request('cursorCoordinator', `${prefix}?cursor=${encodeURIComponent(cursor)}`);
  assert.equal(next.status, 200); assert.deepEqual(next.data.records.map(e => e.version), [26, 27]);
  assert.equal(next.data.hasMore, false); assert.equal(next.data.cursor, null);
});
