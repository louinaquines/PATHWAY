const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAnthropicAnalysis, configErrors } = require('../anthropicAnalysis');
const env = { ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic-not-a-real-key', ANTHROPIC_MODEL: 'claude-test-model', ANTHROPIC_DAILY_REQUEST_LIMIT: '2' };
const reply = (text = 'I tested the application.') => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }));
test('disabled, missing config and emulator modes make no provider calls', async () => {
  for (const settings of [{}, { ...env, ANTHROPIC_API_KEY: '' }, { ...env, PATHWAY_LOCAL_WORKFLOW: '1' }, { ...env, FIRESTORE_EMULATOR_HOST: 'localhost:8180' }]) {
    await assert.rejects(createAnthropicAnalysis(settings, () => { assert.fail('Unexpected paid call'); }).refine('Synthetic notes'), error => error.code === 'AI_DISABLED');
  }
});
test('configuration requires explicit model and bounded daily request limit', () => {
  assert.equal(configErrors(env).length, 0);
  assert.ok(configErrors({ ...env, ANTHROPIC_DAILY_REQUEST_LIMIT: '0' }).length);
  assert.ok(configErrors({ ...env, ANTHROPIC_MODEL: 'https://host.test' }).length);
});
test('input validation occurs before network', async () => {
  const ai = createAnthropicAnalysis(env, () => { assert.fail('Unexpected call'); });
  for (const input of ['', {}, 'x'.repeat(8001)]) await assert.rejects(ai.refine(input), error => error.status === 400);
});
test('bounded request sends only notes with server model and returns advisory output', async () => {
  const ai = createAnthropicAnalysis(env, async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 2048);
    assert.equal(body.model, env.ANTHROPIC_MODEL);
    assert.equal(body.tools, undefined);
    assert.deepEqual(JSON.parse(body.messages[0].content), { journalNotes: 'I tested the application.' });
    return reply();
  });
  assert.deepEqual(await ai.refine('I tested the application.'), { refined: 'I tested the application.', method: 'anthropic', advisoryOnly: true, requiresHumanReview: true });
});
test('provider errors are sanitized and not retried', async () => {
  let calls = 0;
  const ai = createAnthropicAnalysis(env, async () => { calls++; throw new Error('private notes and key'); });
  await assert.rejects(ai.refine('notes'), error => !error.message.includes('private') && error.code === 'AI_PROVIDER');
  assert.equal(calls, 1);
});
test('truncated, nontext, malformed, empty and oversized output fail closed', async () => {
  const responses = [new Response('invalid'), reply(''), reply('x'.repeat(8001)), new Response(JSON.stringify({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'partial' }] })), new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'tool_use' }] })), new Response('x'.repeat(32769))];
  for (const response of responses) await assert.rejects(createAnthropicAnalysis(env, async () => response).refine('notes'));
});
test('thinking blocks are omitted while final text remains validated', async () => {
  const content = [{ type: 'thinking', thinking: 'private reasoning', signature: 'synthetic-signature' },
    { type: 'redacted_thinking', data: 'synthetic-redaction' }, { type: 'text', text: 'I tested the application.' }];
  const ai = createAnthropicAnalysis(env, async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content })));
  assert.equal((await ai.refine('notes')).refined, 'I tested the application.');
  for (const blocks of [[content[0]], [{ type: 'thinking' }], [...content, { type: 'tool_use' }]]) {
    await assert.rejects(createAnthropicAnalysis(env, async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: blocks }))).refine('notes'), error => error.code === 'AI_OUTPUT');
  }
});

test('daily request cap includes failed calls and rejects additional charges', async () => {
  let calls = 0;
  const ai = createAnthropicAnalysis(env, async () => { calls++; return reply(); });
  await ai.refine('notes'); await ai.refine('notes');
  await assert.rejects(ai.refine('notes'), error => error.status === 429);
  assert.equal(calls, 2);
});
test('concurrency cap rejects a third simultaneous call and releases completed slots', async () => {
  const releases = [];
  const ai = createAnthropicAnalysis({ ...env, ANTHROPIC_DAILY_REQUEST_LIMIT: '5' }, () => new Promise(resolve => releases.push(() => resolve(reply()))));
  const first = ai.refine('notes'); const second = ai.refine('notes');
  await assert.rejects(ai.refine('notes'), error => error.status === 429);
  releases.splice(0).forEach(release => release());
  await Promise.all([first, second]);
  const next = ai.refine('notes'); releases.splice(0).forEach(release => release());
  await next;
});
