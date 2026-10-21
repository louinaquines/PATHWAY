const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc } = require('firebase/firestore');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const express = require('express');
const { installAttendanceExcusedDates } = require('../attendanceExcusedDates');
const { installCoordinatorAnalytics } = require('../coordinatorAnalytics');
let env, admin, db, server, origin, revokeDuringTransaction = false, failAudit = false;
let scheduleRevocation;
const originalSchedule = { startDate: '2026-10-01', deadline: '2026-12-31', startTime: '08:00', workingDays: [1, 2, 3, 4, 5], exceptions: [] };
const student = { role: 'student', department: 'IT', sectionId: 'excused-section' };
const coordinator = { role: 'coordinator', department: 'IT', accountApproved: true };
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host: '127.0.0.1', port: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  admin = initializeApp({ projectId: 'demo-pathway-security' }, 'excused-security'); db = getFirestore(admin);
  await Promise.all([
    db.doc('users/excused-coordinator').set(coordinator), db.doc('users/excused-student').set(student),
    db.doc('users/excused-admin').set({ ...coordinator, role: 'admin' }), db.doc('users/excused-foreign').set({ ...coordinator, department: 'other' }),
    db.doc('sections/excused-section').set({ coordinatorId: 'excused-coordinator', department: 'IT' }),
  ]);
  await db.doc('attendanceExcusedDates/excused-student').delete();
  const app = express(); app.use(express.json());
  const routeDb = { collection: db.collection.bind(db), runTransaction: work => db.runTransaction(async tx => {
    if (revokeDuringTransaction) { revokeDuringTransaction = false; await db.doc('users/excused-coordinator').update({ role: 'admin' }); }
    return work(tx);
  }) };
  installAttendanceExcusedDates({ app, db: routeDb, requireStaff(req, res, next) { req.staff = { uid: req.headers.actor || 'excused-coordinator', role: req.headers.role || 'coordinator' }; next(); }, allowRate: () => true,
    audit(tx, event) { tx.set(db.collection('auditLogs').doc(), event); if (failAudit) throw new Error('Synthetic audit failure'); } });
  installCoordinatorAnalytics({ app, db, async requireStaff(req, res, next) {
    const profile = (await db.doc('users/excused-coordinator').get()).data();
    req.staff = { uid: 'excused-coordinator', role: profile.role, data: profile };
    if (scheduleRevocation) await db.doc('users/excused-coordinator').update(scheduleRevocation);
    next();
  }, allowRate: () => true, async coordinatorSection(req, sectionId) {
    const snapshot = await db.collection('sections').doc(sectionId).get();
    if (req.staff.role !== 'coordinator' || snapshot.data().coordinatorId !== req.staff.uid || snapshot.data().department !== req.staff.data.department) throw Object.assign(new Error('Denied'), { status: 403 });
    return snapshot;
  }, audit(tx, event) { tx.set(db.collection('auditLogs').doc(), event); } });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (env) await env.cleanup(); if (admin) await deleteApp(admin); });
