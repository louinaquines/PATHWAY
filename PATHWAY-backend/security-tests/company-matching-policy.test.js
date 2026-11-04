const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = path.join(__dirname, '../companyMatchingPolicy.js');
const policy = fs.existsSync(modulePath) ? require(modulePath) : {};
const settings = () => ({ acceptanceConfirmed: true, eligibleCourses: [' BSIT '], location: ' Manila ', supervisorName: ' Supervisor ', supervisorEmail: 'boss@example.com' });
const company = (id, extra = {}) => ({ id, name: id.toUpperCase(), address: 'Office', active: true, capacity: 2, occupiedSlots: 0, matching: settings(), ...extra });
const student = (id, extra = {}) => ({ id, name: id.toUpperCase(), idNumber: id, role: 'student', accountApproved: true, course: 'BSIT', sectionId: 's1', ...extra });
const batch = (students, companies, extra = {}) => policy.suggestCompanyAssignments({ students, companies, course: 'bsit', ...extra });
const bad = fn => assert.throws(fn, error => error.status === 400);

test('normalizes disabled defaults without inventing confirmation', () => {
  assert.equal(typeof policy.normalizeMatchingSettings, 'function');
  assert.deepEqual(policy.normalizeMatchingSettings({}), { acceptanceConfirmed: false, eligibleCourses: [], location: '', supervisorName: '', supervisorEmail: '', supervisorPosition: '', supervisorPhone: '', internshipRole: '' });
  const result = policy.normalizeMatchingSettings(settings());
  assert.deepEqual(result.eligibleCourses, ['bsit']);
  assert.equal(result.location, 'Manila');
  assert.equal(result.acceptanceConfirmedAt, undefined);
});
test('server actor and injected clock alone stamp explicit confirmation', () => {
  const result = policy.normalizeMatchingSettings(settings(), { actorId: 'staff1', now: 1700000000000 });
  assert.equal(result.acceptanceConfirmedBy, 'staff1');
  assert.equal(result.acceptanceConfirmedAt, 1700000000000);
  assert.equal(policy.normalizeMatchingSettings({}, { actorId: 'staff1', now: 1 }).acceptanceConfirmedAt, undefined);
});
test('rejects unsupported, malformed, oversized, and incomplete settings', () => {
  for (const input of [null, [], new Date(), 'x', { extra: true }, { acceptanceConfirmedAt: 1 }, { acceptanceConfirmedBy: 'fake' }, { acceptanceConfirmed: 'true' }, { location: 1 }, { location: 'x'.repeat(501) }, { eligibleCourses: [1] }, { eligibleCourses: [''] }, { eligibleCourses: Array.from({ length: 31 }, (_, i) => `c${i}`) }]) bad(() => policy.normalizeMatchingSettings(input));
  for (const key of ['eligibleCourses', 'location', 'supervisorName', 'supervisorEmail']) bad(() => policy.normalizeMatchingSettings({ ...settings(), [key]: key === 'eligibleCourses' ? [] : '' }));
  bad(() => policy.normalizeMatchingSettings({ ...settings(), supervisorEmail: 'invalid' }));
  assert.deepEqual(policy.normalizeMatchingSettings({ eligibleCourses: [' BSIT', 'bsit', 'BSA'] }).eligibleCourses, ['bsit', 'bsa']);
});
test('readiness enforces every mandatory company condition and exact course', () => {
  assert.deepEqual(policy.companyReadiness(company('a'), ' bsit '), []);
  for (const override of [{ active: false }, { active: undefined }, { status: 'inactive' }, { capacity: 0 }, { capacity: 1.5 }, { capacity: '2' }, { name: '' }, { address: '' }, { matching: {} }, { matching: { ...settings(), eligibleCourses: ['bsit-special'] } }, { matching: { ...settings(), supervisorEmail: 'bad' } }]) assert.ok(policy.companyReadiness(company('a', override), 'bsit').length);
});
test('reserves preferences before balanced assignment and never mutates input', () => {
  const input = { students: [student('1'), student('2', { placementPreferences: { companyIds: ['a'], location: '' } })], companies: [company('a', { capacity: 1 }), company('b')], course: 'bsit' };
  const before = JSON.stringify(input);
  const result = policy.suggestCompanyAssignments(input);
  assert.deepEqual(result.rows.map(r => [r.studentId, r.companyId]), [['1', 'b'], ['2', 'a']]);
  assert.equal(typeof result.rows[1].preferenceSummary, 'string');
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(policy.suggestCompanyAssignments({ ...input, students: [...input.students].reverse(), companies: [...input.companies].reverse() }), result);
});
test('balances live global occupancy and returns unmatched rows at capacity', () => {
  const result = batch([student('1'), student('2'), student('3')], [company('a', { occupiedSlots: 1 }), company('b', { capacity: 1 })]);
  assert.deepEqual(result.rows.map(r => r.companyId), ['b', 'a', null]);
  assert.ok(result.rows[2].reason);
});
test('skips ineligible students and preserves approved placements requiring manual repair', () => {
  const students = [student('1', { role: 'staff' }), student('2', { accountApproved: false }), student('3', { status: 'inactive' }), student('4', { status: 'rejected' }), student('5', { clearanceStatus: 'cleared' }), student('6', { placementStatus: 'approved', companyId: 'a' }), student('7', { placementStatus: 'approved' })];
  const result = batch(students, [company('a')]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.skipped.length, 7);
  assert.match(result.skipped.find(r => r.studentId === '7').reason, /manual repair/i);
});
test('ranked and location preferences respect eligibility and global capacity', () => {
  assert.equal(batch([student('1', { placementPreferences: { companyIds: ['a', 'b'] } })], [company('a', { occupiedSlots: 2 }), company('b')]).rows[0].companyId, 'b');
  assert.equal(batch([student('1', { placementPreferences: { companyIds: ['a'], location: 'cebu' } })], [company('a', { matching: { ...settings(), eligibleCourses: ['bsa'] } }), company('b', { matching: { ...settings(), location: 'Cebu' } })]).rows[0].companyId, 'b');
});
test('newest nonapproved proposal is fallback only with stable timestamp ties', () => {
  const proposals = [{ id: 'p1', studentId: '1', companyId: 'a', status: 'pending', createdAt: 1 }, { id: 'p2', studentId: '1', companyId: 'b', status: 'rejected', createdAt: 2 }, { id: 'p3', studentId: '1', companyId: 'a', status: 'approved', createdAt: 3 }];
  assert.equal(batch([student('1')], [company('a'), company('b')], { proposals }).rows[0].companyId, 'b');
  assert.equal(batch([student('1', { placementPreferences: { companyIds: ['a'] } })], [company('a'), company('b')], { proposals }).rows[0].companyId, 'a');
});
test('rejects mixed sections/courses and duplicate identities', () => {
  for (const students of [[student('1'), student('2', { sectionId: 's2' })], [student('1', { course: 'bsa' })], [student('1'), student('1')]]) bad(() => batch(students, [company('a')]));
  bad(() => batch([student('1')], [company('a'), company('a')]));
});
test('fingerprints track matching fields, ignore sensitive attributes and occupied counters', () => {
  const s = student('1'); const c = company('a');
  assert.match(policy.studentMatchingFingerprint(s), /^[a-f0-9]{64}$/);
  for (const change of [{ name: 'New' }, { status: 'inactive' }, { companyId: 'a' }, { placementPreferences: { companyIds: ['b'] } }]) assert.notEqual(policy.studentMatchingFingerprint(s), policy.studentMatchingFingerprint({ ...s, ...change }));
  assert.equal(policy.studentMatchingFingerprint(s), policy.studentMatchingFingerprint({ ...s, grade: 99, gender: 'x', disability: true }));
  assert.equal(policy.companyMatchingFingerprint(c), policy.companyMatchingFingerprint({ ...c, occupiedSlots: 99, availableSlots: 0 }));
  for (const change of [{ capacity: 3 }, { address: 'New' }, { matching: { ...settings(), internshipRole: 'Developer' } }, { phone: '123' }]) assert.notEqual(policy.companyMatchingFingerprint(c), policy.companyMatchingFingerprint({ ...c, ...change }));
  assert.equal(policy.companyMatchingFingerprint(c), policy.companyMatchingFingerprint(Object.fromEntries(Object.entries(c).reverse())));
});

test('confirmation accepts edits and omission, while rejecting repeated or out-of-plan choices', () => {
  const plan = { students: { s1: 'hash', s2: 'hash' }, companies: { a: 'hash', b: 'hash' } };
  assert.deepEqual(policy.validateBatchSelection(plan, [{ studentId: 's1', companyId: 'b' }]), [{ studentId: 's1', companyId: 'b' }]);
  for (const selection of [[], [{ studentId: 's3', companyId: 'a' }], [{ studentId: 's1', companyId: 'c' }],
    [{ studentId: 's1', companyId: 'a' }, { studentId: 's1', companyId: 'b' }]]) {
    bad(() => policy.validateBatchSelection(plan, selection));
  }
});
