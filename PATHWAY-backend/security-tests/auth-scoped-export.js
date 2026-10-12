// Uses existing privileged CLI identity; exports exactly one authorized test UID.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
let stage = 'authenticate';
async function main() {
  assert.ok(process.argv.includes('--approved-project-read'));
  const account = require('firebase-tools/lib/auth').getGlobalDefaultAccount();
  assert.ok(account);
  await require('firebase-tools/lib/requireAuth').requireAuth({ project: 'pathway-57400', user: account.user, tokens: account.tokens, nonInteractive: true }, true);
  const token = await require('firebase-tools/lib/apiv2').getAccessToken();
  async function request(endpoint, body) {
    const response = await fetch('https://identitytoolkit.googleapis.com/' + endpoint, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error('HTTP_' + response.status);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) { bytes += chunk.length; assert.ok(bytes <= 1024 * 1024); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks));
  }
  async function readUser() {
    stage = 'download-and-filter-authorized-account';
    let pageToken; let user; const seen = new Set();
    for (let page = 0; page < 100; page++) {
      const result = await request('v1/projects/pathway-57400/accounts:batchGet?maxResults=100&' + (pageToken ? 'nextPageToken=' + encodeURIComponent(pageToken) : ''));
      for (const candidate of result.users || []) {
        if (candidate.localId === uid) { assert.ok(!user); user = candidate; }
      }
      // Other account records are never persisted or logged.
      pageToken = result.nextPageToken;
      if (!pageToken) break;
      assert.ok(!seen.has(pageToken)); seen.add(pageToken);
      assert.ok(page < 99);
    }
    assert.ok(user); assert.equal(user.localId, uid); assert.equal(user.email, 'dex@gmail.com');
    stage = 'validate-password-hash';
    assert.ok(typeof user.passwordHash === 'string' && user.passwordHash.length > 20 && user.passwordHash !== 'UkVEQUNURUQ=');
    stage = 'validate-salt';
    assert.ok(typeof user.salt === 'string' && user.salt.length > 0);
    // Exclude sessions/tokens and other unneeded response fields.
    const keys = ['localId','email','emailVerified','passwordHash','salt','displayName','photoUrl','createdAt','disabled','customAttributes','providerUserInfo','mfaInfo','passwordUpdatedAt','validSince'];
    return Object.fromEntries(keys.filter(key => user[key] !== undefined).map(key => [key,user[key]]));
  }
  const user = await readUser();
  stage = 'read-hash-configuration';
  const config = await request('admin/v2/projects/pathway-57400/config');
  const hashConfig = config.signIn?.hashConfig;
  assert.ok(hashConfig && typeof hashConfig === 'object');
  assert.ok(hashConfig.algorithm && hashConfig.signerKey);
  assert.deepEqual(await readUser(), user);
  assert.deepEqual((await request('admin/v2/projects/pathway-57400/config')).signIn?.hashConfig, hashConfig);
  const root = path.resolve(__dirname, '../.env-backup-restore-tests');
  assert.ok(fs.statSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink());
  const destination = path.join(root, 'auth-export-' + crypto.randomUUID());
  fs.mkdirSync(destination, { mode: 0o700 });
  fs.writeFileSync(path.join(destination, 'auth-scoped.json'), JSON.stringify({ version:1, project:'pathway-57400', studentId:uid,
    exportedAt:new Date().toISOString(), users:[user], hashConfig, sourceUnchanged:true,
    testAccountOnly:true, sessionTokensExported:false }), { flag:'wx', mode:0o600 });
  console.log(JSON.stringify({ scopedAuthAccountsExported:1, passwordHashPresent:true, saltPresent:true,
    hashConfigPresent:true, twoReadsMatched:true, accountsChanged:0, encrypted:false,
    protectedStaging:destination, productionRestoreVerified:false }));
}
main().catch(error => { console.error(JSON.stringify({exportCompleted:false,stage,httpStatus:/^HTTP_\d{3}$/.test(error.message)?Number(error.message.slice(5)):undefined,accountsChanged:0,secretsLogged:false})); process.exitCode=1; });
