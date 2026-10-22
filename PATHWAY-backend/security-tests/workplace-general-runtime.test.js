const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { decision, NOTES } = require('./concern-fixture');
const env = { PATHWAY_LOCAL_WORKFLOW: '1', GOOGLE_CLOUD_PROJECT: 'demo-pathway-security',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8180', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9199' };
function api() { assert.ok(fs.existsSync(path.join(__dirname, 'workplace-general-runtime.js')), 'Synthetic runtime implementation missing'); return require('./workplace-general-runtime'); }
function reply(patch = {}) { return Response.json({ model: 'claude-haiku-5-5', stop_reason: 'end_turn',
  usage: { input_tokens: 600, output_tokens: 150, service_tier: 'standard', inference_geo: 'global' },
  content: [{ type: 'text', text: JSON.stringify(decision()) }], ...patch }); }
function setup(patch = {}) {
  let stage = '', stopped = false, reserved = false, count = 0, generation = 0, guard = true;
  const ticket = Symbol('owned-stop'); const events = [];
  const options = { source: NOTES, enabled: true, env, clock: () => new Date('2026-10-23T00:00:00Z'),
    assertBound: async () => { if (!guard) throw Error('PRIVATE stale'); },
    reserveLocal: () => { assert.equal(reserved, false); reserved = true; events.push('reserve'); },
    assertLocal: value => { if (stopped && value !== ticket) throw Error('PRIVATE stopped'); },
    stopLocal: () => { stopped = true; events.push('stop'); return ticket; },
    claims: { claimStage: async next => { assert.equal(stage, next === 'count' ? '' : 'accepted'); stage = next; events.push(next); },
      recordAcceptedCount: async () => { assert.equal(stage, 'count'); stage = 'accepted'; } },
    countTransport: async payload => { count++; assert.equal(reserved, true); assert.deepEqual(Object.keys(payload).sort(), ['messages','model','output_config','system','thinking']); return Response.json({ input_tokens: 600 }); },
    generationTransport: async () => { generation++; assert.equal(stopped, true); return reply(); }, ...patch };
  const analyzer = api().createSyntheticGeneralAnalyzer(options);
  return { analyzer, options, events, counts: () => ({ count, generation }), stopped: () => stopped, invalidate: () => { guard = false; },
    run: (prepared = analyzer.prepare(NOTES), extra = {}) => analyzer.analyze(prepared, { signal: new AbortController().signal, assertReady: async () => { if (!guard) throw Error('PRIVATE stale'); }, ...extra }) };
}
test('default-off, wrong context and missing transports refuse construction before work', () => {
  const { createSyntheticGeneralAnalyzer } = api();
  assert.throws(() => createSyntheticGeneralAnalyzer({}));
  for (const patch of [{ enabled: false }, { countTransport: undefined }, { generationTransport: undefined }, { env: { ...env, NODE_ENV: 'production' } }]) assert.throws(() => setup(patch));
});
test('one count precedes one validated generation after reservation and owned stop', async () => {
  const h = setup(); const result = await h.run();
  assert.equal(result.decision.findings[0].priority, 'high'); assert.deepEqual(h.counts(), { count: 1, generation: 1 });
  assert.deepEqual(h.events, ['reserve','count','generation','stop']);
  await assert.rejects(h.run()); assert.deepEqual(h.counts(), { count: 1, generation: 1 });
});
test('count admission accepts 1 and 12000 but rejects invalid or excessive values without generation', async () => {
  for (const n of [1, 12000]) { const h = setup({ countTransport: async () => Response.json({ input_tokens: n }) }); assert.ok((await h.run()).decision); }
  for (const n of [0, -1, 1.5, 12001, null, undefined, '600']) {
    let generations = 0; const h = setup({ countTransport: async () => Response.json({ input_tokens: n }), generationTransport: async () => { generations++; return reply(); } });
    await assert.rejects(h.run(), e => e.code !== 'TRANSIENT' && !JSON.stringify(e).includes('PRIVATE')); assert.equal(generations, 0); assert.equal(h.stopped(), true);
  }
});
test('failed, oversized and malformed count responses stop without generation', async () => {
  for (const response of [() => new Response('PRIVATE', { status: 403 }), () => new Response('not json PRIVATE'), () => new Response('a'.repeat(32769))]) {
    const h = setup({ countTransport: async () => response() }); await assert.rejects(h.run()); assert.equal(h.counts().generation, 0); assert.equal(h.stopped(), true);
  }
});
test('unregistered or tampered requests and aborted signals cannot share source', async () => {
  const h = setup(), p = h.analyzer.prepare(NOTES);
  for (const value of [{ ...p, request: p.request + ' ' }, { ...p, maxOutputTokens: 1 }]) await assert.rejects(h.run(value));
  const aborted = setup(); const c = new AbortController(); c.abort(); await assert.rejects(aborted.run(undefined, { signal: c.signal }));
  assert.deepEqual(h.counts(), { count: 0, generation: 0 }); assert.deepEqual(aborted.counts(), { count: 0, generation: 0 });
});
test('withdrawal during count and elapsed analyzer deadline prevent generation', async () => {
  let h; h = setup({ countTransport: async () => { h.invalidate(); return Response.json({ input_tokens: 500 }); } }); await assert.rejects(h.run()); assert.equal(h.counts().generation, 0);
  let instant = Date.parse('2026-10-23T00:00:00Z'); const slow = setup({ clock: () => new Date(instant), countTransport: async () => { instant += 25001; return Response.json({ input_tokens: 500 }); } });
  await assert.rejects(slow.run()); assert.equal(slow.counts().generation, 0);
});
test('generation validation and usage-only overflow reuse the existing adapter', async () => {
  for (const patch of [{ model: 'other' }, { stop_reason: 'max_tokens' }, { usage: { input_tokens: 600, output_tokens: 150 } }, { content: [{ type: 'text', text: '{}' }] }]) {
    const h = setup({ generationTransport: async () => reply(patch) }); await assert.rejects(h.run());
  }
  const h = setup({ generationTransport: async () => reply({ usage: { input_tokens: 14001, output_tokens: 1, service_tier: 'standard', inference_geo: 'global' } }) });
  assert.deepEqual(await h.run(), { usage: { inputTokens: 14001, outputTokens: 1 } });
});
test('stop write failure cannot leak diagnostic text or start generation', async () => {
  const h = setup({ stopLocal: () => { throw Error('PRIVATE filesystem path'); } });
  await assert.rejects(h.run(), e => !String(e).includes('PRIVATE') && e.code === 'SYNTHETIC_UNAVAILABLE');
  assert.equal(h.counts().generation, 0);
});
test('count and generation share one analyzer deadline rather than two fresh deadlines', async () => {
  let instant = Date.parse('2026-10-23T00:00:00Z');
  const h = setup({ clock: () => new Date(instant), countTransport: async () => { instant += 12000; return Response.json({ input_tokens: 500 }); },
    generationTransport: async () => { instant += 14000; return reply(); } });
  await assert.rejects(h.run()); assert.equal(h.stopped(), true);
});
