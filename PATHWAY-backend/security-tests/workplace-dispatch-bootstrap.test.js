const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServerWorkplaceDispatch } = require('../workplaceDispatchBootstrap');
const db = { projectId: 'demo-pathway-security' };
const env = { PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: 'localhost:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' };
test('default, hosted, remote and mixed startup never import controlled or fake runtimes or inspect a key', () => {
  for (const patch of [{}, { PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', NODE_ENV: 'production' },
    { PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', FIRESTORE_EMULATOR_HOST: 'remote:8180' },
    { PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', PATHWAY_WORKPLACE_FAKE_DISPATCH: '1' }]) {
    const configuration = { ...env, ...patch };
    Object.defineProperty(configuration, 'ANTHROPIC_API_KEY', { get() { assert.fail('Key read'); } });
    assert.equal(createServerWorkplaceDispatch({ db, env: configuration, loadFake: () => assert.fail('Fake import'),
      loadControlled: () => assert.fail('Controlled import') }), null);
  }
});
test('explicit fake mode selects only its existing runtime; controlled local mode selects only its gated factory', () => {
  const fake = { mode: 'fixed-synthetic' }, controlled = { mode: 'controlled-claude' };
  assert.equal(createServerWorkplaceDispatch({ db, env: { ...env, PATHWAY_WORKPLACE_FAKE_DISPATCH: '1' },
    loadFake: () => ({ createLocalRuntime: () => fake }), loadControlled: () => assert.fail('Controlled import') }), fake);
  assert.equal(createServerWorkplaceDispatch({ db, env: { ...env, PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1' },
    loadFake: () => assert.fail('Fake import'), loadControlled: () => ({ createControlledRuntime: () => controlled }) }), controlled);
});
test('controlled factory refuses incomplete enrollment before inspecting credentials or opening the ledger', async () => {
  const { createControlledRuntime } = require('./workplace-controlled-runtime');
  for (const patch of [{}, { PATHWAY_CONTROLLED_START_AT: '2026-10-23T12:00:00Z', PATHWAY_CONTROLLED_END_AT: '2026-10-23T12:15:00Z',
    PATHWAY_CONTROLLED_STUDENT_ID: 'c-student', PATHWAY_CONTROLLED_REQUEST_ID: 'new', PATHWAY_CONTROLLED_FIXTURE_ID: 'not-a-fixture' }]) {
    const configuration = { ...env, PATHWAY_WORKPLACE_CONTROLLED_CLAUDE: '1', ...patch };
    Object.defineProperty(configuration, 'ANTHROPIC_API_KEY', { get() { assert.fail('Key inspected before gates'); } });
    const r = createControlledRuntime({ db, env: configuration, clock: () => new Date('2026-10-23T12:01:00Z') });
    assert.equal((await r.start()).status, 'unavailable'); r.stop();
  }
});
