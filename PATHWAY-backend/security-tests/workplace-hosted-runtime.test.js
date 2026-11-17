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
before(async () => { if (emulator) f = await concernFixture(deps => require('../studentJournalSubmission').installStudentJournalSubmission(deps)); });
after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  if (!f) return;
  await f.reset(); await f.seedPilot(); calls = [];
  for (const name of ['workplaceHostedControl','workplaceHostedAttempts','workplaceHostedDays','workplaceWakeReceipts','workplaceWakeJobs']) await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch', notBefore: '2026-10-22T11:00:00Z',
    stopProtocol: 'operator-revision-v1', operatorRevision: 0 });
  await f.job();
});
test('hosted runtime defaults off before touching a store', async () => {
  const { createHostedWorkplaceRuntime } = require('../workplaceHostedRuntime');
  assert.deepEqual(await createHostedWorkplaceRuntime().wake(), { status: 'disabled', processed: 0 });
});

test('recovery authority does not admit a new delivery under a stopped control', { skip: !emulator }, async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  const adapter = createHostedWakeAdapter({ enabled: true, runtime: runtime({ successfulNextJob: true }),
    ...createWorkplaceWakeAuthority({ enabled: true, recoverUnsent: true, db: f.db, workplaceSecret: 'c'.repeat(64), clock: f.clock }) });
  const send = (jobId, wakeId) => adapter.handle({ method: 'POST', authorization: 'Bearer '+ 'c'.repeat(64), body: { jobId, wakeId } });
  assert.equal((await send('c-job', 'first-success')).status, 200);
  await f.job('second-job');
  assert.equal((await send('second-job', 'second-success')).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/second-job').get()).data().state, 'queued');
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 1, reservedMicroUsd: 9560 });
});

test('actual busy worker leaves an unsent delivery recoverable without duplicate reservations', { skip: !emulator }, async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  await f.db.doc('workplaceJournalWorker/control').set({ leaseOwner: 'synthetic-other-worker', leaseUntil: '2026-10-22T12:01:00Z' });
  const adapter = createHostedWakeAdapter({ enabled: true, runtime: runtime({ successfulNextJob: true }),
    ...createWorkplaceWakeAuthority({ enabled: true, recoverUnsent: true, db: f.db, workplaceSecret: 'c'.repeat(64), clock: f.clock }) });
  const send = wakeId => adapter.handle({ method: 'POST', authorization: 'Bearer '+ 'c'.repeat(64), body: { jobId: 'c-job', wakeId } });
  assert.deepEqual(await send('busy-delivery'), { status: 200, body: { status: 'busy', processed: 0 } });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
  await f.db.doc('workplaceJournalWorker/control').set({ leaseOwner: null, leaseUntil: null, cursor: null });
  assert.equal((await send('recovered-delivery')).status, 200);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.equal((await f.db.collection('workplaceJournalAnalysisJobs').get()).size, 1);
  assert.equal((await f.db.collection('users/c-student/logbook').get()).size, 1);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
  assert.equal((await send('provider-replay')).status, 409);
});

test('actual daily budget delay recovers next day without refunding or bypassing the old limit', { skip: !emulator }, async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').set({ attempts: 10, reservedMicroUsd: 95600 });
  const adapter = createHostedWakeAdapter({ enabled: true, runtime: runtime({ successfulNextJob: true }),
    ...createWorkplaceWakeAuthority({ enabled: true, recoverUnsent: true, db: f.db, workplaceSecret: 'c'.repeat(64), clock: f.clock }) });
  const send = wakeId => adapter.handle({ method: 'POST', authorization: 'Bearer '+ 'c'.repeat(64), body: { jobId: 'c-job', wakeId } });
  assert.equal((await send('limited-delivery')).status, 200);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().dueAt, '2026-10-23T00:00:00.000Z');
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
  assert.equal((await send('too-early')).status, 409);
  f.setTime('2026-10-23T00:00:00Z');
  assert.equal((await send('due-delivery')).status, 200);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.deepEqual((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data(), { attempts: 10, reservedMicroUsd: 95600 });
  assert.deepEqual((await f.db.doc('workplaceAnalysisBudgetDays/2026-10-23').get()).data(), { attempts: 1, reservedMicroUsd: 9560 });
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 2);
});

