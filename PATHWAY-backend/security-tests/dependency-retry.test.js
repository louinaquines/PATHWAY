const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reportUnavailable, createRetryTask } = require('../requestAuthentication');
test('diagnostics classify known limits without exposing raw details', () => {
  for (const [details, reason] of [['Quota exceeded for project private-project', 'quota_exceeded'], ['Received message larger than max (secret)', 'message_too_large'], ['Bandwidth exhausted secret', 'bandwidth_exhausted'], ['private unknown details', 'resource_exhausted']]) {
    let logged;
    reportUnavailable((_label, value) => { logged = value; }, 'Unavailable', { code: 8, details });
    assert.equal(logged.reason, reason);
    assert.ok(!JSON.stringify(logged).includes('private'));
    assert.ok(!JSON.stringify(logged).includes('secret'));
  }
});
test('retry task prevents overlap, backs off failures, and resets after recovery', async () => {
  let now = 0, calls = 0, fail = true;
  const run = createRetryTask({ intervalMs: 5000, now: () => now, task: async () => { calls++; if (fail) throw { code: 8 }; }, onError: () => {} });
  await run();
  now = 5000; await run(); assert.equal(calls, 1);
  now = 60000; await Promise.all([run(), run()]); assert.equal(calls, 2);
  now = 120000; await run(); assert.equal(calls, 2);
  fail = false; now = 180000; await run(); assert.equal(calls, 3);
  now = 185000; await run(); assert.equal(calls, 4);
});
