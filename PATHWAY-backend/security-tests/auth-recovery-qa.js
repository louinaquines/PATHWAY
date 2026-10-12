const assert = require('node:assert/strict');
async function check(auth, accounts) {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
  assert.equal(auth.app.options.projectId, 'demo-pathway-security');
  const selected = accounts.find(item => item.email === 'student.approved@pathway.test');
  assert.ok(selected, 'Expected imported synthetic account');
  for (const original of accounts) {
    const recovered = await auth.getUser(original.localId);
    assert.equal(recovered.email, original.email);
    assert.equal(recovered.disabled, !!original.disabled);
    assert.equal(recovered.emailVerified, !!original.emailVerified);
    if (original.displayName !== undefined) assert.equal(recovered.displayName, original.displayName);
    if (original.customAttributes) assert.deepEqual(recovered.customClaims, JSON.parse(original.customAttributes));
  }
  const endpoint = 'http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only';
  async function login(password) {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: selected.email, password, returnSecureToken: true }) });
    const result = await response.json();
    return { ok: response.ok, result };
  }
  // Existing seed fixture password only. No reset/update/create operation.
  const successful = await login('PathwayLocal!2026');
  assert.ok(successful.ok, 'Restored fixture password must still work');
  assert.equal(successful.result.localId, selected.localId);
  assert.equal(successful.result.email, selected.email);
  assert.ok(successful.result.idToken && successful.result.refreshToken);
  const denied = await login('INTENTIONALLY-WRONG-RECOVERY-TEST');
  assert.ok(!denied.ok && denied.result.error, 'Incorrect password must be denied');
  console.log(JSON.stringify({ emulatorAuthMetadataMatched: accounts.length, restoredFixturePasswordWorks: true,
    signInUidMatchesRestoredProfile: true, incorrectPasswordDenied: true,
    passwordsReset: 0, liveAccountsChanged: 0, productionPasswordHashRecoveryVerified: false }));
}
module.exports = { check };
