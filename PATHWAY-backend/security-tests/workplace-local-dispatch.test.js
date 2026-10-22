const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkplaceLocalDispatch } = require('../workplaceLocalDispatch');
const env = { PATHWAY_WORKPLACE_FAKE_DISPATCH: '1', PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9199' };
function setup(patch = {}, runBatch = async () => ({ status: 'complete', processed: 0 })) {
  let tick, interval, cleared = 0, calls = 0;
  const dispatch = createWorkplaceLocalDispatch({ db: { projectId: 'demo-pathway-security' }, env: { ...env, ...patch },
    runBatch: async args => { calls++; assert.deepEqual(args, { limit: 5 }); return runBatch(); },
    setIntervalFn: (fn, ms) => { tick = fn; interval = ms; return 42; }, clearIntervalFn: id => { assert.equal(id, 42); cleared++; } });
  return { dispatch, tick: () => tick(), calls: () => calls, interval: () => interval, cleared: () => cleared };
}
test('disabled, remote and production contexts cannot start timers or workers', async () => {
  for (const patch of [{ PATHWAY_WORKPLACE_FAKE_DISPATCH: '' }, { PATHWAY_LOCAL_WORKFLOW: '' }, { GOOGLE_CLOUD_PROJECT: 'pathway-57400' },
    { FIRESTORE_EMULATOR_HOST: 'remote:8180' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199/remote' }, { NODE_ENV: 'production' }, { K_SERVICE: 'hosted' }]) {
    const f = setup(patch); await f.dispatch.start(); await f.dispatch.wake(); f.dispatch.stop();
    assert.equal(f.calls(), 0); assert.equal(f.interval(), undefined); assert.equal(f.cleared(), 0);
  }
});
test('start wakes once and recovery wakes every fifteen minutes; stop owns its timer', async () => {
  const f = setup(); await f.dispatch.start(); await f.dispatch.start();
  assert.equal(f.calls(), 1); assert.equal(f.interval(), 900000);
  await f.tick(); assert.equal(f.calls(), 2);
  f.dispatch.stop(); f.dispatch.stop(); await f.tick(); await f.dispatch.wake(); assert.equal(f.calls(), 2); assert.equal(f.cleared(), 1);
});
test('backlog is bounded to four five-job batches despite continuous wake pressure', async () => {
  let f; f = setup({}, async () => { void f.dispatch.wake(); return { status: 'complete', processed: 5 }; });
  await f.dispatch.start(); assert.equal(f.calls(), 4); f.dispatch.stop();
});
test('overlapping wakes serialize and coalesce into one pending check', async () => {
  let release, active = 0, peak = 0;
  const f = setup({}, async () => { active++; peak = Math.max(peak, active); if (f.calls() === 1) await new Promise(r => { release = r; }); active--; return { status: 'complete', processed: 0 }; });
  const first = f.dispatch.start(); await Promise.resolve();
  const others = Array.from({ length: 20 }, () => f.dispatch.wake()); release();
  await Promise.all([first, ...others]); assert.equal(peak, 1); assert.equal(f.calls(), 2); f.dispatch.stop();
});
test('busy, unavailable and errors stop draining but permit a later recovery', async () => {
  for (const outcome of ['busy', 'unavailable', 'throw']) {
    let first = true; const f = setup({}, async () => { if (first) { first = false; if (outcome === 'throw') throw Error('private failure'); return { status: outcome, processed: 5 }; } return { status: 'complete', processed: 0 }; });
    await f.dispatch.start(); assert.equal(f.calls(), 1); await f.tick(); assert.equal(f.calls(), 2); f.dispatch.stop();
  }
});
test('stop during an attempt drops pending wakes without cancelling the active attempt', async () => {
  let release; const f = setup({}, async () => { await new Promise(r => { release = r; }); return { status: 'complete', processed: 5 }; });
  const first = f.dispatch.start(); await Promise.resolve(); void f.dispatch.wake(); f.dispatch.stop(); release(); await first;
  assert.equal(f.calls(), 1); assert.equal(f.cleared(), 1);
});
test('fixed analyzer supports exact synthetic fixtures only, with validated literal evidence', async () => {
  const { createLocalAnalyzer } = require('./workplace-local-analyzer');
  const { fixtures } = require('./workplace-claude-fixtures');
  const analyzer = createLocalAnalyzer();
  for (const f of fixtures) {
    const result = await analyzer.analyze(analyzer.prepare(f.notes));
    assert.equal(result.decision.findings[0]?.priority || 'none', f.expected);
    assert.equal(result.decision.findings[0]?.quote || null, f.evidence);
  }
  assert.throws(() => analyzer.prepare('A real or unsupported journal'), /unavailable/i);
  await assert.rejects(analyzer.analyze({ request: 'unsupported' }), /unavailable/i);
});

test('owned recovery runs once per bounded wake and cannot block jobs after a failure', async () => {
  let recoveries = 0, batches = 0;
  const dispatch = createWorkplaceLocalDispatch({ db: { projectId: 'demo-pathway-security' }, env,
    runRecovery: async () => { recoveries++; throw Error('synthetic cleanup unavailable'); },
    runBatch: async () => { batches++; return { status: 'complete', processed: 5 }; },
    setIntervalFn: () => 1, clearIntervalFn: () => {} });
  await dispatch.start(); assert.equal(recoveries, 1); assert.equal(batches, 4);
  dispatch.stop(); await dispatch.wake(); assert.equal(recoveries, 1);
  const disabled = createWorkplaceLocalDispatch({ db: { projectId: 'demo-pathway-security' }, env: {},
    runRecovery: () => assert.fail('Disabled cleanup accessed'), runBatch: () => assert.fail('Disabled worker accessed') });
  await disabled.start(); await disabled.wake();
});
