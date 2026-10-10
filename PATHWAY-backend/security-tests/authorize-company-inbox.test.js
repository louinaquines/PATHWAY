const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorizationUrl } = require('./authorize-gmail');
const { verifyAuthorization, MAILBOX } = require('./authorize-company-inbox');
const { READ_SCOPE } = require('../companyMailInbox');
test('inbox OAuth requests only read scope and the authorized mailbox', () => {
  const url = new URL(authorizationUrl('qa.apps.googleusercontent.com', 'http://127.0.0.1:1234/', 'state', 'v'.repeat(64), { scope: READ_SCOPE, mailbox: MAILBOX }));
  assert.equal(url.searchParams.get('scope'), READ_SCOPE);
  assert.equal(url.searchParams.get('login_hint'), 'pathwaysystem4@gmail.com');
  assert.equal(url.searchParams.get('include_granted_scopes'), 'false');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});
test('wrong mailbox, excessive scopes and missing refresh token fail closed', () => {
  const tokens = { scope: READ_SCOPE, refresh_token: 'synthetic' };
  assert.doesNotThrow(() => verifyAuthorization(tokens, { emailAddress: MAILBOX }));
  assert.throws(() => verifyAuthorization(tokens, { emailAddress: 'other@example.com' }));
  assert.throws(() => verifyAuthorization({ ...tokens, scope: `${READ_SCOPE} https://www.googleapis.com/auth/gmail.send` }, { emailAddress: MAILBOX }));
  assert.throws(() => verifyAuthorization({ scope: READ_SCOPE }, { emailAddress: MAILBOX }));
});
