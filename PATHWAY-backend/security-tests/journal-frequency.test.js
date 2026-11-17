const { test } = require('node:test');
const assert = require('node:assert/strict');
const { journalPeriod, settingsValue, journalDays } = require('../departmentJournals');
test('weekly default and malformed stored settings fail closed', () => {
  assert.deepEqual(settingsValue(null), { frequency: 'weekly', revision: 0 });
  assert.throws(() => settingsValue({ frequency: 'monthly', revision: 2 }));
});
test('daily and weekly periods use Philippine dates across UTC midnight', () => {
  const now = new Date('2026-10-25T18:00:00Z');
  assert.deepEqual(journalPeriod('daily', now), { frequency: 'daily', periodStart: '2026-10-26', periodEnd: '2026-10-26' });
  assert.deepEqual(journalDays(journalPeriod('weekly', now)), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  assert.throws(() => journalPeriod('monthly', now));
});
test('daily review checks validate dates and daily hours without weekly gap warnings', () => {
  const { journalAnalysis } = require('../reviewAnalysis');
  const valid = { frequency: 'daily', periodStart: '2026-10-22', periodEnd: '2026-10-22', rawNotes: 'Completed testing and learned useful debugging techniques with the team while documenting the result and identifying no further issues today.', hours: 8 };
  assert.equal(journalAnalysis(valid).findings.length, 0);
  assert.ok(journalAnalysis({ ...valid, hours: 25 }).findings.some(text => /daily hours/.test(text)));
});
