const assert = require('node:assert/strict');
const { test } = require('node:test');
const { probeHealth } = require('../healthProbe');
const url = 'https://example.test/healthz';
test('valid health response passes', async () => {
  assert.equal((await probeHealth({ url, fetchImpl: async () => new Response('{"status":"ok"}') })).healthy, true);
});
test('HTTP failure remains unhealthy even with an ok body', async () => {
  assert.equal((await probeHealth({ url, fetchImpl: async () => new Response('{"status":"ok"}', { status: 503 }) })).reason, 'http_failure');
});
test('unexpected and malformed payloads fail safely', async () => {
  for (const body of ['{}', '<html>failure</html>']) {
    assert.equal((await probeHealth({ url, fetchImpl: async () => new Response(body) })).healthy, false);
  }
});
test('network and timeout failures do not expose exception contents', async () => {
  for (const name of ['Error', 'TimeoutError']) {
    const result = await probeHealth({ url, fetchImpl: async () => { throw Object.assign(new Error('secret must not appear'), { name }); } });
    assert.equal(result.healthy, false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  }
});
test('probe supplies a bounded signal and rejects redirects', async () => {
  await probeHealth({ url, fetchImpl: async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    return new Response('{"status":"ok"}');
  } });
});
