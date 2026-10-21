const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { installAttendanceRiskAlerts } = require('../attendanceRiskAlerts');
let admin, db, env, server, origin, worker, failAudit = false;
const due = new Date('2026-10-20T16:15:00Z');
const schedule = { startDate: '2026-09-21', deadline: '2027-06-30', workingDays: [1,2,3,4,5], startTime: '08:00', exceptions: [] };
const coordinator = { role: 'coordinator', department: 'IT', accountApproved: true };
function install(database = db) {
  const app = express(); app.use(express.json());
  const result = installAttendanceRiskAlerts({ app, db: database, clock: () => due,
    requireStaff(req, res, next) { req.staff = { uid: req.headers.actor || 'risk-c', role: 'coordinator' }; next(); }, allowRate: () => true,
    audit(tx, event) { if (failAudit) throw new Error('Synthetic failure with private data'); tx.set(db.collection('auditLogs').doc(), event); } });
  return { app, ...result };
}
before(async () => {
  process.env.PATHWAY_LOCAL_WORKFLOW = '1';
  env = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host: '127.0.0.1', port: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = initializeApp({ projectId: 'demo-pathway-security' }, 'risk-tests'); db = getFirestore(admin);
  worker = install(); server = worker.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (env) await env.cleanup(); if (admin) await deleteApp(admin); });
