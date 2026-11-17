const test = require('node:test'), assert = require('node:assert');
const { compareStudentName: c } = require('../nameMatch');
const p = { firstName: 'Juan Miguel', middleName: 'Reyes', lastName: 'Dela Cruz' };
test('exact and reordered names match', () => {
  assert.equal(c(p, 'Juan Miguel Reyes Dela Cruz').result, 'match');
  assert.equal(c(p, 'DELA CRUZ, JUAN MIGUEL R.').result, 'match');
  assert.equal(c(p, 'Juan Miguel Dela Cruz').result, 'match');
});
test('accents, Ma., suffixes', () => {
  assert.equal(c({ firstName: 'Maria', lastName: 'Peña' }, 'Ma. Pena Jr.').result, 'match');
});
test('one-letter typo is only partial', () => {
  assert.equal(c(p, 'Juan Migel Reyes Dela Cruz').result, 'partial');
});
test('different person and missing name', () => {
  assert.equal(c(p, 'Pedro Santos').result, 'mismatch');
  assert.equal(c(p, 'Juan Miguel Santos').result, 'partial');
  assert.equal(c(p, '').result, 'missing');
});
test('wrong middle initial is partial', () => {
  assert.equal(c(p, 'Juan Miguel S. Dela Cruz').result, 'partial');
});
