// Includes one explicitly selected local TEST ONLY fixture, never remote/student files.
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { packageSnapshot, inspect } = require('./operatorBackup');
function packTestDocument(snapshot, destination, secret) {
  const result = packageSnapshot(snapshot, destination, secret, 'demo-pathway-security', [{
    source: path.resolve(__dirname, '../output/pdf/test-only-endorsement.pdf'),
    recordPath: 'requirements/TEST-ONLY-RECOVERY', version: 'synthetic-v1',
  }]);
  const verified = inspect(destination, secret);
  return { ...result, verifiedFiles: verified.files.length, testDocumentIncluded: true, productionAccess: false };
}
module.exports = { packTestDocument };
function scopedAuthAttachment(directory) {
  const selected = path.resolve(directory);
  assert.equal(path.dirname(selected), path.resolve(__dirname, '.env-backup-restore-tests'));
  assert.match(path.basename(selected), /^auth-export-[a-f0-9-]{36}$/);
  assert.ok(!fs.lstatSync(selected).isSymbolicLink());
  const source = path.join(selected, 'auth-scoped.json');
  assert.ok(!fs.lstatSync(source).isSymbolicLink());
  assert.ok(fs.statSync(source).size <= 1024 * 1024);
  const data = JSON.parse(fs.readFileSync(source));
  assert.equal(data.project, 'pathway-57400');
  assert.equal(data.studentId, 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2');
  assert.equal(data.users?.length, 1);
  assert.equal(data.users[0].localId, data.studentId);
  assert.equal(data.users[0].email, 'dex@gmail.com');
  assert.ok(data.users[0].passwordHash && data.users[0].salt && data.hashConfig?.signerKey);
  assert.equal(data.sessionTokensExported, false);
  assert.equal(data.sourceUnchanged, true);
  return { source, recordPath: 'users/' + data.studentId, version: 'scoped-auth-v1-' + path.basename(selected) };
}
module.exports.scopedAuthAttachment = scopedAuthAttachment;
function packAcquiredTestDocument(snapshot, destination, secret, directory, authDirectory) {
  const root = path.resolve(__dirname, '.env-backup-restore-tests');
  const selected = path.resolve(directory);
  assert.equal(path.dirname(selected), root);
  assert.match(path.basename(selected), /^student-document-[a-f0-9-]{36}$/);
  assert.ok(!fs.lstatSync(selected).isSymbolicLink());
  const bindingFile = path.join(selected, 'student-binding.json');
  const binding = JSON.parse(fs.readFileSync(bindingFile));
  assert.equal(binding.project, 'pathway-57400');
  assert.equal(binding.studentId, 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2');
  assert.equal(binding.requirementId, 'endorsement');
  assert.equal(binding.requirement.fileName, 'test-only-fictional-signature.pdf');
  assert.equal(binding.attachment.recordPath, 'users/' + binding.studentId);
  assert.equal(binding.attachment.version, String(binding.requirement.cloudinaryVersion));
  assert.equal(path.dirname(path.resolve(binding.attachment.source)), selected);
  const bytes = fs.readFileSync(binding.attachment.source);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), binding.attachment.sha256);
  assert.equal(bytes.length, binding.attachment.size);
  const attachments = [binding.attachment, {
    source: bindingFile, recordPath: binding.attachment.recordPath,
    version: binding.attachment.version + '-endorsement-binding',
  }];
  const scopedFile = path.join(selected, 'scoped-records.json');
  if (fs.existsSync(scopedFile)) {
    const scoped = JSON.parse(fs.readFileSync(scopedFile));
    assert.equal(scoped.project, 'pathway-57400'); assert.equal(scoped.studentId, binding.studentId);
    assert.ok(Array.isArray(scoped.documents) && scoped.documents.length > 0);
    attachments.push({ source: scopedFile, recordPath: binding.attachment.recordPath, version: binding.attachment.version + '-scoped-records' });
  }
  if (authDirectory) attachments.push(scopedAuthAttachment(authDirectory));
  const packed = packageSnapshot(snapshot, destination, secret, 'demo-pathway-security', attachments);
  inspect(destination, secret);
  return { ...packed, acquiredTestStudentDocumentIncluded: true, scopedLiveRecordsIncluded: fs.existsSync(scopedFile), scopedAuthIncluded: Boolean(authDirectory), productionBackupComplete: false };
}
module.exports.packAcquiredTestDocument = packAcquiredTestDocument;
if (require.main === module) {
  try {
    console.log(JSON.stringify(process.argv[4]
      ? packAcquiredTestDocument(process.argv[2], process.argv[3], process.env.PATHWAY_BACKUP_SECRET, process.argv[4], process.argv[5])
      : packTestDocument(process.argv[2], process.argv[3], process.env.PATHWAY_BACKUP_SECRET)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