test('actual submission jobs honor declined and withdrawn consent and successive exact-job delivery', { skip: !emulator }, async () => {
  const { digest } = require('../workplaceJournalConsent');
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  const payload = requestId => ({ requestId, rawNotes: 'My supervisor threatened to hit me now.',
    refined: 'Synthetic preserved description.', aiRefined: false, hours: 8 });
  const submit = async requestId => {
    const result = await f.post('/student/journals', payload(requestId), 'c-student');
    assert.equal(result.status, 200); return result.data;
  };
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
  assert.equal((await submit('declined')).analysisStatus, 'not-enabled');
  assert.equal((await f.db.collection('workplaceJournalAnalysisJobs').get()).size, 1); // untouched baseline fixture
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: true, revision: 2 });
  const first = await submit('enabled-one'), second = await submit('enabled-two');
  const adapter = createHostedWakeAdapter({ enabled: true, runtime: runtime({ successfulNextJob: true }),
    ...createWorkplaceWakeAuthority({ enabled: true, db: f.db, workplaceSecret: 'c'.repeat(64), clock: f.clock }) });
  const send = (entry, wakeId) => adapter.handle({ method: 'POST', authorization: 'Bearer '+ 'c'.repeat(64),
    body: { jobId: digest(['c-student', entry.entryId, entry.revision]), wakeId } });
  for (const [entry, wakeId] of [[first, 'submitted-first'], [second, 'submitted-second']]) {
    assert.equal((await send(entry, wakeId)).status, 200);
    assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${digest(['c-student', entry.entryId, entry.revision])}`).get()).data().state, 'processed');
    assert.equal((await f.db.doc(`users/c-student/logbook/${entry.entryId}`).get()).data().rawNotes, payload('unused').rawNotes);
  }
  const withdrawn = await submit('withdrawn-before-wake');
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false, revision: 3 });
  await send(withdrawn, 'withdrawn-wake');
  assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${digest(['c-student', withdrawn.entryId, withdrawn.revision])}`).get()).data().state, 'cancelled');
  assert.equal(calls.length, 4);
  assert.equal((await f.db.collection('studentJournalReceipts').get()).size, 4);
  assert.equal((await f.db.collection('users/c-student/logbook').get()).size, 5);
  assert.equal((await f.db.collection('workplaceJournalAnalysisJobs').get()).size, 4);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceConcernNotices').get()).size, 0);
});

test('opted-in restart during uncertain generation stays stopped and never resends', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  await runtime({ successfulNextJob: true, transport: async url => {
    calls.push(url);
    if (url.endsWith('count_tokens')) return Response.json({ input_tokens: 600 });
    assert.deepEqual(await runtime({ successfulNextJob: true }).wake({ jobId: 'c-job' }), { status: 'stopped', processed: 0 });
    throw Error('Synthetic connection lost during generation');
  } }).wake({ jobId: 'c-job' });
  f.setTime('2026-10-22T12:02:00Z');
  await runtime({ successfulNextJob: true }).wake({ jobId: 'c-job' });
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'unavailable');
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
});

test('retry of final read-only validation creates one handoff without replaying provider calls', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  const real = f.db.runTransaction.bind(f.db); let retried = false, callbacks = 0;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return async callback => {
      if (!retried && (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed'
        && !(await f.db.doc('workplaceJournalWorker/control').get()).data().leaseOwner) {
        return real(async tx => {
          callbacks++; const result = await callback(tx);
          if (!retried) { retried = true; throw Object.assign(Error('Synthetic transaction contention'), { code: 10 }); }
          return result;
        });
      }
      return real(callback);
    };
  } });
  const runner = runtime({ successfulNextJob: true, db: wrapped });
  await runner.wake({ jobId: 'c-job' });
  assert.equal(retried, true); assert.equal(callbacks, 2);
  await f.job('second-job'); await runner.wake({ jobId: 'second-job' });
  assert.equal(calls.length, 4);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 2, reservedMicroUsd: 19120 });
});

