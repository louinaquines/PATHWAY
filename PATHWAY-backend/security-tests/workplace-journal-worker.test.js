const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { PRICE_PROFILE, FEATURES } = require('../workplaceAnalysisPricing');
const { digest } = require('../workplaceJournalConsent');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let app, db, instant, calls, prepares, analyzer;
const baseTime = Date.parse('2026-10-22T12:00:00Z');
const metadata = () => ({ model: 'claude-haiku-5-5', inputTokenUpperBound: 10000, maxOutputTokens: 2048, features: FEATURES, request: 'synthetic bounded request' });
const clock = () => new Date(instant);
const worker = patch => createWorkplaceJournalWorker({ db, enabled: true, analyzer, clock, priceProfile: PRICE_PROFILE, ...patch });
test('default-off worker does not access DB, adapter or pricing', async () => {
  for (const enabled of [undefined, false, 'true', 1]) assert.deepEqual(await createWorkplaceJournalWorker({ enabled }).runBatch(), { status: 'disabled', processed: 0 });
});
before(async () => {
  if (!emulator) return;
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp } = require('firebase-admin/app'), { getFirestore } = require('firebase-admin/firestore');
  app = initializeApp({ projectId: 'demo-pathway-security' }, 'workplace-worker-tests'); db = getFirestore(app);
});
after(async () => { if (app) await require('firebase-admin/app').deleteApp(app); });
beforeEach(async () => {
  if (!emulator) return;
  instant = baseTime; calls = 0; prepares = 0;
  for (const name of ['workplaceJournalAnalysisJobs', 'workplaceJournalWorker', 'workplaceAnalysisBudgetDays', 'workplaceAnalysisBudgetAttempts']) await db.recursiveDelete(db.collection(name));
  await db.doc('users/worker-student').set({ role: 'student', accountApproved: true, preDeploymentStatus: 'approved', placementStatus: 'approved', companyId: 'worker-company' });
  await db.doc('companies/worker-company').set({ active: true });
  await db.doc('workplaceJournalConsents/worker-student').set({ granted: true, disclosureVersion: 'workplace-journal-consent-v2', revision: 1 });
  await db.doc('users/worker-student/logbook/entry').set({ rawNotes: 'Synthetic original notes.', sourceRevision: 1, status: 'pending' });
  analyzer = { prepare: notes => { prepares++; assert.equal(notes, 'Synthetic original notes.'); return metadata(); },
    analyze: async prepared => { calls++; assert.ok(Object.isFrozen(prepared)); return { usage: { inputTokens: 1000, outputTokens: 100 } }; } };
});
async function job(id = 'job-a', patch = {}) {
  await db.doc(`workplaceJournalAnalysisJobs/${id}`).set({ studentId: 'worker-student', entryId: 'entry', sourceRevision: 1,
    sourceHash: digest('Synthetic original notes.'), consentRevision: 1, disclosureVersion: 'workplace-journal-consent-v2',
    state: 'queued', attempts: 0, createdAt: clock().toISOString(), ...patch });
}
async function data(id = 'job-a') { return (await db.doc(`workplaceJournalAnalysisJobs/${id}`).get()).data(); }
test('stale pricing fails before adapter, valid job reserves and stores only operational usage', { skip: !emulator }, async () => {
  await job(); assert.equal((await worker({ priceProfile: { ...PRICE_PROFILE, expiresAt: '2026-10-22T00:00:00Z' } }).runBatch()).status, 'unavailable');
  assert.equal(calls, 0); assert.equal(prepares, 0);
  assert.equal((await worker().runBatch()).processed, 1); assert.equal(calls, 1);
  const saved = await data(); assert.equal(saved.state, 'processed'); assert.equal(saved.attempts, 1);
  assert.deepEqual(saved.usage, { inputTokens: 1000, outputTokens: 100 });
  assert.equal(JSON.stringify(saved).includes('Synthetic original notes.'), false);
  assert.equal((await db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data().reservedMicroUsd, 10120);
  await worker().runBatch(); assert.equal(calls, 1);
});
test('withdrawal/regrant, same-revision edits, and revoked account all cancel without sharing', { skip: !emulator }, async () => {
  for (const patch of [{ consentRevision: 0 }, { sourceHash: digest('old') }, { sourceRevision: 0 }]) {
    await job('invalid', patch); await worker().runBatch(); assert.equal((await data('invalid')).state, 'cancelled');
    await db.doc('workplaceJournalWorker/control').delete();
  }
  await job(); await db.doc('workplaceJournalConsents/worker-student').update({ revision: 3 });
  await worker().runBatch(); assert.equal((await data()).state, 'cancelled');
  await db.doc('workplaceJournalWorker/control').delete(); await job('wrong-account');
  await db.doc('workplaceJournalConsents/worker-student').update({ revision: 1 });
  await db.doc('users/worker-student').update({ role: 'coordinator' });
  await worker().runBatch(); assert.equal((await data('wrong-account')).state, 'cancelled'); assert.equal(calls, 0);
});
test('preparation-time source change and post-send consent change cannot commit successful outcomes', { skip: !emulator }, async () => {
  await job();
  let resolvePrepare; const originalPrepare = analyzer.prepare;
  // Preparation must be synchronous; an async adapter is rejected without calling analyze.
  analyzer.prepare = () => new Promise(resolve => { resolvePrepare = resolve; });
  await worker().runBatch(); assert.equal(calls, 0); assert.equal((await data()).state, 'unavailable'); resolvePrepare(metadata());
  await db.doc('workplaceJournalWorker/control').delete(); await job('after-send'); analyzer.prepare = originalPrepare;
  analyzer.analyze = async () => { calls++; await db.doc('workplaceJournalConsents/worker-student').update({ granted: false, revision: 2 }); return { usage: { inputTokens: 1000, outputTokens: 100 } }; };
  await worker().runBatch(); assert.equal((await data('after-send')).state, 'cancelled'); assert.equal((await data('after-send')).usage, null);
});
test('concurrent workers, max batch, and terminal head entries do not duplicate or starve queued work', { skip: !emulator }, async () => {
  await job('a-terminal', { state: 'processed' }); for (const id of ['b', 'c', 'd']) await job(id);
  await assert.rejects(worker().runBatch({ limit: 6 }));
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const original = analyzer.analyze;
  analyzer.analyze = async prepared => { started(); await new Promise(resolve => { release = resolve; }); return original(prepared); };
  const first = worker().runBatch({ limit: 2 });
  await Promise.race([entered, first.then(result => { throw Error(`Worker ended before analysis: ${JSON.stringify(result)}`); })]);
  try { assert.equal((await worker().runBatch({ limit: 2 })).status, 'busy'); }
  finally { release(); }
  await first; assert.equal(calls, 1); analyzer.analyze = original;
  await worker().runBatch({ limit: 2 }); assert.equal(calls, 3);
});
test('only one classified transient retry is allowed, fifteen minutes later', { skip: !emulator }, async () => {
  await job(); analyzer.analyze = async () => { calls++; throw Object.assign(Error('PRIVATE'), { code: 'TRANSIENT' }); };
  await worker().runBatch(); assert.equal((await data()).state, 'retry'); assert.equal(calls, 1);
  await worker().runBatch(); assert.equal(calls, 1);
  instant += 15 * 60000; await worker().runBatch(); assert.equal(calls, 2); assert.equal((await data()).state, 'unavailable');
  assert.equal(JSON.stringify(await data()).includes('PRIVATE'), false);
});
test('auth, invalid and unknown provider errors never retry', { skip: !emulator }, async () => {
  for (const code of ['AUTH', 'INVALID_OUTPUT', undefined]) {
    await db.doc('workplaceJournalWorker/control').delete(); await job(`err-${code || 'unknown'}`);
    analyzer.analyze = async () => { calls++; throw Object.assign(Error('PRIVATE'), { code }); };
    await worker().runBatch(); assert.equal((await data(`err-${code || 'unknown'}`)).state, 'unavailable');
  }
  assert.equal(calls, 3);
});
test('budget exhaustion defers without an attempt and resumes next UTC day', { skip: !emulator }, async () => {
  await job(); await db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 100000 });
  await worker().runBatch(); assert.equal(calls, 0); assert.equal((await data()).state, 'queued'); assert.equal((await data()).attempts, 0);
  instant = Date.parse('2026-10-23T00:00:00Z'); await worker().runBatch(); assert.equal(calls, 1);
});
test('existing receipt and abandoned sending state fail closed across restart and midnight', { skip: !emulator }, async () => {
  await job(); await db.doc(`workplaceAnalysisBudgetAttempts/${digest(['job-a', 1])}`).set({ day: '2026-10-21', reservedMicroUsd: 10120 });
  await worker().runBatch(); assert.equal(calls, 0); assert.equal((await data()).state, 'unavailable');
  await db.doc('workplaceJournalWorker/control').delete(); await job('sending', { state: 'sending', attempts: 1, leaseUntil: '2026-10-21T00:00:00Z', leaseOwner: 'old' });
  await worker().runBatch(); assert.equal(calls, 0); assert.equal((await data('sending')).state, 'unavailable');
});
test('expired owner cannot commit usage and overrun durably disables later batches', { skip: !emulator }, async () => {
  await job(); analyzer.analyze = async () => { calls++; instant += 91000; return { usage: { inputTokens: 1000, outputTokens: 100 } }; };
  await worker().runBatch(); assert.notEqual((await data()).state, 'processed'); assert.equal((await data()).usage, undefined);
  await db.doc('workplaceJournalWorker/control').delete(); await job('overrun');
  analyzer.analyze = async () => { calls++; return { usage: { inputTokens: 10001, outputTokens: 100 } }; };
  await worker().runBatch(); assert.equal((await data('overrun')).state, 'unavailable');
  await job('later'); const count = calls; assert.equal((await worker().runBatch()).status, 'unavailable'); assert.equal(calls, count);
});
test('usage brake stops the same batch and cannot be bypassed by profile property ordering', { skip: !emulator }, async () => {
  await job('a-overrun'); await job('b-waiting');
  analyzer.analyze = async () => { calls++; return { usage: { inputTokens: 10001, outputTokens: 1 } }; };
  await worker().runBatch(); assert.equal(calls, 1); assert.equal((await data('b-waiting')).state, 'queued');
  const reordered = Object.fromEntries(Object.entries(PRICE_PROFILE).reverse());
  assert.equal((await worker({ priceProfile: reordered }).runBatch()).status, 'unavailable'); assert.equal(calls, 1);
});
test('malformed due dates fail closed rather than staying invisibly queued', { skip: !emulator }, async () => {
  await job('malformed', { dueAt: 'invalid' });
  await worker().runBatch(); assert.equal((await data('malformed')).state, 'unavailable'); assert.equal(calls, 0);
});
test('source mutation between preparation and send is cancelled in a fresh real transaction', { skip: !emulator }, async () => {
  await job(); let pending;
  const wrapped = { collection: name => db.collection(name), runTransaction: async fn => {
    if (pending) { const mutation = pending; pending = null; await mutation; }
    return db.runTransaction(fn);
  } };
  analyzer.prepare = () => { pending = db.doc('users/worker-student/logbook/entry').update({ rawNotes: 'New legacy text, same revision.' }); return metadata(); };
  await worker({ db: wrapped }).runBatch(); assert.equal((await data()).state, 'cancelled'); assert.equal(calls, 0);
});

