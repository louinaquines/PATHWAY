const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = require('firebase/auth');
const { doc, setDoc, getDoc, getDocs, collection, updateDoc, deleteDoc } = require('firebase/firestore');
const express = require('express');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { installWorkplaceSupport } = require('../workplaceSupport');

const projectId = 'demo-pathway-security';
const identities = {};
let env, backend, base, output = '';
async function seed(collection, id, data) {
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), collection, id), data));
}
async function request(who, route = '', body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}${route}`, {
    method, headers: { Authorization: `Bearer ${identities[who]?.token || ''}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, data: text.startsWith('{') ? JSON.parse(text) : text };
}
const submit = (who, body) => request(who, '/student/workplace-support', body);
const payload = requestId => ({ requestId, description: '  Kailangan ko ng tulong 日本語  ', immediateSafety: false });

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST, 'Emulators required; never run against production');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  await env.clearFirestore();
  for (const [name, role] of Object.entries({ student: 'student', other: 'student', cleared: 'student', locked: 'student', stale: 'student', missing: 'student', coordinator: 'coordinator', former: 'coordinator', admin: 'admin', supervisor: 'supervisor' })) {
    const app = initializeApp({ apiKey: 'synthetic-emulator', projectId }, `support-${name}-${Date.now()}`);
    const auth = getAuth(app);
    connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
    const { user } = await createUserWithEmailAndPassword(auth, `${name}-${Date.now()}@support.invalid`, 'Synthetic!123');
    identities[name] = { app, uid: user.uid, token: await user.getIdToken(), profile: { role, accountApproved: true, department: 'D', sectionId: name === 'missing' ? 'absent' : 'support-section', firstName: name, lastName: 'Synthetic', ...(name === 'cleared' ? { clearanceStatus: 'cleared' } : {}), ...(name === 'locked' ? { passwordChangeRequired: true } : {}), ...(name === 'stale' ? { passwordEpoch: 'new' } : {}) } };
    await seed('users', user.uid, identities[name].profile);
  }
  await seed('sections', 'support-section', { department: 'D', coordinatorId: identities.coordinator.uid });
  backend = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), windowsHide: true, env: { ...process.env, GOOGLE_CLOUD_PROJECT: projectId, PATHWAY_LOCAL_WORKFLOW: '1', PORT: '3197', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  backend.stdout.on('data', c => { output += c; }); backend.stderr.on('data', c => { output += c; });
  base = 'http://127.0.0.1:3197';
  for (let i = 0; i < 200; i++) {
    if (backend.exitCode !== null) throw new Error(output);
    try { await fetch(`${base}/healthz`); return; } catch { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error(output);
});
after(async () => { backend?.kill(); await Promise.all(Object.values(identities).map(i => deleteApp(i.app))); await env?.cleanup(); });

test('validates description, Philippine calendar dates, safety flag and unsupported attachments without writing', async () => {
  for (const change of [{ description: '' }, { description: ' '.repeat(10) }, { description: 'x'.repeat(8001) }, { incidentDate: '2026-02-30' }, { incidentDate: '9999-01-01' }, { incidentDate: 'not-a-date' }, { immediateSafety: 'yes' }, { attachmentIntentId: '' }]) {
    assert.equal((await submit('student', { ...payload('invalid'), ...change })).status, 400);
  }
  await env.withSecurityRulesDisabled(async c => assert.equal((await getDocs(collection(c.firestore(), 'workplaceSupportReports'))).size, 0));
});
test('no-placement and cleared students can submit; missing recipient and password safeguards are independent', async () => {
  for (const who of ['student', 'cleared']) {
    const result = await submit(who, { ...payload(`eligible-${who}`), incidentDate: '2024-02-29' });
    assert.equal(result.status, 201); assert.equal(result.data.status, 'Submitted');
  }
  for (const who of ['locked', 'stale', 'admin', 'supervisor', 'coordinator']) assert.equal((await submit(who, payload('denied'))).status, 403);
  const context = await request('missing', '/student/workplace-support/context');
  assert.equal(context.data.available, false);
  assert.equal((await submit('missing', payload('missing'))).status, 409);
  const available = await request('student', '/student/workplace-support/context');
  assert.deepEqual(available.data, { available: true, coordinator: { name: 'coordinator Synthetic' } });
});
test('concurrent identical retries create one immutable report, conflict rejects, projections omit private data', async () => {
  const results = await Promise.all([submit('student', payload('retry')), submit('student', payload('retry'))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 201]);
  const id = results[0].data.id; assert.equal(id, results[1].data.id);
  await env.withSecurityRulesDisabled(async c => {
    const audits = (await getDocs(collection(c.firestore(), 'auditLogs'))).docs.filter(d => d.data().targetId === id);
    assert.equal(audits.length, 1); assert.ok(!JSON.stringify(audits[0].data()).includes('Kailangan'));
    assert.equal((await getDocs(collection(c.firestore(), 'notifications'))).size, 0);
  });
  assert.equal((await submit('student', { ...payload('retry'), description: 'changed' })).status, 409);
  const detail = await request('student', `/student/workplace-support/${id}`);
  assert.equal(detail.data.description, 'Kailangan ko ng tulong 日本語');
  await env.withSecurityRulesDisabled(async c => {
    const ref = doc(c.firestore(), 'workplaceSupportReports', id);
    await updateDoc(ref, { privateNote: 'secret', recipientId: 'historical', internal: 'secret' });
    await setDoc(doc(c.firestore(), 'workplaceSupportReports', id, 'events', 'private'), { note: 'secret' });
  });
  for (const who of ['student', 'coordinator']) {
    const read = await request(who, `/${who === 'student' ? 'student' : 'coordinator'}/workplace-support/${id}`);
    assert.equal(read.status, 200); assert.ok(!JSON.stringify(read.data).includes('secret')); assert.equal(read.data.recipientId, undefined);
  }
  for (const who of ['other', 'admin', 'supervisor']) assert.equal((await request(who, `/student/workplace-support/${id}`)).status, 403);
  assert.equal((await request('former', `/coordinator/workplace-support/${id}`)).status, 403);
  for (const who of ['student', 'other', 'coordinator', 'former', 'admin', 'locked']) {
    const store = env.authenticatedContext(identities[who].uid).firestore();
    const ref = doc(store, 'workplaceSupportReports', id);
    await assertFails(setDoc(ref, { description: 'overwrite' }));
    await assertFails(setDoc(doc(store, 'workplaceSupportReports', `forged-${who}`), { studentId: identities[who].uid }));
    await assertFails(setDoc(doc(store, 'workplaceSupportReports', id, 'events', 'forged'), { note: 'forged' }));
    await assertFails(deleteDoc(ref));
    await assertFails(getDoc(doc(store, 'workplaceSupportReports', id, 'events', 'private')));
    // All report reads use projected backend responses, never raw private fields.
    await assertFails(getDoc(ref));
  }
  assert.equal((await request('student', `/student/workplace-support/${id}`, { description: 'edit' }, 'PATCH')).status, 404);
});
test('historical department never prevents a newly assigned coordinator from listing the report', async () => {
  try {
    await seed('users', identities.student.uid, { ...identities.student.profile, department: 'Transferred', sectionId: 'transferred' });
    await seed('users', identities.former.uid, { ...identities.former.profile, department: 'Transferred' });
    await seed('sections', 'transferred', { department: 'Transferred', coordinatorId: identities.former.uid });
    const page = await request('former', '/coordinator/workplace-support');
    assert.equal(page.status, 200); assert.ok(page.data.records.length > 0);
    assert.equal((await request('coordinator', `/coordinator/workplace-support/${page.data.records[0].id}`)).status, 403);
  } finally {
    await seed('users', identities.student.uid, identities.student.profile);
    await seed('users', identities.former.uid, identities.former.profile);
  }
});
test('coordinator listing sorts priority then newest, paginates, and immediately follows current assignment', async () => {
  await submit('student', { ...payload('urgent'), immediateSafety: true });
  const first = await request('coordinator', '/coordinator/workplace-support?limit=1');
  assert.equal(first.status, 200); assert.equal(first.data.records.length, 1); assert.equal(first.data.records[0].priority, 'high'); assert.equal(first.data.hasMore, true);
  const next = await request('coordinator', `/coordinator/workplace-support?limit=1&cursor=${first.data.cursor}`);
  assert.equal(next.status, 200); assert.notEqual(next.data.records[0].id, first.data.records[0].id);
  assert.equal((await request('other', `/student/workplace-support?cursor=${first.data.cursor}`)).status, 400);
  await seed('sections', 'support-section', { department: 'D', coordinatorId: identities.former.uid });
  assert.equal((await request('coordinator', `/coordinator/workplace-support/${first.data.records[0].id}`)).status, 403);
  assert.equal((await request('former', `/coordinator/workplace-support/${first.data.records[0].id}`)).status, 200);
  assert.deepEqual((await request('coordinator', '/coordinator/workplace-support')).data.records, []);
  assert.equal((await request('admin', '/coordinator/workplace-support')).status, 403);
  await seed('sections', 'support-section', { department: 'D', coordinatorId: identities.coordinator.uid });
});
test('read routes preserve authentication and password locks; valid trimmed boundaries and Philippine today are accepted', async () => {
  for (const who of ['locked', 'stale', 'admin', 'supervisor']) {
    for (const route of ['/student/workplace-support/context', '/student/workplace-support', '/student/workplace-support/unknown']) {
      assert.equal((await request(who, route)).status, 403);
    }
  }
  assert.equal((await request('anonymous', '/student/workplace-support')).status, 401);
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const length of [1, 8000]) {
    const result = await submit('other', { ...payload(`boundary-${length}`), description: `  ${'x'.repeat(length)}  `, incidentDate: today });
    assert.equal(result.status, 201);
    const detail = await request('other', `/student/workplace-support/${result.data.id}`);
    assert.equal(detail.data.description.length, length); assert.equal(detail.data.incidentDate, today);
  }
  const list = await request('student', '/student/workplace-support?limit=1');
  assert.equal(list.data.records.length, 1); assert.equal(list.data.records[0].description, undefined);
  assert.equal((await request('student', '/student/workplace-support?limit=0')).status, 400);
});