test('operator stop defaults off before touching a store', async () => {
  const { createHostedWorkplaceControl } = require('../workplaceHostedControl');
  assert.deepEqual(await createHostedWorkplaceControl({ db: { runTransaction: () => assert.fail('disabled control accessed store') } }).stop(), { status: 'disabled' });
});

test('concurrent protected stops increment revisions and lost acknowledgement cannot reopen the control', { skip: !emulator }, async () => {
  const { createHostedWorkplaceControl } = require('../workplaceHostedControl');
  const build = db => createHostedWorkplaceControl({ enabled: true, db, clock: f.clock });
  const stops = await Promise.all([build(f.db).stop(), build(f.db).stop()]);
  assert.deepEqual(stops.map(s => s.revision).sort(), [1, 2]);
  const real = f.db.runTransaction.bind(f.db);
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key === 'runTransaction') return async callback => { await real(callback); throw Error('Synthetic operator stop acknowledgement lost'); };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(build(wrapped).stop());
  const control = (await f.db.doc('workplaceHostedControl/control').get()).data();
  assert.equal(control.stopped, true); assert.equal(control.operatorRevision, 3);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 0);
});

test('multi-job mode refuses missing stop protocol and malformed operator revision without reserving', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1', stopProtocol: null });
  assert.equal((await runtime({ successfulNextJob: true }).wake({ jobId: 'c-job' })).status, 'stopped');
  await f.db.doc('workplaceHostedControl/control').update({ stopProtocol: 'operator-revision-v1', operatorRevision: -1 });
  assert.equal((await runtime({ successfulNextJob: true }).wake({ jobId: 'c-job' })).status, 'stopped');
  await assert.rejects(require('../workplaceHostedControl').createHostedWorkplaceControl({ enabled: true, db: f.db }).stop());
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
});

test('opted-in success releases only its own acknowledged interlock and permits a distinct job', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  const runner = runtime({ successfulNextJob: true });
  await runner.wake({ jobId: 'c-job' });
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  await f.job('second-job');
  assert.equal((await runtime({ successfulNextJob: true }).wake({ jobId: 'second-job' })).status, 'stopped');
  await runner.wake({ jobId: 'second-job' });
  assert.equal(calls.length, 4);
  for (const id of ['c-job', 'second-job']) assert.equal((await f.db.doc(`workplaceJournalAnalysisJobs/${id}`).get()).data().state, 'processed');
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 2, reservedMicroUsd: 19120 });
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 2);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 2);
  await runner.wake({ jobId: 'c-job' });
  assert.equal(calls.length, 4);
});

test('successful-next-job requires the explicit control mode before any reservation or sharing', { skip: !emulator }, async () => {
  assert.deepEqual(await runtime({ successfulNextJob: true }).wake({ jobId: 'c-job' }), { status: 'stopped', processed: 0 });
  assert.equal(calls.length, 0);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
});

test('protected operator stop advances its revision even when already stopped', { skip: !emulator }, async () => {
  const ref = f.db.doc('workplaceHostedControl/control');
  await ref.update({ operatingMode: 'successful-next-job-v1' });
  let operatorWrite;
  await runtime({ successfulNextJob: true, transport: async url => {
    calls.push(url);
    if (url.endsWith('count_tokens')) return Response.json({ input_tokens: 600 });
    const before = await ref.get();
    operatorWrite = await require('../workplaceHostedControl').createHostedWorkplaceControl({ enabled: true, db: f.db, clock: f.clock }).stop();
    assert.equal((await ref.get()).data().operatorRevision, 1);
    assert.equal(before.updateTime.isEqual((await ref.get()).updateTime), false);
    return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn',
      usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
      content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }] });
  } }).wake({ jobId: 'c-job' });
  assert.ok(operatorWrite);
  assert.equal((await ref.get()).data().stopped, true);
  await f.job('second-job');
  assert.equal((await runtime({ successfulNextJob: true }).wake({ jobId: 'second-job' })).status, 'stopped');
  assert.equal(calls.length, 2);
});

