const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installJournalAiReview } = require('../journalAiReview');
const { validateJournalResult, createAnthropicAnalysis } = require('../anthropicAnalysis');
function fixture({ owns = true, role = 'coordinator', consent = true, providerError } = {}) {
  let handler, reads = 0, calls = 0;
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }), collection: () => ({ doc: () => ({ get: async () => { reads++; return { exists: true, data: () => ({ rawNotes: 'I tested software.', refined: 'Different text' }) }; } }) }) }) }) };
  installJournalAiReview({ app: { post: (path, auth, fn) => { handler = fn; } }, db, requireStaff: () => {}, coordinatorOwnsStudent: async () => owns, allowRate: () => true, ai: { analyzeJournal: async notes => { calls++; assert.equal(notes, 'I tested software.'); if (providerError) throw providerError; return { mood: 'positive', headline: 'Positive work experience', summary: 'Tested software.' }; } } });
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  return { run: async () => { await handler({ staff: { uid: 'staff', role }, params: { studentId: 'student', entryId: 'entry' }, body: { consent, notes: 'Do not use client text' } }, res); return { res, reads, calls }; } };
}
test('coordinator receives analysis from original server text without writes', async () => {
  const { res, calls } = await fixture().run(); assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(res.data.source, 'original-notes');
});
test('ownership, coordinator role and consent gate provider and journal access', async () => {
  for (const opts of [{ owns: false }, { role: 'admin' }, { role: 'student' }, { consent: false }]) {
    const { res, reads, calls } = await fixture(opts).run(); assert.ok([400, 403].includes(res.code)); assert.equal(reads, 0); assert.equal(calls, 0);
  }
});
test('provider failure never exposes private details', async () => {
  const { res } = await fixture({ providerError: new Error('private key and journal') }).run(); assert.equal(res.code, 503); assert.ok(!JSON.stringify(res.data).includes('private'));
});
test('analysis rejects invented quotes, unexpected fields and oversized arrays', () => {
  const valid = { mood: 'negative', headline: 'Struggling with workload', summary: 'Worked long hours on testing.' };
  assert.deepEqual(validateJournalResult({ ...valid, approval: true }), valid);
  for (const bad of [{ ...valid, mood: 'great' }, { ...valid, headline: '' }, { ...valid, summary: 'x'.repeat(701) }, null]) assert.throws(() => validateJournalResult(bad));
});
test('structured analysis uses mocked provider and shared request quota', async () => {
  const ai = createAnthropicAnalysis({ ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '1' }, async () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ mood: 'unclear', headline: 'Not enough to tell', summary: 'Short entry.' }) }] })));
  assert.equal((await ai.analyzeJournal('Test notes')).advisoryOnly, true);
  await assert.rejects(ai.refine('Test notes'), error => error.code === 'AI_LIMIT');
});
