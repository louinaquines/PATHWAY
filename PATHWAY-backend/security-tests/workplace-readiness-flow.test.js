const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
let f, calls;
const secret = 'd'.repeat(64);
const build = patch => require('../workplaceReadinessGate').createReadinessWorkplaceComposition({ enabled: true, readinessGate: true,
  db: f.db, clock: f.clock, workplaceSecret: secret, apiKey: 'SYNTHETIC-NOT-A-KEY', transport: async url => {
    calls.push(url);
    return url.endsWith('count_tokens') ? Response.json({ input_tokens: 600 }) : Response.json({
      model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
      content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }] });
  }, ...patch });
const request = (jobId, wakeId) => ({ method: 'POST', authorization: 'Bearer '+secret, body: { jobId, wakeId } });
before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:(8180|8280)$/);
  f = await concernFixture(() => {});
});
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.reset(); await f.job(); calls = [];
  for (const name of ['workplaceHostedControl', 'workplaceHostedInterlock', 'workplaceWakeReceipts', 'workplaceWakeJobs', 'workplaceHostedAttempts', 'workplaceHostedDays'])
    await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, operatorRevision: 0,
    stopProtocol: 'operator-revision-v1', readinessProtocol: 'split-operator-interlock-v1', epoch: 'synthetic-epoch', notBefore: '2026-10-22T11:00:00Z' });
  await f.db.doc('workplaceHostedInterlock/control').set({ state: 'bootstrap-idle', generation: 0 });
});

test('one composed runtime processes two jobs with separate held interlock and unchanged operator stop', async () => {
  const operator = (await f.db.doc('workplaceHostedControl/control').get()).data(), composition = build();
  assert.deepEqual(await composition.handle(request('c-job', 'first')), { status: 200, body: { status: 'complete', processed: 1 } });
  await f.job('second-job');
  assert.deepEqual(await composition.handle(request('second-job', 'second')), { status: 200, body: { status: 'complete', processed: 1 } });
  assert.equal(calls.length, 4);
  assert.deepEqual((await f.db.doc('workplaceHostedControl/control').get()).data(), operator);
  const interlock = (await f.db.doc('workplaceHostedInterlock/control').get()).data();
  assert.equal(interlock.state, 'held'); assert.equal(interlock.generation, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/second-job').get()).data().state, 'processed');
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 2, reservedMicroUsd: 19120 });
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 2);
});

test('operator stop and new process both deny continuation without additional provider calls', async () => {
  const composition = build(); await composition.handle(request('c-job', 'first'));
  await f.job('second-job');
  assert.equal((await build().handle(request('second-job', 'restart'))).status, 409);
  await require('../workplaceHostedControl').createHostedWorkplaceControl({ enabled: true, db: f.db, clock: f.clock }).stop();
  assert.equal((await composition.handle(request('second-job', 'operator-stopped'))).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
});

test('confirmed-unsent daily delay waits across UTC midnight and recovers only its exact job', async () => {
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  const composition = build();
  assert.equal((await composition.handle(request('c-job', 'limited'))).status, 200);
  assert.equal(calls.length, 0);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'unsent-wait');
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
  await f.job('different-job');
  assert.equal((await composition.handle(request('different-job', 'cannot-skip-wait'))).status, 409);
  assert.equal((await composition.handle(request('c-job', 'too-early'))).status, 409);
  f.setTime('2026-10-23T00:00:00Z');
  assert.equal((await build().handle(request('c-job', 'restart'))).status, 409);
  assert.deepEqual(await composition.handle(request('c-job', 'due-retry')), { status: 200, body: { status: 'complete', processed: 1 } });
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.deepEqual((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data(), { attempts: 10, reservedMicroUsd: 95600 });
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 2);
});

test('lost safe-unsent settlement acknowledgement never exposes an admissible idle state', async () => {
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  const real = f.db.runTransaction.bind(f.db); let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return async callback => {
      const result = await real(callback);
      if (!lost && (await f.db.doc('workplaceHostedInterlock/control').get()).data().state === 'unsent-wait') {
        lost = true; throw Error('PRIVATE synthetic settlement acknowledgement lost');
      }
      return result;
    };
  } });
  const composition = build({ db: wrapped });
  assert.equal((await composition.handle(request('c-job', 'limited'))).status, 503);
  assert.equal(lost, true); assert.equal(calls.length, 0);
  f.setTime('2026-10-23T00:00:00Z');
  assert.equal((await composition.handle(request('c-job', 'unknown-retry'))).status, 409);
  assert.equal((await build().handle(request('c-job', 'restart-retry'))).status, 409);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'unsent-wait');
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, false);
});

