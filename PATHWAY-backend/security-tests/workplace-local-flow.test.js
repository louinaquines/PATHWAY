const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
const { installStudentJournalSubmission } = require('../studentJournalSubmission');
const { createLocalRuntime } = require('./workplace-local-runtime');
const { fixtures } = require('./workplace-claude-fixtures');
const env = { PATHWAY_WORKPLACE_FAKE_DISPATCH: '1', PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST };
let f, runtime, queued, hookFailure = false;
before(async () => { f = await concernFixture(args => installStudentJournalSubmission({ ...args, onJournalQueued: id => {
  queued.push(id); if (hookFailure) throw Error('synthetic wake failure'); return runtime.wake();
} })); });
after(async () => { runtime?.stop(); if (f) await f.close(); });
beforeEach(async () => { runtime?.stop(); await f.reset(); queued = []; hookFailure = false; runtime = createLocalRuntime({ db: f.db, env, clock: f.clock }); });
const submit = (notes = fixtures[0].notes, requestId = 'local-submit') => f.post('/student/journals', { requestId, rawNotes: notes, refined: notes, aiRefined: false, hours: 8 }, 'c-student');
async function job() { return (await f.db.collection('workplaceJournalAnalysisJobs').get()).docs[0]; }
async function outcome() { await runtime.wake(); return (await job())?.data(); }
test('post-commit submission automatically creates one private concern without coordinator UI', async () => {
  await runtime.start(); const first = await submit(); assert.equal(first.status, 200);
  // No manual wake: poll only the durable result of the submission hook.
  for (let n = 0; n < 150 && !(await f.case()); n++) await new Promise(r => setTimeout(r, 20));
  assert.equal((await f.case()).data().priority, 'high');
  assert.match((await f.case()).data().findings[0].reason, /SYNTHETIC/);
  const [a, b] = await Promise.all([submit(), submit()]); assert.deepEqual(a, first); assert.deepEqual(b, first);
  assert.equal((await outcome()).attempts, 1);
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 1);
  const notices = await f.db.collection('workplaceConcernNotices').get(); assert.equal(notices.size, 1);
  assert.equal(notices.docs[0].data().recipientId, 'c-coord'); assert.equal(JSON.stringify(notices.docs[0].data()).includes(fixtures[0].evidence), false);
  assert.equal((await f.db.doc(`users/c-student/logbook/${first.data.entryId}`).get()).data().rawNotes, fixtures[0].notes);
  assert.ok(queued.every(id => id === queued[0]));
});
test('default-off flow saves a queued journal but never processes it', async () => {
  runtime.stop(); runtime = createLocalRuntime({ db: f.db, env: { ...env, PATHWAY_WORKPLACE_FAKE_DISPATCH: '' }, clock: f.clock });
  await runtime.start(); assert.equal((await submit()).status, 200); assert.equal((await outcome()).attempts, 0); assert.equal(await f.case(), undefined);
});
test('declined consent saves normally without a job or wake', async () => {
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false, revision: 2 });
  await runtime.start(); const r = await submit(); assert.equal(r.status, 200); assert.equal(r.data.analysisStatus, 'not-enabled');
  assert.equal(await job(), undefined); assert.equal(queued.length, 0);
});
test('throwing post-commit hook cannot undo saved submission; restart recovers the durable job', async () => {
  hookFailure = true; const first = await submit(); assert.equal(first.status, 200);
  assert.equal((await job()).data().state, 'queued'); assert.equal(queued.length, 1);
  runtime.stop(); runtime = createLocalRuntime({ db: f.db, env, clock: f.clock }); await runtime.start();
  assert.equal((await job()).data().state, 'processed'); assert.equal((await f.case()).data().state, 'open');
});
test('withdrawal and stale source cancel before fake analysis, unsupported notes stay unavailable', async () => {
  for (const mode of ['withdraw', 'source', 'unsupported']) {
    runtime.stop(); await f.reset(); runtime = createLocalRuntime({ db: f.db, env, clock: f.clock });
    const saved = await submit(mode === 'unsupported' ? 'Not an exact fixed synthetic fixture.' : fixtures[0].notes);
    if (mode === 'withdraw') await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false, revision: 2 });
    if (mode === 'source') await f.db.doc(`users/c-student/logbook/${saved.data.entryId}`).update({ rawNotes: 'Edited notes' });
    await runtime.start(); const result = (await job()).data();
    assert.equal(result.state, mode === 'unsupported' ? 'unavailable' : 'cancelled'); assert.equal(result.attempts, 0); assert.equal(await f.case(), undefined);
  }
});
test('no-concern fixture is processed without a case; exhausted daily budget defers concern', async () => {
  await runtime.start(); await submit(fixtures[3].notes); assert.equal((await outcome()).state, 'processed'); assert.equal(await f.case(), undefined);
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 100000 });
  await submit(fixtures[0].notes, 'over-budget'); await runtime.wake();
  const jobs = (await f.db.collection('workplaceJournalAnalysisJobs').get()).docs.map(d => d.data());
  const delayed = jobs.find(j => j.delayReason === 'daily-limit'); assert.equal(delayed.state, 'queued'); assert.equal(delayed.attempts, 0); assert.equal(await f.case(), undefined);
});
