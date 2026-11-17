const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { concernFixture } = require('./concern-fixture');
const { createWorkplaceHostedService, installWorkplaceHostedHttp } = require('../workplaceHostedService');
let f, server, base, calls;
const workplaceSecret = 'a'.repeat(64), operatorSecret = 'b'.repeat(64);
before(async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:(8180|8280)$/);
  f = await concernFixture(() => {});
});
beforeEach(async () => {
  await f.reset(); await f.job(); calls = [];
  for (const name of ['workplaceHostedControl','workplaceHostedInterlock','workplaceHostedAttempts','workplaceHostedDays','workplaceWakeReceipts','workplaceWakeJobs'])
    await f.db.recursiveDelete(f.db.collection(name));
  await f.db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, operatorRevision: 0,
    stopProtocol: 'operator-revision-v1', readinessProtocol: 'split-operator-interlock-v1', epoch: 'synthetic-epoch', notBefore: '2026-10-22T11:00:00Z' });
  await f.db.doc('workplaceHostedInterlock/control').set({ state: 'bootstrap-idle', generation: 0 });
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (f) await f.close(); });
async function start(patch = {}) {
  if (server) await new Promise(resolve => server.close(resolve));
  const app = express();
  const service = createWorkplaceHostedService({ enabled: true, readinessGate: true, db: f.db, clock: f.clock,
    apiKey: 'SYNTHETIC-NOT-A-KEY', workplaceSecret, operatorSecret, transport: async url => {
      calls.push(url);
      return url.endsWith('count_tokens') ? Response.json({ input_tokens: 600 }) : Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn',
        usage: { input_tokens: 600, output_tokens: 100, service_tier: 'standard', inference_geo: 'global' },
        content: [{ type: 'text', text: '{"version":"workplace-concern-v1","findings":[]}' }] });
    }, ...patch });
  installWorkplaceHostedHttp({ enabled: true, app, service });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
async function post(route, secret, body) {
  const response = await fetch(base+route, { method: 'POST', headers: { authorization: 'Bearer '+secret, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('prepared HTTP routes deliver exact jobs and isolate operator stop from wake credentials', async () => {
  await start();
  assert.equal((await post('/internal/workplace/stop', workplaceSecret, { action: 'stop' })).status, 401);
  assert.equal((await post('/internal/workplace/wake', operatorSecret, { jobId: 'c-job', wakeId: 'wrong-role' })).status, 401);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0);
  assert.equal((await post('/internal/workplace/wake', workplaceSecret, { jobId: 'c-job', wakeId: 'first' })).status, 200);
  assert.equal(calls.length, 2);
  const stopped = await post('/internal/workplace/stop', operatorSecret, { action: 'stop' });
  assert.deepEqual(stopped, { status: 200, body: { status: 'stopped', revision: 1 } });
  await f.job('next-job');
  assert.equal((await post('/internal/workplace/wake', workplaceSecret, { jobId: 'next-job', wakeId: 'stopped-next' })).status, 409);
  assert.equal(calls.length, 2);
  assert.equal((await f.db.doc('workplaceHostedControl/control').get()).data().stopped, true);
  await start(); // Simulated service restart; no operator state reset.
  assert.equal((await post('/internal/workplace/wake', workplaceSecret, { jobId: 'next-job', wakeId: 'restart' })).status, 409);
  assert.equal(calls.length, 2);
});

test('bounded HTTP parser returns sanitized errors before any provider or receipt access', async () => {
  await start();
  const malformed = await fetch(base+'/internal/workplace/wake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{PRIVATE invalid' });
  assert.equal(malformed.status, 400); assert.equal((await malformed.text()).includes('PRIVATE'), false);
  const oversized = await post('/internal/workplace/wake', workplaceSecret, { notes: 'x'.repeat(3000) });
  assert.equal(oversized.status, 413);
  assert.equal((await f.db.collection('workplaceWakeReceipts').get()).size, 0); assert.equal(calls.length, 0);
});

test('operator HTTP stop during token counting prevents generation and retains reservations', async () => {
  await start({ transport: async url => {
    calls.push(url);
    assert.equal(url.endsWith('count_tokens'), true, 'Generation must never start after operator stop');
    const result = await post('/internal/workplace/stop', operatorSecret, { action: 'stop' });
    assert.equal(result.status, 200);
    return Response.json({ input_tokens: 600 });
  } });
  const response = await post('/internal/workplace/wake', workplaceSecret, { jobId: 'c-job', wakeId: 'stop-during-count' });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const control = (await f.db.doc('workplaceHostedControl/control').get()).data();
  assert.equal(control.stopped, true); assert.equal(control.operatorRevision, 1);
  assert.equal((await f.db.collection('workplaceHostedAttempts').get()).size, 1);
  assert.equal((await f.db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
  assert.equal((await f.db.doc('workplaceHostedInterlock/control').get()).data().state, 'held');
});