async function reset(tier = 'Medium') {
  // Other suites have ended; isolate this suite's scan without deleting their fixtures.
  const users = await db.collection('users').where('role', '==', 'student').get();
  for (const item of users.docs) await item.ref.update({ role: 'risk-test-inactive' });
  for (const name of ['attendanceRiskStates','attendanceRiskNotices','attendanceRiskWorker']) await db.recursiveDelete(db.collection(name));
  await db.doc('users/risk-c').set(coordinator); await db.doc('users/risk-new').set(coordinator);
  await db.doc('users/risk-admin').set({ ...coordinator, role: 'admin' });
  await db.doc('sections/risk-s').set({ department: 'IT', coordinatorId: 'risk-c', hoursRequired: 500, attendanceSchedule: schedule });
  await db.doc('users/risk-student').set({ role: 'student', department: 'IT', sectionId: 'risk-s', hoursRendered: 200, hoursRequired: 500, privateName: 'NEVER EXPOSE' });
  await db.recursiveDelete(db.collection('users/risk-student/attendance'));
  await records(tier);
}
async function records(tier) {
  const dates = [];
  for (let ms = Date.parse('2026-09-21T00:00Z'); ms < Date.parse('2026-10-21T00:00Z'); ms += 86400000) if ([1,2,3,4,5].includes(new Date(ms).getUTCDay())) dates.push(new Date(ms).toISOString().slice(0,10));
  const missing = tier === 'Medium' ? new Set(['2026-09-24','2026-10-01','2026-10-08']) : tier === 'High' ? new Set(['2026-09-24','2026-10-01','2026-10-08','2026-10-15','2026-10-16']) : new Set();
  await db.recursiveDelete(db.collection('users/risk-student/attendance'));
  for (const date of dates) if (!missing.has(date)) await db.doc(`users/risk-student/attendance/${date}`).set({ date, timeIn: `${date}T08:00:00+08:00`, timeOut: `${date}T17:00:00+08:00`, hoursToday: 8, location: 'SECRET' });
}
async function tick(instance = worker, now = due, batchSize = 25) { return instance.evaluateDueAttendanceRisk({ now, batchSize }); }
async function notices() { return (await db.collection('attendanceRiskNotices').get()).docs.map(d => ({ id: d.id, ...d.data() })); }
async function request(url = '', actor = 'risk-c', method = 'GET', body) {
  const response = await fetch(`${origin}/coordinator/attendance-risk-notices${url}`, { method, headers: { actor, 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
test('deadline excludes today and uses previous context before 00:15 Manila', () => {
  const { latestDueContext } = require('../attendanceRiskAlerts');
  assert.equal(latestDueContext(new Date('2026-10-20T16:14:59Z')), '2026-10-20');
  assert.equal(latestDueContext(new Date('2026-10-20T16:15:00Z')), '2026-10-21');
});
test('first risk is private and retries/concurrent workers deduplicate; read does not resolve', async () => {
  await reset(); await Promise.all([tick(), tick(install())]); await tick();
  const saved = await notices(); assert.equal(saved.length, 1); assert.equal(saved[0].kind, 'opened'); assert.equal(saved[0].riskTier, 'Medium');
  const page = await request(); assert.equal(page.status, 200); assert.equal(page.body.records.length, 1);
  assert.equal(JSON.stringify(page.body).includes('NEVER EXPOSE'), false); assert.equal(JSON.stringify(page.body).includes('SECRET'), false);
  assert.equal((await request(`/${saved[0].id}/read`, 'risk-c', 'POST', {})).status, 200);
  assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().open, true);
  assert.equal((await request(`/${saved[0].id}/read`, 'risk-c', 'POST', { riskTier: 'Low' })).status, 400);
});
test('High to Medium to High is a distinct escalation; uncertain completed cannot recover', async () => {
  await reset('High'); await tick(); await records('Medium'); await tick(); await records('High'); await tick(); await tick();
  assert.deepEqual((await notices()).map(n => n.kind).sort(), ['escalated','opened']);
  await records('Low'); await db.doc('users/risk-student').update({ hoursRendered: 500 });
  await db.doc('users/risk-student/attendance/2026-10-20').update({ timeOut: null }); await tick();
  assert.equal((await notices()).length, 2); assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().open, true);
  await records('Low'); await tick(); await tick();
  assert.equal((await notices()).filter(n => n.kind === 'recovered').length, 1);
});
test('first reliable Low and Completed are silent; unavailable and overflow retain open episode', async () => {
  await reset('Low'); await tick(); assert.equal((await notices()).length, 0);
  await db.doc('users/risk-student').update({ hoursRendered: 500 }); await tick(); assert.equal((await notices()).length, 0);
  await reset(); await tick(); await db.doc('users/risk-student').update({ hoursRendered: null }); await tick(); assert.equal((await notices()).length, 1);
  await db.doc('attendanceExcusedDates/risk-student').set({ dates: ['invalid'], version: 1 }); await tick();
  assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().open, true);
  await db.doc('attendanceExcusedDates/risk-student').delete();
});
test('transfer routes open risk to new coordinator without page opening and revokes historical access', async () => {
  await reset(); await tick(); const old = (await notices())[0];
  await db.doc('sections/risk-s').update({ coordinatorId: 'risk-new' }); await tick();
  assert.equal((await notices()).length, 2); assert.equal((await request()).body.records.length, 0);
  assert.equal((await request(`/${old.id}/read`, 'risk-c', 'POST', {})).status, 403);
  assert.equal((await request('', 'risk-new')).body.records.length, 1);
  for (const change of [{ disabled: true }, { accountApproved: false }, { role: 'admin' }, { department: 'other' }, { status: 'suspended' }]) {
    await db.doc('users/risk-new').set({ ...coordinator, ...change });
    const response = await request('', 'risk-new');
    assert.equal(response.status, change.department ? 200 : 403);
    if (change.department) assert.deepEqual(response.body.records, []);
    assert.equal((await request(`/${(await notices()).find(n => n.recipientId === 'risk-new').id}/read`, 'risk-new', 'POST', {})).status, 403);
  }
  for (const actor of ['risk-student','risk-admin']) assert.equal((await request('', actor)).status, 403);
});
test('backend collections deny direct client reads and writes for every role', async () => {
  for (const uid of ['risk-student','risk-c','risk-admin']) for (const collection of ['attendanceRiskStates','attendanceRiskNotices','attendanceRiskWorker']) {
    const ref = doc(env.authenticatedContext(uid).firestore(), collection, 'private');
    await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { recipientId: uid }));
  }
});
test('bounded persisted scan resumes across installer restart and new day without starving tail', async () => {
  await reset();
  for (let i = 0; i < 12; i++) await db.doc(`users/risk-student-${String(i).padStart(2,'0')}`).set({ role: 'student', sectionId: 'risk-s', department: 'IT', hoursRendered: 100, hoursRequired: 500 });
  const first = await tick(worker, due, 3); assert.equal(first.processed, 3);
  for (let i = 0; i < 5; i++) await tick(install(), new Date('2026-10-21T16:15:00Z'), 3);
  assert.equal((await db.doc('attendanceRiskStates/risk-student-11').get()).exists, true);
});
test('audit failure leaves no episode or notice and retries failed student after restart', async () => {
  await reset(); failAudit = true; try { await tick(); } finally { failAudit = false; }
  assert.equal((await notices()).length, 0); assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).exists, false);
  const checkpoint = (await db.doc('attendanceRiskWorker/daily').get()).data(); assert.equal(checkpoint?.errorCode, 'EVALUATION_FAILED'); assert.equal(JSON.stringify(checkpoint).includes('private data'), false);
  await tick(install()); assert.equal((await notices()).length, 1);
});
test('local enablement requires exact opt-in and pinned demo emulator; manual evaluation rejects remote DB', async () => {
  const { riskAlertsEnabled } = require('../attendanceRiskAlerts');
  const valid = { ATTENDANCE_RISK_ALERTS_ENABLED: '1', PATHWAY_LOCAL_WORKFLOW: '1', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180' };
  assert.equal(riskAlertsEnabled(db, valid), true);
  for (const env of [{ ...valid, ATTENDANCE_RISK_ALERTS_ENABLED: undefined }, { ...valid, PATHWAY_LOCAL_WORKFLOW: 'true' }, { ...valid, NODE_ENV: 'production' }, { ...valid, K_SERVICE: 'deployed-service' }, { ...valid, FIRESTORE_EMULATOR_HOST: 'example.org:8180' }, { ...valid, GOOGLE_CLOUD_PROJECT: 'real-project' }]) assert.equal(riskAlertsEnabled(db, env), false);
  assert.equal(riskAlertsEnabled({ projectId: 'real-project' }, valid), false);
  await assert.rejects(() => install({ projectId: 'real-project', collection: db.collection.bind(db) }).evaluateDueAttendanceRisk(), /pinned local/);
  await assert.rejects(() => tick(worker, due, 26), /batchSize/);
});
test('no valid recipient retains open episode and sends current notice when authority becomes valid', async () => {
  await reset(); await db.doc('users/risk-c').update({ disabled: true }); await tick();
  assert.equal((await notices()).length, 0); assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().open, true);
  await db.doc('users/risk-c').set(coordinator); await tick(); await tick();
  assert.equal((await notices()).length, 1); assert.equal((await notices())[0].recipientId, 'risk-c');
});
test('overflow fails closed, preserving open episode even when totals claim completion', async () => {
  await reset(); await tick(); await db.doc('users/risk-student').update({ hoursRendered: 500 });
  const batch = db.bulkWriter();
  for (let i = 0; i < 1001; i++) batch.set(db.doc(`users/risk-student/attendance/overflow-${i}`), { date: '2026-10-20', timeIn: 'invalid' });
  await batch.close(); await tick();
  const state = (await db.doc('attendanceRiskStates/risk-student').get()).data();
  assert.equal(state.open, true); assert.equal(state.dataStatus, 'Unavailable'); assert.deepEqual(state.reasonCodes, ['SOURCE_UNAVAILABLE']);
  assert.equal((await notices()).length, 1);
});
test('student section transfer removes historical notice visibility even for its former recipient', async () => {
  await reset(); await tick(); const old = (await notices())[0];
  await db.doc('sections/risk-other').set({ department: 'IT', coordinatorId: 'risk-new', hoursRequired: 500, attendanceSchedule: schedule });
  await db.doc('users/risk-student').update({ sectionId: 'risk-other' });
  assert.deepEqual((await request()).body.records, []); assert.equal((await request(`/${old.id}/read`, 'risk-c', 'POST', {})).status, 403);
  await tick(); assert.equal((await request('', 'risk-new')).body.records.length, 1);
});
test('fresh profile checks after list/read transaction prevent stale response disclosure', async () => {
  await reset(); await tick(); const notice = (await notices())[0];
  for (const method of ['GET','POST']) {
    await db.doc('users/risk-c').set(coordinator); let revoke = true;
    const database = { projectId: db.projectId, collection: db.collection.bind(db), async runTransaction(callback) {
      const result = await db.runTransaction(callback);
      if (revoke) { revoke = false; await db.doc('users/risk-c').update({ accountApproved: false }); }
      return result;
    } };
    const local = install(database).app.listen(0, '127.0.0.1'); await new Promise(resolve => local.once('listening', resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${local.address().port}/coordinator/attendance-risk-notices${method === 'POST' ? `/${notice.id}/read` : ''}`, { method, headers: { 'content-type': 'application/json' }, ...(method === 'POST' ? { body: '{}' } : {}) });
      assert.equal(response.status, 403); assert.deepEqual(await response.json(), { error: 'Notice unavailable.' });
    } finally { await new Promise(resolve => local.close(resolve)); }
  }
});
test('midnight context and today records cannot fabricate completed-day absence or credit', async () => {
  await reset('Low');
  await tick(worker, new Date('2026-10-20T16:14:59Z'));
  assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().asOf, '2026-10-20');
  await db.doc('users/risk-student/attendance/today').set({ date: '2026-10-21', timeIn: 'bad', timeOut: null, hoursToday: 999 });
  await tick(); const state = (await db.doc('attendanceRiskStates/risk-student').get()).data();
  assert.equal(state.asOf, '2026-10-21'); assert.equal(state.riskTier, 'Low'); assert.equal(state.dataStatus, 'Ready');
  await tick(worker, new Date('2026-10-19T16:15:00Z'));
  assert.equal((await db.doc('attendanceRiskStates/risk-student').get()).data().asOf, '2026-10-21');
});
test('pagination is opaque actor scoped and advances over denied records even with empty page', async () => {
  await reset(); await tick(); const original = (await notices())[0];
  for (let i = 0; i < 21; i++) await db.doc(`attendanceRiskNotices/000${String(i).padStart(2,'0')}`).set({ ...original, studentId: 'denied-student' });
  const first = await request(); assert.equal(first.status, 200); assert.deepEqual(first.body.records, []); assert.equal(first.body.hasMore, true);
  assert.equal(typeof first.body.cursor, 'string'); assert.equal(first.body.cursor.includes('risk-c'), false);
  const next = await request(`?cursor=${first.body.cursor}`); assert.equal(next.status, 200); assert.equal(next.body.records.length, 1); assert.equal(next.body.hasMore, false);
  assert.equal((await request(`?cursor=${first.body.cursor}`, 'risk-new')).status, 400);
  assert.equal((await request(`?cursor=${first.body.cursor.slice(0,-4)}AAAA`)).status, 400);
  assert.equal((await request('?cursor=student-id')).status, 400);
  const keys = Object.keys(next.body.records[0]).sort();
  assert.deepEqual(keys, ['asOf','createdAt','dataStatus','id','kind','progressStatus','read','reasonCodes','riskTier','ruleVersion','title']);
});
test('transaction reads fresh authority and assignment before using source inputs', async () => {
  await reset(); let injected = false;
  const database = { projectId: db.projectId, collection: db.collection.bind(db), runTransaction: callback => db.runTransaction(async tx => {
    if (!injected) { injected = true; await db.doc('sections/risk-s').update({ coordinatorId: 'risk-new' }); await db.doc('users/risk-c').update({ disabled: true }); }
    return callback(tx);
  }) };
  await tick(install(database)); const saved = await notices(); assert.equal(saved.length, 1); assert.equal(saved[0].recipientId, 'risk-new');
  assert.equal((await request()).status, 403);
});
test('new attendance insertion between transactional query read and commit cannot commit old calculation', async () => {
  await reset('Low'); let inserted = false;
  const database = { projectId: db.projectId, collection: db.collection.bind(db), runTransaction: callback => db.runTransaction(async tx => {
    const get = tx.get.bind(tx);
    tx.get = async target => {
      const snapshot = await get(target);
      if (!inserted && target._queryOptions?.collectionId === 'attendance') {
        inserted = true;
        await db.doc('users/risk-student/attendance/new-duplicate').set({ date: '2026-10-20', timeIn: '2026-10-20T08:00:00+08:00', timeOut: null });
      }
      return snapshot;
    };
    return callback(tx);
  }) };
  await tick(install(database)); assert.equal(inserted, true);
  const state = (await db.doc('attendanceRiskStates/risk-student').get()).data();
  assert.equal(state.dataStatus, 'Needs verification'); assert.equal(state.riskTier, null); assert.equal((await notices()).length, 0);
});
