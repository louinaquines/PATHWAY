const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { concernFixture } = require('./concern-fixture');
const { installStudentJournalSubmission } = require('../studentJournalSubmission');
const { digest } = require('../workplaceJournalConsent');
const { openPilotLedger } = require('./workplace-claude-pilot');
const { createControlledDispatch } = require('./workplace-controlled-dispatch');
const { fixtures } = require('./workplace-claude-fixtures');
let f, dir, ledger, runtimes, calls;
const env = { PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' };
const window = { studentId: 'c-student', requestId: 'controlled-new', source: fixtures[0].notes,
  startAt: '2026-10-22T12:00:00Z', endAt: '2026-10-22T12:15:00Z' };
function response(fixture = fixtures[0]) {
  return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 150 },
    content: [{ type: 'text', text: JSON.stringify({ version: 'workplace-concern-v1', findings: fixture.expected === 'none' ? [] : [
      { category: 'threat', priority: 'high', quote: fixture.evidence, immediateDangerQuote: fixture.evidence, reason: 'Synthetic review required.' }] }) }] });
}
const submit = (patch = {}) => f.post('/student/journals', { requestId: window.requestId, rawNotes: window.source,
  refined: window.source, aiRefined: false, hours: 8, ...patch }, 'c-student');
function runtime(patch = {}) {
  const value = createControlledDispatch({ db: f.db, env, window, clock: f.clock, ledger, apiKey: 'SYNTHETIC ONLY',
    fetcher: async () => { calls++; return response(); }, setIntervalFn: () => ({ unref() {} }), clearIntervalFn() {}, ...patch });
  runtimes.push(value); return value;
}
function transactionBoundary(around) {
  return new Proxy(f.db, { get(db, key) {
    if (key === 'runTransaction') return callback => around(cb => db.runTransaction(cb), callback);
    const value = Reflect.get(db, key, db); return typeof value === 'function' ? value.bind(db) : value;
  } });
}
before(async () => { f = await concernFixture(installStudentJournalSubmission); });
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-controlled-')); ledger = openPilotLedger(path.join(dir, 'ledger')); runtimes = []; calls = 0;
});
afterEach(() => { for (const r of runtimes) r.stop(); ledger?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
test('new actor-scoped receipt alone dispatches once; replay and another runtime do not consume another attempt', async () => {
  await f.job('unrelated'); const r = runtime(); assert.equal((await r.start()).status, 'waiting');
  const saved = await submit(); assert.equal(saved.status, 200);
  const other = runtime(); await Promise.all([r.wake('unrelated'), other.start()]);
  assert.equal(calls, 1); assert.equal(ledger.isStopped(), true);
  assert.deepEqual((await submit()).data, saved.data); await other.wake(); assert.equal(calls, 1);
  const jobId = digest(['c-student', saved.data.entryId, 1]);
  assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${jobId}`).get()).data().state, 'processed');
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/unrelated').get()).data().state, 'queued');
  assert.equal((await f.db.doc(`users/c-student/logbook/${saved.data.entryId}`).get()).data().rawNotes, window.source);
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 1);
});
test('submission wake during startup waiting transaction is retained through executable lifecycle ownership', async () => {
  let entered, release, paused = false;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const db = transactionBoundary(async (run, callback) => {
    const result = await run(callback);
    if (result === null && !paused) { paused = true; entered(); await gate; }
    return result;
  });
  const { ownControlledRuntime } = require('./workplace-controlled-runtime');
  assert.equal(typeof ownControlledRuntime, 'function');
  const r = ownControlledRuntime(runtime({ db }), { close() {} });
  const startup = r.start(); await waiting; await submit(); const wake = r.wake(); release();
  await Promise.all([startup, wake]); assert.equal(calls, 1); r.stop();
});
test('final authorization transaction finishing after its valid lease cannot authorize HTTP', async () => {
  let delayed = false;
  const db = transactionBoundary(async (run, callback) => {
    const result = await run(callback);
    if (result?.job?.state === 'sending' && ledger.isStopped() && !delayed) {
      delayed = true; f.setTime('2026-10-22T12:02:00Z');
    }
    return result;
  });
  const r = runtime({ db }); await r.start(); await submit(); await r.wake();
  assert.equal(delayed, true); assert.equal(calls, 0); assert.equal(ledger.isStopped(), true);
});
test('unknown Firestore reservation failure durably stops before and after commit even if finalization fails', async () => {
  for (const mode of ['before', 'after']) {
    await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
    ledger.close(); ledger = openPilotLedger(path.join(dir, mode)); let uncertain = false;
    const db = transactionBoundary(async (run, callback) => {
      const result = await run(tx => callback(new Proxy(tx, { get(target, key) {
        if (key === 'get') return ref => {
          if (mode === 'before' && ref.path?.startsWith('workplaceAnalysisBudgetAttempts/')) { uncertain = true; throw Error('SECRET accounting'); }
          return target.get(ref);
        };
        if (key === 'update') return (ref, value) => {
          if (uncertain && value?.state === 'unavailable') throw Error('SECRET finalization');
          return target.update(ref, value);
        };
        const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
      } })));
      if (result?.status === 'reserved' && mode === 'after') { uncertain = true; throw Error('SECRET lost acknowledgement'); }
      return result;
    });
    const r = runtime({ db }); await r.start(); await submit(); const result = await r.wake();
    assert.equal(result.status, 'unavailable'); assert.equal(calls, 0); assert.equal(ledger.isStopped(), true);
    assert.ok(!JSON.stringify(result).includes('SECRET')); await runtime().start(); assert.equal(calls, 0); r.stop();
  }
});
test('receipt predating arming and arbitrary submitted source cannot be processed', async () => {
  await submit(); assert.equal((await runtime().start()).status, 'unavailable'); assert.equal(calls, 0);
  await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
  const r = runtime(); await r.start(); await submit({ rawNotes: 'Not the authorized fixture' });
  assert.equal((await r.wake()).status, 'unavailable'); assert.equal(calls, 0); assert.equal(ledger.snapshot(f.clock()).attempts, 0);
});
test('stopped pilot prevents startup and never creates a new window allowance', async () => {
  ledger.stop(); assert.equal((await runtime().start()).status, 'unavailable'); assert.equal(calls, 0);
  assert.equal((await f.db.collection('workplaceControlledWindows').get()).size, 0);
});
test('a competing wake observing another live lease must not stop the pilot owner', async () => {
  const owner = runtime(); await owner.start(); const saved = await submit();
  const jobId = digest(['c-student', saved.data.entryId, 1]);
  await f.db.doc(`workplaceJournalAnalysisJobs/${jobId}`).update({ state: 'leased', leaseOwner: 'other-owner', leaseUntil: '2026-10-22T12:01:00Z' });
  await runtime().start(); assert.equal(ledger.isStopped(), false); assert.equal(calls, 0);
  await f.db.doc(`workplaceJournalAnalysisJobs/${jobId}`).update({ state: 'queued', leaseOwner: null, leaseUntil: null });
  await owner.wake(); assert.equal(calls, 1);
});
test('failure or invalid output stops durably without another HTTP request', async () => {
  const r = runtime({ fetcher: async () => { calls++; throw Error('SECRET network body'); } });
  await r.start(); await submit(); const result = await r.wake();
  assert.equal(result.status, 'unavailable');
  assert.equal(calls, 1); assert.equal(ledger.isStopped(), true); assert.ok(!JSON.stringify(result).includes('SECRET'));
  await runtime().start(); await r.wake(); assert.equal(calls, 1);
});
test('UTC day crossing after reservations prevents external fetch rather than charging the wrong day', async () => {
  f.setTime('2026-10-22T23:59:59Z');
  const delayed = { isStopped: () => ledger.isStopped(), snapshot: now => ledger.snapshot(now), stop: () => ledger.stop(),
    reserve: (...args) => { const result = ledger.reserve(...args); f.setTime('2026-10-23T00:00:00Z'); return result; } };
  const r = runtime({ ledger: delayed, window: { ...window, startAt: '2026-10-22T23:59:00Z', endAt: '2026-10-23T00:14:00Z' } });
  await r.start(); await submit(); await r.wake(); assert.equal(calls, 0); assert.equal(ledger.isStopped(), true);
});
test('local accounting failure spends the window but sends nothing and cannot restart into a new allowance', async () => {
  const broken = { isStopped: () => ledger.isStopped(), snapshot: now => ledger.snapshot(now), stop: () => ledger.stop(),
    reserve: () => { throw Error('SECRET accounting'); } };
  const r = runtime({ ledger: broken }); await r.start(); await submit(); await r.wake();
  assert.equal(calls, 0); assert.equal(ledger.isStopped(), true);
  assert.equal((await f.db.collection('workplaceControlledWindows').get()).docs[0].data().state, 'spent');
  await runtime().start(); assert.equal(calls, 0);
});
test('lease expiry during local reservation is checked again before external fetch', async () => {
  const delayed = { isStopped: () => ledger.isStopped(), snapshot: now => ledger.snapshot(now), stop: () => ledger.stop(),
    reserve: (...args) => { const result = ledger.reserve(...args); f.setTime('2026-10-22T12:02:00Z'); return result; } };
  const r = runtime({ ledger: delayed }); await r.start(); await submit(); await r.wake();
  assert.equal(calls, 0); assert.equal(ledger.snapshot(f.clock()).attempts, 1); assert.equal(ledger.isStopped(), true);
});
test('restart of an armed window processes only its new receipt, while a changed window is refused', async () => {
  const r = runtime(); await r.start(); r.stop(); await submit();
  const changed = runtime({ window: { ...window, endAt: '2026-10-22T12:14:00Z' } });
  assert.equal((await changed.start()).status, 'unavailable'); assert.equal(calls, 0);
  await runtime().start(); assert.equal(calls, 1);
});
test('restart may recover an abandoned pre-send lease for the same newly bound receipt', async () => {
  const r = runtime(); await r.start(); const saved = await submit(); r.stop();
  const jobId = digest(['c-student', saved.data.entryId, 1]);
  await f.db.doc(`workplaceJournalAnalysisJobs/${jobId}`).update({ state: 'leased', attempts: 0,
    leaseOwner: 'abandoned', leaseUntil: '2026-10-22T11:59:59Z' });
  await runtime().start(); assert.equal(calls, 1);
});
test('both existing daily ceilings remain authoritative and do not silently refund reservations', async () => {
  for (const layer of ['firestore', 'local']) {
    await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
    ledger.close(); ledger = openPilotLedger(path.join(dir, layer));
    if (layer === 'firestore') await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
    else for (let i = 0; i < 10; i++) ledger.reserve(`prior-${i}`, 9560, f.clock());
    const r = runtime(); await r.start(); await submit(); await r.wake(); assert.equal(calls, 0); r.stop();
    assert.equal(ledger.snapshot(f.clock()).attempts, layer === 'local' ? 10 : 0);
  }
});
test('no-concern output creates no alert; cleanup failure does not prevent the bound submission', async () => {
  const r = runtime({ window: { ...window, source: fixtures[3].notes }, runRecovery: () => { throw Error('SECRET cleanup'); },
    fetcher: async () => { calls++; return response(fixtures[3]); } });
  await r.start(); const saved = await submit({ rawNotes: fixtures[3].notes, refined: fixtures[3].notes });
  assert.equal(saved.status, 200); await r.wake(); assert.equal(calls, 1);
  assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0);
});
test('malformed output and usage overflow stop without success alerts or retries', async () => {
  for (const kind of ['malformed', 'overflow']) {
    await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
    ledger.close(); ledger = openPilotLedger(path.join(dir, kind));
    const r = runtime({ fetcher: async () => { calls++; if (kind === 'malformed') return new Response('SECRET invalid body');
      const result = await response().json(); result.usage.input_tokens = 14001; return Response.json(result); } });
    await r.start(); await submit(); await r.wake(); await r.wake();
    assert.equal(ledger.isStopped(), true); assert.equal((await f.db.collection('workplaceConcernCases').get()).size, 0); r.stop();
  }
  assert.equal(calls, 2);
});
test('expiry and consent withdrawal before send produce no provider request', async () => {
  const r = runtime(); await r.start(); await submit();
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
  await r.wake(); assert.equal(calls, 0);
  f.setTime(window.endAt); assert.equal((await r.wake()).status, 'unavailable');
});
test('expired window clears its recovery timer instead of leaving an idle scheduling loop', async () => {
  let cleared = 0;
  const r = runtime({ setIntervalFn: () => 42, clearIntervalFn: value => { assert.equal(value, 42); cleared++; } });
  await r.start(); f.setTime(window.endAt); await r.wake(); assert.equal(cleared, 1); assert.equal(calls, 0);
});
test('withdrawal, source edit or lease expiry during HTTP discards the result; reassignment uses current recipient', async () => {
  for (const change of ['consent', 'source', 'lease', 'assignment']) {
    await f.reset(); await f.db.recursiveDelete(f.db.collection('workplaceControlledWindows'));
    ledger.close(); ledger = openPilotLedger(path.join(dir, change)); let saved;
    const r = runtime({ fetcher: async () => { calls++;
      if (change === 'consent') await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
      if (change === 'source') await f.db.doc(`users/c-student/logbook/${saved.data.entryId}`).update({ sourceRevision: 2 });
      if (change === 'lease') f.setTime('2026-10-22T12:02:00Z');
      if (change === 'assignment') await f.db.doc('sections/c-section').update({ coordinatorId: 'c-other' });
      return response(); } });
    await r.start(); saved = await submit(); await r.wake();
    const notices = await f.db.collection('workplaceConcernNotices').get();
    assert.equal(notices.size, change === 'assignment' ? 1 : 0);
    if (change === 'assignment') assert.equal(notices.docs[0].data().recipientId, 'c-other');
    r.stop();
  }
  assert.equal(calls, 4);
});
