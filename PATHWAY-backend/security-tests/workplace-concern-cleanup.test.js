const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { installWorkplaceConcernReview } = require('../workplaceConcernReview');
const { runConcernRetentionBatch } = require('../workplaceConcernCleanup');
let f, id;
before(async () => { f = await concernFixture(installWorkplaceConcernReview); });
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.reset(); await f.job(); await createWorkplaceJournalWorker({ db: f.db, enabled: true, analyzer: f.analyzer, clock: f.clock }).runBatch();
  id = (await f.case()).id;
  assert.equal((await f.post(`/coordinator/workplace-concerns/${id}/action`, { action: 'dismiss_false_positive', note: 'PRIVATE synthetic closure', requestId: 'close', expectedVersion: 1 })).status, 200);
});
const run = patch => runConcernRetentionBatch({ db: f.db, enabled: true, clock: f.clock, ...patch });
test('cleanup is default off and refuses remote or non-exact demo without DB access', async () => {
  const db = { projectId: 'real', collection() { assert.fail('Disabled DB accessed'); } };
  assert.equal((await runConcernRetentionBatch({ db })).status, 'disabled');
  assert.equal((await runConcernRetentionBatch({ db, enabled: true })).status, 'disabled');
});
test('ninety-day cleanup preserves only safe action audit; anniversary removes linked copies, not original records', async () => {
  const source = (await f.db.doc('users/c-student/logbook/entry').get()).data();
  const consent = (await f.db.doc('workplaceJournalConsents/c-student').get()).data();
  await f.db.doc('auditLogs/unrelated').set({ action: 'journal.submitted', targetType: 'workplaceConcernCases', targetId: id, details: { keep: true } });
  await f.db.doc('studentJournalReceipts/unrelated').set({ result: { entryId: 'entry' } });
  f.setTime('2027-01-20T12:00:00Z'); assert.equal((await run()).purged, 1);
  const safe = (await f.case()).data(); assert.equal(safe.history[0].action, 'dismiss_false_positive');
  for (const key of ['findings', 'sourceHash', 'recipientId', 'sectionId', 'deliveryState']) assert.equal(safe[key], undefined);
  assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
  f.setTime('2027-10-22T12:00:00Z');
  let retired = 0; for (let i = 0; i < 8 && (await f.db.doc(`workplaceConcernCases/${id}`).get()).exists; i++) retired += (await run()).retired;
  assert.equal(retired, 1); assert.equal(await f.case(), undefined);
  for (const col of ['workplaceConcernNotices', 'workplaceConcernReceipts', 'workplaceJournalAnalysisJobs']) assert.equal((await f.db.collection(col).get()).size, 0);
  assert.deepEqual((await f.db.doc('users/c-student/logbook/entry').get()).data(), source);
  assert.deepEqual((await f.db.doc('workplaceJournalConsents/c-student').get()).data(), consent);
  assert.equal((await f.db.collection('studentJournalReceipts').get()).size, 1);
  assert.deepEqual((await f.db.collection('auditLogs').get()).docs.map(d => d.id), ['unrelated']);
});
test('bounded partial cleanup resumes after restart and competing cleaners cannot retire twice', async () => {
  for (let n = 0; n < 25; n++) await f.db.doc(`workplaceConcernNotices/extra-${n}`).set({ caseId: id, recipientId: 'c-coord' });
  f.setTime('2027-10-22T12:00:00Z');
  const first = await run(); assert.equal(first.retired, 0); assert.equal((await f.db.doc(`workplaceConcernCases/${id}`).get()).exists, true);
  let retired = 0; for (let n = 0; n < 8; n++) { const results = await Promise.all([run(), run()]); retired += results.reduce((sum, r) => sum + r.retired, 0); }
  assert.equal(retired, 1); assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
});
test('active or inconsistent jobs block final retirement; invalid closure never deletes data', async () => {
  f.setTime('2027-10-22T12:00:00Z'); await f.db.doc('workplaceJournalAnalysisJobs/c-job').update({ state: 'sending' });
  assert.equal((await run()).status, 'unavailable');
  assert.equal((await f.db.doc(`workplaceConcernCases/${id}`).get()).exists, true);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'sending');
  assert.equal((await f.db.doc(`workplaceConcernCases/${id}`).get()).data().findings, undefined);
  await f.db.doc('workplaceJournalAnalysisJobs/c-job').update({ state: 'processed' });
  await f.db.doc(`workplaceJournalAnalysisJobs/${id}`).set({ state: 'processed', studentId: 'unrelated', entryId: 'entry', sourceRevision: 1 });
  assert.equal((await run()).status, 'unavailable');
  assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${id}`).get()).data().studentId, 'unrelated');
  await f.db.doc(`workplaceConcernCases/${id}`).update({ closedAt: 'bad' });
  assert.equal((await run()).status, 'unavailable'); assert.equal((await f.db.doc(`workplaceConcernCases/${id}`).get()).exists, true);
});

test('legacy already-purged records are normalized to the stricter minimal audit', async () => {
  await f.db.doc(`workplaceConcernCases/${id}`).update({ evidencePurged: true, purgedAt: '2027-01-20T12:00:00Z',
    sectionId: 'old-section', recipientId: 'old-coord', deliveryState: 'delivered' });
  f.setTime('2027-01-21T00:00:00Z'); await run();
  const saved = (await f.db.doc(`workplaceConcernCases/${id}`).get()).data();
  for (const key of ['sectionId','recipientId','deliveryState','findings','sourceHash']) assert.equal(saved[key], undefined);
  assert.equal(saved.history[0].note, undefined);
});

test('paused active worker cannot restore evidence or resurrect a physically retired case', async () => {
  await f.db.doc(`workplaceConcernCases/${id}`).update({ closedAt: '2025-10-22T12:00:00Z', evidenceDeleteAt: '2026-01-20T12:00:00Z', auditDeleteAt: '2026-10-22T12:00:00Z' });
  await f.job('c-racing');
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; }), arrived = new Promise(resolve => { entered = resolve; });
  const analyze = f.analyzer.analyze;
  const worker = createWorkplaceJournalWorker({ db: f.db, enabled: true, clock: f.clock,
    analyzer: { ...f.analyzer, analyze: async () => { entered(); await gate; return analyze(); } } });
  const pending = worker.runBatch();
  await Promise.race([arrived, pending.then(() => assert.fail('Worker did not enter analyzer'))]);
  try { assert.equal((await run()).status, 'unavailable'); assert.equal((await f.case()).data().findings, undefined); }
  finally { release(); await pending; }
  for (let n = 0; n < 8 && await f.case(); n++) await run();
  assert.equal(await f.case(), undefined); await worker.runBatch();
  assert.equal(await f.case(), undefined); assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
});
