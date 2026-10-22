const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepareWorkplaceClaudeRequest, createWorkplaceClaudeAdapter } = require('../workplaceClaudeAdapter');
const { fixtures } = require('./workplace-claude-fixtures');
const { reserveCostMicroUsd } = require('../workplaceAnalysisPricing');

test('pure preparation preserves ordinary original text through both JSON layers', () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  for (const source of ['  Finished filing today.  ', 'Nagtrabaho ako; gikapoy ko karon. 測試 😀',
    'She said "hello". Path: C:\\test\nTab:\t Null:\u0000', 'Not threatened; this was a training example.']) {
    const value = prepareWorkplaceClaudeRequest(source);
    const body = JSON.parse(value.request);
    assert.equal(JSON.parse(body.messages[0].content).journalNotes, source);
    assert.ok(Object.isFrozen(value));
    assert.equal(body.service_tier, 'standard_only'); assert.equal(body.inference_geo, 'global');
    assert.equal(body.max_tokens, 1024);
  }
});

test('invalid or excessive code-unit source yields only sanitized input failure', () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  for (const source of [null, undefined, 123, {}, [], '', ' \t\n', 'PRIVATE'.repeat(1334)]) {
    assert.throws(() => prepareWorkplaceClaudeRequest(source), error => error.code === 'CLAUDE_INPUT'
      && !JSON.stringify(error).includes('PRIVATE'));
  }
  // The source length boundary does not make its serialized request eligible.
  for (const length of [8000, 8001]) assert.throws(() => prepareWorkplaceClaudeRequest('a'.repeat(length)), { code: 'CLAUDE_INPUT' });
});

test('complete serialized request admits 5000 UTF-8 bytes and refuses 5001', () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  const overhead = Buffer.byteLength(prepareWorkplaceClaudeRequest('a').request, 'utf8') - 1;
  const source = 'a'.repeat(5000 - overhead);
  assert.equal(Buffer.byteLength(prepareWorkplaceClaudeRequest(source).request, 'utf8'), 5000);
  assert.throws(() => prepareWorkplaceClaudeRequest(source + 'a'), { code: 'CLAUDE_INPUT' });
  for (const prefix of ['😀測', '"\\\n\t\u0000']) {
    const prefixBytes = Buffer.byteLength(prepareWorkplaceClaudeRequest(prefix).request, 'utf8');
    const exact = prefix + 'a'.repeat(5000 - prefixBytes);
    const value = prepareWorkplaceClaudeRequest(exact);
    assert.equal(Buffer.byteLength(value.request, 'utf8'), 5000);
    assert.equal(JSON.parse(JSON.parse(value.request).messages[0].content).journalNotes, exact);
    assert.throws(() => prepareWorkplaceClaudeRequest(exact + 'a'), { code: 'CLAUDE_INPUT' });
  }
});

test('byte and escaping limits reject stored-source-sized inputs without truncation', () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  for (const source of ['測'.repeat(2000), '😀'.repeat(2000), '\u0000'.repeat(1000)]) {
    assert.ok(source.length <= 8000);
    assert.throws(() => prepareWorkplaceClaudeRequest(source), { code: 'CLAUDE_INPUT' });
  }
});

test('pure preparation cannot authorize a nonmember source or register an analysis payload', async () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  const source = 'Ordinary new journal, synthetic only.';
  let calls = 0;
  const options = { enabled: true, apiKey: 'SYNTHETIC', fetcher: () => { calls++; assert.fail('No HTTP authorized'); } };
  const denied = createWorkplaceClaudeAdapter({ ...options, allowedSources: [] });
  const prepared = prepareWorkplaceClaudeRequest(source);
  assert.throws(() => denied.prepare(source), { code: 'CLAUDE_SOURCE' });
  await assert.rejects(denied.analyze(prepared), { code: 'CLAUDE_INPUT' });
  const member = createWorkplaceClaudeAdapter({ ...options, allowedSources: [source] });
  await assert.rejects(member.analyze(prepared), { code: 'CLAUDE_INPUT' });
  assert.equal(calls, 0);
});

test('all fixed fixtures preserve factory payloads and conservative reservations', () => {
  assert.equal(typeof prepareWorkplaceClaudeRequest, 'function');
  const adapter = createWorkplaceClaudeAdapter({ enabled: true, apiKey: 'SYNTHETIC', allowedSources: fixtures.map(f => f.notes),
    fetcher: () => assert.fail('No provider or token-count call allowed') });
  for (const fixture of fixtures) {
    const pure = prepareWorkplaceClaudeRequest(fixture.notes), registered = adapter.prepare(fixture.notes);
    assert.deepEqual(pure, registered);
    assert.equal(pure.inputTokenUpperBound, 14000); assert.equal(pure.maxOutputTokens, 1024);
    assert.equal(reserveCostMicroUsd({ ...pure, now: new Date('2026-10-23T00:00:00Z') }), 9560);
    assert.ok(Buffer.byteLength(pure.request, 'utf8') <= 5000);
  }
});
