const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function helper(globals = {}) {
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/services/recordPagination.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({ readRecordPage, mergeRecords, buildActivity })`, globals);
}
const document = id => ({ id, data: () => ({ text: id }) });
test('pages use look-ahead and resume after the last displayed document, not the look-ahead', async () => {
  let constraints;
  const api = helper({ getDocs: async () => ({ docs: ['a', 'b', 'c'].map(document) }), query: (...args) => { constraints = args; return args; }, limit: value => ({ limit: value }), startAfter: value => ({ cursor: value }) });
  const page = await api.readRecordPage('base', 2);
  assert.deepEqual(Array.from(page.records, item => item.id), ['a', 'b']);
  assert.equal(page.cursor.id, 'b');
  assert.equal(page.hasMore, true);
  assert.equal(constraints[1].limit, 3);
  await api.readRecordPage('base', 2, page.cursor);
  assert.equal(constraints[1].cursor.id, 'b');
});
test('exactly full final pages and empty pages do not advertise more records', async () => {
  const api = helper({ getDocs: async () => ({ docs: ['a', 'b'].map(document) }), query: () => null, limit: () => null });
  assert.equal((await api.readRecordPage('base', 2)).hasMore, false);
  const empty = helper({ getDocs: async () => ({ docs: [] }), query: () => null, limit: () => null });
  assert.equal((await empty.readRecordPage('base', 2)).records.length, 0);
});
test('overlapping records merge without duplication and retain updated content', () => {
  const result = helper().mergeRecords([{ id: 'a', text: 'old' }, { id: 'b' }], [{ id: 'a', text: 'updated' }, { id: 'c' }]);
  assert.equal(result.length, 3);
  assert.equal(result[0].text, 'updated');
});
test('Home activity merges all sources newest-first and supports Firestore timestamps', () => {
  const result = helper().buildActivity([{ id: 'a', date: '2026-10-08', timeOut: '2026-10-08T02:00:00Z', hoursToday: .03 }], [{ id: 'j', createdAt: '2026-10-08T04:00:00Z', weekNum: 1 }], [{ id: 'n', createdAt: { toMillis: () => Date.parse('2026-10-08T05:00:00Z') }, title: 'Approved' }]);
  assert.deepEqual(Array.from(result, item => item.id), ['n-n', 'l-j', 'a-a']);
  assert.match(result[2].text, /0\.03/);
});
