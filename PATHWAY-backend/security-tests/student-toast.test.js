const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../../PATHWAY-master/services/studentToastTracker.js'), 'utf8');
const scope = {};
vm.runInNewContext(source.replace('export function', 'function') + ';this.create = createStudentToastTracker;', scope);
const notice = (id, data = {}, type = 'added') => ({ type, doc: { id, metadata: {}, data: () => ({ recipientId: 'student', title: 'Coordinator update', read: false, ...data }) } });
const snapshot = (changes, fromCache = false) => ({ metadata: { fromCache }, docChanges: () => changes });

test('initial server history and cached updates do not produce toast notifications', () => {
  const track = scope.create('student');
  assert.equal(track(snapshot([notice('cache')], true)).length, 0);
  assert.equal(track(snapshot([notice('old')])).length, 0);
  assert.equal(track(snapshot([notice('new')])).length, 1);
});
test('approval and message updates deduplicate and ignore read, outgoing and modified events', () => {
  const track = scope.create('student'); track(snapshot([]));
  assert.equal(track(snapshot([notice('approve'), notice('message', { type: 'message' })])).length, 2);
  assert.equal(track(snapshot([notice('approve'), notice('message')])).length, 0);
  assert.equal(track(snapshot([notice('read', { read: true }), notice('out', { recipientId: 'other' }), notice('self', { senderId: 'student' }), notice('edit', {}, 'modified'), notice('gone', {}, 'removed')])).length, 0);
});
test('pending local writes and a fresh account session cannot replay another session', () => {
  const track = scope.create('student'); track(snapshot([]));
  const pending = notice('pending'); pending.doc.metadata.hasPendingWrites = true;
  assert.equal(track(snapshot([pending])).length, 0);
  const other = scope.create('other'); other(snapshot([]));
  assert.equal(other(snapshot([notice('private')])).length, 0);
});
