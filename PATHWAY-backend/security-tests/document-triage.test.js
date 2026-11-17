const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateDocumentTriage, documentVersion } = require('../documentTriage');
const { createAnthropicAnalysis } = require('../anthropicAnalysis');
test('provider adapter uses one bounded request and returns only the validated triage decision', async () => {
  let calls = 0;
  const decision = { color: 'red', reason: 'Apparent different document type.', evidence: 'Driving permit' };
  const ai = createAnthropicAnalysis({ ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '1' }, async (_url, options) => {
    calls++; const envelope = JSON.parse(options.body);
    const content = JSON.parse(JSON.parse(envelope.messages[0].content).documentSource);
    assert.deepEqual(content, { expectedDocument: 'Medical certificate', reviewedExcerpt: 'Driving permit TEST ONLY' });
    return Response.json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(decision) }] });
  });
  assert.deepEqual(await ai.triageDocument('Driving permit TEST ONLY', 'Medical certificate'), decision);
  assert.equal(calls, 1);
});
test('triage validates exact evidence and never equates colour with official approval', () => {
  for (const color of ['green', 'yellow', 'red']) {
    const value = validateDocumentTriage('Medical certificate: TEST ONLY synthetic excerpt.', { color, reason: 'Check manually.', evidence: 'Medical certificate' });
    assert.equal(value.advisoryOnly, true); assert.equal(value.requiresHumanReview, true); assert.equal(value.color, color);
  }
});
test('unsupported evidence, decisions, malformed colours and oversized output fail closed', () => {
  const base = { color: 'red', reason: 'Check manually.', evidence: 'source' };
  for (const value of [null, { ...base, color: 'approved' }, { ...base, approved: true }, { ...base, evidence: 'invented' },
    { ...base, evidence: '' }, { ...base, reason: '' }, { ...base, reason: 'x'.repeat(401) }]) {
    assert.throws(() => validateDocumentTriage('source', value));
  }
  assert.equal(validateDocumentTriage('source', { color: 'yellow', reason: 'Insufficient context.', evidence: '' }).color, 'yellow');
});
test('source binding changes when any uploaded document identity changes', () => {
  const source = { fileName: 'test.pdf', cloudinaryAssetId: 'synthetic-asset', cloudinaryPublicId: 'test/source', cloudinaryVersion: 1, submittedAt: '2026-10-25' };
  assert.match(documentVersion(source), /^[a-f0-9]{64}$/);
  for (const key of Object.keys(source)) assert.notEqual(documentVersion(source), documentVersion({ ...source, [key]: 'changed' }));
});
