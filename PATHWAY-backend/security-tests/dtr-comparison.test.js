const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTime, normalizeForm48, compareDtr } = require('../dtrComparison');
const row = () => ({ day: 1, amArrival: '08:00', amDeparture: '12:00', pmArrival: '1:00', pmDeparture: '5:00' });
const form = (rows = [row()]) => ({ year: 2026, month: 10, copies: [rows] });
const digital = () => ({ date: '2026-10-01', timeIn: '2026-10-01T00:00:00Z', timeOut: '2026-10-01T09:00:00Z' });

test('clock strings, noon, explicit suffix and spreadsheet fractions', () => {
  assert.equal(parseTime('1:00 PM', 'pm'), 780);
  assert.equal(parseTime('12:00', 'am'), 720);
  assert.equal(parseTime('12:00 AM', 'am'), 0);
  assert.equal(parseTime(0.5, 'am'), 720);
  assert.equal(parseTime('  ', 'am'), null);
  for (const value of ['8.OO', '8:60', '25:00', '0:00 PM', -1, 1, NaN]) assert.throws(() => parseTime(value, 'am'));
});
test('sessions exclude lunch and duplicate copies count once', () => {
  const input = { ...form(), copies: [[row()], [row()]] };
  const before = JSON.stringify(input);
  const result = normalizeForm48(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].workedMinutes, 480);
  assert.equal(JSON.stringify(input), before);
});
test('conflicting copies and uncertain transcription need review', () => {
  assert.equal(normalizeForm48({ ...form(), copies: [[row()], [{ ...row(), pmDeparture: '4:00' }]] })[0].workedMinutes, null);
  assert.equal(normalizeForm48(form([{ ...row(), needsReview: true }]))[0].workedMinutes, null);
});
test('real calendar dates, leap years and duplicate rows', () => {
  assert.throws(() => normalizeForm48({ year: 2026, month: 2, copies: [[{ day: 29 }]] }));
  assert.equal(normalizeForm48({ year: 2024, month: 2, copies: [[{ day: 29 }]] })[0].date, '2024-02-29');
  assert.throws(() => normalizeForm48(form([row(), row()])));
  assert.throws(() => normalizeForm48({ ...form(), year: undefined }));
});
test('blanks are not zero work or inferred absence', () => {
  assert.equal(normalizeForm48(form([{ day: 1 }]))[0].workedMinutes, null);
  assert.equal(compareDtr(form([{ day: 1 }]), []).results[0].status, 'blank');
  assert.equal(compareDtr(form([{ day: 1 }]), [digital()]).results[0].status, 'needs_review');
});
test('incomplete, reversed and overlapping sessions block totals', () => {
  for (const patch of [{ amDeparture: '' }, { amDeparture: '07:00' }, { pmArrival: '11:00 AM' }, { amArrival: 'bad' }]) {
    assert.equal(normalizeForm48(form([{ ...row(), ...patch }]))[0].workedMinutes, null);
  }
});
test('matching endpoints disclose elapsed-span difference without writing records', () => {
  const records = [digital()];
  const before = JSON.stringify(records);
  const result = compareDtr(form(), records);
  assert.equal(result.results[0].status, 'endpoints_match');
  assert.equal(result.results[0].durationDifferenceMinutes, -60);
  assert.equal(result.results[0].issues.length, 1);
  assert.equal(result.attendanceModified, false);
  assert.equal(JSON.stringify(records), before);
});
test('endpoint differences obey explicit tolerance', () => {
  const input = form([{ ...row(), amArrival: '08:05' }]);
  assert.equal(compareDtr(input, [digital()]).results[0].status, 'discrepancy');
  assert.equal(compareDtr(input, [digital()], { toleranceMinutes: 5 }).results[0].status, 'endpoints_match');
  assert.throws(() => compareDtr(input, [], { toleranceMinutes: -1 }));
});
test('missing, duplicate, incomplete, timezone-less and overnight digital shifts need review', () => {
  for (const records of [[], [digital(), digital()], [{ ...digital(), timeOut: null }],
    [{ ...digital(), timeIn: '2026-10-01T08:00:00' }], [{ ...digital(), timeOut: '2026-10-01T17:00:00Z' }]]) {
    assert.equal(compareDtr(form(), records).results[0].status, 'needs_review');
  }
});
test('single afternoon session and digital-only dates', () => {
  const input = form([{ day: 1, pmArrival: '1:00', pmDeparture: '5:00' }]);
  assert.equal(normalizeForm48(input)[0].workedMinutes, 240);
  assert.deepEqual(compareDtr(input, [{ ...digital(), date: '2026-10-02' }]).digitalOnlyDates, ['2026-10-02']);
});
