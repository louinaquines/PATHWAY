const { test } = require('node:test');
const assert = require('node:assert/strict');
test('excused policy rejects impossible, duplicate, oversized and noncalendar dates', () => {
  const { validateExcusedDates } = require('../attendanceExcusedDates');
  assert.deepEqual(validateExcusedDates(['2026-10-21', '2024-02-29']), ['2024-02-29', '2026-10-21']);
  for (const dates of [['2026-02-30'], ['2026-10-21', '2026-10-21'], Array(367).fill('2026-10-21'), ['1999-12-31'], ['2026-1-1'], null]) assert.throws(() => validateExcusedDates(dates));
  const dates = Array.from({ length: 367 }, (_, n) => new Date(Date.UTC(2024, 0, 1 + n)).toISOString().slice(0, 10));
  assert.equal(validateExcusedDates(dates.slice(0, 366)).length, 366);
  assert.throws(() => validateExcusedDates(dates));
});
test('fresh assignment rejects disabled roles, foreign departments and transfers', async () => {
  const { assertAttendanceAccess } = require('../attendanceExcusedDates');
  for (const change of [{ role: 'admin' }, { disabled: true }, { accountApproved: false }, { department: 'other' }]) {
    const db = { collection: name => ({ doc: id => ({ get: async () => ({ exists: true, data: () => name === 'sections' ? { coordinatorId: 'staff', department: 'IT' } : id === 'staff' ? { role: 'coordinator', department: 'IT', accountApproved: true, ...change } : { role: 'student', department: 'IT', sectionId: 's' } }) }) }) };
    await assert.rejects(assertAttendanceAccess(db, 'staff', 's', 'student'), e => e.status === 403);
  }
});
