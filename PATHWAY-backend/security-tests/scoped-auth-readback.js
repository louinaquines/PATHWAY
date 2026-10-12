// Local-only acceptance: never imports Auth or prints sensitive values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { validateExport } = require('./scoped-profile-restore-qa');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
function validateAuth(data) {
  assert.equal(data.version, 1);
  assert.equal(data.project, 'pathway-57400');
  assert.equal(data.studentId, uid);
  assert.equal(data.users?.length, 1);
  assert.equal(data.users[0].localId, uid);
  assert.equal(data.users[0].email, 'dex@gmail.com');
  assert.equal(data.sourceUnchanged, true);
  assert.equal(data.sessionTokensExported, false);
  const user = data.users[0];
  assert.ok(typeof user.passwordHash === 'string' && user.passwordHash.length > 20 && user.passwordHash !== 'UkVEQUNURUQ=');
  assert.ok(typeof user.salt === 'string' && user.salt.length > 0);
  assert.equal(data.hashConfig?.algorithm, 'SCRYPT');
  assert.ok(typeof data.hashConfig.signerKey === 'string' && data.hashConfig.signerKey.length > 0);
  assert.ok(Number.isInteger(data.hashConfig.rounds) && Number.isInteger(data.hashConfig.memoryCost));
  assert.ok(typeof data.hashConfig.saltSeparator === 'string');
}
function check(restored, source) {
  const root = path.resolve(__dirname, '../.env-backup-restore-tests');
  for (const directory of [restored, source]) {
    assert.equal(path.dirname(path.resolve(directory)), root);
    assert.ok(!fs.lstatSync(directory).isSymbolicLink());
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json')));
  function readMapping(predicate) {
    const matches = manifest.attachments.filter(predicate);
    assert.equal(matches.length, 1);
    const mapping = matches[0];
    assert.equal(mapping.recordPath, 'users/' + uid);
    assert.match(mapping.name, /^attachment-bytes\/[A-Za-z0-9_-]+\.bin$/);
    const file = path.join(restored, mapping.name);
    assert.ok(!fs.lstatSync(path.dirname(file)).isSymbolicLink() && !fs.lstatSync(file).isSymbolicLink());
    const bytes = fs.readFileSync(file);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), mapping.sha256);
    return bytes;
  }
  const auth = readMapping(item => item.version.startsWith('scoped-auth-v1-'));
  assert.deepEqual(auth, fs.readFileSync(path.join(source, 'auth-scoped.json')));
  validateAuth(JSON.parse(auth));
  validateExport(JSON.parse(readMapping(item => item.version.endsWith('-scoped-records'))));
  return { exactAuthBytesMatched: true, scopedAccountCount: 1, hashConfigurationValidated: true,
    profileAccountBindingMatched: true, productionWrites: 0, productionAuthRestoreVerified: false };
}
module.exports = { check, validateAuth };
if (require.main === module) {
  try { console.log(JSON.stringify(check(process.argv[2], process.argv[3]))); }
  catch { console.error('Local Auth recovery validation failed. No sensitive values logged; no accounts changed.'); process.exitCode = 1; }
}
