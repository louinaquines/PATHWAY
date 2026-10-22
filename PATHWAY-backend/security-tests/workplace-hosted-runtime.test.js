const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let f, calls;
const runtime = patch => require('../workplaceHostedRuntime').createHostedWorkplaceRuntime({
  db: f.db, enabled: true, apiKey: 'SYNTHETIC-NOT-A-KEY', clock: f.clock,
  transport: async url => {
    calls.push(url);
    return url.endsWith('count_tokens') ? Response.json({ input_tokens: 600 }) : Response.json({
      model: 'claude-haiku-5-5', stop_reason: 'end_turn',
      usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
      content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }],
    });
  }, ...patch,
});
before(async () => { if (emulator) f = await concernFixture(() => {}); });
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  if (!f) return;
  await f.reset(); await f.seedPilot(); calls = [];
  for (const name of ['workplaceHostedControl','workplaceHostedAttempts','workplaceHostedDays']) await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch', notBefore: '2026-10-22T11:00:00Z' });
  await f.job();
});
test('hosted runtime defaults off before touching a store', async () => {
  const { createHostedWorkplaceRuntime } = require('../workplaceHostedRuntime');
  assert.deepEqual(await createHostedWorkplaceRuntime().wake(), { status: 'disabled', processed: 0 });
});
test('one bounded job persists reservation and stages; restart cannot resend under stop', { skip: !emulator }, async () => {
  await runtime().wake({ jobId: 'c-job' });
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  const attempts = (await f.db.collection('workplaceHostedAttempts').get()).docs;
  assert.equal(attempts.length, 1); assert.equal(attempts[0].data().stage, 'generation');
  assert.equal(attempts[0].data().reservedMicroUsd, 9560);
  assert.deepEqual(await runtime().wake({ jobId: 'c-job' }), { status: 'stopped', processed: 0 });
  assert.equal(calls.length, 2);
});
test('withdrawal during counting prevents generation and keeps the reservation', { skip: !emulator }, async () => {
  await runtime({ transport: async () => { calls.push('count'); await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false }); return Response.json({ input_tokens: 600 }); } }).wake({ jobId: 'c-job' });
  assert.equal(calls.length, 1);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
});
test('missing control and historical jobs never send', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').delete();
  await runtime().wake({ jobId: 'c-job' }); assert.equal(calls.length, 0);
  await f.job('c-job', { createdAt: '2026-10-22T10:00:00Z' });
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch', notBefore: '2026-10-22T11:00:00Z' });
  await runtime().wake({ jobId: 'c-job' }); assert.equal(calls.length, 0);
});
test('concurrent wakes send at most one count and generation', { skip: !emulator }, async () => {
  await Promise.all([runtime().wake({ jobId: 'c-job' }), runtime().wake({ jobId: 'c-job' })]);
  assert.equal(calls.length, 2);
});
test('source edit, midnight and lease expiry during count block generation', { skip: !emulator }, async () => {
  for (const mutation of ['source','midnight','lease']) {
    await f.reset(); await f.seedPilot(); await f.job(); calls = [];
    for (const name of ['workplaceHostedAttempts','workplaceHostedDays']) await f.db.recursiveDelete(f.db.collection(name));
    await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch', notBefore: '2026-10-22T11:00:00Z' });
    await runtime({ transport: async () => {
      calls.push('count');
      if (mutation === 'source') await f.db.doc('users/c-student/logbook/entry').update({ rawNotes: 'Changed synthetic source' });
      if (mutation === 'midnight') f.setTime('2026-10-23T00:00:00Z');
      if (mutation === 'lease') f.setTime('2026-10-22T12:02:00Z');
      return Response.json({ input_tokens: 600 });
    } }).wake({ jobId: 'c-job' });
    assert.equal(calls.length, 1, mutation);
    assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  }
});
test('lost count-claim acknowledgement persists uncertainty and cannot resend', { skip: !emulator }, async () => {
  const real = f.db.runTransaction.bind(f.db); let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
    return async callback => {
      const result = await real(callback);
      const attempts = (await f.db.collection('workplaceHostedAttempts').get()).docs;
      if (!lost && attempts.some(d => d.data().stage === 'count')) { lost = true; throw Error('Synthetic lost commit acknowledgement'); }
      return result;
    };
  } });
  await runtime({ db: wrapped }).wake({ jobId: 'c-job' });
  assert.equal(lost, true); assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).docs[0].data().stage, 'count');
  await runtime().wake({ jobId: 'c-job' }); assert.equal(calls.length, 0);
});
test('lost reservation, generation-claim and stop acknowledgements never replay requests', { skip: !emulator }, async () => {
  for (const boundary of ['reserved','generation','stop']) {
    await f.reset(); await f.seedPilot(); await f.job(); calls = [];
    for (const name of ['workplaceHostedAttempts','workplaceHostedDays']) await f.db.recursiveDelete(f.db.collection(name));
    await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch', notBefore: '2026-10-22T11:00:00Z' });
    const real = f.db.runTransaction.bind(f.db); let lost = false;
    const wrapped = new Proxy(f.db, { get(target, key) {
      if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
      return async callback => {
        const result = await real(callback);
        const attempts = (await f.db.collection('workplaceHostedAttempts').get()).docs;
        const stopped = (await f.db.doc('workplaceHostedControl/control').get()).data().stopped;
        if (!lost && (boundary === 'stop' ? stopped : attempts.some(d => d.data().stage === boundary))) {
          lost = true; throw Error('Synthetic acknowledgement lost');
        }
        return result;
      };
    } });
    await runtime({ db: wrapped }).wake({ jobId: 'c-job' });
    assert.equal(lost, true, boundary);
    assert.equal(calls.length, boundary === 'reserved' ? 0 : 1, boundary);
    const receipt = (await f.db.collection('workplaceHostedAttempts').get()).docs[0].data();
    assert.equal(receipt.reservedMicroUsd, 9560);
    const before = calls.length;
    await runtime().wake({ jobId: 'c-job' }); assert.equal(calls.length, before, boundary);
    assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  }
});
test('durable daily ceiling prevents external requests without refunding worker reservation', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  await runtime().wake({ jobId: 'c-job' });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 0);
});
test('recovery refuses expired sending jobs instead of resending uncertain work', { skip: !emulator }, async () => {
  await f.job('c-job', { state: 'sending', attempts: 1, leaseOwner: 'old-worker', leaseUntil: '2026-10-22T11:59:00Z' });
  await runtime().wake({ jobId: 'c-job' });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'unavailable');
});
test('stopped restart quarantines expired sending work without reopening sharing', { skip: !emulator }, async () => {
  await f.job('c-job', { state: 'sending', attempts: 1, leaseOwner: 'old-worker', leaseUntil: '2026-10-22T11:59:00Z' });
  await f.db.doc('workplaceHostedControl/control').update({ stopped: true, stopSession: 'old-session' });
  assert.deepEqual(await runtime().wake({ jobId: 'c-job' }), { status: 'stopped', processed: 1 });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'unavailable');
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
});
