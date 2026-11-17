const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
function helpers() {
  const source = readFileSync(require('node:path').resolve(__dirname, '../../PATHWAY-master/services/journalPresentation.js'), 'utf8').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({journalEntryTitle, journalContextChanged, validJournalSettings})`);
}
test('daily and legacy weekly entry titles retain their own period', () => {
  const { journalEntryTitle } = helpers();
  assert.equal(journalEntryTitle({ frequency: 'daily', periodStart: '2026-10-22' }), 'Daily journal · 2026-10-22');
  assert.equal(journalEntryTitle({ weekNum: 3, weekRange: 'Oct 5 – Oct 11' }), 'Week 3 · Oct 5 – Oct 11');
});
test('draft confirmation detects frequency, revision, and midnight changes without modifying notes', () => {
  const { journalContextChanged, validJournalSettings } = helpers();
  const a = { department: 'IT', frequency: 'daily', revision: 1, periodStart: '2026-10-22', periodEnd: '2026-10-22' };
  assert.equal(journalContextChanged(a, { ...a }), false);
  for (const patch of [{ frequency: 'weekly' }, { revision: 2 }, { periodStart: '2026-10-23' }]) assert.equal(journalContextChanged(a, { ...a, ...patch }), true);
  assert.equal(validJournalSettings(a), true);
  assert.equal(validJournalSettings({ frequency: 'daily' }), false);
});