test('lost successful finalization acknowledgement must retain the stop despite processed job state', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  const real = f.db.runTransaction.bind(f.db); let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
    return async callback => {
      const result = await real(callback);
      if (!lost && (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed') {
        lost = true; throw Error('Synthetic finalization acknowledgement lost');
      }
      return result;
    };
  } });
  await runtime({ db: wrapped, successfulNextJob: true }).wake({ jobId: 'c-job' });
  assert.equal(lost, true);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  await f.job('second-job'); await runtime({ successfulNextJob: true }).wake({ jobId: 'second-job' });
  assert.equal(calls.length, 2);
});

test('unsuccessful completion, source changes and stale time never release a multi-job interlock', { skip: !emulator }, async () => {
  for (const boundary of ['invalid-output', 'usage-overflow', 'withdrawal', 'source-edit', 'midnight', 'lease-expiry']) {
    await f.reset(); await f.seedPilot(); await f.job(); calls = [];
    for (const name of ['workplaceHostedAttempts', 'workplaceHostedDays']) await f.db.recursiveDelete(f.db.collection(name));
    await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch',
      notBefore: '2026-10-22T11:00:00Z', operatingMode: 'successful-next-job-v1', stopProtocol: 'operator-revision-v1', operatorRevision: 0 });
    await runtime({ successfulNextJob: true, transport: async url => {
      calls.push(url);
      if (url.endsWith('count_tokens')) return Response.json({ input_tokens: 600 });
      if (boundary === 'withdrawal') await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false });
      if (boundary === 'source-edit') await f.db.doc('users/c-student/logbook/entry').update({ rawNotes: 'Changed synthetic text.', sourceRevision: 2 });
      if (boundary === 'midnight') f.setTime('2026-10-23T00:00:00Z');
      if (boundary === 'lease-expiry') f.setTime('2026-10-22T12:02:00Z');
      return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        usage: { input_tokens: boundary === 'usage-overflow' ? 30000 : 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
        content: [{ type: 'text', text: boundary === 'invalid-output' ? 'invalid' : '{"version":"workplace-concern-v1","findings":[]}' }] });
    } }).wake({ jobId: 'c-job' });
    assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true, boundary);
    assert.notEqual((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed', boundary);
    await f.job('second-job'); await runtime({ successfulNextJob: true }).wake({ jobId: 'second-job' });
    assert.equal(calls.length, 2, boundary);
    assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1, boundary);
  }
});

test('control change after worker finalization wins over interlock release', { skip: !emulator }, async () => {
  const control = f.db.doc('workplaceHostedControl/control');
  await control.update({ operatingMode: 'successful-next-job-v1' });
  const real = f.db.runTransaction.bind(f.db); let changed = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
    return async callback => {
      const result = await real(callback);
      if (!changed && (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed') {
        changed = true; await control.update({ stopped: true, operatorReason: 'Synthetic operator stop' });
      }
      return result;
    };
  } });
  await runtime({ db: wrapped, successfulNextJob: true }).wake({ jobId: 'c-job' });
  assert.equal(changed, true);
  assert.equal((await control.get()).data().stopped, true);
  assert.equal((await control.get()).data().operatorReason, 'Synthetic operator stop');
  assert.equal(calls.length, 2);
});

