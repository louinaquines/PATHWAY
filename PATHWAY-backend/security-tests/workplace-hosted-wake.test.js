const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHostedWakeAdapter } = require('../workplaceHostedWake');
const request = { method: 'POST', authorization: 'Bearer synthetic-workplace-only', body: { jobId: 'job-one', wakeId: 'wake-one' } };
test('disabled adapter touches no dependencies', async () => {
  const result = await createHostedWakeAdapter().handle(request);
  assert.equal(result.status, 503);
});
test('authentication precedes validation, receipt claims and runtime reads', async () => {
  const adapter = createHostedWakeAdapter({ enabled: true, authorize: async () => false,
    claimWake: () => assert.fail('claim'), runtime: { wake: () => assert.fail('runtime') } });
  assert.equal((await adapter.handle(request)).status, 401);
});
test('only exact body and POST can reach durable claim and exact-job runtime', async () => {
  const seen = [], claims = new Set();
  const adapter = createHostedWakeAdapter({ enabled: true, authorize: async token => token === request.authorization,
    claimWake: async identity => { seen.push(identity); if (claims.has(identity.wakeId)) return false; claims.add(identity.wakeId); return true; },
    runtime: { wake: async target => { assert.deepEqual(target, { jobId: 'job-one' }); return { status: 'stopped', processed: 0, secret: 'NEVER RETURN' }; } } });
  assert.equal((await adapter.handle({ ...request, method: 'GET' })).status, 405);
  for (const body of [null, [], {}, { ...request.body, notes: 'private' }, { ...request.body, jobId: '../bad' }])
    assert.equal((await adapter.handle({ ...request, body })).status, 400);
  assert.equal(seen.length, 0);
  assert.deepEqual(await adapter.handle(request), { status: 200, body: { status: 'stopped', processed: 0 } });
  assert.equal((await adapter.handle(request)).status, 409);
  assert.equal(seen.length, 2);
});
test('concurrent wake is refused and uncertain claims never invoke runtime', async () => {
  let release, entered; const start = new Promise(resolve => { entered = resolve; });
  const adapter = createHostedWakeAdapter({ enabled: true, authorize: async () => true, claimWake: async () => true,
    runtime: { wake: async () => { entered(); await new Promise(resolve => { release = resolve; }); return { status: 'processed', processed: 1 }; } } });
  const pending = adapter.handle(request); await start;
  assert.equal((await adapter.handle({ ...request, body: { jobId: 'job-two', wakeId: 'wake-two' } })).status, 409);
  release(); assert.equal((await pending).status, 200);
  const uncertain = createHostedWakeAdapter({ enabled: true, authorize: async () => true,
    claimWake: async () => { throw Error('PRIVATE'); }, runtime: { wake: () => assert.fail('runtime') } });
  assert.deepEqual(await uncertain.handle(request), { status: 503, body: { error: 'Workplace wake unavailable.' } });
});
test('missing dependencies and malformed runtime outcomes fail closed without secret output', async () => {
  assert.throws(() => createHostedWakeAdapter({ enabled: true }));
  const adapter = createHostedWakeAdapter({ enabled: true, authorize: async () => { throw Error('PRIVATE'); }, claimWake: async () => true, runtime: { wake() {} } });
  assert.equal(JSON.stringify(await adapter.handle(request)).includes('PRIVATE'), false);
  for (const result of [null, { status: 'unknown', processed: 0 }, { status: 'complete', processed: 2 }]) {
    const malformed = createHostedWakeAdapter({ enabled: true, authorize: async () => true, claimWake: async () => true, runtime: { wake: async () => result } });
    assert.equal((await malformed.handle(request)).status, 503);
  }
});
