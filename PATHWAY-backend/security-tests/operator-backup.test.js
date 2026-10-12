const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packageSnapshot, inspect, restore } = require('../operatorBackup');
const secret = 'synthetic-test-secret-not-production';
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-backup-test-'));
  const source = path.join(root, 'source'); fs.mkdirSync(source);
  fs.mkdirSync(path.join(source, 'auth')); fs.mkdirSync(path.join(source, 'firestore'));
  fs.writeFileSync(path.join(source, 'firebase-export-metadata.json'), JSON.stringify({ auth: { path: 'auth' }, firestore: { metadata_file: 'firestore/metadata' } }));
  fs.writeFileSync(path.join(source, 'auth/accounts.json'), JSON.stringify({ users: [{ localId: 'TEST-ONLY' }] }));
  fs.writeFileSync(path.join(source, 'firestore/metadata'), 'TEST ONLY snapshot fixture');
  return { root, source, backup: path.join(root, 'backup.enc'), target: path.join(root, 'restored') };
}
test('encrypted round trip verifies every file and dry run writes nothing', () => {
  const f = fixture();
  const result = packageSnapshot(f.source, f.backup, secret);
  assert.equal(result.files, 3);
  assert.ok(!fs.readFileSync(f.backup, 'utf8').includes('TEST-ONLY'));
  assert.equal(inspect(f.backup, secret).files.length, 3);
  assert.equal(restore(f.backup, f.target, secret, { project: 'demo-pathway-security' }).dryRun, true);
  assert.equal(fs.existsSync(f.target), false);
  assert.equal(restore(f.backup, f.target, secret, { project: 'demo-pathway-security', dryRun: false }).restored, true);
  assert.deepEqual(fs.readFileSync(path.join(f.target, 'auth/accounts.json')), fs.readFileSync(path.join(f.source, 'auth/accounts.json')));
});
test('wrong key and corruption fail before destination creation', () => {
  const f = fixture(); packageSnapshot(f.source, f.backup, secret);
  assert.throws(() => inspect(f.backup, 'wrong-secret-for-this-backup'));
  const envelope = JSON.parse(fs.readFileSync(f.backup)); envelope.tag = '0'.repeat(32);
  fs.writeFileSync(f.backup, JSON.stringify(envelope));
  assert.throws(() => restore(f.backup, f.target, secret, { project: 'demo-pathway-security', dryRun: false }));
  assert.equal(fs.existsSync(f.target), false);
});
test('production targets, overwrites and incomplete snapshots are refused', () => {
  const f = fixture(); packageSnapshot(f.source, f.backup, secret);
  assert.throws(() => restore(f.backup, f.target, secret, { project: 'pathway-57400', dryRun: false }));
  assert.throws(() => restore(f.backup, f.source, secret, { project: 'demo-pathway-security' }));
  assert.throws(() => packageSnapshot(f.source, f.backup, secret));
  fs.unlinkSync(path.join(f.source, 'firestore/metadata'));
  assert.throws(() => packageSnapshot(f.source, path.join(f.root, 'incomplete.enc'), secret));
});
test('partial write failures report progress and preserve isolated target', () => {
  const f = fixture(); packageSnapshot(f.source, f.backup, secret);
  const original = fs.writeFileSync; let writes = 0;
  fs.writeFileSync = (...args) => { if (++writes === 2) throw new Error('SIMULATED_DISK_FAILURE'); return original(...args); };
  try { assert.throws(() => restore(f.backup, f.target, secret, { project: 'demo-pathway-security', dryRun: false }), /Partial restore: 1\/3/); }
  finally { fs.writeFileSync = original; }
  assert.equal(fs.existsSync(f.target), true);
  assert.throws(() => restore(f.backup, f.target, secret, { project: 'demo-pathway-security', dryRun: false }));
});

test('attachment bytes and exact document/version mappings survive encrypted recovery', () => {
  const f = fixture();
  const source = path.resolve(__dirname, '../../output/pdf/test-only-endorsement.pdf');
  const bytes = fs.readFileSync(source);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  packageSnapshot(f.source, f.backup, secret, 'demo-pathway-security', [{ source, recordPath: 'requirements/TEST-ONLY', version: 'synthetic-v1' }]);
  restore(f.backup, f.target, secret, { project: 'demo-pathway-security', dryRun: false });
  const manifest = JSON.parse(fs.readFileSync(path.join(f.target, 'attachment-recovery.json')));
  assert.equal(manifest.attachments[0].recordPath, 'requirements/TEST-ONLY');
  assert.equal(manifest.attachments[0].version, 'synthetic-v1');
  assert.deepEqual(fs.readFileSync(path.join(f.target, manifest.attachments[0].name)), bytes);
  assert.ok(!fs.readFileSync(f.backup, 'utf8').includes('synthetic-v1'));
});

test('attachment missing bytes, ambiguous versions and unsafe record paths fail before packaging', () => {
  const f = fixture();
  const source = path.join(f.source, 'auth/accounts.json');
  const item = { source, recordPath: 'requirements/TEST-ONLY', version: 'v1' };
  for (const attachments of [[{ ...item, source: path.join(f.root, 'missing') }], [item, item], [{ ...item, recordPath: '../escape' }], [{ ...item, recordPath: 'requirements' }], [{ ...item, version: '' }]]) {
    assert.throws(() => packageSnapshot(f.source, f.backup, secret, 'demo-pathway-security', attachments));
    assert.equal(fs.existsSync(f.backup), false);
  }
});
