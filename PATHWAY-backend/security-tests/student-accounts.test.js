const { test } = require('node:test');
const assert = require('node:assert/strict');
const { accountIdentity, validReplacement } = require('../studentAccounts');

test('student identifiers map deterministically without a real email inbox', () => {
  assert.deepEqual(accountIdentity('24228132'), { username: 'uclm-24228132', email: 'uclm-24228132@students.pathway.invalid', uid: 'roster-24228132' });
  assert.equal(accountIdentity('21-ABC123').username, 'uclm-21-abc123');
  for (const id of ['', '123', 'hello/world', 'name@example.com', null]) assert.throws(() => accountIdentity(id));
});
test('replacement password must differ and cannot restore the predictable default', () => {
  assert.equal(validReplacement('MyPersonalPassword123!', '24228132', 'UC@24228132'), true);
  for (const password of ['UC@24228132', 'MyCurrentPass123!', 'lettersOnlyLongPassword', '123456789012345', 'short1', 'a1'.repeat(65)]) {
    assert.equal(validReplacement(password, '24228132', 'MyCurrentPass123!'), false);
  }
});
