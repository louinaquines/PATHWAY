const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { authorizationUrl, SCOPE } = require('./authorize-gmail');
test('authorization requests only send permission, offline access, state and S256 PKCE', () => {
  const verifier = 'v'.repeat(64);
  const url = new URL(authorizationUrl('qa.apps.googleusercontent.com', 'http://127.0.0.1:12345/', 'qa-state', verifier));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), SCOPE);
  assert.equal(url.searchParams.get('state'), 'qa-state');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.equal(url.searchParams.has('client_secret'), false);
});
