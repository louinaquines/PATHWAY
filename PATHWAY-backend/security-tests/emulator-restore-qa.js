// Restore rehearsal uses separate ports; the running phone demo is untouched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { latestSnapshot } = require('./emulator-persistence');
async function main() {
  let snapshot = process.env.PATHWAY_QA_RESTORE_SNAPSHOT || latestSnapshot();
  assert.ok(snapshot, 'A saved snapshot is required');
  if (process.argv.includes('--check')) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9199';
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8180';
    const { initializeApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    const { getFirestore } = require('firebase-admin/firestore');
    initializeApp({ projectId: 'demo-pathway-security' });
    const accounts = JSON.parse(fs.readFileSync(path.join(snapshot, 'auth_export/accounts.json'), 'utf8')).users;
    for (const account of accounts) assert.equal((await getAuth().getUser(account.localId)).uid, account.localId);
    if (process.env.PATHWAY_QA_AUTH_SIGNIN === '1') await require('./auth-recovery-qa').check(getAuth(), accounts);
    const account = accounts.find(item => item.email === 'student.approved@pathway.test');
    assert.ok(account);
    const db = getFirestore();
    const student = (await db.doc('users/' + account.localId).get()).data();
    assert.equal(student.preDeploymentStatus, 'approved');
    const company = (await db.doc('companies/' + student.companyId).get()).data();
    assert.ok(company);
    const attendance = await db.collection('users').doc(account.localId).collection('attendance').get();
    console.log(`Restore verified: ${accounts.length} Auth accounts, approved student profile, company/geofence, ${attendance.size} attendance records.`);
    if (process.env.PATHWAY_QA_LINK_RESTORE === '1') await require('./attachment-link-restore-qa').check(db);
    if (process.env.PATHWAY_QA_SCOPED_PROFILE === '1') await require('./scoped-profile-restore-qa').check(db, snapshot);
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-restore-qa-'));
  if (process.argv.includes('--encrypted')) {
    const { packageSnapshot, restore } = require('../operatorBackup');
    const secret = require('node:crypto').randomBytes(32).toString('hex');
    const encrypted = path.join(directory, 'snapshot.enc');
    const restored = path.join(directory, 'restored');
    const attachmentSource = path.resolve(__dirname, '../../output/pdf/test-only-endorsement.pdf');
    const packed = packageSnapshot(snapshot, encrypted, secret, 'demo-pathway-security', process.argv.includes('--attachments') ? [{ source: attachmentSource, recordPath: 'requirements/TEST-ONLY-RECOVERY', version: 'synthetic-v1' }] : []);
    restore(encrypted, restored, secret, { project: 'demo-pathway-security' });
    restore(encrypted, restored, secret, { project: 'demo-pathway-security', dryRun: false });
    if (process.argv.includes('--attachments')) {
      const manifest = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json')));
      assert.equal(manifest.attachments[0].recordPath, 'requirements/TEST-ONLY-RECOVERY');
      assert.equal(manifest.attachments[0].version, 'synthetic-v1');
      assert.deepEqual(fs.readFileSync(path.join(restored, manifest.attachments[0].name)), fs.readFileSync(attachmentSource));
      console.log('TEST ONLY PDF bytes and document/version mapping restored exactly; no provider upload or link change.');
    }
    console.log(`Encrypted snapshot round trip verified: ${packed.files} files.`);
    snapshot = restored;
  }
  const config = { firestore: { rules: path.resolve(__dirname, '../../firestore.rules') }, emulators: {
    auth: { host: '127.0.0.1', port: 9199 }, firestore: { host: '127.0.0.1', port: 8180 },
    hub: { host: '127.0.0.1', port: 4490 }, logging: { host: '127.0.0.1', port: 4590 }, ui: { enabled: false },
  } };
  const configFile = path.join(directory, 'firebase.json');
  fs.writeFileSync(configFile, JSON.stringify(config));
  const cli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib/bin/firebase.js');
  const result = spawnSync(process.execPath, [cli, 'emulators:exec', '--config', configFile,
    '--project', 'demo-pathway-security', '--only', 'auth,firestore', '--import', snapshot,
    'node security-tests/emulator-restore-qa.js --check'], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: 'inherit',
    env: { ...process.env, PATHWAY_QA_AUTH_SIGNIN: process.argv.includes('--auth-signin') ? '1' : '0', PATHWAY_QA_SCOPED_PROFILE: process.argv.includes('--scoped-profile') ? '1' : '0', PATHWAY_QA_LINK_RESTORE: process.argv.includes('--links') ? '1' : '0', PATHWAY_QA_RESTORE_SNAPSHOT: snapshot, FIREBASE_EMULATORS_PATH: path.resolve(__dirname, '../.firebase-cache'), FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' },
  });
  process.exitCode = result.status ?? 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
