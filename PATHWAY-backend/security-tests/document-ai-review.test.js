const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnthropicAnalysis } = require('../anthropicAnalysis');
const { installDocumentAiReview } = require('../documentAiReview');
const env = { ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '2' };
const reply = result => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(result) }] }));
test('document provider receives only reviewed source text and returns exact-quote advisory findings', async () => {
  const ai = createAnthropicAnalysis(env, async (url, options) => {
    assert.deepEqual(JSON.parse(JSON.parse(options.body).messages[0].content), { documentSource: 'TEST ONLY. Missing supervisor field.' });
    return reply({ findings: [{ finding: 'Review the supervisor field manually.', evidence: 'Missing supervisor field.' }] });
  });
  assert.equal((await ai.assistDocument('TEST ONLY. Missing supervisor field.')).advisoryOnly, true);
});
test('unsupported evidence, extra fields, invalid shape and oversized findings fail closed', async () => {
  for (const bad of [{ findings: [{ finding: 'Test', evidence: 'invented' }] }, { findings: [], approved: true }, { findings: [{ finding: 'x'.repeat(301), evidence: 'source' }] }, { findings: Array(6).fill({ finding: 'Test', evidence: 'source' }) }, { findings: null }]) {
    await assert.rejects(createAnthropicAnalysis(env, async () => reply(bad)).assistDocument('source'), error => error.code === 'AI_OUTPUT');
  }
});
test('document AI remains disabled in emulator mode', async () => {
  await assert.rejects(createAnthropicAnalysis({ ...env, FIRESTORE_EMULATOR_HOST: 'localhost:8180' }, () => assert.fail('paid call')).assistDocument('source'), error => error.code === 'AI_DISABLED');
});
function fixture({ role = 'coordinator', owns = true, consent = true, reviewed = true, text = 'Reviewed test text', form, requirementId = 'dtr', submitted = true, count = 0, providerError = false } = {}) {
  let handler, attendanceReads = 0, calls = 0, source;
  const records = { where() { return this; }, limit() { return this; }, get: async () => { attendanceReads++; return { size: count, docs: [{ data: () => ({ date: '2026-10-01', timeIn: '2026-10-01T00:00:00Z', timeOut: '2026-10-01T09:00:00Z', location: 'PRIVATE LOCATION' }) }] }; } };
  const ref = { get: async () => ({ exists: true, data: () => ({ email: 'PRIVATE EMAIL', requirements: submitted ? { [requirementId]: { fileName: 'test.pdf' } } : {} }) }), collection: () => records };
  installDocumentAiReview({ app: { post: (path, auth, fn) => { handler = fn; } }, db: { collection: () => ({ doc: () => ref }) }, requireStaff() {}, allowRate: () => true, coordinatorOwnsStudent: async () => owns, ai: { assistDocument: async value => { calls++; source = value; if (providerError) throw new Error('private key'); return { findings: [] }; } } });
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  return async () => { await handler({ staff: { role, uid: 'staff' }, params: { studentId: 'student', requirementId }, body: { text, form, consent, reviewed, comparison: { approved: true }, fileUrl: 'https://untrusted.test' } }, res); return { res, attendanceReads, calls, source }; };
}
const form = { year: 2026, month: 10, copies: [[{ day: 1, amArrival: '08:00', amDeparture: '12:00', pmArrival: '13:00', pmDeparture: '17:00' }]] };
test('DTR server compares corrected transcription to fresh attendance, without forwarding raw identity or punches', async () => {
  const { res, calls, source } = await fixture({ form })();
  assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(res.data.comparison.results[0].status, 'endpoints_match');
  for (const secret of ['PRIVATE EMAIL', 'PRIVATE LOCATION', 'T00:00:00Z', 'untrusted.test', 'approved']) assert.ok(!source.includes(secret));
  assert.ok(source.includes('2026-10-01: endpoints_match')); assert.equal(res.data.comparison.attendanceModified, false);
});
test('generic document route labels client transcription honestly and never fetches a file', async () => {
  const { res, source, attendanceReads } = await fixture({ requirementId: 'certificate' })();
  assert.equal(res.code, 200); assert.equal(source, 'Reviewed test text'); assert.equal(attendanceReads, 0); assert.equal(res.data.source, 'reviewed-client-excerpt');
});
test('role, ownership, consent, review, missing source and oversized text block provider', async () => {
  for (const settings of [{ role: 'student' }, { role: 'admin' }, { owns: false }, { consent: false }, { reviewed: false }, { submitted: false }, { text: '' }, { text: 'x'.repeat(6001) }, { form, requirementId: 'certificate' }]) {
    const { res, calls, attendanceReads } = await fixture(settings)(); assert.ok([400, 403, 404].includes(res.code)); assert.equal(calls, 0); assert.equal(attendanceReads, 0);
  }
});
test('invalid DTR and record overflow do not call provider; failures sanitized', async () => {
  for (const settings of [{ form: { ...form, month: 13 } }, { form, count: 367 }, { providerError: true }]) {
    const { res } = await fixture(settings)(); assert.ok([400, 422, 503].includes(res.code)); assert.ok(!JSON.stringify(res.data).includes('private key'));
  }
});
