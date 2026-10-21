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
test('incomplete punches require verification rather than invented absences', () => {
  const result = attendanceAnalytics({ ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00', exceptions: ['2026-10-06'] }, records: [{ date: '2026-10-05', timeIn: '2026-10-05T00:00:00Z' }] });
  assert.equal(result.attendanceRate, null); assert.equal(result.onTimeRate, null); assert.equal(result.missedShifts, null); assert.equal(result.dataStatus, 'Needs verification');
});
test('projection requires credited history and does not use elapsed spans', () => {
  const input = { ...base, schedule: { startDate: '2026-10-05', deadline: '2026-12-31', workingDays: [1,2,3,4,5], startTime: '08:00' }, records: [5,6,7,8,9].map(day => ({ date: `2026-10-0${day}`, timeIn: `2026-10-0${day}T00:00:00Z`, creditedHours: 8 })) };
  input.records.forEach(record => { record.timeOut = `${record.date}T09:00:00Z`; });
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
  input.records.forEach(record => { record.timeOut = `${record.date}T09:00:00Z`; });
  assert.equal(attendanceAnalytics(input).riskTier, 'Medium');
  input.schedule.deadline = '2026-10-09';
  assert.ok(attendanceAnalytics(input).reasons.includes('Completion deadline has passed.'));
});

function record(date, creditedHours = 8) {
  return { date, timeIn: `${date}T00:00:00Z`, timeOut: `${date}T09:00:00Z`, creditedHours };
}
function fixture(count = 20) {
  const dates = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 9, i + 1)).toISOString().slice(0, 10));
  const missing = [2, 6, 10, 14, 18].slice(0, 20 - count);
  return { today: '2026-10-21', creditedHours: 160, requiredHours: 240,
    schedule: { startDate: '2026-10-01', deadline: '2026-12-31', workingDays: [0,1,2,3,4,5,6], startTime: '08:00' },
    records: dates.filter((_, i) => !missing.includes(i)).map(date => record(date)) };
}
for (const [count, tier, rate] of [[18,'Low',90],[17,'Medium',85],[16,'Medium',80],[15,'High',75]]) {
  test(`${count}/20 attendance establishes ${tier}`, () => {
    const input = fixture(count), before = structuredClone(input);
    const result = attendanceAnalytics(input);
    assert.equal(result.riskTier, tier); assert.equal(result.attendanceRate, rate);
    assert.equal(result.ruleVersion, 'attendance-risk-v1'); assert.equal(result.dataStatus, 'Ready');
    assert.equal(result.progressStatus, 'In progress'); assert.equal(result.creditedHours, 160);
    assert.deepEqual(input, before); assert.equal(result.observationCounts.attendanceEligibleDays, 20);
  });
}
test('completion remains separate from risk', () => {
  const result = attendanceAnalytics({ ...fixture(), creditedHours: 240 });
  assert.equal(result.progressStatus, 'Completed'); assert.equal(result.riskTier, 'Low');
  assert.equal(result.risk, 'Completed');
});
test('insufficient days preserve absence triggers without percentage classification', () => {
  const input = fixture(); input.schedule.startDate = '2026-10-17'; input.records = input.records.slice(-4);
  let result = attendanceAnalytics(input);
  assert.equal(result.attendanceRate, null); assert.equal(result.riskTier, null); assert.equal(result.dataStatus, 'Insufficient data');
  input.records = input.records.slice(0, 2);
  assert.equal(attendanceAnalytics(input).riskTier, 'Medium');
  input.records = input.records.slice(0, 1);
  assert.equal(attendanceAnalytics(input).riskTier, 'High');
});
test('today, leave, exceptions and weekends are excluded', () => {
  const input = fixture(); input.schedule.startDate = '2026-10-12'; input.schedule.workingDays = [1,2,3,4,5];
  input.excusedDates = ['2026-10-13']; input.schedule.exceptions = ['2026-10-14'];
  input.records.push({ date: input.today, timeIn: 'invalid' });
  const result = attendanceAnalytics(input);
  assert.equal(result.observationCounts.attendanceEligibleDays, 5); assert.equal(result.attendanceRate, 100);
  assert.equal(result.riskTier, 'Low');
});
for (const kind of ['missing checkout', 'invalid', 'duplicate', 'reverse', 'wrong date']) {
  test(`${kind} requires verification and preserves overdue High`, () => {
    const input = fixture();
    if (kind === 'missing checkout') delete input.records[19].timeOut;
    if (kind === 'invalid') input.records[19].timeIn = '2026-10-20T08:00:00';
    if (kind === 'duplicate') input.records.push({ ...input.records[19] });
    if (kind === 'reverse') input.records[19].timeOut = '2026-10-19T23:00:00Z';
    if (kind === 'wrong date') input.records[19].timeIn = '2026-10-19T00:00:00Z';
    let result = attendanceAnalytics(input);
    assert.equal(result.dataStatus, 'Needs verification'); assert.equal(result.riskTier, null);
    assert.equal(result.attendanceRate, null); assert.equal(result.missedShifts, null);
    assert.equal(result.projectedCompletion, null); assert.ok(result.reasonCodes.some(reason => reason.code === 'UNCERTAIN_ATTENDANCE'));
    input.schedule.deadline = '2026-10-20'; result = attendanceAnalytics(input);
    assert.equal(result.riskTier, 'High'); assert.ok(result.reasonCodes.some(reason => reason.code === 'OVERDUE'));
  });
}
test('absence chains break at attendance/uncertainty and skip excused dates', () => {
  const input = fixture(); input.records = input.records.slice(0, 17); input.excusedDates = ['2026-10-19'];
  assert.equal(attendanceAnalytics(input).observationCounts.consecutiveAbsences, 2);
  input.records.push({ date: '2026-10-19', timeIn: 'invalid' });
  assert.equal(attendanceAnalytics(input).observationCounts.consecutiveAbsences, 2);
  input.excusedDates = []; assert.equal(attendanceAnalytics(input).observationCounts.consecutiveAbsences, 1);
  input.records.push(record('2026-10-20'));
  assert.equal(attendanceAnalytics(input).observationCounts.consecutiveAbsences, 0);
});
test('zero authoritative velocity and projected shortfall establish Medium', () => {
  const input = fixture(); input.records.forEach(item => { item.creditedHours = 0; });
  let result = attendanceAnalytics(input); assert.equal(result.riskTier, 'Medium'); assert.equal(result.projectedCompletion, null);
  assert.ok(result.reasonCodes.some(reason => reason.code === 'ZERO_VELOCITY'));
  input.records.forEach(item => { item.creditedHours = 8; }); input.schedule.deadline = '2026-10-22';
  result = attendanceAnalytics(input); assert.equal(result.riskTier, 'Medium'); assert.equal(result.projectedCompletion, '2026-10-30');
});
test('missing credit prevents Low but preserves Medium/High; spans never supply credit', () => {
  for (const [count, tier] of [[20,null],[17,'Medium'],[15,'High']]) {
    const input = fixture(count); input.records.forEach(item => { delete item.creditedHours; });
    const result = attendanceAnalytics(input); assert.equal(result.riskTier, tier);
    assert.equal(result.projectedCompletion, null); assert.equal(result.dataStatus, 'Insufficient data');
  }
});
test('20 eligible days can extend beyond the separate 28 calendar day projection window', () => {
  const input = fixture(); input.schedule.startDate = '2026-08-01'; input.schedule.workingDays = [1,3]; input.records = [];
  for (let ms = Date.UTC(2026,7,1); ms < Date.UTC(2026,9,21); ms += 86400000) {
    if ([1,3].includes(new Date(ms).getUTCDay())) input.records.push(record(new Date(ms).toISOString().slice(0,10)));
  }
  const result = attendanceAnalytics(input);
  assert.equal(result.observationCounts.attendanceEligibleDays, 20);
  assert.equal(result.observationCounts.projectionEligibleDays, 8); assert.equal(result.riskTier, 'Low');
  assert.equal(result.projectedCompletion, '2026-11-23');
});
test('invalid and out of bounds dates cannot trigger unbounded scans', () => {
  for (const today of ['2026-02-30','9999-12-31',null]) assert.throws(() => attendanceAnalytics({ ...fixture(), today }), /Invalid/);
  for (const change of [{ startDate: '0000-01-01' }, { deadline: '9999-12-31' }, { workingDays: [] }]) {
    const input = fixture(); Object.assign(input.schedule, change);
    assert.equal(attendanceAnalytics(input).dataStatus, 'Unavailable');
  }
  assert.throws(() => attendanceAnalytics({ ...fixture(), excusedDates: ['bad'] }), /Invalid/);
});
test('overdue remains High even when other schedule fields are unavailable', () => {
  const input = fixture(); delete input.schedule.startTime; input.schedule.deadline = '2026-10-20';
  const result = attendanceAnalytics(input); assert.equal(result.riskTier, 'High'); assert.equal(result.dataStatus, 'Unavailable');
});
test('malformed record dates cannot silently become unexplained absences', () => {
  for (const item of [null, {}, { date: '2026-02-30' }, { date: '9999-01-01' }]) {
    assert.throws(() => attendanceAnalytics({ ...fixture(), records: [item] }), /Invalid/);
  }
});
test('projection horizon is bounded and cannot imply Low or ready projection', () => {
  const input = fixture(); input.requiredHours = 1e8;
  const result = attendanceAnalytics(input); assert.equal(result.projectedCompletion, null);
  assert.equal(result.riskTier, null); assert.equal(result.dataStatus, 'Insufficient data');
  assert.ok(result.reasonCodes.some(reason => reason.code === 'PROJECTION_HORIZON'));
});
test('Philippine dates and explicit offsets give the same attendance and timing', () => {
  const input = fixture(); input.records[0] = { date: '2026-10-01', timeIn: '2026-10-01T08:00:00+08:00', timeOut: '2026-10-01T17:00:00+08:00', creditedHours: 8 };
  assert.equal(attendanceAnalytics(input).onTimeRate, 100);
  input.records[1].timeIn = '2026-10-01T23:59:00Z';
  assert.equal(attendanceAnalytics(input).attendanceRate, 100);
  input.records[1].timeOut = '2026-10-21T00:00:00+08:00';
  assert.equal(attendanceAnalytics(input).dataStatus, 'Needs verification');
});
test('exact attendance ratio is classified independently of rounded display', () => {
  const input = fixture(); input.schedule.startDate = '2026-10-02';
  input.records = input.records.filter(item => !['2026-10-03','2026-10-07'].includes(item.date));
  const result = attendanceAnalytics(input); // 17/19, below 90%.
  assert.equal(result.attendanceRate, 89); assert.equal(result.riskTier, 'Medium');
});
test('highest trigger wins, including a streak despite 90% attendance', () => {
  const input = fixture(); input.records = input.records.slice(0,18);
  let result = attendanceAnalytics(input); assert.equal(result.attendanceRate, 90); assert.equal(result.riskTier, 'Medium');
  input.schedule.deadline = '2026-10-20';
  assert.equal(attendanceAnalytics(input).riskTier, 'High');
});
test('uncertain punch breaks a streak without erasing later established absences', () => {
  const input = fixture(); input.records = input.records.slice(0,16);
  input.records.push({ date: '2026-10-17', timeIn: 'invalid' });
  const result = attendanceAnalytics(input); assert.equal(result.dataStatus, 'Needs verification');
  assert.equal(result.riskTier, 'High'); assert.equal(result.observationCounts.consecutiveAbsences, 3);
  assert.equal(result.observationCounts.absentDays, 3);
});
