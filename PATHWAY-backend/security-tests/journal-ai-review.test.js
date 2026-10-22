const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installJournalAiReview } = require('../journalAiReview');
const { validateJournalResult, createAnthropicAnalysis } = require('../anthropicAnalysis');
const judgments = () => ['tasks', 'learning', 'outcomes', 'challenges'].map(id => ({ id, level: 'partial', reason: 'Mentioned without detail.', evidence: 'tested' }));
function fixture({ owns = true, role = 'coordinator', consent = true, providerError, entryData, providerResult, transferAt } = {}) {
  let handler, reads = 0, calls = 0, transferred = false;
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }), collection: () => ({ doc: () => ({ get: async () => { reads++; if (transferAt === 'journal-read') transferred = true; return { exists: true, data: () => entryData ?? ({ rawNotes: 'I tested software.', refined: 'Different text', hours: 40, weekRange: '2026-10-19 – 2026-10-25' }) }; } }) }) }) }) };
  installJournalAiReview({ app: { post: (path, auth, fn) => { handler = fn; } }, db, requireStaff: () => {}, coordinatorOwnsStudent: async () => owns && !transferred, allowRate: () => true, ai: { analyzeJournal: async notes => { calls++; assert.equal(notes, 'I tested software.'); if (transferAt === 'provider') transferred = true; if (providerError) throw providerError; return providerResult ?? { completeness: [], competencies: [], sentiment: [], rubric: judgments() }; } } });
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  return { run: async () => { await handler({ staff: { uid: 'staff', role }, params: { studentId: 'student', entryId: 'entry' }, body: { consent, notes: 'Do not use client text' } }, res); return { res, reads, calls }; } };
}
test('coordinator receives analysis from original server text without writes', async () => {
  const { res, calls } = await fixture().run(); assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(res.data.source, 'original-notes');
  assert.equal(res.data.scoring.total, 55); assert.equal(res.data.scoring.criteria[0].points, 15);
});
test('ownership, coordinator role and consent gate provider and journal access', async () => {
  for (const opts of [{ owns: false }, { role: 'admin' }, { role: 'student' }, { consent: false }]) {
    const { res, reads, calls } = await fixture(opts).run(); assert.ok([400, 403].includes(res.code)); assert.equal(reads, 0); assert.equal(calls, 0);
  }
});
test('provider failure never exposes private details', async () => {
  const { res } = await fixture({ providerError: new Error('private key and journal') }).run(); assert.equal(res.code, 503); assert.ok(!JSON.stringify(res.data).includes('private'));
  assert.equal(res.data.scoring.total, null); assert.equal(res.data.scoring.status, 'Analysis unavailable');
});

test('legacy refined-only journals are unavailable without sending rewritten text to Claude', async () => {
  const { res, calls } = await fixture({ entryData: { refined: 'Polished text', hours: 40 } }).run();
  assert.equal(res.code, 200); assert.equal(calls, 0); assert.equal(res.data.scoring.total, null);
  assert.equal(res.data.source, 'original-unavailable');
});

test('malformed judgments cannot be exposed as a completed score', async () => {
  const { res } = await fixture({ providerResult: { completeness: [], competencies: [], sentiment: [], rubric: [] } }).run();
  assert.equal(res.code, 503); assert.equal(res.data.scoring.total, null);
});

test('reassignment before provider prevents sharing and reassignment during provider prevents disclosure', async () => {
  for (const transferAt of ['journal-read', 'provider']) {
    const { res, calls } = await fixture({ transferAt }).run();
    assert.equal(res.code, 403); assert.equal(res.data.scoring?.total ?? null, null);
    assert.equal(calls, transferAt === 'provider' ? 1 : 0);
    assert.equal(res.data.rubric, undefined);
  }
});
test('analysis rejects invented quotes, unexpected fields and oversized arrays', () => {
  const valid = { completeness: [], competencies: [{ name: 'Testing', evidence: 'tested' }], sentiment: [], rubric: judgments() };
  assert.deepEqual(validateJournalResult(valid, 'I tested software.'), valid);
  for (const bad of [{ ...valid, approval: true }, { ...valid, competencies: [{ name: 'Testing', evidence: 'invented' }] }, { ...valid, completeness: Array(6).fill({ finding: 'Test', evidence: 'tested' }) }]) assert.throws(() => validateJournalResult(bad, 'I tested software.'));
});
test('structured analysis uses mocked provider and shared request quota', async () => {
  const ai = createAnthropicAnalysis({ ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '1' }, async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ completeness: [], competencies: [], sentiment: [], rubric: judgments() }) }] })));
  const result = await ai.analyzeJournal('I tested software.');
  assert.equal(result.advisoryOnly, true); assert.equal(result.rubric.length, 4);
  await assert.rejects(ai.refine('Test notes'), error => error.code === 'AI_LIMIT');
});

test('provider rejects missing rubric and invented or AI-calculated score fields', async () => {
  for (const body of [
    { completeness: [], competencies: [], sentiment: [] },
    { completeness: [], competencies: [], sentiment: [], rubric: judgments(), total: 100 },
    { completeness: [], competencies: [], sentiment: [], rubric: judgments().map(x => ({ ...x, evidence: 'invented' })) },
  ]) {
    const ai = createAnthropicAnalysis({ ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '1' }, async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body) }] })));
    await assert.rejects(ai.analyzeJournal('I tested software.'), error => error.code === 'AI_OUTPUT');
  }
});