async function request(method, body, actor, role) {
  const res = await fetch(`${origin}/coordinator/sections/excused-section/students/excused-student/attendance-excused-dates`, { method, headers: { 'content-type': 'application/json', ...(actor ? { actor } : {}), ...(role ? { role } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
test('policy API stores only policy, returns versions, audits and rejects stale concurrent writes', async () => {
  assert.deepEqual(await request('GET'), { status: 200, body: { dates: [], version: 0 } });
  const results = await Promise.all([request('PUT', { dates: ['2026-10-20'], expectedVersion: 0 }), request('PUT', { dates: ['2026-10-19'], expectedVersion: 0 })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const saved = (await db.doc('attendanceExcusedDates/excused-student').get()).data();
  assert.deepEqual(Object.keys(saved).sort(), ['dates', 'updatedAt', 'updatedBy', 'version']);
  assert.equal(saved.updatedBy, 'excused-coordinator'); assert.equal(saved.version, 1);
  assert.deepEqual((await request('GET')).body, { dates: saved.dates, version: 1 });
  assert.deepEqual((await db.doc('users/excused-student').get()).data(), student);
  const audits = await db.collection('auditLogs').where('targetId', '==', 'excused-student').get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().action, 'attendance.excused_dates_updated');
  for (const body of [{ dates: ['2026-02-30'], expectedVersion: 1 }, { dates: ['2026-01-01', '2026-01-01'], expectedVersion: 1 }, { dates: [], expectedVersion: '1' }, { dates: [], expectedVersion: 1, hoursRendered: 9 }]) assert.equal((await request('PUT', body)).status, 400);
});
test('fresh profile and assignment deny get and put despite cached coordinator role', async () => {
  for (const [actor, role] of [['excused-admin', 'admin'], ['excused-admin', 'coordinator'], ['excused-foreign', 'coordinator']]) {
    for (const method of ['GET', 'PUT']) assert.equal((await request(method, method === 'PUT' ? { dates: [], expectedVersion: 1 } : null, actor, role)).status, 403);
  }
  for (const change of [{ disabled: true }, { role: 'student' }, { department: 'other' }, { accountApproved: false }]) {
    await db.doc('users/excused-coordinator').set({ ...coordinator, ...change });
    for (const method of ['GET', 'PUT']) assert.equal((await request(method, method === 'PUT' ? { dates: [], expectedVersion: 1 } : null)).status, 403);
  }
  await db.doc('users/excused-coordinator').set(coordinator);
  await db.doc('users/excused-student').update({ sectionId: 'transferred' });
  for (const method of ['GET', 'PUT']) assert.equal((await request(method, method === 'PUT' ? { dates: [], expectedVersion: 1 } : null)).status, 403);
  await db.doc('users/excused-student').set(student);
});
test('all clients including admin and assigned coordinator cannot read or write backend policy', async () => {
  for (const uid of ['excused-student', 'excused-coordinator', 'excused-admin', 'excused-foreign']) {
    const ref = doc(env.authenticatedContext(uid).firestore(), 'attendanceExcusedDates', 'excused-student');
    await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { dates: [], version: 2 }));
  }
});
test('audit failure rolls back policy and role revocation after middleware forces transactional denial', async () => {
  const before = (await db.doc('attendanceExcusedDates/excused-student').get()).data();
  failAudit = true;
  assert.equal((await request('PUT', { dates: [], expectedVersion: 1 })).status, 500);
  failAudit = false;
  assert.deepEqual((await db.doc('attendanceExcusedDates/excused-student').get()).data(), before);
  revokeDuringTransaction = true;
  assert.equal((await request('PUT', { dates: [], expectedVersion: 1 })).status, 403);
  assert.deepEqual((await db.doc('attendanceExcusedDates/excused-student').get()).data(), before);
  await db.doc('users/excused-coordinator').set(coordinator);
});
test('schedule API rechecks actor after middleware and preserves schedule and audit on denial', async t => {
  for (const change of [{ role: 'admin' }, { role: 'student' }, { disabled: true }, { accountApproved: false }, { department: 'other' }, { status: 'disabled' }, { status: 'inactive' }, { status: 'suspended' }]) {
    await t.test(JSON.stringify(change), async () => {
      await db.doc('users/excused-coordinator').set(coordinator);
      await db.doc('sections/schedule-section').set({ coordinatorId: 'excused-coordinator', department: 'IT', attendanceSchedule: originalSchedule });
      const auditsBefore = await db.collection('auditLogs').where('targetId', '==', 'schedule-section').get();
      scheduleRevocation = change;
      try {
        const response = await fetch(`${origin}/coordinator/sections/schedule-section/analytics/schedule`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schedule: { ...originalSchedule, startTime: '09:00' } }) });
        assert.equal(response.status, 403);
        assert.deepEqual((await db.doc('sections/schedule-section').get()).data().attendanceSchedule, originalSchedule);
        assert.equal((await db.collection('auditLogs').where('targetId', '==', 'schedule-section').get()).size, auditsBefore.size);
      } finally { scheduleRevocation = undefined; await db.doc('users/excused-coordinator').set(coordinator); }
    });
  }
});
test('schedule API allows fresh assigned coordinator and creates exactly one audit', async () => {
  await db.doc('sections/schedule-valid').set({ coordinatorId: 'excused-coordinator', department: 'IT', attendanceSchedule: originalSchedule });
  const schedule = { ...originalSchedule, startTime: '09:00' };
  const response = await fetch(`${origin}/coordinator/sections/schedule-valid/analytics/schedule`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schedule }) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { schedule });
  assert.deepEqual((await db.doc('sections/schedule-valid').get()).data().attendanceSchedule, schedule);
  const audits = await db.collection('auditLogs').where('targetId', '==', 'schedule-valid').get();
  assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().action, 'section.updated');
});