test('lost release-validation acknowledgement cannot create a continuation permit', { skip: !emulator }, async () => {
  const control = f.db.doc('workplaceHostedControl/control');
  await control.update({ operatingMode: 'successful-next-job-v1' });
  const real = f.db.runTransaction.bind(f.db); let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
    return async callback => {
      let writes = false;
      const result = await real(tx => callback(new Proxy(tx, { get(transaction, method) {
        const value = transaction[method];
        if (['set', 'update', 'create', 'delete'].includes(method)) return (...args) => { writes = true; return value.apply(transaction, args); };
        return typeof value === 'function' ? value.bind(transaction) : value;
      } })));
      if (!lost && (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed'
        && !(await f.db.doc('workplaceJournalWorker/control').get()).data().leaseOwner && !writes) {
        lost = true; throw Error('Synthetic release validation acknowledgement lost');
      }
      return result;
    };
  } });
  const runner = runtime({ db: wrapped, successfulNextJob: true });
  await runner.wake({ jobId: 'c-job' });
  assert.equal(lost, true); assert.equal((await control.get()).data().stopped, true);
  await f.job('second-job'); await runner.wake({ jobId: 'second-job' });
  assert.equal(calls.length, 2);
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), { attempts: 1, reservedMicroUsd: 9560 });
});

