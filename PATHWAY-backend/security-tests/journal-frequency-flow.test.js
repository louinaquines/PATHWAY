const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installDepartmentJournals } = require('../departmentJournals');
const { installStudentJournalSubmission } = require('../studentJournalSubmission');
const { migrationFixture } = require('./journal-migration-fixture');
let f;
before(async () => { f = await migrationFixture(args => {
  installDepartmentJournals({ ...args, requireStaff: (req, res, next) => args.requireUser(req, res, () => { req.staff = req.user; next(); }) });
  installStudentJournalSubmission({ ...args, periodAware: true });
}); });
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.reset();
  for (const name of ['departmentJournalSettings', 'studentJournalDays']) await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc(`users/${f.uid}`).update({ department: 'IT' });
  await f.db.doc('users/frequency-coordinator').set({ role: 'coordinator', department: 'IT', accountApproved: true });
  await f.db.doc('users/other-coordinator').set({ role: 'coordinator', department: 'Nursing', accountApproved: true });
});
const settings = (frequency, expectedRevision = 0, actor = 'frequency-coordinator') => f.post('/coordinator/journal-settings', { frequency, expectedRevision }, actor);
const payload = { requestId: 'period-one', department: 'IT', rawNotes: 'Completed testing and learned debugging.', refined: 'Completed testing and learned debugging.', aiRefined: false, hours: 8, frequency: 'daily', settingsRevision: 1, periodStart: '2026-10-22' };
const submit = patch => f.post('/student/period-journals', { ...payload, ...patch });
test('department setting is scoped, versioned, fresh-authorized, and audit-atomic', async () => {
  assert.equal((await f.post('/student/journal-settings/read')).data.frequency, 'weekly');
  assert.equal((await settings('daily')).status, 200);
  assert.equal((await f.post('/student/journal-settings/read')).data.frequency, 'daily');
  assert.equal((await f.post('/coordinator/journal-settings/read', {}, 'other-coordinator')).data.frequency, 'weekly');
  assert.equal((await settings('weekly')).status, 409);
  assert.equal((await settings('daily', 0, f.uid)).status, 403);
  f.setFailAudit(true); assert.equal((await settings('weekly', 1)).status, 500);
  assert.equal((await f.post('/student/journal-settings/read')).data.frequency, 'daily');
  f.setAfterAuth(() => f.db.doc('users/frequency-coordinator').update({ department: 'Nursing' }));
  assert.equal((await settings('weekly', 1)).status, 403);
});
test('daily submission persists period, replays safely, caps hours, and prevents concurrent duplicates', async () => {
  await settings('daily');
  assert.equal((await submit({ hours: 25 })).status, 400);
  const results = await Promise.all([submit(), submit({ requestId: 'second' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const success = results.find(r => r.status === 200);
  const saved = (await f.db.doc(`users/${f.uid}/logbook/${success.data.entryId}`).get()).data();
  assert.equal(saved.frequency, 'daily'); assert.equal(saved.periodStart, '2026-10-22'); assert.equal(saved.periodEnd, saved.periodStart);
  const winningId = results[0].status === 200 ? 'period-one' : 'second';
  assert.deepEqual(await submit({ requestId: winningId }), success);
  assert.equal((await f.db.doc(`users/${f.uid}`).get()).data().hoursRendered, undefined);
});
test('frequency races, mismatched dates, and daily/weekly overlap reject without losing old entries', async () => {
  await settings('daily'); assert.equal((await submit()).status, 200);
  await settings('weekly', 1);
  assert.equal((await submit({ requestId: 'stale' })).status, 409);
  assert.equal((await submit({ requestId: 'overlap', frequency: 'weekly', settingsRevision: 2, periodStart: '2026-10-19' })).status, 409);
  assert.equal((await submit({ requestId: 'forged', frequency: 'weekly', settingsRevision: 2, periodStart: '2026-10-26' })).status, 409);
  assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 1);
});
test('revisions preserve historical frequency and period after settings change', async () => {
  await settings('daily'); const created = await submit();
  assert.equal(created.status, 200);
  const ref = f.db.doc(`users/${f.uid}/logbook/${created.data.entryId}`);
  await ref.update({ status: 'rejected' }); await settings('weekly', 1);
  const result = await submit({ requestId: 'revision', entryId: ref.id, expectedRevision: 1,
    expectedSource: { rawNotes: payload.rawNotes, refined: payload.refined, aiRefined: false, hours: 8, reviewedAt: null } });
  assert.equal(result.status, 200); assert.equal((await ref.get()).data().frequency, 'daily');
  assert.equal((await ref.get()).data().periodStart, '2026-10-22');
});
test('activated policy denies old direct client writes while preserving reads and other departments', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host: '127.0.0.1', port: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  try {
    const owner = env.authenticatedContext(f.uid).firestore();
    const content = { rawNotes: 'Legacy notes', refined: 'Legacy notes', aiRefined: false, hours: 8, status: 'pending', weekNum: 1, weekRange: '2026-10-19 – 2026-10-25', createdAt: '2026-10-22T12:00:00Z' };
    await assertSucceeds(setDoc(doc(owner, 'users', f.uid, 'logbook', 'old-client'), content));
    await settings('daily');
    await assertSucceeds(getDoc(doc(owner, 'users', f.uid, 'logbook', 'old-client')));
    await assertFails(setDoc(doc(owner, 'users', f.uid, 'logbook', 'bypass'), content));
    await f.db.doc(`users/${f.uid}/logbook/old-client`).update({ status: 'rejected' });
    await assertFails(updateDoc(doc(owner, 'users', f.uid, 'logbook', 'old-client'), { status: 'pending' }));
    await f.db.doc(`users/${f.uid}`).update({ department: '   ' });
    await assertFails(setDoc(doc(owner, 'users', f.uid, 'logbook', 'whitespace-bypass'), content));
    for (const name of ['departmentJournalSettings', 'studentJournalDays']) await assertFails(setDoc(doc(owner, name, 'forged'), { frequency: 'daily' }));
  } finally { await env.cleanup(); }
});
test('legacy journals block overlapping new periods and missing department fails closed', async () => {
  await f.db.doc(`users/${f.uid}/logbook/legacy`).set({ status: 'approved', weekNum: 1, weekRange: '2026-10-19 – 2026-10-25', createdAt: '2026-10-22T12:00:00Z' });
  await settings('daily'); assert.equal((await submit()).status, 409);
  await f.db.doc(`users/${f.uid}`).update({ department: '' });
  assert.equal((await submit()).status, 403);
});
test('a saved legacy draft can become a period-aware submission without duplicate entries', async () => {
  await settings('daily');
  const old = { rawNotes: 'Saved draft', refined: 'Saved draft', aiRefined: false, hours: 8, status: 'draft', weekNum: 2, weekRange: '2026-10-19 – 2026-10-25', createdAt: '2026-10-21T00:00:00Z' };
  const ref = f.db.doc(`users/${f.uid}/logbook/saved-draft`); await ref.set(old);
  const result = await submit({ entryId: ref.id, submitDraft: true, expectedRevision: 0, expectedSource: { rawNotes: old.rawNotes, refined: old.refined, aiRefined: false, hours: 8, reviewedAt: null } });
  assert.equal(result.status, 200);
  const saved = (await ref.get()).data(); assert.equal(saved.status, 'pending'); assert.equal(saved.frequency, 'daily');
  assert.equal(saved.periodStart, '2026-10-22'); assert.equal(saved.createdAt, old.createdAt);
  assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 1);
  assert.equal((await submit({ requestId: 'duplicate' })).status, 409);
});
test('legacy API rejects malformed department and cannot bypass an activated policy', async () => {
  const { installStudentJournalSubmission } = require('../studentJournalSubmission');
  const legacy = await migrationFixture(installStudentJournalSubmission);
  try {
    await legacy.reset(); await legacy.db.doc(`users/${legacy.uid}`).update({ department: '' });
    const { department, frequency, settingsRevision, periodStart, ...plain } = payload;
    assert.equal((await legacy.post('/student/journals', plain)).status, 403);
    await legacy.db.doc(`users/${legacy.uid}`).update({ department: 'IT' });
    await settings('daily');
    assert.equal((await legacy.post('/student/journals', plain)).status, 409);
  } finally { await legacy.close(); }
});
