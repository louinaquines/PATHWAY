const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAnthropicAnalysis } = require('../anthropicAnalysis');
const { installAttendanceAiReview } = require('../attendanceAiReview');
const { attendanceFixture } = require('./attendance-fixture');
const env = { ANTHROPIC_ENABLED: '1', ANTHROPIC_API_KEY: 'synthetic', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_DAILY_REQUEST_LIMIT: '3' };
const reply = data => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(data) }] }));
test('provider receives only allowlisted aggregate metrics, not identity or raw records', async () => {
  const ai = createAnthropicAnalysis(env, async (url, options) => {
    const metrics = JSON.parse(JSON.parse(options.body).messages[0].content).attendanceMetrics;
    assert.deepEqual(Object.keys(metrics), ['creditedHours', 'completionPercentage', 'attendanceRate', 'onTimeRate', 'missedShifts', 'projectedCompletion', 'risk', 'riskTier', 'progressStatus', 'dataStatus']);
    assert.equal(metrics.attendanceRate, null);
    return reply({ explanations: [{ field: 'risk', value: 'Unavailable', explanation: 'Insufficient reliable data; review the schedule before interpreting risk.' }] });
  });
  assert.equal((await ai.explainAttendance({ risk: 'Unavailable', creditedHours: 120, name: 'private', email: 'private', records: [{ location: 'private' }] })).advisoryOnly, true);
});
test('invented numbers, changed risk, duplicate fields and extra top-level fields fail closed', async () => {
  for (const bad of [
    { explanations: [{ field: 'risk', value: 'Completed', explanation: 'Completed.' }] },
    { explanations: [{ field: 'creditedHours', value: 999, explanation: 'Progress.' }] },
    { explanations: [{ field: 'risk', value: 'On Track', explanation: 'Finish in 3 days.' }] },
    { explanations: Array(2).fill({ field: 'risk', value: 'On Track', explanation: 'Estimated progress.' }) },
    { explanations: [], approved: true },
  ]) await assert.rejects(createAnthropicAnalysis(env, async () => reply(bad)).explainAttendance({ risk: 'On Track', creditedHours: 120 }), error => error.code === 'AI_OUTPUT');
});
function fixture({ role = 'coordinator', consent = true, denied = false, sectionId = 'section', department = 'IT', providerError = false, count = 0, onAttendance, onProvider = () => {} } = {}) {
  let handler, calls = 0;
  const f = attendanceFixture({ student: { sectionId, department, journalHours: 900 }, count, onAttendance });
  installAttendanceAiReview({ app: { post: (path, auth, fn) => { handler = fn; } }, db: f.db, requireStaff() {}, coordinatorSection: async () => { if (denied) throw Object.assign(new Error('private'), { status: 403 }); return { data: () => f.profiles['sections/section'] }; }, allowRate: () => true, ai: { explainAttendance: async metrics => { calls++; assert.equal(metrics.creditedHours, 120); assert.equal(metrics.risk, 'Unavailable'); onProvider(f.profiles); if (providerError) throw new Error('private credential'); return { explanations: [] }; } } });
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  return async () => { await handler({ staff: { role, uid: 'staff' }, params: { sectionId: 'section', studentId: 'student' }, body: { consent, metrics: { risk: 'Completed' } } }, res); return { res, reads: f.reads, calls }; };
}
test('route calculates server metrics, never uses supplied metrics or journal hours', async () => {
  const { res, calls } = await fixture()(); assert.equal(res.code, 200); assert.equal(calls, 1); assert.equal(res.data.metrics.risk, 'Unavailable'); assert.equal(res.data.metrics.creditedHours, 120);
});
test('transfer before provider prevents disclosure; transfer during provider prevents response', async () => {
  for (const stage of ['onAttendance', 'onProvider']) {
    const { res, calls } = await fixture({ [stage]: profiles => { profiles['users/student'].sectionId = 'other'; } })();
    assert.equal(res.code, 403); assert.equal(calls, stage === 'onAttendance' ? 0 : 1); assert.equal(res.data.metrics, undefined);
  }
});
test('role, ownership, department, section and consent deny before attendance/provider reads', async () => {
  for (const settings of [{ role: 'admin' }, { consent: false }, { denied: true }, { sectionId: 'other' }, { department: 'other' }]) {
    const { res, reads, calls } = await fixture(settings)(); assert.ok([400, 403].includes(res.code)); assert.equal(reads, 0); assert.equal(calls, 0);
  }
});
test('bounded record reads and provider failures return sanitized errors', async () => {
  for (const settings of [{ count: 1001 }, { providerError: true }]) {
    const { res } = await fixture(settings)(); assert.equal(res.code, 503); assert.ok(!JSON.stringify(res.data).includes('private'));
  }
});
test('emulator gate blocks attendance explanations without provider calls', async () => {
  await assert.rejects(createAnthropicAnalysis({ ...env, FIRESTORE_EMULATOR_HOST: 'localhost:8180' }, () => assert.fail('paid call')).explainAttendance({ risk: 'Unavailable' }), error => error.code === 'AI_DISABLED');
});
test('explicit risk progress and data values are copied exactly and cannot be changed', async () => {
  const metrics = { riskTier: 'High', progressStatus: 'Completed', dataStatus: 'Needs verification', excusedDates: ['2026-01-01'], name: 'private' };
  const fields = ['riskTier', 'progressStatus', 'dataStatus'];
  const explanations = fields.map(field => ({ field, value: metrics[field], explanation: 'Review the available evidence.' }));
  const ai = createAnthropicAnalysis(env, async (url, options) => {
    const aggregate = JSON.parse(JSON.parse(options.body).messages[0].content).attendanceMetrics;
    for (const field of fields) assert.equal(aggregate[field], metrics[field]);
    assert.equal(aggregate.excusedDates, undefined);
    return reply({ explanations });
  });
  assert.deepEqual((await ai.explainAttendance(metrics)).explanations, explanations);
  await assert.rejects(createAnthropicAnalysis(env, async () => reply({ explanations: [{ field: 'riskTier', value: 'Low', explanation: 'Available.' }] })).explainAttendance(metrics), e => e.code === 'AI_OUTPUT');
});
