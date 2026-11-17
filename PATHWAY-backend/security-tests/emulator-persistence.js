const fs = require('node:fs');
const path = require('node:path');
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
async function exportFromPinnedHub(destination, fetchImpl = fetch) {
  const origin = 'http://127.0.0.1:4400';
  const status = await fetchImpl(`${origin}/emulators`, { signal: AbortSignal.timeout(15000) });
  if (!status.ok) throw new Error('Local demo emulator hub is unavailable.');
  const services = await status.json();
  const local = service => service && ['127.0.0.1','localhost','::1'].includes(service.host);
  if (!local(services.auth) || services.auth.port !== 9099 || !local(services.firestore) || services.firestore.port !== 8080) {
    throw new Error('Refusing backup: hub does not own the pinned demo services.');
  }
  const result = await fetchImpl(`${origin}/_admin/export`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: destination, initiatedBy: 'pathway-local-demo', targets: ['auth','firestore'] }), signal: AbortSignal.timeout(60000) });
  if (!result.ok) throw new Error('Local demo export failed; prior snapshots retained.');
}
function backup() {
  if (saving) return saving;
  const destination = snapshotPath();
  saving = exportFromPinnedHub(destination).then(() => {
    if (!completeSnapshot(destination)) throw new Error('Local demo export is incomplete; previous snapshots retained.');
    return destination;
  }).finally(() => { saving = null; });
  return saving;
}
function watch() {
  const save = () => backup().then(() => console.log('Local Auth/Firestore snapshot saved.')).catch(error => console.error(error.message));
  save();
  const timer = setInterval(save, 5 * 60 * 1000);
  return () => clearInterval(timer);
}
module.exports = { latestSnapshot, snapshotPath, completeSnapshot, backup, watch, exportFromPinnedHub };
if (require.main === module) {
  if (process.argv.includes('--watch')) watch();
  else backup().catch(error => { console.error(error.message); process.exitCode = 1; });
}
