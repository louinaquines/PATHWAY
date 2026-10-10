const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.resolve(__dirname, '../../PATHWAY-master/services/logbookLoadError.js'), 'utf8').replace('export function', 'function');
const message = vm.runInNewContext(`${source}\nlogbookLoadErrorMessage`);

test('session failure gives sign-in guidance', () => {
  assert.match(message({ code: 'unauthenticated' }), /Sign out and sign in again/);
  assert.match(message({ code: 'auth/user-token-expired' }), /session/);
});
test('permission failure is not mislabeled as a connection problem', () => {
  assert.match(message({ code: 'firestore/permission-denied' }), /account access/);
  assert.doesNotMatch(message({ code: 'permission-denied' }), /USB/);
});
test('connection failure offers retry and USB reconnection guidance', () => {
  assert.match(message({ code: 'unavailable' }), /port connections/);
  assert.match(message({ code: 'deadline-exceeded' }), /database/);
});
test('unknown errors do not expose internal error text', () => {
  assert.doesNotMatch(message({ message: 'private details' }), /private details/);
  assert.match(message(null), /Try again/);
});
