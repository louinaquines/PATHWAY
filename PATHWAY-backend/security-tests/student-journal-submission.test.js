const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installStudentJournalSubmission } = require('../studentJournalSubmission');
const { migrationFixture } = require('./journal-migration-fixture');
let f; before(async () => { f = await migrationFixture(installStudentJournalSubmission); });
after(async () => { if (f) await f.close(); }); beforeEach(async () => f.reset());
const payload = { requestId: 'submit-one', rawNotes: 'Original sample activities.', refined: 'Polished sample activities.', aiRefined: true, hours: 32 };
const submit = patch => f.post('/student/journals', { ...payload, ...patch });
async function grant() { await f.db.doc(`workplaceJournalConsents/${f.uid}`).set({ granted: true, disclosureVersion: 'workplace-journal-consent-v1', revision: 1 }); }
test('atomic creation derives dates and preserves original notes; declined consent creates no job', async () => {
  const result = await submit(); assert.equal(result.status, 200); assert.equal(result.data.analysisStatus, 'not-enabled');
  const saved = (await f.db.doc(`users/${f.uid}/logbook/${result.data.entryId}`).get()).data();
  assert.equal(saved.rawNotes, payload.rawNotes); assert.equal(saved.refined, payload.refined); assert.equal(saved.status, 'pending');
  assert.equal(saved.weekRange, '2026-10-19 – 2026-10-25'); assert.equal(saved.weekNum, 1); assert.equal(saved.sourceRevision, 1);
  assert.equal((await f.db.collection('workplaceJournalAnalysisJobs').get()).size, 0);
});
test('opted-in commit/replay yields one inert job; receipt contains no notes; changed replay conflicts', async () => {
  await grant(); const first = await submit(); assert.equal(first.status, 200); assert.equal(first.data.analysisStatus, 'queued');
  assert.deepEqual(await submit(), first);
  assert.equal((await submit({ hours: 40 })).status, 409);
  assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 1);
  const jobs = await f.db.collection('workplaceJournalAnalysisJobs').get(); assert.equal(jobs.size, 1);
  assert.equal(jobs.docs[0].data().state, 'queued'); assert.equal(jobs.docs[0].data().attempts, 0);
  assert.equal(JSON.stringify(jobs.docs[0].data()).includes(payload.rawNotes), false);
  assert.equal(JSON.stringify((await f.db.collection('studentJournalReceipts').get()).docs[0].data()).includes(payload.rawNotes), false);
});
test('audit failure rolls back journal, job, sequence and receipt', async () => {
  await grant(); f.setFailAudit(true); assert.equal((await submit()).status, 500);
  for (const name of [`users/${f.uid}/logbook`, 'studentJournalSequences', 'studentJournalReceipts', 'workplaceJournalAnalysisJobs']) assert.equal((await f.db.collection(name).get()).size, 0);
});
test('concurrent backend creates allocate distinct weeks and duplicate payload sends save once', async () => {
  const results = await Promise.all([submit(), submit(), submit({ requestId: 'submit-two' })]);
  assert.ok(results.every(r => r.status === 200)); assert.equal(results[0].data.entryId, results[1].data.entryId);
  const saved = await f.db.collection(`users/${f.uid}/logbook`).get(); assert.equal(saved.size, 2);
  assert.deepEqual(saved.docs.map(d => d.data().weekNum).sort(), [1, 2]);
});
test('rejected revisions preserve period, dates and week while preventing stale decisions', async () => {
  await f.db.doc(`users/${f.uid}/logbook/legacy`).set({ rawNotes: 'Old', refined: 'Old', status: 'rejected', weekRange: 'Oct 5 – Oct 11', weekNum: 7, createdAt: '2026-10-05T00:00:00Z' });
  const request = { entryId: 'legacy', expectedRevision: 0, expectedSource: { rawNotes: 'Old', refined: 'Old', aiRefined: null, hours: null, reviewedAt: null } };
  const result = await submit(request); assert.equal(result.status, 200); assert.equal(result.data.revision, 1);
  const data = (await f.db.doc(`users/${f.uid}/logbook/legacy`).get()).data();
  assert.equal(data.weekRange, 'Oct 5 – Oct 11'); assert.equal(data.weekNum, 7); assert.equal(data.createdAt, '2026-10-05T00:00:00Z');
  assert.equal((await submit({ ...request, requestId: 'another' })).status, 409);
  await f.db.doc(`users/${f.uid}/logbook/legacy`).update({ status: 'approved' });
  assert.equal((await submit({ ...request, expectedRevision: 1, requestId: 'after-approval' })).status, 409);
});
test('legacy resubmit followed by a new rejection cannot be overwritten by a stale open draft', async () => {
  const ref = f.db.doc(`users/${f.uid}/logbook/legacy-race`);
  await ref.set({ rawNotes: 'First draft', refined: 'First draft', aiRefined: false, hours: 8, status: 'rejected', reviewedAt: '2026-10-20T00:00:00Z' });
  const request = { entryId: 'legacy-race', expectedRevision: 0, expectedSource: { rawNotes: 'First draft', refined: 'First draft', aiRefined: false, hours: 8, reviewedAt: '2026-10-20T00:00:00Z' } };
  await ref.update({ rawNotes: 'Newer legacy resubmission', refined: 'Newer legacy resubmission', status: 'pending' });
  await ref.update({ status: 'rejected', reviewedAt: '2026-10-21T00:00:00Z' });
  assert.equal((await submit(request)).status, 409);
  assert.equal((await ref.get()).data().rawNotes, 'Newer legacy resubmission');
});
test('a committed identical receipt remains recoverable after eligibility changes without new writes', async () => {
  const saved = await submit(); assert.equal(saved.status, 200);
  await f.db.doc(`users/${f.uid}`).update({ clearanceStatus: 'cleared', placementStatus: 'rejected' });
  await f.db.doc('companies/journal-company').update({ active: false });
  assert.deepEqual(await submit(), saved);
  assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 1);
  assert.ok([403, 409].includes((await submit({ requestId: 'new-write' })).status));
});
test('fresh eligibility/password/company checks reject after middleware and malformed fields never save', async () => {
  for (const patch of [{ hours: '32' }, { hours: 0 }, { rawNotes: ' ' }, { status: 'approved' }, { weekNum: 4 }, { expectedRevision: 0 }, { aiRefined: 'yes' }]) assert.equal((await submit(patch)).status, 400);
  for (const patch of [{ role: 'coordinator' }, { passwordChangeRequired: true }, { passwordEpoch: 'new' }, { accountApproved: false }, { clearanceStatus: 'cleared' }]) {
    await f.reset(); f.setAfterAuth(async () => f.db.doc(`users/${f.uid}`).update(patch));
    assert.ok([403, 409].includes((await submit()).status));
    assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 0);
  }
  await f.reset(); f.setAfterAuth(async () => f.db.doc('companies/journal-company').update({ active: false }));
  assert.equal((await submit()).status, 403);
});
test('withdrawal before transaction is honored; malformed stored consent fails closed', async () => {
  await grant(); f.setAfterAuth(async () => f.db.doc(`workplaceJournalConsents/${f.uid}`).update({ granted: false, revision: 2 }));
  assert.equal((await submit()).data.analysisStatus, 'not-enabled');
  assert.equal((await f.db.collection('workplaceJournalAnalysisJobs').get()).size, 0);
  await f.reset(); await f.db.doc(`workplaceJournalConsents/${f.uid}`).set({ granted: true });
  assert.equal((await submit()).status, 503);
});

