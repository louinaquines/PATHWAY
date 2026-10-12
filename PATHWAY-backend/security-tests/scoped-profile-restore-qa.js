const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
const prefix = 'projects/pathway-57400/databases/(default)/documents/';
function validateExport(data) {
  assert.equal(data.version, 1); assert.equal(data.project, 'pathway-57400'); assert.equal(data.studentId, uid);
  assert.ok(Array.isArray(data.documents) && data.documents.length > 0 && data.documents.length <= 4001);
  const names = new Set();
  for (const document of data.documents) {
    assert.ok(document.name.startsWith(prefix));
    const relative = document.name.slice(prefix.length);
    assert.ok(relative === `users/${uid}` || new RegExp(`^users/${uid}/(attendance|logbook)/[A-Za-z0-9_-]+$`).test(relative));
    assert.ok(!names.has(relative)); names.add(relative);
    assert.ok(document.fields && typeof document.fields === 'object');
  }
  assert.ok(names.has(`users/${uid}`));
  const profile = data.documents.find(x => x.name === prefix + `users/${uid}`);
  assert.equal(profile.fields.email.stringValue, 'dex@gmail.com');
  assert.equal(profile.fields.role.stringValue, 'student');
  return data.documents;
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    if (typeof value.timestampValue === 'string') {
      const match = value.timestampValue.match(/^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/);
      assert.ok(match); return { timestampValue: match[1] + '.' + (match[2] || '').padEnd(9, '0') + 'Z' };
    }
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
async function check(db, snapshot) {
  assert.equal(db.projectId, 'demo-pathway-security');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180');
  const manifest = JSON.parse(fs.readFileSync(path.join(snapshot, 'attachment-recovery.json')));
  const mapping = manifest.attachments.find(item => item.version.endsWith('-scoped-records'));
  assert.ok(mapping && /^attachment-bytes\/[A-Za-z0-9_-]+\.bin$/.test(mapping.name));
  const data = JSON.parse(fs.readFileSync(path.join(snapshot, mapping.name)));
  const documents = validateExport(data);
  const base = 'http://127.0.0.1:8180/v1/projects/demo-pathway-security/databases/(default)/documents';
  // Preserve REST typed values rather than converting through lossy JSON primitives.
  const writes = documents.map(document => ({
    update: { name: 'projects/demo-pathway-security/databases/(default)/documents/' + document.name.slice(prefix.length), fields: document.fields },
    currentDocument: { exists: false },
  }));
  assert.ok(writes.length <= 500, 'Single atomic rehearsal commit limit');
  const response = await fetch(base + ':commit', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ writes }) });
  assert.ok(response.ok, 'Isolated create-only commit failed');
  for (const document of documents) {
    const readback = await fetch(base + '/' + document.name.slice(prefix.length), { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: 'Bearer owner' } });
    assert.ok(readback.ok);
    assert.deepEqual(canonical((await readback.json()).fields), canonical(document.fields));
  }
  // Retry must refuse existing records, not overwrite them.
  const replay = await fetch(base + ':commit', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }, body: JSON.stringify({ writes }) });
  assert.ok(!replay.ok, 'Existing records must not be overwritten');
  console.log(JSON.stringify({ scopedProfileImportedIntoDemoOnly: true, importedRecords: documents.length,
    allTypedFieldsCompared: true, existingRecordOverwriteRefused: true, authAccountCreated: false, productionWrites: 0 }));
}
module.exports = { check, validateExport, canonical };
