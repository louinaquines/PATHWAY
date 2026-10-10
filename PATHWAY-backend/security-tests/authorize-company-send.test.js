const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyAuthorization, validScopes, MAILBOX } = require('./authorize-company-send');
const scope = 'openid email https://www.googleapis.com/auth/gmail.send';
test('accepts only send permission plus verified mailbox identity', () => {
  assert.doesNotThrow(() => verifyAuthorization({ scope, refresh_token: 'fixture' }, { email: MAILBOX, email_verified: true }));
  assert.equal(validScopes(scope.replace('email', 'https://www.googleapis.com/auth/userinfo.email')), true);
});
test('rejects read permission, missing identity, and wrong mailbox', () => {
  assert.equal(validScopes(`${scope} https://www.googleapis.com/auth/gmail.readonly`), false);
  assert.equal(validScopes('https://www.googleapis.com/auth/gmail.send'), false);
  assert.throws(() => verifyAuthorization({ scope, refresh_token: 'fixture' }, { email: 'wrong@example.com', email_verified: true }));
  assert.throws(() => verifyAuthorization({ scope, refresh_token: 'fixture' }, { email: MAILBOX, email_verified: false }));
  assert.throws(() => verifyAuthorization({ scope }, { email: MAILBOX, email_verified: true }));
});
