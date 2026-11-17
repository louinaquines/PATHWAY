const { test } = require('node:test');
const assert = require('node:assert/strict');
const options = { enabled: true, readinessGate: true, workplaceSecret: 'a'.repeat(64), operatorSecret: 'b'.repeat(64),
  db: {}, apiKey: 'SYNTHETIC', transport: async () => { throw Error('Unexpected transport'); } };
const stopRequest = { method: 'POST', authorization: 'Bearer '+ 'b'.repeat(64), body: { action: 'stop' } };
const create = patch => require('../workplaceHostedService').createWorkplaceHostedService({ ...options, ...patch });

test('hosted service defaults disabled without storage or provider access', async () => {
  const service = require('../workplaceHostedService').createWorkplaceHostedService();
  assert.equal((await service.handleWake({})).status, 503);
  assert.equal((await service.handleStop(stopRequest)).status, 503);
});

test('operator control rejects wake credentials and invalid requests before storage', async () => {
  const service = create({ db: new Proxy({}, { get() { assert.fail('Unauthenticated storage access'); } }) });
  assert.equal((await service.handleStop({ ...stopRequest, authorization: 'Bearer '+options.workplaceSecret })).status, 401);
  assert.equal((await service.handleStop({ ...stopRequest, authorization: '' })).status, 401);
  assert.equal((await service.handleStop({ ...stopRequest, method: 'GET' })).status, 405);
  assert.equal((await service.handleStop({ ...stopRequest, body: { action: 'resume' } })).status, 400);
  assert.equal((await service.handleStop({ ...stopRequest, body: { action: 'stop', stopped: false } })).status, 400);
});

test('identical or malformed operator credentials fail closed at construction', () => {
  assert.throws(() => create({ operatorSecret: options.workplaceSecret }));
  assert.throws(() => create({ operatorSecret: 'short' }));
  assert.throws(() => create({ readinessGate: false }));
});

test('HTTP installation is default-off and cannot register routes accidentally', () => {
  const { installWorkplaceHostedHttp } = require('../workplaceHostedService');
  assert.equal(installWorkplaceHostedHttp({ app: { all() { assert.fail('Unexpected route installation'); } } }), false);
});
