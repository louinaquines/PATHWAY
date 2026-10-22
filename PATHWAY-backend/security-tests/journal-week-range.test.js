const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { scoreJournalCompleteness } = require('../journalCompleteness');
const source = readFileSync(path.resolve(__dirname, '../../PATHWAY-master/services/journalWeekRange.js'), 'utf8').replace(/export /g, '');
const journalWeekRange = vm.runInNewContext(`${source}\njournalWeekRange`, { Date });

test('new reporting weeks have explicit years, including leap days and year rollover', () => {
  for (const [instant, want] of [
    ['2026-10-22T04:00:00Z', '2026-10-19 – 2026-10-25'],
    ['2026-10-18T15:59:59Z', '2026-10-12 – 2026-10-18'],
    ['2026-10-18T16:00:00Z', '2026-10-19 – 2026-10-25'],
    ['2026-12-31T04:00:00Z', '2026-12-28 – 2027-01-03'],
    ['2024-02-29T04:00:00Z', '2024-02-26 – 2024-03-03'],
    ['2026-10-18T09:00:00-07:00', '2026-10-19 – 2026-10-25'],
  ]) {
    const date = new Date(instant), before = date.getTime();
    assert.equal(journalWeekRange(date), want);
    assert.equal(date.getTime(), before, 'formatting must not mutate the supplied date');
  }
});

test('a new student reporting period can earn all metadata points and a total of 100', () => {
  const rawNotes = 'Tested login. Learned testing. Tests passed. No challenges.';
  const rubric = ['tasks', 'learning', 'outcomes', 'challenges'].map(id => ({ id, level: 'full', reason: 'Clearly described.', evidence: 'Tested login' }));
  const result = scoreJournalCompleteness({ rawNotes, hours: 40, weekRange: journalWeekRange(new Date('2026-10-22T04:00:00Z')) }, rubric);
  assert.equal(result.total, 100); assert.equal(result.criteria[4].points, 10);
  assert.equal(result.status, 'Complete');
});

test('invalid clock input does not create a plausible reporting date', () => {
  for (const input of [new Date('invalid'), null, '2026-10-22']) assert.throws(() => journalWeekRange(input));
});
