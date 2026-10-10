// Read-only production retrieval. Saves immutable rollback evidence, never deploys.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const auth = require('firebase-tools/lib/auth');
  const options = { project: 'pathway-57400', nonInteractive: true };
  const account = auth.getGlobalDefaultAccount();
  if (account) auth.setActiveAccount(options, account);
  await require('firebase-tools/lib/requireAuth').requireAuth(options);
  const rules = require('firebase-tools/lib/gcp/rules');
  const releases = await rules.listAllReleases(options.project);
  const release = releases.find(item => item.name === 'projects/pathway-57400/releases/cloud.firestore');
  if (!release) throw new Error('Default Firestore release unavailable.');
  const files = await rules.getRulesetContent(release.rulesetName);
  if (!files?.length) throw new Error('Released rules source missing.');
  const destination = path.resolve(__dirname, '../../output/release', new Date().toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(destination, { recursive: true });
  for (const [index, file] of files.entries()) {
    fs.writeFileSync(path.join(destination, `deployed-${index}.rules`), file.content, { flag: 'wx' });
  }
  fs.writeFileSync(path.join(destination, 'release.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), release,
    files: files.map((file, index) => ({ savedAs: `deployed-${index}.rules`, name: file.name,
      sha256: crypto.createHash('sha256').update(file.content).digest('hex') })),
  }, null, 2), { flag: 'wx' });
  console.log('Captured active Firestore rules and release identity: ' + destination);
  const { Client } = require('firebase-tools/lib/apiv2');
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  const findings = {};
  for (const [name, endpoint] of Object.entries({
    database: '/projects/pathway-57400/databases/(default)',
    backupSchedules: '/projects/pathway-57400/databases/(default)/backupSchedules',
    backups: '/projects/pathway-57400/locations/-/backups',
  })) {
    try {
      const response = await client.get(endpoint);
      findings[name] = response.body;
      console.log(name + ': read succeeded');
    } catch (error) {
      findings[name] = { unavailable: true, status: error.status || error.context?.response?.statusCode || null };
      console.log(name + ': unavailable; not verified');
    }
  }
  fs.writeFileSync(path.join(destination, 'backup-inventory.json'), JSON.stringify(findings, null, 2), { flag: 'wx' });
}
main().catch(error => { console.error('Rules capture failed: ' + (error.code || 'access unavailable')); process.exitCode = 1; });
