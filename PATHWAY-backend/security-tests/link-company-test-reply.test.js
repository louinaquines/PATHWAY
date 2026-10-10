const { test } = require('node:test');
const assert = require('node:assert/strict');
const { verifyMapping } = require('./link-company-test-reply');
const owner = { uid: 'staff', email: 'loui@test.com', role: 'coordinator', department: 'CCS' };
const section = { id: 'section', name: 'BSIT - 4G', coordinatorId: 'staff', department: 'CCS' };
const student = { firstName: 'dexter', lastName: 'tampus', role: 'student', sectionId: 'section', department: 'CCS' };
test('fixed coordinator, student and normalized section pass', () => {
  assert.doesNotThrow(() => verifyMapping(owner, section, student));
});
test('wrong owner, role, department, section or student fail closed', () => {
  for (const args of [[{ ...owner, email: 'other@example.com' }, section, student],
    [{ ...owner, role: 'admin' }, section, student], [owner, { ...section, coordinatorId: 'other' }, student],
    [owner, { ...section, name: 'BSIT 4A' }, student], [owner, section, { ...student, sectionId: 'other' }],
    [owner, section, { ...student, department: 'other' }], [owner, section, { ...student, firstName: 'other' }]]) {
    assert.throws(() => verifyMapping(...args));
  }
});
