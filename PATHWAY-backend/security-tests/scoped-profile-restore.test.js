const test = require('node:test');
const assert = require('node:assert/strict');
const { validateExport, canonical, check } = require('./scoped-profile-restore-qa');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
const profile = { name: `projects/pathway-57400/databases/(default)/documents/users/${uid}`, fields: { email: { stringValue: 'dex@gmail.com' }, role: { stringValue: 'student' } } };
const data = { version: 1, project: 'pathway-57400', studentId: uid, documents: [profile] };
test('only fixed test account paths and unique records are accepted', () => {
  assert.equal(validateExport(data).length, 1);
  for (const invalid of [{ ...data, studentId: 'other' }, { ...data, project: 'other' }, { ...data, documents: [profile, profile] },
    { ...data, documents: [{ ...profile, name: profile.name + '/messages/x' }] }]) assert.throws(() => validateExport(invalid));
});
test('timestamp precision canonicalization preserves nanoseconds', () => {
  assert.deepEqual(canonical({ timestampValue: '2026-10-11T00:00:00Z' }), canonical({ timestampValue: '2026-10-11T00:00:00.000000000Z' }));
  assert.notDeepEqual(canonical({ timestampValue: '2026-10-11T00:00:00.000000001Z' }), canonical({ timestampValue: '2026-10-11T00:00:00Z' }));
});
test('production target refused before reading files or making requests', async () => {
  await assert.rejects(check({ projectId: 'pathway-57400' }, 'unused'));
});