test('legacy runtime cannot silently process a split-protocol control without its gate', async () => {
  const runtime = require('../workplaceHostedRuntime').createHostedWorkplaceRuntime({ enabled: true, db: f.db, clock: f.clock,
    apiKey: 'SYNTHETIC-NOT-A-KEY', transport: async () => { calls.push('unexpected'); throw Error('Unexpected transport'); } });
  assert.deepEqual(await runtime.wake({ jobId: 'c-job' }), { status: 'stopped', processed: 0 });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, false);
});

test('malformed provider result leaves held ownership nontransferable with retained budgets', async () => {
  const composition = build({ transport: async url => {
    calls.push(url);
    return url.endsWith('count_tokens') ? Response.json({ input_tokens: 600 }) : Response.json({
      model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
      content: [{ type: 'text', text: 'not a validated decision' }] });
  } });
  await composition.handle(request('c-job', 'invalid-output'));
  await f.job('second-job');
  assert.equal((await composition.handle(request('second-job', 'no-transfer'))).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'unavailable');
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
});

test('transfer cannot extend a predecessor capability that expires during source reads', async () => {
  const real = f.db.runTransaction.bind(f.db); let transferring = false, expired = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return callback => real(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'get') return async ref => {
        const snapshot = await transaction.get(ref);
        if (transferring && !expired && ref.path === 'companies/c-company') { expired = true; f.setTime('2026-10-22T12:01:31Z'); }
        return snapshot;
      };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
  } });
  const composition = build({ db: wrapped });
  assert.equal((await composition.handle(request('c-job', 'first'))).status, 200);
  await f.job('second-job'); f.setTime('2026-10-22T12:01:29Z'); transferring = true;
  assert.equal((await composition.handle(request('second-job', 'expired-transfer'))).status, 409);
  assert.equal(expired, true); assert.equal(calls.length, 2);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().jobId, 'c-job');
});

test('legacy adapter cannot consume split receipts before the correctly composed runtime', async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  const { createHostedWorkplaceRuntime } = require('../workplaceHostedRuntime');
  const legacy = createHostedWakeAdapter({ enabled: true,
    ...createWorkplaceWakeAuthority({ enabled: true, db: f.db, workplaceSecret: secret, clock: f.clock }),
    runtime: createHostedWorkplaceRuntime({ enabled: true, db: f.db, clock: f.clock, apiKey: 'SYNTHETIC-NOT-A-KEY', transport: async () => assert.fail('Legacy transport') }) });
  assert.equal((await legacy.handle(request('c-job', 'legacy-delivery'))).status, 409);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
  assert.equal((await f.db.collection('workplaceWakeJobs').get()).size, 0);
  assert.equal((await build().handle(request('c-job', 'correct-delivery'))).status, 200);
  assert.equal(calls.length, 2);
});

test('uncertain source read during unsent recovery consumes its private retry capability', async () => {
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  const real = f.db.runTransaction.bind(f.db); let failing = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return callback => real(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'get') return async ref => {
        if (failing && ref.path === 'users/c-student') throw Error('PRIVATE uncertain source read');
        return transaction.get(ref);
      };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
  } });
  const composition = build({ db: wrapped });
  assert.equal((await composition.handle(request('c-job', 'limited'))).status, 200);
  f.setTime('2026-10-23T00:00:00Z'); failing = true;
  assert.equal((await composition.handle(request('c-job', 'uncertain-read'))).status, 503);
  failing = false;
  assert.equal((await composition.handle(request('c-job', 'cannot-retry-uncertainty'))).status, 409);
  assert.equal(calls.length, 0);
});

test('lost successful worker-finalization acknowledgement retains held state and blocks every successor', async () => {
  const real = f.db.runTransaction.bind(f.db); let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return async callback => {
      const result = await real(callback);
      if (!lost && (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed') {
        lost = true; throw Error('PRIVATE lost successful finalization acknowledgement');
      }
      return result;
    };
  } });
  const composition = build({ db: wrapped });
  const response = await composition.handle(request('c-job', 'uncertain-success'));
  assert.equal(lost, true); assert.equal(JSON.stringify(response).includes('PRIVATE'), false);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  await f.job('next-job');
  assert.equal((await composition.handle(request('next-job', 'same-process-next'))).status, 409);
  assert.equal((await build().handle(request('next-job', 'restarted-next'))).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 1, reservedMicroUsd: 9560 });
});

test('concurrent same-instance due recovery claims only one receipt and provider attempt', async () => {
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  const composition = build();
  assert.equal((await composition.handle(request('c-job', 'limited'))).status, 200);
  f.setTime('2026-10-23T00:00:00Z');
  const outcomes = await Promise.all([composition.handle(request('c-job', 'concurrent-a')), composition.handle(request('c-job', 'concurrent-b'))]);
  assert.equal(outcomes.filter(r => r.status === 200).length, 1);
  assert.equal(outcomes.filter(r => r.status === 409).length, 1);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-23').get()).data(), { attempts: 1, reservedMicroUsd: 9560 });
});
