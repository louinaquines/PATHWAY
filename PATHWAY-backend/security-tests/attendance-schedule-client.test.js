const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const secret = 'ab'.repeat(32);
const config = { origin: 'https://synthetic-backend.onrender.com', secret };

test('scheduled client resumes batches through transient failures without leaking credentials or responses', async () => {
  const { runScheduledChecks } = require('../../.github/scripts/attendance-risk-run.cjs');
  let requests = 0, seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url, auth: req.headers.authorization, method: req.method });
    requests++;
    if (requests === 1) { res.writeHead(503).end('PRIVATE cold start'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ status: requests < 3 ? 'pending' : 'complete', hasMore: requests < 3, pendingRetries: false, dueDate: '2026-10-21' }));
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const fetchImpl = (url, init) => fetch(`http://127.0.0.1:${server.address().port}${new URL(url).pathname}`, init);
    const result = await runScheduledChecks({ ...config, fetchImpl, sleep: async () => {} });
    assert.equal(result.status, 'complete'); assert.equal(requests, 3);
    for (const item of seen) assert.deepEqual(item, { path: '/internal/attendance-risk/run', auth: `Bearer ${secret}`, method: 'POST' });
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('client never retries auth failures, redirects, missing configuration or malformed success', async () => {
  const { runScheduledChecks } = require('../../.github/scripts/attendance-risk-run.cjs');
  for (const status of [401, 403, 302]) {
    let count = 0;
    await assert.rejects(() => runScheduledChecks({ ...config, fetchImpl: async () => { count++; return new Response('PRIVATE', { status }); } }), /authentication|rejected/);
    assert.equal(count, 1);
  }
  for (const change of [{ origin: '' }, { origin: 'http://backend.example' }, { origin: 'https://user:pass@backend.example' }, { origin: 'https://backend.example/path' }, { secret: 'weak' }]) {
    await assert.rejects(() => runScheduledChecks({ ...config, ...change, fetchImpl: () => { throw new Error('MUST NOT FETCH'); } }), /configuration/);
  }
  await assert.rejects(() => runScheduledChecks({ ...config, fetchImpl: async () => new Response(JSON.stringify({ status: 'complete' })) }), /response/);
});

test('client bounds all attempts to twenty and stops on pending retry backlog', async () => {
  const { runScheduledChecks } = require('../../.github/scripts/attendance-risk-run.cjs');
  let attempts = 0;
  const pending = { status: 'pending', hasMore: true, pendingRetries: false, dueDate: '2026-10-21' };
  await assert.rejects(() => runScheduledChecks({ ...config, fetchImpl: async () => { attempts++; return new Response(JSON.stringify(pending)); } }), /budget/);
  assert.equal(attempts, 20);
  attempts = 0;
  await assert.rejects(() => runScheduledChecks({ ...config, fetchImpl: async () => { attempts++; return new Response(JSON.stringify({ ...pending, hasMore: false, pendingRetries: true })); } }), /pending/);
  assert.equal(attempts, 1);
});

test('network timeout has bounded retries and deadline prevents another request', async () => {
  const { runScheduledChecks } = require('../../.github/scripts/attendance-risk-run.cjs');
  let attempts = 0;
  await assert.rejects(() => runScheduledChecks({ ...config, sleep: async () => {}, fetchImpl: async () => {
    attempts++; throw new DOMException('PRIVATE', 'TimeoutError');
  } }), /unavailable/);
  assert.equal(attempts, 3);
  attempts = 0; let time = 0;
  await assert.rejects(() => runScheduledChecks({ ...config, clock: () => time, fetchImpl: async () => {
    attempts++; time = 780001;
    return new Response(JSON.stringify({ status: 'pending', hasMore: true, pendingRetries: false, dueDate: '2026-10-21' }));
  } }), /budget/);
  assert.equal(attempts, 1);
});