test('adapter runs outside transaction callbacks and lease expiry during reads prevents sending', { skip: !emulator }, async () => {
  await job(); let inside = false, expire = false;
  const wrapped = { collection: name => db.collection(name), runTransaction: fn => db.runTransaction(async tx => {
    inside = true;
    try { return await fn({ get: async ref => {
      const snap = await tx.get(ref);
      if (expire && ref.path === 'users/worker-student/logbook/entry') { instant += 91000; expire = false; }
      return snap;
    }, set: (...args) => tx.set(...args), update: (...args) => tx.update(...args) }); }
    finally { inside = false; }
  }) };
  const original = analyzer.analyze;
  analyzer.analyze = prepared => { assert.equal(inside, false); return original(prepared); };
  await worker({ db: wrapped }).runBatch(); assert.equal(calls, 1);
  await db.doc('workplaceJournalWorker/control').delete(); await job('expires-during-read');
  analyzer.prepare = () => { expire = true; return metadata(); };
  await worker({ db: wrapped }).runBatch(); assert.equal(calls, 1);
});

test('final send and outcome transactions cannot use a lease that expires during source reads', { skip: !emulator }, async () => {
  // After preparation: preflight, sending transaction, pre-send recheck, outcome.
  for (const expireAt of [2, 4]) {
    instant = baseTime; calls = 0; await db.doc('workplaceJournalWorker/control').delete(); await job(`late-${expireAt}`);
    let reads = 0, armed = false;
    const wrapped = { collection: name => db.collection(name), runTransaction: fn => db.runTransaction(async tx => fn({
      get: async ref => { const snap = await tx.get(ref);
        if (armed && ref.path === 'users/worker-student/logbook/entry' && ++reads === expireAt) instant += 91000;
        return snap; }, set: (...args) => tx.set(...args), update: (...args) => tx.update(...args),
    })) };
    analyzer.prepare = () => { armed = true; return metadata(); };
    await worker({ db: wrapped }).runBatch();
    assert.equal(calls, expireAt === 2 ? 0 : 1);
    assert.notEqual((await data(`late-${expireAt}`)).state, 'processed');
    await db.doc(`workplaceJournalAnalysisJobs/late-${expireAt}`).delete();
  }
});

test('lease expiry after sending transaction resolves prevents an adapter call', { skip: !emulator }, async () => {
  await job();
  const wrapped = { collection: name => db.collection(name), runTransaction: async fn => {
    let sending = false;
    const result = await db.runTransaction(tx => fn({ get: ref => tx.get(ref), set: (...args) => tx.set(...args),
      update: (ref, patch) => { if (patch.state === 'sending') sending = true; return tx.update(ref, patch); } }));
    if (sending) instant += 91000;
    return result;
  } };
  await worker({ db: wrapped }).runBatch(); assert.equal(calls, 0);
});
