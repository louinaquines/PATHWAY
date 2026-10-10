const { test } = require('node:test');
const assert = require('node:assert/strict');
const { attendanceAnalytics } = require('../attendanceAnalytics');
const base = { today: '2026-10-11', creditedHours: 120, requiredHours: 540 };
test('no schedule means no invented rate or risk', () => {
  const result = attendanceAnalytics(base); assert.equal(result.attendanceRate, null); assert.equal(result.risk, 'Unavailable');
});
test('completed total does not require prediction', () => {
  assert.equal(attendanceAnalytics({ ...base, creditedHours: 540 }).risk, 'Completed');
});
test('configured schedule excludes today, weekends and exceptions', () => {
  const result = attendanceAnalytics({ ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00', exceptions: ['2026-10-06'] }, records: [{ date: '2026-10-05', timeIn: '2026-10-05T00:00:00Z' }] });
  assert.equal(result.attendanceRate, 25); assert.equal(result.onTimeRate, 100); assert.equal(result.missedShifts, 3); assert.equal(result.risk, 'Unavailable');
});
test('projection requires credited history and does not use elapsed spans', () => {
  const input = { ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00' }, records: [5,6,7,8,9].map(day => ({ date: `2026-10-0${day}`, timeIn: `2026-10-0${day}T00:00:00Z`, creditedHours: 8 })) };
  assert.equal(attendanceAnalytics(input).risk, 'On Track');
  assert.ok(attendanceAnalytics(input).projectedCompletion);
  input.records.forEach(record => delete record.creditedHours);
  assert.equal(attendanceAnalytics(input).projectedCompletion, null);
});
test('duplicate or invalid punches do not masquerade as missed shifts', () => {
  const record = { date: '2026-10-05', timeIn: '2026-10-05T00:00:00Z' };
  const input = { ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00' }, records: [record, record] };
  assert.equal(attendanceAnalytics(input).missedShifts, null);
  input.records = [{ ...record, timeIn: '2026-10-05T08:00:00' }];
  assert.equal(attendanceAnalytics(input).attendanceRate, null);
});
test('zero velocity and overdue cases have explicit reasons', () => {
  const input = { ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00' }, records: [5,6,7,8,9].map(day => ({ date: `2026-10-0${day}`, timeIn: `2026-10-0${day}T00:00:00Z`, creditedHours: 0 })) };
  assert.equal(attendanceAnalytics(input).risk, 'High Risk');
  input.schedule.deadline = '2026-10-09';
  assert.ok(attendanceAnalytics(input).reasons.includes('Completion deadline has passed.'));
});
