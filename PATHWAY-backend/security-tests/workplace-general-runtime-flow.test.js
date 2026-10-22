const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { concernFixture, NOTES, decision } = require('./concern-fixture');
const { installPilotFlow } = require('./workplace-claude-pilot');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { prepareWorkplaceClaudeRequest } = require('../workplaceClaudeAdapter');
const { digest } = require('../workplaceJournalConsent');
const runtime = require('./workplace-general-runtime');
const env = { PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' };
let f, dir, accounting, calls, sequence = 0;
function reply(patch = {}) { return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 150, service_tier: 'standard', inference_geo: 'global' },
  content: [{ type: 'text', text: JSON.stringify(decision()) }], ...patch }); }
before(async () => { f = await concernFixture(installPilotFlow); });
after(async () => { await f?.close(); });
beforeEach(async () => { await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceSyntheticStageClaims')); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-synthetic-general-')); accounting = []; calls = { count: 0, generation: 0 }; });
afterEach(() => { for (const a of accounting) a.close(); fs.rmSync(dir, { recursive: true, force: true }); });
async function harness(patch = {}) {
  assert.equal(typeof runtime.createSyntheticStageClaims, 'function'); assert.equal(typeof runtime.createSyntheticLocalAccounting, 'function');
  const requestId = `synthetic-general-${++sequence}`, prepared = prepareWorkplaceClaudeRequest(NOTES), sessionId = randomUUID(), day = f.clock().toISOString().slice(0, 10);
  const claims = runtime.createSyntheticStageClaims({ db: patch.db || f.db, env, enabled: true, studentId: 'c-student', requestId, requestHash: digest(prepared.request), day, sessionId, clock: f.clock });
  await claims.arm();
  const saved = await f.post('/student/journals', { requestId, rawNotes: NOTES, refined: NOTES, aiRefined: false, hours: 8 }, 'c-student');
  assert.equal(saved.status, 200); const jobId = digest(['c-student', saved.data.entryId, 1]);
  const a = runtime.createSyntheticLocalAccounting({ file: path.join(dir, `ledger-${sequence}`), attemptId: digest([jobId, 1]), sessionId, day, clock: f.clock }); accounting.push(a);
  const analyzer = runtime.createSyntheticGeneralAnalyzer({ enabled: true, env, source: NOTES, clock: f.clock, claims, assertBound: claims.assertBound,
    ...a, countTransport: async () => { calls.count++; assert.equal(a.snapshot().attempts, 1); return Response.json({ input_tokens: 600 }); },
    generationTransport: async () => { calls.generation++; assert.equal(a.isStopped(), true); return reply(); }, ...patch.analyzer });
  const worker = createWorkplaceJournalWorker({ db: patch.db || f.db, enabled: true, analyzer, clock: f.clock,
    onAccountingUncertain: a.stopLocal, ...patch.worker });
  return { claims, a, analyzer, worker, jobId, entryId: saved.data.entryId, requestId, prepared, run: () => worker.runBatch({ limit: 1, jobId }) };
}
test('selected new submission counts once after both reservations, generates once, and delivers privately', async () => {
  const h = await harness(); await h.run(); await h.run(); assert.deepEqual(calls, { count: 1, generation: 1 });
  assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${h.jobId}`).get()).data().state, 'processed');
  const item = await f.case(); assert.equal(item.data().priority, 'high');
  assert.equal((await f.post(`/coordinator/workplace-concerns/${item.id}/detail`)).status, 200);
  assert.equal((await f.post(`/coordinator/workplace-concerns/${item.id}/detail`, {}, 'c-other')).status, 403);
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 1);
  assert.equal(h.a.snapshot().reservedMicroUsd, 9560); assert.equal(h.a.isStopped(), true);
});
test('count refusal retains both reservations and stops with no generation or case', async () => {
  const h = await harness({ analyzer: { countTransport: async () => { calls.count++; return Response.json({ input_tokens: 12001 }); } } }); await h.run();
  assert.deepEqual(calls, { count: 1, generation: 0 }); assert.equal(h.a.snapshot().attempts, 1); assert.equal(h.a.isStopped(), true);
  assert.equal((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data().attempts, 1);
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
});
test('withdrawal, source edit, midnight and lease expiry during count prevent generation', async () => {
  for (const change of ['consent', 'source', 'day', 'lease']) {
    await f.reset(); const h = await harness({ analyzer: { countTransport: async () => {
      calls.count++;
      if (change === 'consent') await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
      if (change === 'source') await f.db.doc(`users/c-student/logbook/${h.entryId}`).update({ rawNotes: 'Changed original' });
      if (change === 'day') f.setTime('2026-10-23T00:00:00Z');
      if (change === 'lease') f.setTime('2026-10-22T12:02:00Z');
      return Response.json({ input_tokens: 600 });
    } } });
    const prior = calls.generation; await h.run(); assert.equal(calls.generation, prior); assert.equal(h.a.isStopped(), true);
    assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
  }
});
test('stale results and reassignment never leak to the prior coordinator', async () => {
  for (const change of ['consent', 'source', 'assignment']) {
    await f.reset(); const h = await harness({ analyzer: { generationTransport: async () => {
      calls.generation++;
      if (change === 'consent') await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
      if (change === 'source') await f.db.doc(`users/c-student/logbook/${h.entryId}`).update({ rawNotes: 'Changed' });
      if (change === 'assignment') await f.db.doc('sections/c-section').update({ coordinatorId: 'c-other' });
      return reply();
    } } }); await h.run();
    const items = await f.db.collection('workplaceConcernCases').get();
    if (change === 'assignment') { assert.equal(items.size, 1); assert.equal((await f.post(`/coordinator/workplace-concerns/${items.docs[0].id}/detail`)).status, 403); }
    else assert.equal(items.size, 0);
  }
});
test('usage overflow triggers the real worker price brake with retained reservation', async () => {
  const h = await harness({ analyzer: { generationTransport: async () => reply({ usage: { input_tokens: 14001, output_tokens: 1, service_tier: 'standard', inference_geo: 'global' } }) } });
  await h.run(); const brakes = await f.db.collection('workplaceJournalWorker').get();
  assert.ok(brakes.docs.some(d => d.data().blocked === true)); assert.equal(h.a.isStopped(), true); assert.equal(h.a.snapshot().attempts, 1);
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
});
test('historical receipts, wrong emulator context and canonical ledger paths are refused', async () => {
  assert.equal(typeof runtime.createSyntheticStageClaims, 'function');
  assert.throws(() => runtime.createSyntheticStageClaims({ db: f.db, env: { ...env, GOOGLE_CLOUD_PROJECT: 'other' }, enabled: true }));
  assert.throws(() => runtime.createSyntheticLocalAccounting({ file: path.resolve(__dirname, '../../output/release/workplace-claude-pilot-reservations.jsonl') }));
  const h = await harness();
  const claims = runtime.createSyntheticStageClaims({ db: f.db, env, enabled: true, studentId: 'c-student', requestId: h.requestId,
    requestHash: digest(h.prepared.request), sessionId: randomUUID(), day: '2026-10-22', clock: f.clock });
  await assert.rejects(claims.arm()); assert.deepEqual(calls, { count: 0, generation: 0 });
});

test('competing workers and replay cannot create a second count or generation', async () => {
  const h = await harness(); await Promise.all([h.run(), h.run()]);
  assert.deepEqual(calls, { count: 1, generation: 1 });
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 1);
});

test('persisted count or generation claim prevents a restart after an uncertain boundary', async () => {
  for (const stage of ['count', 'generation']) {
    await f.reset(); const h = await harness({ analyzer: {
      ...(stage === 'count' ? { countTransport: async () => { calls.count++; throw Error('PRIVATE lost count'); } }
        : { generationTransport: async () => { calls.generation++; throw Error('PRIVATE lost generation'); } }),
    } });
    await h.run(); const before = { ...calls };
    const claim = (await f.db.doc(`workplaceSyntheticStageClaims/${digest([h.jobId, 1])}`).get()).data();
    assert.equal(claim.stage, stage);
    assert.equal(h.a.isStopped(), true); await h.run(); assert.deepEqual(calls, before);
    const restarted = runtime.createSyntheticStageClaims({ db: f.db, env, enabled: true, studentId: 'c-student', requestId: h.requestId,
      requestHash: digest(h.prepared.request), sessionId: randomUUID(), day: '2026-10-22', clock: f.clock });
    await assert.rejects(restarted.arm());
    assert.throws(() => runtime.createSyntheticLocalAccounting({ file: path.join(dir, `ledger-${sequence}`), attemptId: digest([h.jobId, 1]), sessionId: randomUUID(), day: '2026-10-22', clock: f.clock }));
    assert.equal(h.a.snapshot().attempts, 1);
  }
});

test('local reservation failure stops after Firestore reservation without sharing', async () => {
  const h = await harness({ analyzer: { reserveLocal: () => { throw Error('PRIVATE local disk'); } } });
  await h.run(); assert.deepEqual(calls, { count: 0, generation: 0 }); assert.equal(h.a.isStopped(), true);
  assert.equal(h.a.snapshot().attempts, 0);
  assert.equal((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data().attempts, 1);
});

test('lost Firestore reservation acknowledgement and finalization failure still write the fake stop', async () => {
  let lost = false;
  const db = new Proxy(f.db, { get(target, key) {
    if (key === 'runTransaction') return async callback => {
      const result = await target.runTransaction(tx => callback(new Proxy(tx, { get(transaction, method) {
        if (method === 'update') return (ref, value) => { if (lost && value?.state === 'unavailable') throw Error('PRIVATE finalization'); return transaction.update(ref, value); };
        const value = Reflect.get(transaction, method, transaction); return typeof value === 'function' ? value.bind(transaction) : value;
      } })));
      if (result?.status === 'reserved') { lost = true; throw Error('PRIVATE lost acknowledgement'); } return result;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const h = await harness({ db }); await h.run(); assert.equal(lost, true); assert.equal(h.a.isStopped(), true);
  assert.deepEqual(calls, { count: 0, generation: 0 }); assert.equal((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data().attempts, 1);
});

test('a day-mismatched budget receipt blocks before local reservation or count', async () => {
  const h = await harness(); const original = h.claims.assertBound;
  let changed = false;
  h.claims.assertBound = async p => original(p);
  // Intercept the analyzer's first authorization check after the worker reserved.
  const analyzer = runtime.createSyntheticGeneralAnalyzer({ source: NOTES, enabled: true, env, clock: f.clock, claims: h.claims, ...h.a,
    assertBound: async p => { if (!changed) { changed = true; await f.db.doc(`workplaceAnalysisBudgetAttempts/${digest([h.jobId, 1])}`).update({ day: '2026-10-21' }); } return original(p); },
    countTransport: async () => { calls.count++; return Response.json({ input_tokens: 500 }); }, generationTransport: async () => { calls.generation++; return reply(); } });
  await createWorkplaceJournalWorker({ db: f.db, enabled: true, analyzer, clock: f.clock, onAccountingUncertain: h.a.stopLocal }).runBatch({ limit: 1, jobId: h.jobId });
  assert.deepEqual(calls, { count: 0, generation: 0 }); assert.equal(h.a.snapshot().attempts, 0); assert.equal(h.a.isStopped(), true);
});

test('stale pricing and daily ceilings refuse sharing without changing existing limits', async () => {
  const h = await harness(); f.setTime('2026-10-30T00:00:00Z'); await h.run(); assert.deepEqual(calls, { count: 0, generation: 0 });
  await f.reset(); const capped = await harness(); await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  await capped.run(); assert.deepEqual(calls, { count: 0, generation: 0 }); assert.equal(capped.a.snapshot().attempts, 0);
});

test('transaction finishing after the selected lease expires cannot authorize count', async () => {
  let delayed = false;
  const db = new Proxy(f.db, { get(target, key) {
    if (key === 'runTransaction') return async callback => {
      const result = await target.runTransaction(callback);
      if (!delayed && Number.isFinite(result?.leaseUntil)) { delayed = true; f.setTime('2026-10-22T12:02:00Z'); }
      return result;
    };
    const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
  } });
  const h = await harness({ db }); await h.run(); assert.equal(delayed, true); assert.deepEqual(calls, { count: 0, generation: 0 }); assert.equal(h.a.isStopped(), true);
});

test('shutdown during counting leaves durable stop and never starts generation', async () => {
  const h = await harness({ analyzer: { countTransport: async () => { calls.count++; h.a.stopLocal(); return Response.json({ input_tokens: 600 }); } } });
  await h.run(); assert.deepEqual(calls, { count: 1, generation: 0 }); assert.equal(h.a.isStopped(), true); assert.equal(h.a.snapshot().attempts, 1);
});

test('worker analyzer timeout aborts a stalled count, without a second transport or refund', async () => {
  let aborted = false;
  const h = await harness({ analyzer: { countTransport: async (_body, { signal }) => {
    calls.count++; return new Promise((resolve, reject) => { signal.addEventListener('abort', () => { aborted = true; reject(Error('PRIVATE timeout')); }, { once: true }); });
  } } });
  await h.run(); assert.equal(aborted, true); assert.deepEqual(calls, { count: 1, generation: 0 });
  assert.equal(h.a.isStopped(), true); assert.equal(h.a.snapshot().attempts, 1);
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
});
