const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const notes = 'Synthetic only. My supervisor threatened to hit me now.';
const decision = { version: 'workplace-concern-v1', findings: [{ category: 'threat', priority: 'high', quote: 'threatened to hit me now',
  immediateDangerQuote: 'hit me now', reason: 'Potential immediate danger; human review required.' }] };
const reply = patch => ({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, content: [{ type: 'text', text: JSON.stringify(decision) }], ...patch });
const adapter = patch => createWorkplaceClaudeAdapter({ enabled: true, apiKey: 'SYNTHETIC-KEY', allowedSources: [notes], fetcher: async () => Response.json(reply()), ...patch });
test('disabled, missing key and non-allowlisted sources never access HTTP', async () => {
  for (const patch of [{ enabled: false },{ enabled: 'true' },{ apiKey: '' },{ allowedSources: [] }]) {
    const a = adapter({ ...patch, fetcher: () => assert.fail('Unexpected HTTP') });
    assert.throws(() => a.prepare(notes)); await assert.rejects(a.analyze({}));
  }
  assert.throws(() => adapter().prepare('Real or arbitrary notes are not allowed.'));
});
test('canonical request pins model, limits, thinking and endpoint, and returns only validated decision/usage', async () => {
  let calls = 0;
  const a = adapter({ fetcher: async (url,options) => {
    calls++; assert.equal(url,'https://api.anthropic.com/v1/messages'); assert.equal(options.redirect,'error');
    const body = JSON.parse(options.body); assert.equal(body.model,'claude-haiku-5-5'); assert.equal(body.max_tokens,1024);
    assert.deepEqual(body.thinking,{ type: 'disabled' }); assert.deepEqual(body.output_config,{ effort: 'low' });
    assert.deepEqual(Object.keys(body).sort(),['model','max_tokens','system','messages','thinking','output_config'].sort());
    assert.equal(JSON.parse(body.messages[0].content).journalNotes,notes); return Response.json(reply());
  } });
  const p = a.prepare(notes); assert.equal(p.inputTokenUpperBound,14000); assert.ok(Object.isFrozen(p)); assert.ok(Buffer.byteLength(p.request) <= 5000);
  assert.deepEqual(await a.analyze(p),{ usage: { inputTokens: 500, outputTokens: 200 }, decision }); assert.equal(calls,1);
});
test('tampered, oversized and unsupported requests fail before sending', async () => {
  let calls = 0; const a = adapter({ fetcher: async () => { calls++; return Response.json(reply()); } }), p = a.prepare(notes);
  for (const value of [{ ...p, model: 'other' },{ ...p, maxOutputTokens: 2048 },{ ...p, inputTokenUpperBound: 1 },
    { ...p, features: { ...p.features, tools: true } },{ ...p, request: p.request + ' ' },{ ...p, extra: true }]) await assert.rejects(a.analyze(value));
  const large = '測'.repeat(2000); assert.throws(() => adapter({ allowedSources: [large] }).prepare(large)); assert.equal(calls,0);
});
test('malformed, thinking, truncated, wrong-model and unsupported-usage responses fail without raw content', async () => {
  const bad = [reply({ stop_reason: 'max_tokens' }),reply({ model: 'other' }),reply({ content: [{ type: 'thinking', thinking: 'PRIVATE-THINKING' }] }),
    reply({ content: [{ type: 'text', text: 'not JSON PRIVATE' }] }),reply({ usage: { input_tokens: -1, output_tokens: 1 } }),
    reply({ usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 10 } }),reply({ usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } } }),
    reply({ content: [{ type: 'text', text: JSON.stringify({ ...decision, findings: [{ ...decision.findings[0], quote: 'invented PRIVATE' }] }) }] })];
  for (const body of bad) { const a = adapter({ fetcher: async () => Response.json(body) }); await assert.rejects(a.analyze(a.prepare(notes)), e => e.code === 'CLAUDE_OUTPUT' && !e.message.includes('PRIVATE')); }
  const a = adapter({ fetcher: async () => new Response('PRIVATE-KEY',{ status: 401 }) });
  await assert.rejects(a.analyze(a.prepare(notes)), e => e.code === 'CLAUDE_PROVIDER' && !e.message.includes('PRIVATE'));
});
test('usage over the allowance reaches the worker brake without returning provider text', async () => {
  for (const usage of [{ input_tokens: 14001, output_tokens: 1 },{ input_tokens: 1, output_tokens: 1025 }]) {
    const a = adapter({ fetcher: async () => Response.json(reply({ usage, content: [{ type: 'text',text: 'PRIVATE' }] })) });
    assert.deepEqual(Object.keys(await a.analyze(a.prepare(notes))),['usage']);
  }
});
test('caller abort, deadline signal, oversized output and uncertain transport never retry', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const a = adapter({ fetcher: async () => { calls++; throw Error('PRIVATE transport'); } });
  await assert.rejects(a.analyze(a.prepare(notes),{ signal: controller.signal })); assert.equal(calls,0);
  await assert.rejects(a.analyze(a.prepare(notes)), e => e.code === 'CLAUDE_TRANSPORT_UNCERTAIN'); assert.equal(calls,1);
  const large = adapter({ fetcher: async (url,options) => { assert.ok(options.signal instanceof AbortSignal); return new Response('a'.repeat(32769)); } });
  await assert.rejects(large.analyze(large.prepare(notes)),e => e.code === 'CLAUDE_OUTPUT');
});
test('diagnostics retain only fixed stages, HTTP status and allowlisted stop reasons', async () => {
  for (const [fetcher,expected] of [
    [async () => new Response('SECRET BODY',{ status: 401 }),{ stage: 'http',code: 'CLAUDE_PROVIDER',httpStatus: 401 }],
    [async () => { throw Error('SECRET NETWORK'); },{ stage: 'transport',code: 'CLAUDE_TRANSPORT_UNCERTAIN' }],
    [async () => Response.json(reply({ stop_reason: 'max_tokens' })),{ stage: 'response-validation',code: 'CLAUDE_OUTPUT',reason: 'stop-reason',stopReason: 'max_tokens' }],
    [async () => Response.json(reply({ stop_reason: 'SECRET STOP' })),{ stage: 'response-validation',code: 'CLAUDE_OUTPUT',reason: 'stop-reason',stopReason: 'unknown' }],
    [async () => new Response('SECRET JSON'),{ stage: 'response-validation',code: 'CLAUDE_OUTPUT',reason: 'invalid-json' }],
  ]) {
    const a = adapter({ fetcher });
    await assert.rejects(a.analyze(a.prepare(notes)), e => { assert.deepEqual(e.diagnostic,expected); assert.ok(!JSON.stringify(e).includes('SECRET')); return true; });
  }
});
