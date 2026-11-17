const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const fixture = 'Synthetic native test E: recover one saved entry after a lost success response.';
async function listen(server) { server.listen(0, '127.0.0.1'); await once(server, 'listening'); return server.address().port; }
async function close(server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
function helper() { return require('./native-lost-response-proxy'); }

test('lost-response helper is inert unless explicitly enabled', () => {
  assert.equal(helper().createLostResponseProxy(), null);
});

test('a request whose headers arrived before the dropped response cannot forward its later body', async () => {
  const { createLostResponseProxy } = helper(); let calls = 0, delayed;
  const raw = JSON.stringify({ requestId: 'held-request', rawNotes: fixture, refined: fixture, aiRefined: false, hours: 8 });
  const upstream = http.createServer(async (req, res) => {
    for await (const part of req) { /* drain the synthetic request */ }
    calls++; res.end(JSON.stringify({ entryId: 'synthetic-entry', revision: 1, analysisStatus: 'not-enabled' }));
  });
  const port = await listen(upstream);
  const proxy = createLostResponseProxy({ enabled: true, upstreamPort: port, onEvent: e => { if (e.event === 'response-dropped') delayed.end(raw); } });
  const local = await listen(proxy);
  try {
    const arrived = once(proxy, 'request');
    const delayedStatus = new Promise((resolve, reject) => {
      delayed = http.request({ host: '127.0.0.1', port: local, path: '/student/journals', method: 'POST', headers: { authorization: 'Bearer synthetic-test-only', 'content-length': Buffer.byteLength(raw) } }, res => { res.resume(); resolve(res.statusCode); });
      delayed.on('error', reject); delayed.flushHeaders();
    });
    await arrived;
    await assert.rejects(fetch(`http://127.0.0.1:${local}/student/journals`, { method: 'POST', headers: { authorization: 'Bearer synthetic-test-only' }, body: raw }));
    assert.equal(await delayedStatus, 503); assert.equal(calls, 1);
  } finally { delayed?.destroy(); await close(proxy); await close(upstream); }
});

test('an uncertain upstream result stops the helper without retry or a false committed event', async () => {
  const { createLostResponseProxy } = helper(); let calls = 0; const events = [];
  const upstream = http.createServer((req, res) => { calls++; res.writeHead(500); res.end('{}'); });
  const port = await listen(upstream);
  const proxy = createLostResponseProxy({ enabled: true, upstreamPort: port, onEvent: e => events.push(e) });
  const local = await listen(proxy);
  const send = () => fetch(`http://127.0.0.1:${local}/student/journals`, { method: 'POST', headers: { authorization: 'Bearer synthetic-test-only' }, body: JSON.stringify({ requestId: 'uncertain', rawNotes: fixture, refined: fixture, aiRefined: false, hours: 8 }) });
  try {
    assert.equal((await send()).status, 503); assert.equal((await send()).status, 503);
    assert.equal(calls, 1); assert.deepEqual(events, [{ event: 'stopped', automaticRetry: false }]);
  } finally { await close(proxy); await close(upstream); }
});

test('only exact fixture reaches localhost; dropped success stops forwarding and direct retry recovers receipt', async () => {
  const { createLostResponseProxy } = helper();
  const events = [], receipts = new Map(); let calls = 0;
  const upstream = http.createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw); calls++;
    assert.equal(req.url, '/student/journals'); assert.equal(req.headers.authorization, 'Bearer synthetic-test-only');
    if (!receipts.has(body.requestId)) receipts.set(body.requestId, { entryId: 'synthetic-entry', revision: 1, analysisStatus: 'not-enabled' });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(receipts.get(body.requestId)));
  });
  const port = await listen(upstream);
  const proxy = createLostResponseProxy({ enabled: true, upstreamPort: port, onEvent: e => events.push(e) });
  const local = await listen(proxy);
  const post = (body, route = '/student/journals') => fetch(`http://127.0.0.1:${local}${route}`, { method: 'POST', headers: { authorization: 'Bearer synthetic-test-only', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const body = { requestId: 'synthetic-request', rawNotes: fixture, refined: fixture, aiRefined: false, hours: 8 };
  try {
    assert.equal((await post(body, '/refine-logbook')).status, 403);
    assert.equal((await post({ ...body, rawNotes: 'Other notes' })).status, 403);
    assert.equal(calls, 0);
    await assert.rejects(post(body));
    assert.equal(receipts.size, 1); assert.equal(events[0].event, 'response-dropped');
    assert.equal((await post(body)).status, 503); assert.equal(calls, 1);
    const retry = await fetch(`http://127.0.0.1:${port}/student/journals`, { method: 'POST', headers: { authorization: 'Bearer synthetic-test-only' }, body: JSON.stringify(body) });
    assert.equal(retry.status, 200); assert.equal((await retry.json()).entryId, 'synthetic-entry');
    assert.equal(calls, 2); assert.equal(receipts.size, 1);
    assert.equal((await post(body)).status, 503); assert.equal(calls, 2);
    assert.equal(JSON.stringify(events).includes('synthetic-test-only'), false);
  } finally { await close(proxy); await close(upstream); }
});
