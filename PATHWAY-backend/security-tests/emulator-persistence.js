const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const backendDir = path.resolve(__dirname, '..');
const dataDir = path.join(backendDir, '.emulator-data');
const project = 'demo-pathway-security';

function snapshotPath() {
  return path.join(dataDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
}
function completeSnapshot(directory) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'firebase-export-metadata.json'), 'utf8'));
    return !!(manifest.auth && manifest.firestore
      && Array.isArray(JSON.parse(fs.readFileSync(path.join(directory, manifest.auth.path, 'accounts.json'), 'utf8')).users)
      && fs.existsSync(path.join(directory, manifest.firestore.metadata_file)));
  } catch (_) { return false; }
}
function latestSnapshot() {
  if (!fs.existsSync(dataDir)) return null;
  const names = fs.readdirSync(dataDir).sort().reverse();
  for (const name of names) {
    const directory = path.join(dataDir, name);
    try {
      if (completeSnapshot(directory)) return directory;
    } catch (_) { /* An incomplete export must not replace a usable snapshot. */ }
  }
  if (names.length) throw new Error('Saved emulator data exists but no complete snapshot was found. Refusing to start an empty database.');
  return null;
}
let saving = null;
function backup() {
  if (saving) return saving;
  const destination = snapshotPath();
  const cli = path.join(path.dirname(require.resolve('firebase-tools/package.json')), 'lib/bin/firebase.js');
  saving = new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'emulators:export', destination,
      '--config', '../firebase.json', '--project', project, '--only', 'auth,firestore', '--non-interactive'], {
      cwd: backendDir, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GOOGLE_CLOUD_PROJECT: project, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true' },
    });
    let exportCompleted = false;
    let output = '';
    child.stdout.on('data', data => { process.stdout.write(data); output = (output + data).slice(-4096); exportCompleted ||= output.includes('Export complete'); });
    child.stderr.on('data', data => process.stderr.write(data));
    child.once('error', reject);
    child.once('close', code => {
      if ((code === 0 || exportCompleted) && completeSnapshot(destination)) {
        if (code !== 0) console.warn('Firebase CLI exited abnormally after export; snapshot files verified.');
        resolve(destination);
      } else reject(new Error(`Emulator backup failed (${code}); previous snapshots retained.`));
    });
  }).finally(() => { saving = null; });
  return saving;
}
function watch() {
  const save = () => backup().then(() => console.log('Local Auth/Firestore snapshot saved.')).catch(error => console.error(error.message));
  save();
  const timer = setInterval(save, 5 * 60 * 1000);
  return () => clearInterval(timer);
}
module.exports = { latestSnapshot, snapshotPath, completeSnapshot, backup, watch };
if (require.main === module) {
  if (process.argv.includes('--watch')) watch();
  else backup().catch(error => { console.error(error.message); process.exitCode = 1; });
}
