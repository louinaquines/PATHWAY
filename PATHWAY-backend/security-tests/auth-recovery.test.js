const test = require('node:test');
const assert = require('node:assert/strict');
const { check } = require('./auth-recovery-qa');
test('non-emulator Auth host refused before account access', async () => {
  const previous = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'example.com:9199';
  try { await assert.rejects(check({}, [])); }
  finally { if (previous === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST; else process.env.FIREBASE_AUTH_EMULATOR_HOST = previous; }
});
test('production Auth project refused before account access', async () => {
  const previous = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
  try { await assert.rejects(check({ app: { options: { projectId: 'pathway-57400' } } }, [])); }
  finally { if (previous === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST; else process.env.FIREBASE_AUTH_EMULATOR_HOST = previous; }
});
