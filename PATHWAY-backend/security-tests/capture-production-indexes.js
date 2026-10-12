// Read-only index inventory; never creates, updates or deletes indexes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const project = 'pathway-57400';
  const auth = require('firebase-tools/lib/auth');
  const options = { project, nonInteractive: true };
  const account = auth.getGlobalDefaultAccount();
  if (account) auth.setActiveAccount(options, account);
  await require('firebase-tools/lib/requireAuth').requireAuth(options);
  const { Client } = require('firebase-tools/lib/apiv2');
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  async function list(suffix, property) {
    const records = [];
    let pageToken;
    do {
      const response = await client.get(`/projects/${project}/databases/(default)/collectionGroups/-/${suffix}`, {
        queryParams: { ...(suffix === 'fields' ? { filter: 'indexConfig.usesAncestorConfig=false OR ttlConfig:*' } : {}), ...(pageToken ? { pageToken } : {}) },
      }).catch(error => { console.error('Inventory endpoint: ' + suffix + '; ' + error.message); throw error; });
      records.push(...(response.body[property] || []));
      pageToken = response.body.nextPageToken;
    } while (pageToken);
    return records;
  }
  const indexes = await list('indexes', 'indexes');
  const fieldOverrides = await list('fields', 'fields');
  const specBytes = fs.readFileSync(path.resolve(__dirname, '../../firestore.indexes.json'));
  const spec = JSON.parse(specBytes);
  const signature = item => JSON.stringify({
    collectionGroup: item.collectionGroup || item.name.split('/collectionGroups/')[1].split('/')[0],
    queryScope: item.queryScope,
    fields: item.fields.filter(field => field.fieldPath !== '__name__'),
  });
  const checks = spec.indexes.map(item => {
    const matches = indexes.filter(remote => signature(remote) === signature(item));
    return { ...item, deployedStates: matches.map(remote => remote.state), ready: matches.some(remote => remote.state === 'READY') };
  });
  const destination = path.resolve(__dirname, '../../output/release', `indexes-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, 'index-inventory.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), project, productionWrites: 0,
    localSpecSha256: crypto.createHash('sha256').update(specBytes).digest('hex'), indexes, fieldOverrides, checks,
  }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ destination, deployedIndexes: indexes.length, fieldOverrides: fieldOverrides.length,
    configuredIndexes: checks.length, configuredReady: checks.filter(item => item.ready).length, productionWrites: 0 }));
}
main().catch(error => { console.error('Read-only index inventory failed: ' + (error.code || error.status || 'access unavailable')); process.exitCode = 1; });