// Keep authentication and database operations real; instrument only the installer boundary.
async function supportHarness(who, { race, broken = false } = {}) {
  const adminApp = require('../firebaseAdmin');
  const db = getFirestore(adminApp);
  const reads = { queries: [], points: 0 };
  const observedDb = {
    collection: db.collection.bind(db),
    runTransaction: handler => {
      if (broken) throw new Error('SENSITIVE synthetic description / student-id / private-note');
      return db.runTransaction(tx => handler(new Proxy(tx, {
        get(target, key) {
          if (key === 'get') return async reference => {
            const result = await target.get(reference);
            if (result.docs) reads.queries.push(result.size); else reads.points++;
            return result;
          };
          const value = target[key];
          return typeof value === 'function' ? value.bind(target) : value;
        },
      })));
    },
  };
  const app = express(); app.use(express.json());
  const authenticate = async (req, res, next) => {
    try {
      const decoded = await getAdminAuth(adminApp).verifyIdToken(req.headers.authorization.slice(7), true);
      const data = (await db.collection('users').doc(decoded.uid).get()).data();
      req.user = { uid: decoded.uid, role: data.role, data }; req.staff = req.user;
      if (race) await db.collection('users').doc(decoded.uid).update(race);
      next();
    } catch { res.sendStatus(401); }
  };
  installWorkplaceSupport({ app, db: observedDb, requireUser: authenticate, requireStaff: authenticate, allowRate: () => true, audit: () => {} });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  return {
    reads, db,
    async get(route, identity = who) {
      reads.queries.length = 0; reads.points = 0;
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { headers: { authorization: `Bearer ${identities[identity].token}` } });
      return { status: response.status, data: await response.json() };
    },
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

for (const [name, race] of Object.entries({ password_replacement: { passwordChangeRequired: true }, password_epoch: { passwordEpoch: 'reset-after-middleware' } })) {
  test(`fresh ${name} denies context, list and detail after successful middleware authentication`, async () => {
    const harness = await supportHarness('student', { race });
    try {
      await seed('workplaceSupportReports', 'race-report', { studentId: identities.student.uid, priority: 'normal', createdAt: '2024-01-01T00:00:00.000Z', description: 'private', status: 'Submitted' });
      const results = [];
      for (const route of ['/student/workplace-support/context', '/student/workplace-support', '/student/workplace-support/race-report']) {
        await seed('users', identities.student.uid, identities.student.profile);
        results.push(await harness.get(route));
      }
      assert.deepEqual(results.map(r => r.status), [403, 403, 403]);
      assert.ok(results.every(r => !JSON.stringify(r.data).includes('private')));
    } finally { await seed('users', identities.student.uid, identities.student.profile); await harness.close(); }
  });
}

test('limit=1 bounds real database reads as history grows and continuation skips denied candidates without losing reports', async () => {
  const harness = await supportHarness('coordinator');
  const report = (studentId, priority, createdAt) => ({ studentId, priority, createdAt, description: 'private', status: 'Submitted', version: 1 });
  const costs = [];
  const bounded = () => {
    assert.equal(harness.reads.queries.length, 1);
    assert.ok(harness.reads.queries[0] <= 26, `unbounded query result sizes: ${harness.reads.queries}`);
    assert.ok(harness.reads.points <= 76, `unbounded point reads: ${harness.reads.points}`);
    costs.push({ documents: harness.reads.queries[0], points: harness.reads.points });
  };
  try {
    await seed('users', 'scan-student', { role: 'student', department: 'Scan', sectionId: 'scan-section' });
    await seed('users', identities.coordinator.uid, { ...identities.coordinator.profile, department: 'Scan' });
    await seed('sections', 'scan-section', { department: 'Scan', coordinatorId: identities.coordinator.uid });
    const batch = harness.db.batch();
    for (let i = 0; i < 80; i++) batch.set(harness.db.collection('users').doc(`scan-roster-${i}`), { role: 'student', department: 'Scan', sectionId: 'scan-section' });
    for (let i = 0; i < 120; i++) batch.set(harness.db.collection('workplaceSupportReports').doc(`scan-denied-${String(i).padStart(3, '0')}`), report(identities.student.uid, 'high', '2030-01-01T00:00:00.000Z'));
    batch.set(harness.db.collection('workplaceSupportReports').doc('scan-visible-high'), report('scan-student', 'high', '2029-01-01T00:00:00.000Z'));
    batch.set(harness.db.collection('workplaceSupportReports').doc('scan-visible-new'), report('scan-student', 'normal', '2028-01-01T00:00:00.000Z'));
    batch.set(harness.db.collection('workplaceSupportReports').doc('scan-visible-old'), report('scan-student', 'normal', '2027-01-01T00:00:00.000Z'));
    await batch.commit();
    let result = await harness.get('/coordinator/workplace-support?limit=1');
    assert.equal(result.status, 200);
    bounded();
    assert.deepEqual(result.data.records, []); assert.equal(result.data.hasMore, true); assert.ok(result.data.cursor);
    const firstCursor = result.data.cursor;
    const extra = harness.db.batch();
    for (let i = 0; i < 160; i++) extra.set(harness.db.collection('workplaceSupportReports').doc(`scan-extra-${i}`), report(identities.student.uid, 'normal', '2020-01-01T00:00:00.000Z'));
    await extra.commit();
    result = await harness.get('/coordinator/workplace-support?limit=1');
    bounded();
    const found = [];
    for (let page = 0; page < 40; page++) {
      found.push(...result.data.records.map(r => r.id));
      if (!result.data.hasMore) break;
      const previous = result.data.cursor;
      result = await harness.get(`/coordinator/workplace-support?limit=1&cursor=${previous}`);
      assert.equal(result.status, 200); bounded();
      if (result.data.hasMore) assert.notEqual(result.data.cursor, previous);
    }
    assert.equal(result.data.hasMore, false);
    assert.deepEqual(found, ['scan-visible-high', 'scan-visible-new', 'scan-visible-old']);
    console.log('Support pagination read evidence:', { pages: costs.length, maxQueryDocuments: Math.max(...costs.map(c => c.documents)), maxPointReads: Math.max(...costs.map(c => c.points)) });
    assert.equal((await harness.get(`/coordinator/workplace-support?cursor=${firstCursor}`, 'former')).status, 400);
    assert.equal((await harness.get(`/coordinator/workplace-support?cursor=${firstCursor.slice(0, -3)}abc`)).status, 400);
    const owner = await supportHarness('student');
    try {
      const page = await owner.get('/student/workplace-support?limit=1');
      assert.equal(page.status, 200); assert.equal(page.data.records.length, 1);
      assert.equal(owner.reads.queries.length, 1); assert.ok(owner.reads.queries[0] <= 2); assert.equal(owner.reads.points, 1);
      const next = await owner.get(`/student/workplace-support?limit=1&cursor=${page.data.cursor}`);
      assert.equal(next.status, 200); assert.notEqual(next.data.records[0].id, page.data.records[0].id);
      assert.equal(owner.reads.queries.length, 1); assert.ok(owner.reads.queries[0] <= 2); assert.equal(owner.reads.points, 1);
    } finally { await owner.close(); }
  } finally { await seed('users', identities.coordinator.uid, identities.coordinator.profile); await harness.close(); }
});

test('unrelated disabled students do not abort coordinator listing or pagination', async () => {
  const harness = await supportHarness('coordinator');
  try {
    await seed('users', 'disabled-candidate', { role: 'student', disabled: true, department: 'Other', sectionId: 'Other' });
    await seed('workplaceSupportReports', 'disabled-first', { studentId: 'disabled-candidate', priority: 'high', createdAt: '2099-01-01', status: 'Submitted' });
    const page = await harness.get('/coordinator/workplace-support?limit=1');
    assert.equal(page.status, 200); assert.ok(Array.isArray(page.data.records));
    assert.ok(!page.data.records.some(item => item.id === 'disabled-first'));
  } finally { await harness.db.doc('workplaceSupportReports/disabled-first').delete(); await harness.db.doc('users/disabled-candidate').delete(); await harness.close(); }
});

test('unexpected errors log only fixed diagnostic metadata, never exception content or identifiers', async t => {
  const entries = [];
  t.mock.method(console, 'error', (...args) => entries.push(args));
  const harness = await supportHarness('student', { broken: true });
  try {
    const result = await harness.get('/student/workplace-support');
    assert.equal(result.status, 500); assert.equal(entries.length, 1);
    assert.deepEqual(entries[0], ['Workplace support request failed', { operation: 'student.list', code: 'internal' }]);
    assert.ok(!JSON.stringify(result).includes('SENSITIVE'));
  } finally { await harness.close(); }
});
