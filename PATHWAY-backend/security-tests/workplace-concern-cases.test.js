const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { concernFixture, decision, NOTES } = require('./concern-fixture');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { routePendingConcernCases } = require('../workplaceConcernCases');
let f;
before(async () => { f = await concernFixture(); }); after(async () => { if (f) await f.close(); }); beforeEach(async () => f.reset());
const run = patch => createWorkplaceJournalWorker({ db: f.db, clock: f.clock, enabled: true, analyzer: f.analyzer, ...patch }).runBatch();
test('validated finding commits a private case and minimal notice once with the job', async () => {
  await f.job(); await run();
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  const saved = await f.case(); assert.equal(saved.data().state, 'open'); assert.equal(saved.data().priority, 'high');
  assert.equal(saved.data().findings[0].quote, 'threatened to hit me now');
  await run(); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 1);
  const notices = await f.db.collection('workplaceConcernNotices').get(); assert.equal(notices.size, 1);
  assert.equal(JSON.stringify(notices.docs[0].data()).includes('threatened'), false);
  assert.equal(notices.docs[0].data().recipientId, 'c-coord');
  await saved.ref.update({ state: 'dismissed_false_positive', evidenceDeleteAt: '2027-01-20T12:00:00.000Z' });
  await f.job('duplicate'); await run(); assert.equal((await f.case()).data().state, 'dismissed_false_positive');
});
test('no flag and invalid output never produce concern cases or notices', async () => {
  f.analyzer.analyze = async () => ({ usage: { inputTokens: 100, outputTokens: 100 }, decision: { version: 'workplace-concern-v1', findings: [] } });
  await f.job(); await run(); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
  const bad = decision(); bad.findings[0].quote = 'invented';
  f.analyzer.analyze = async () => ({ usage: { inputTokens: 100, outputTokens: 100 }, decision: bad });
  await f.job('invalid'); await run(); assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/invalid').get()).data().state, 'unavailable');
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
});
test('post-send consent withdrawal and same-revision source edit discard findings', async () => {
  for (const [collection, patch] of [['workplaceJournalConsents/c-student', { granted: false, revision: 2 }], ['users/c-student/logbook/entry', { rawNotes: 'Changed original.' }]]) {
    await f.reset(); await f.job();
    f.analyzer.analyze = async () => { await f.db.doc(collection).update(patch); return { usage: { inputTokens: 100, outputTokens: 100 }, decision: decision() }; };
    await run(); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
    assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'cancelled');
  }
});
test('missing recipient retains case and recovery/reassignment delivers without duplicate or paid work', async () => {
  await f.db.doc('sections/c-section').update({ coordinatorId: null }); await f.job(); await run();
  assert.equal((await f.case()).data().deliveryState, 'awaiting_assignment');
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
  await f.db.doc('sections/c-section').update({ coordinatorId: 'c-coord' });
  await routePendingConcernCases({ db: f.db, clock: f.clock, enabled: true });
  await routePendingConcernCases({ db: f.db, clock: f.clock, enabled: true });
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 1);
  await f.db.doc('sections/c-section').update({ coordinatorId: 'c-other' });
  await routePendingConcernCases({ db: f.db, clock: f.clock, enabled: true });
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 2);
  assert.equal((await f.case()).data().recipientId, 'c-other');
});
test('outcome planning failure rolls back case, notice and processed state without replayed analysis', async () => {
  await f.job(); let calls = 0, assignmentRead = false;
  f.analyzer.analyze = async () => { calls++; return { usage: { inputTokens: 100, outputTokens: 100 }, decision: decision() }; };
  const wrapped = { projectId: f.db.projectId, collection: name => f.db.collection(name), runTransaction: fn => f.db.runTransaction(tx => fn({
    get: ref => { if (ref.path === 'sections/c-section') { assignmentRead = true; throw Error('Synthetic assignment query failure'); } return tx.get(ref); },
    set: (...args) => tx.set(...args), create: (...args) => tx.create(...args), update: (...args) => tx.update(...args),
  })) };
  await run({ db: wrapped }); assert.equal(assignmentRead, true); assert.equal(calls, 1); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
  assert.notEqual((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  await run(); assert.equal(calls, 1);
});
test('lease expiring during case assignment reads cannot commit a case or notice', async () => {
  await f.job(); let shared = false, expiryInjected = false;
  const original = f.analyzer.analyze;
  f.analyzer.analyze = async () => { shared = true; return original(); };
  const wrapped = { projectId: f.db.projectId, collection: name => f.db.collection(name), runTransaction: fn => f.db.runTransaction(tx => fn({
    get: async ref => { const snap = await tx.get(ref); if (shared && ref.path === 'sections/c-section') { expiryInjected = true; f.setTime('2026-10-22T12:02:00Z'); } return snap; },
    set: (...args) => tx.set(...args), create: (...args) => tx.create(...args), update: (...args) => tx.update(...args),
  })) };
  await run({ db: wrapped }); assert.equal(expiryInjected, true); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
  assert.notEqual((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
});
test('client roles cannot directly read or write private cases, notices or receipts', async () => {
  const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const rules = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host, port: Number(port), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  try { for (const role of ['student','coordinator','admin']) {
    await f.db.doc(`users/c-${role}`).set({ role, accountApproved: true });
    for (const col of ['workplaceConcernCases','workplaceConcernNotices','workplaceConcernReceipts']) {
      const ref = doc(rules.authenticatedContext(`c-${role}`).firestore(), col, 'private');
      await assertFails(getDoc(ref)); await assertFails(setDoc(ref, { notes: NOTES }));
    }
  } } finally { await rules.cleanup(); }
});