test('lost CAS acquisition acknowledgement never permits generation or later automatic sharing', { skip: !emulator }, async () => {
  await f.db.doc('workplaceHostedControl/control').update({ operatingMode: 'successful-next-job-v1' });
  let lost = false;
  const wrapped = new Proxy(f.db, { get(target, key) {
    if (key === 'doc') return path => {
      const ref = target.doc(path);
      if (path !== 'workplaceHostedControl/control') return ref;
      return new Proxy(ref, { get(doc, method) {
        if (method === 'update') return async (...args) => {
          const result = await doc.update(...args);
          if (!lost) { lost = true; throw Error('Synthetic CAS acknowledgement lost'); }
          return result;
        };
        const value = doc[method]; return typeof value === 'function' ? value.bind(doc) : value;
      } });
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  await runtime({ db: wrapped, successfulNextJob: true }).wake({ jobId: 'c-job' });
  assert.equal(lost, true); assert.equal(calls.length, 1);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  await f.job('second-job'); await runtime({ successfulNextJob: true }).wake({ jobId: 'second-job' });
  assert.equal(calls.length, 1);
});

test('operator stop between successful jobs invalidates the same-process continuation permit', { skip: !emulator }, async () => {
  const control = f.db.doc('workplaceHostedControl/control');
  await control.update({ operatingMode: 'successful-next-job-v1' });
  const runner = runtime({ successfulNextJob: true });
  await runner.wake({ jobId: 'c-job' });
  assert.equal((await control.get()).data().stopped, true);
  await require('../workplaceHostedControl').createHostedWorkplaceControl({ enabled: true, db: f.db, clock: f.clock }).stop();
  await f.job('second-job');
  assert.equal((await runner.wake({ jobId: 'second-job' })).status, 'stopped');
  assert.equal(calls.length, 2);
});

test('expiry during final validation reads or its acknowledgement cannot create a handoff', { skip: !emulator }, async () => {
  for (const boundary of ['read-midnight', 'ack-lease']) {
    await f.reset(); await f.seedPilot(); await f.job(); calls = [];
    for (const name of ['workplaceHostedAttempts', 'workplaceHostedDays']) await f.db.recursiveDelete(f.db.collection(name));
    await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch',
      notBefore: '2026-10-22T11:00:00Z', operatingMode: 'successful-next-job-v1', stopProtocol: 'operator-revision-v1', operatorRevision: 0 });
    const real = f.db.runTransaction.bind(f.db); let finalized = false, expired = false;
    const wrapped = new Proxy(f.db, { get(target, key) {
      if (key !== 'runTransaction') { const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; }
      return async callback => {
        let writes = false;
        const result = await real(tx => callback(new Proxy(tx, { get(transaction, method) {
          if (method === 'get') return async ref => {
            const snapshot = await transaction.get(ref);
            if (finalized && !expired && boundary === 'read-midnight' && ref.path === 'companies/c-company') {
              expired = true; f.setTime('2026-10-23T00:00:00Z');
            }
            return snapshot;
          };
          const value = transaction[method];
          if (['set', 'update', 'create', 'delete'].includes(method)) return (...args) => { writes = true; return value.apply(transaction, args); };
          return typeof value === 'function' ? value.bind(transaction) : value;
        } })));
        if (finalized && !expired && !writes && boundary === 'ack-lease') { expired = true; f.setTime('2026-10-22T12:02:00Z'); }
        if (!finalized) finalized = (await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state === 'processed';
        return result;
      };
    } });
    const runner = runtime({ db: wrapped, successfulNextJob: true });
    await runner.wake({ jobId: 'c-job' });
    assert.equal(expired, true, boundary);
    assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed', boundary);
    assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true, boundary);
    await f.job('second-job'); await runner.wake({ jobId: 'second-job' });
    assert.equal(calls.length, 2, boundary);
  }
});

test('authenticated adapter and durable authority execute one real runtime job and block restart replay', { skip: !emulator }, async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  const secret = 'c'.repeat(64);
  const build = () => createHostedWakeAdapter({ enabled: true,
    ...createWorkplaceWakeAuthority({ enabled: true, db: f.db, workplaceSecret: secret, clock: f.clock }), runtime: runtime() });
  const request = { method: 'POST', authorization: 'Bearer '+secret, body: { jobId: 'c-job', wakeId: 'integrated-wake' } };
  assert.equal((await build().handle({ ...request, authorization: 'Bearer '+ 'd'.repeat(64) })).status, 401);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0); assert.equal(calls.length, 0);
  const result = await build().handle(request);
  assert.deepEqual(result, { status: 200, body: { status: 'complete', processed: 1 } });
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'processed');
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  const receipt = (await f.db.collection('workplaceWakeReceipts').get()).docs;
  assert.equal(receipt.length, 1); assert.equal(receipt[0].data().jobId, 'c-job'); assert.equal(receipt[0].data().wakeId, 'integrated-wake');
  assert.equal((await f.db.collection('workplaceWakeJobs').get()).size, 1);
  const budget = (await f.db.doc('workplaceHostedDays/2026-10-22').get()).data();
  assert.deepEqual(budget, { attempts: 1, reservedMicroUsd: 9560 });
  assert.equal((await build().handle(request)).status, 409);
  assert.equal((await build().handle({ ...request, body: { jobId: 'c-job', wakeId: 'new-wake' } })).status, 409);
  await f.job('other-job');
  assert.deepEqual(await build().handle({ ...request, body: { jobId: 'other-job', wakeId: 'other-wake' } }), { status: 200, body: { status: 'stopped', processed: 0 } });
  assert.equal(calls.length, 2);
  assert.deepEqual((await f.db.doc('workplaceHostedDays/2026-10-22').get()).data(), budget);
});

test('integrated authority preserves consumed receipt when withdrawn consent prevents runtime sharing', { skip: !emulator }, async () => {
  const { createHostedWakeAdapter } = require('../workplaceHostedWake');
  const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
  await f.db.doc('workplaceJournalConsents/c-student').update({ granted: false, revision: 2 });
  const build = () => createHostedWakeAdapter({ enabled: true,
    ...createWorkplaceWakeAuthority({ enabled: true, db: f.db, workplaceSecret: 'e'.repeat(64), clock: f.clock }), runtime: runtime() });
  const request = { method: 'POST', authorization: 'Bearer '+ 'e'.repeat(64), body: { jobId: 'c-job', wakeId: 'withdrawn-wake' } };
  assert.equal((await build().handle(request)).status, 200);
  assert.equal((await f.db.doc('workplaceJournalAnalysisJobs/c-job').get()).data().state, 'cancelled');
  assert.equal(calls.length, 0); assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 0);
  assert.equal((await build().handle(request)).status, 409);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 1);
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
