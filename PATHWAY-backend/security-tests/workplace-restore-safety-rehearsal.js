// Fresh local export -> encrypted package -> import. No live service or credential access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { packageSnapshot, inspect, restore } = require('../operatorBackup');
const backend = path.resolve(__dirname, '..'), root = path.resolve(backend, '..');
const project = 'demo-pathway-security';
const home = path.join(root, 'output/release', `workplace-restore-safety-${crypto.randomUUID()}`);
fs.mkdirSync(home, { recursive: true });
const privateTemp = path.join(home, 'private-temp'); fs.mkdirSync(privateTemp);
const exported = path.join(home, 'export'), restored = path.join(home, 'restored');
const config = path.join(home, 'firebase.json');
fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(root, 'firestore.rules') }, emulators: {
  auth: { host: '127.0.0.1', port: 9299 }, firestore: { host: '127.0.0.1', port: 8280, websocketPort: 9250 },
  hub: { host: '127.0.0.1', port: 4491 }, logging: { host: '127.0.0.1', port: 4591 }, ui: { enabled: false }, singleProjectMode: true,
} }));
const cli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib/bin/firebase.js');
function phase(mode, flags) {
  const child = spawnSync(process.execPath, [cli, 'emulators:exec', '--config', config, '--project', project, '--only', 'auth,firestore',
    ...flags, `node security-tests/workplace-restore-safety-qa.js ${mode}`], {
    cwd: backend, stdio: 'inherit', windowsHide: true, timeout: 180000,
    env: { ...process.env, TEMP: privateTemp, TMP: privateTemp, XDG_CONFIG_HOME: privateTemp,
      FIREBASE_EMULATORS_PATH: path.join(backend, '.firebase-cache'), FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
      GOOGLE_CLOUD_PROJECT: project, GCLOUD_PROJECT: project, PATHWAY_LOCAL_WORKFLOW: '1' },
  });
  assert.ifError(child.error); assert.equal(child.status, 0, `${mode} must succeed`);
}
try {
  phase('seed', ['--export-on-exit', exported]);
  const metadata = JSON.parse(fs.readFileSync(path.join(exported, 'firebase-export-metadata.json')));
  const accounts = JSON.parse(fs.readFileSync(path.join(exported, metadata.auth.path, 'accounts.json'))).users;
  assert.equal(accounts.length, 1); assert.equal(accounts[0].localId, 'restore-safety-student');
  const attachment = path.join(home, 'synthetic-attachment.txt');
  const attachmentBytes = Buffer.from('INVENTED PRIVATE RESTORE ATTACHMENT ONLY\n');
  fs.writeFileSync(attachment, attachmentBytes, { flag: 'wx' });
  const secret = crypto.randomBytes(32).toString('hex'), archive = path.join(home, 'synthetic-backup.enc');
  const packaged = packageSnapshot(exported, archive, secret, project, [{ source: attachment,
    recordPath: 'workplaceConcernCases/restore-private-case', version: '1', originalAssetId: 'synthetic_private_asset_1234' }]);
  assert.equal(fs.readFileSync(archive, 'utf8').includes('INVENTED PRIVATE'), false);
  assert.equal(restore(archive, restored, secret, { project }).dryRun, true); assert.equal(fs.existsSync(restored), false);
  assert.throws(() => restore(archive, restored, 'wrong-synthetic-key', { project, dryRun: false }));
  assert.equal(fs.existsSync(restored), false);
  restore(archive, restored, secret, { project, dryRun: false });
  for (const file of inspect(archive, secret).files) assert.deepEqual(fs.readFileSync(path.join(restored, file.name)), Buffer.from(file.bytes, 'base64'));
  const mapping = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json'))).attachments;
  assert.equal(mapping.length, 1); assert.equal(mapping[0].recordPath, 'workplaceConcernCases/restore-private-case');
  assert.equal(mapping[0].originalAssetId, 'synthetic_private_asset_1234');
  assert.equal(mapping[0].version, '1');
  assert.deepEqual(fs.readFileSync(path.join(restored, mapping[0].name)), attachmentBytes);
  phase('verify', ['--import', restored]);
  const result = { complete: true, syntheticOnly: true, filesVerified: packaged.files, encryptedAttachmentRestored: true,
    dryRunNoWrites: true, wrongKeyDenied: true, productionWrites: 0, paidCalls: 0, artifactDirectory: home };
  fs.writeFileSync(path.join(home, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result));
} catch { console.error(`Local restore rehearsal failed; evidence retained at ${home}`); process.exitCode = 1; }