test('consent withdrawal racing submission produces a coherent snapshot without duplicate jobs', async () => {
  const { installWorkplaceJournalConsent } = require('../workplaceJournalConsent');
  const both = await migrationFixture(args => { installStudentJournalSubmission(args); installWorkplaceJournalConsent(args); });
  try {
    await both.reset();
    await both.db.doc(`workplaceJournalConsents/${both.uid}`).set({ granted: true, disclosureVersion: 'workplace-journal-consent-v1', revision: 1 });
    const [submitted, withdrawn] = await Promise.all([
      both.post('/student/journals', payload),
      both.post('/student/journal-analysis-consent', { granted: false, expectedRevision: 1, disclosureVersion: 'workplace-journal-consent-v1', requestId: 'race-withdraw' }),
    ]);
    assert.equal(submitted.status, 200); assert.equal(withdrawn.status, 200);
    const jobs = await both.db.collection('workplaceJournalAnalysisJobs').get();
    assert.equal(jobs.size, submitted.data.analysisStatus === 'queued' ? 1 : 0);
    if (jobs.size) assert.equal(jobs.docs[0].data().consentRevision, 1);
    assert.equal((await both.db.doc(`workplaceJournalConsents/${both.uid}`).get()).data().granted, false);
  } finally { await both.close(); }
});

test('new backend metadata keeps owner reads and legacy rules while private collections deny all roles', async () => {
  const fs = require('node:fs'), path = require('node:path');
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host: '127.0.0.1', port: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  try {
    const saved = await submit();
    const owner = env.authenticatedContext(f.uid).firestore();
    await assertSucceeds(getDoc(doc(owner, 'users', f.uid, 'logbook', saved.data.entryId)));
    await assertSucceeds(setDoc(doc(owner, 'users', f.uid, 'logbook', 'legacy-direct'), { rawNotes: 'Legacy entry', refined: 'Legacy entry', aiRefined: false, hours: 8, status: 'pending', weekNum: 2, weekRange: 'Week 2', createdAt: '2026-10-22T12:00:00Z' }));
    for (const role of ['student', 'coordinator', 'admin']) {
      await f.db.doc(`users/migration-${role}`).set({ role, accountApproved: true });
      const client = env.authenticatedContext(`migration-${role}`).firestore();
      for (const name of ['workplaceJournalConsents', 'workplaceJournalConsentReceipts', 'studentJournalReceipts', 'studentJournalSequences', 'workplaceJournalAnalysisJobs']) {
        await assertFails(getDoc(doc(client, name, 'private'))); await assertFails(setDoc(doc(client, name, 'private'), { granted: true }));
      }
    }
  } finally { await env.cleanup(); }
});

test('legacy initialization is bounded and malformed or overflowing counters never allocate', async () => {
  const sequence = f.db.doc(`studentJournalSequences/${f.uid}`);
  for (const lastWeekNum of [-1, '3', Number.MAX_SAFE_INTEGER]) {
    await sequence.set({ lastWeekNum }); assert.equal((await submit()).status, 503);
    assert.equal((await f.db.collection(`users/${f.uid}/logbook`).get()).size, 0);
  }
  await sequence.delete();
  for (let start = 0; start < 1001; start += 400) {
    const batch = f.db.batch();
    for (let i = start; i < Math.min(start + 400, 1001); i++) batch.set(f.db.doc(`users/${f.uid}/logbook/bounded-${i}`), { weekNum: i + 1 });
    await batch.commit();
  }
  assert.equal((await submit()).status, 409);
  assert.equal((await f.db.collection('studentJournalReceipts').get()).size, 0);
  assert.equal((await sequence.get()).exists, false);
});
