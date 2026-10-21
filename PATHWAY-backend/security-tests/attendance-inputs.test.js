const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAttendanceMetrics, loadAttendanceInputs } = require('../attendanceAiReview');
const schedule = { startDate: '2026-01-01', deadline: '2027-12-31', workingDays: [1], startTime: '08:00', exceptions: [] };
function fixture(records = [], policy = { dates: [], version: 1 }) {
  const bounds = [];
  const query = { where(...args) { bounds.push(args); return this; }, limit(n) { bounds.push(n); return this; }, async get() { return { size: records.length, docs: records.map(record => ({ data: () => record })) }; } };
  const db = { collection(name) { assert.equal(name, 'attendanceExcusedDates'); return { doc(id) { assert.equal(id, 'student'); return { get: async () => ({ exists: true, data: () => policy }) }; } }; } };
  return { ref: { id: 'student', firestore: db, collection: () => query }, bounds };
}
test('sparse schedule loads twenty workdays beyond twenty eight calendar days', async () => {
  const f = fixture();
  const result = await loadAttendanceMetrics(f.ref, { hoursRendered: 0 }, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
  assert.equal(result.observationCounts.attendanceEligibleDays, 20);
  assert.deepEqual(f.bounds, [['date', '>=', '2026-06-08'], ['date', '<', '2026-10-21'], 1001]);
});
test('missing total remains unavailable and never becomes zero', async () => {
  const f = fixture();
  const result = await loadAttendanceMetrics(f.ref, {}, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
  assert.equal(result.creditedHours, null);
  assert.ok(result.reasonCodes.some(r => r.code === 'INVALID_TOTALS'));
});
test('backend excused policy extends sparse coverage across long leave', async () => {
  const f = fixture([], { dates: ['2026-10-19', '2026-10-12'], version: 2 });
  const result = await loadAttendanceMetrics(f.ref, { hoursRendered: 0 }, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
  assert.equal(result.observationCounts.attendanceEligibleDays, 20);
  assert.deepEqual(f.bounds[0], ['date', '>=', '2026-05-25']);
});
test('pending completed server credit counts; missing, strings and invalid credit do not', async () => {
  for (const credit of [8, undefined, '8', -1, NaN]) {
    const f = fixture([{ date: '2026-10-19', timeIn: '2026-10-19T00:00:00Z', timeOut: '2026-10-19T08:00:00Z', hoursToday: credit, status: 'pending' }]);
    const result = await loadAttendanceMetrics(f.ref, { hoursRendered: 8 }, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
    assert.equal(result.observationCounts.projectionMissingCreditDays, credit === 8 ? 0 : 1);
  }
});
test('overflow and malformed dates fail explicitly rather than fabricating absence', async () => {
  for (const records of [Array(1001).fill({ date: '2026-10-19' }), [{ date: '2026-02-30' }]]) {
    const f = fixture(records);
    await assert.rejects(loadAttendanceMetrics(f.ref, { hoursRendered: 0 }, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21'));
  }
});
test('coverage includes the full previous calendar interval even when its first days are not scheduled', async () => {
  const f = fixture();
  await loadAttendanceMetrics(f.ref, { hoursRendered: 0 }, { hoursRequired: 540, attendanceSchedule: { ...schedule, startDate: '2026-09-24' } }, '2026-10-21');
  assert.deepEqual(f.bounds[0], ['date', '>=', '2026-09-24']);
});
test('worker loader pins query bounds, policy version and authoritative input snapshots', async () => {
  const f = fixture([], { dates: ['2026-10-19'], version: 3 });
  const { inputs, evidence } = await loadAttendanceInputs(f.ref, { role: 'student', sectionId: 'section', department: 'IT', hoursRendered: 4 }, { coordinatorId: 'staff', department: 'IT', hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
  assert.equal(inputs.creditedHours, 4); assert.deepEqual(inputs.excusedDates, ['2026-10-19']);
  assert.equal(evidence.excusedDatesVersion, 3); assert.equal(evidence.ruleVersion, 'attendance-risk-v1');
  assert.equal(evidence.queryFrom, '2026-06-01'); assert.equal(evidence.queryBefore, '2026-10-21'); assert.equal(evidence.recordLimit, 1000);
  assert.equal(evidence.student.sectionId, 'section'); assert.equal(evidence.section.coordinatorId, 'staff');
});
test('numeric-looking profile strings and explicit invalid target never become authoritative numbers', async () => {
  for (const student of [{ hoursRendered: '8' }, { hoursRendered: 8, hoursRequired: 0 }, { hoursRendered: 8, hoursRequired: '540' }]) {
    const f = fixture();
    const result = await loadAttendanceMetrics(f.ref, student, { hoursRequired: 540, attendanceSchedule: schedule }, '2026-10-21');
    assert.ok(result.reasonCodes.some(r => r.code === 'INVALID_TOTALS'));
  }
});
