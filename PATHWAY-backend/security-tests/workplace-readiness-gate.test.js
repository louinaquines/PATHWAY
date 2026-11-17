const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let f;
const gate = patch => require('../workplaceReadinessGate').createWorkplaceReadinessGate({ enabled: true, db: f.db, clock: f.clock, ...patch });
before(async () => { if (emulator) {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:(8180|8280)$/);
  f = await concernFixture(() => {});
} });
after(async () => { if (f) await f.close(); });
beforeEach(async () => { if (!f) return;
  await f.reset(); await f.job();
  for (const name of ['workplaceHostedControl', 'workplaceHostedInterlock', 'workplaceWakeReceipts', 'workplaceWakeJobs', 'workplaceHostedAttempts'])
    await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, operatorRevision: 0,
    stopProtocol: 'operator-revision-v1', readinessProtocol: 'split-operator-interlock-v1', epoch: 'synthetic-epoch', notBefore: '2026-10-22T11:00:00Z' });
  await f.db.doc('workplaceHostedInterlock/control').set({ state: 'bootstrap-idle', generation: 0 });
});

test('split readiness gate defaults off before accessing storage', async () => {
  const { createWorkplaceReadinessGate } = require('../workplaceReadinessGate');
  const gate = createWorkplaceReadinessGate({ db: new Proxy({}, { get() { assert.fail('Disabled gate accessed storage'); } }) });
  assert.equal(await gate.claimWake({ jobId: 'synthetic-job', wakeId: 'synthetic-wake' }), false);
  assert.equal(await gate.settleWake({ jobId: 'synthetic-job', wakeId: 'synthetic-wake' }), false);
  await assert.rejects(gate.assertExecution({ jobId: 'synthetic-job' }));
  await assert.rejects(gate.finishSuccess({ jobId: 'synthetic-job' }));
});

test('atomic bootstrap admission persists receipt and held interlock without changing operator control or budgets', { skip: !emulator }, async () => {
  const g = gate(), operator = await f.db.doc('workplaceHostedControl/control').get();
  assert.equal(await g.claimWake({ jobId: 'c-job', wakeId: 'wake-one' }), true);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().generation, 1);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
  assert.equal((await f.db.collection('workplaceWakeJobs').get()).size, 1);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
  assert.deepEqual((await f.db.doc('workplaceHostedControl/control').get()).data(), operator.data());
  await g.assertExecution({ jobId: 'c-job' });
  await assert.rejects(gate().assertExecution({ jobId: 'c-job' }));
});

test('operator stops, disabled and legacy controls deny before claiming receipts', { skip: !emulator }, async () => {
  const control = f.db.doc('workplaceHostedControl/control'), original = (await control.get()).data();
  for (const patch of [{ stopped: true }, { enabled: false }, { readinessProtocol: null }, { operatorRevision: -1 }]) {
    await control.set({ ...original, ...patch });
    assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'denied-wake' }), false);
    assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
    assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().generation, 0);
  }
});

test('concurrent instances admit at most one job and restart cannot use its held ownership', { skip: !emulator }, async () => {
  await f.job('other-job');
  const a = gate(), b = gate();
  const outcomes = await Promise.all([a.claimWake({ jobId: 'c-job', wakeId: 'wake-one' }), b.claimWake({ jobId: 'other-job', wakeId: 'wake-two' })]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  const held = (await f.db.doc('workplaceHostedInterlock/control').get()).data();
  await assert.rejects(gate().assertExecution({ jobId: held.jobId }));
  assert.equal(await gate().claimWake({ jobId: held.jobId, wakeId: 'restart-wake' }), false);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
});

test('lost admission acknowledgement retains held state without private execution authority', { skip: !emulator }, async () => {
  const real = f.db.runTransaction.bind(f.db);
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key === 'runTransaction') return async callback => { await real(callback); throw Error('Synthetic lost admission acknowledgement'); };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const g = gate({ db: wrapped });
  await assert.rejects(g.claimWake({ jobId: 'c-job', wakeId: 'lost-ack' }));
  await assert.rejects(g.assertExecution({ jobId: 'c-job' }));
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
  assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'new-wake' }), false);
});

test('busy worker, prior attempts and revoked consent deny without consuming delivery', { skip: !emulator }, async () => {
  await f.db.doc('workplaceJournalWorker/control').set({ leaseOwner: 'other', leaseUntil: '2026-10-22T12:01:00Z' });
  assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'busy' }), false);
  await f.db.doc('workplaceJournalWorker/control').set({ leaseOwner: null, leaseUntil: null });
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
  assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'withdrawn' }), false);
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: true });
  const { digest } = require('../workplaceJournalConsent');
  await f.db.doc(`workplaceHostedAttempts/${digest(['c-job', 2])}`).set({ stage: 'reserved' });
  assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'reserved' }), false);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
});

test('operator stop during admission read wins on transaction retry', { skip: !emulator }, async () => {
  const real = f.db.runTransaction.bind(f.db); let stopped = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    const attempt = callback => real(tx => callback(new Proxy(tx, { get(transaction, method) {
      if (method === 'get') return async ref => {
        const snapshot = await transaction.get(ref);
        if (!stopped && ref.path === 'workplaceHostedControl/control') {
          stopped = true;
          throw Object.assign(Error('Synthetic transaction retry boundary'), { code: 'SYNTHETIC_RETRY' });
        }
        return snapshot;
      };
      const value = transaction[method]; return typeof value === 'function' ? value.bind(transaction) : value;
    } })));
    return async callback => {
      try { return await attempt(callback); } catch (error) {
        if (error.code !== 'SYNTHETIC_RETRY') throw error;
        await f.db.doc('workplaceHostedControl/control').update({ stopped: true, operatorRevision: 1 });
        return attempt(callback);
      }
    };
  } });
  assert.equal(await gate({ db: wrapped }).claimWake({ jobId: 'c-job', wakeId: 'raced-stop' }), false);
  assert.equal(stopped, true);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
});

test('expiry after admission commit destroys private authority but preserves the held receipt', { skip: !emulator }, async () => {
  const real = f.db.runTransaction.bind(f.db); let expired = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return async callback => {
      const result = await real(callback);
      if (!expired) { expired = true; f.setTime('2026-10-22T12:02:00Z'); }
      return result;
    };
  } });
  const g = gate({ db: wrapped });
  await assert.rejects(g.claimWake({ jobId: 'c-job', wakeId: 'expired-ack' }));
  await assert.rejects(g.assertExecution({ jobId: 'c-job' }));
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
});

test('malformed bootstrap ownership and mixed legacy protocol never admit work', { skip: !emulator }, async () => {
  const ref = f.db.doc('workplaceHostedInterlock/control');
  for (const value of [null, { state: 'held', generation: 0 }, { state: 'bootstrap-idle', generation: -1 },
    { state: 'bootstrap-idle', generation: Number.MAX_SAFE_INTEGER }, { state: 'bootstrap-idle', generation: 0, jobId: 'old-job', nonce: 'old-owner' }]) {
    if (value) await ref.set(value); else await ref.delete();
    assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'bad-bootstrap' }), false);
    assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
  }
  await ref.set({ state: 'bootstrap-idle', generation: 0 });
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  assert.equal(await gate().claimWake({ jobId: 'c-job', wakeId: 'mixed-protocol' }), false);
});
