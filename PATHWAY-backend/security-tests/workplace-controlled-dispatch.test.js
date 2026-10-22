const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('./workplace-claude-fixtures');
const { controlledDispatchAllowed, createControlledDispatch } = require('./workplace-controlled-dispatch');
const window = { studentId: 'c-student', requestId: 'controlled-new', source: fixtures[0].notes,
  startAt: '2026-10-23T12:00:00Z', endAt: '2026-10-23T12:15:00Z' };
const env = { PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9199' };
const clock = () => new Date('2026-10-23T12:01:00Z');
test('only the exact local controlled context and current bounded fixture window are eligible', () => {
  const db = { projectId: 'demo-pathway-security' };
  assert.equal(controlledDispatchAllowed({ db, env, window, now: clock() }), true);
  for (const patch of [{ PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '' }, { PATHWAY_LOCAL_WORKFLOW: '' },
    { GOOGLE_CLOUD_PROJECT: 'pathway-57400' }, { FIRESTORE_EMULATOR_HOST: 'example.com:8180' },
    { FIREBASE_AUTH_EMULATOR_HOST: 'localhost:65536' }, { NODE_ENV: 'production' }, { K_SERVICE: 'hosted' },
    { PATHWAY_WORKPLACE_FAKE_DISPATCH: '1' }]) {
    assert.equal(controlledDispatchAllowed({ db, env: { ...env, ...patch }, window, now: clock() }), false);
  }
  for (const patch of [{ source: 'arbitrary journal' }, { studentId: '../real' }, { requestId: '' },
    { startAt: '2026-10-23' }, { endAt: '2026-10-23T12:15:01Z' }, { endAt: window.startAt },
    { startAt: '2026-10-23T12:02:00Z' }, { endAt: '2026-10-23T12:01:00Z' }]) {
    assert.equal(controlledDispatchAllowed({ db, env, window: { ...window, ...patch }, now: clock() }), false);
  }
  assert.equal(controlledDispatchAllowed({ db: { projectId: 'real' }, env, window, now: clock() }), false);
  assert.equal(controlledDispatchAllowed({ db, env, window, now: new Date('2026-10-30') }), false);
});
test('disabled and missing-key runtime never accesses storage, ledger, timers or HTTP', async () => {
  const forbidden = new Proxy({}, { get() { assert.fail('Disabled runtime accessed a dependency'); } });
  for (const configuration of [{ env: {}, apiKey: 'synthetic' }, { env, apiKey: '' }]) {
    const runtime = createControlledDispatch({ db: { projectId: 'demo-pathway-security', collection: () => assert.fail('DB') },
      window, clock, ledger: forbidden, fetcher: () => assert.fail('HTTP'), setIntervalFn: () => assert.fail('timer'), ...configuration });
    assert.equal((await runtime.start()).status, 'unavailable');
    assert.equal((await runtime.wake()).status, 'unavailable');
    runtime.stop();
  }
});
test('invalid runtime clock settles unavailable without touching storage', async () => {
  const r = createControlledDispatch({ db: { projectId: 'demo-pathway-security' }, env, window,
    apiKey: 'synthetic', clock: () => { throw Error('SECRET clock'); } });
  assert.deepEqual(await r.start(), { status: 'unavailable' }); r.stop();
});
