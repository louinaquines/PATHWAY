const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequireUser } = require('../requestAuthentication');

function fixture({ verifyError, profileError, profile = { role: 'coordinator' } } = {}) {
  const responses = [];
  const logs = [];
  let next = 0;
  const verifyCalls = [];
  const middleware = createRequireUser({
    auth: { verifyIdToken: async (...args) => { verifyCalls.push(args); if (verifyError) throw verifyError; return { uid: 'sample' }; } },
    db: { collection: () => ({ doc: () => ({ get: async () => {
      if (profileError) throw profileError;
      return { exists: true, data: () => profile };
    } }) }) },
    log: (...args) => logs.push(args),
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { responses.push({ status: this.code, body }); return this; } };
  return { run: () => middleware({ headers: { authorization: 'Bearer private-test-token' } }, res, () => { next++; }),
    responses, logs, verifyCalls, get next() { return next; } };
}
test('a Firestore dependency failure is unavailable, never an expired session, and logs only its code', async () => {
  const f = fixture({ profileError: { code: 7, message: 'private details', token: 'secret' } });
  await f.run();
  assert.equal(f.responses[0].status, 503);
  assert.equal(f.responses[0].body.code, 'AUTH_DEPENDENCY_UNAVAILABLE');
  assert.equal(f.next, 0);
  assert.deepEqual(f.logs, [['Authentication dependency unavailable', { stage: 'profile', code: '7' }]]);
});
test('expired and revoked tokens remain denied and revocation checking stays enabled', async () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token', 'auth/user-disabled']) {
    const f = fixture({ verifyError: { code } });
    await f.run();
    assert.equal(f.responses[0].status, 401);
    assert.equal(f.next, 0);
    assert.deepEqual(f.verifyCalls[0], ['private-test-token', true]);
  }
});
test('credential or verification infrastructure failures return unavailable', async () => {
  const f = fixture({ verifyError: { code: 'app/invalid-credential' } });
  await f.run();
  assert.equal(f.responses[0].status, 503);
  assert.equal(f.next, 0);
});
test('valid coordinator passes and student password reset restrictions still apply', async () => {
  const valid = fixture();
  await valid.run();
  assert.equal(valid.next, 1);
  const blocked = fixture({ profile: { role: 'student', passwordChangeRequired: true } });
  await blocked.run();
  assert.equal(blocked.responses[0].status, 403);
  assert.equal(blocked.next, 0);
});
