const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { acquire, reconciliationPlan } = require('../attachmentRecovery');
const { packageSnapshot, restore } = require('../operatorBackup');
const record = { recordPath: 'requirements/TEST-ONLY', cloudName: 'synthetic', publicId: 'test/file.pdf', version: '1', assetId: 'synthetic_asset_1234', resourceType: 'raw', deliveryType: 'authenticated' };
const pdf = fs.readFileSync(path.resolve(__dirname, '../../output/pdf/test-only-endorsement.pdf'));
const metadata = { public_id: record.publicId, version: 1, asset_id: record.assetId, resource_type: 'raw', type: 'authenticated', bytes: pdf.length, secure_url: 'https://res.cloudinary.com/synthetic/raw/authenticated/test/file.pdf' };
function directory() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-acquisition-test-')), 'acquired'); }
function adapters(overrides = {}) { return { readRecord: async () => record, readMetadata: async () => metadata, downloadBytes: async () => pdf, ...overrides }; }
test('loopback HTTP acquisition, encrypted restore and dry-run reconciliation preserve exact bytes', async () => {
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'application/pdf'); response.end(pdf); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const target = directory();
    const attachments = await acquire([record], target, adapters({ downloadBytes: async (_record, { maxBytes }) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/test-only.pdf`, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > maxBytes) throw new Error('Limit'); chunks.push(chunk); }
      return Buffer.concat(chunks);
    } }));
    assert.deepEqual(fs.readFileSync(attachments[0].source), pdf);
    const root = path.dirname(target), snapshot = path.join(root, 'snapshot'); fs.mkdirSync(snapshot);
    fs.mkdirSync(path.join(snapshot, 'auth')); fs.mkdirSync(path.join(snapshot, 'firestore'));
    fs.writeFileSync(path.join(snapshot, 'firebase-export-metadata.json'), JSON.stringify({ auth: { path: 'auth' }, firestore: { metadata_file: 'firestore/metadata' } }));
    fs.writeFileSync(path.join(snapshot, 'auth/accounts.json'), JSON.stringify({ users: [] }));
    fs.writeFileSync(path.join(snapshot, 'firestore/metadata'), 'TEST ONLY fixture');
    const encrypted = path.join(root, 'backup.enc'), restored = path.join(root, 'restored'), secret = crypto.randomBytes(32).toString('hex');
    packageSnapshot(snapshot, encrypted, secret, 'demo-pathway-security', attachments);
    restore(encrypted, restored, secret, { project: 'demo-pathway-security', dryRun: false });
    const mapping = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json'))).attachments[0];
    const bytes = fs.readFileSync(path.join(restored, mapping.name));
    assert.deepEqual(bytes, pdf);
    const replacement = { assetId: 'synthetic_replaced_1234', version: '2', verifiedSha256: mapping.sha256 };
    assert.equal(reconciliationPlan(mapping, bytes, record, replacement).databaseWrites, 0);
    assert.throws(() => reconciliationPlan(mapping, bytes, { ...record, version: '3' }, replacement));
    assert.throws(() => reconciliationPlan(mapping, bytes, { ...record, assetId: 'different_asset_1234' }, replacement));
    assert.throws(() => reconciliationPlan(mapping, Buffer.from('corrupt'), record, replacement));
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('authorization refusal, provider mismatch and byte mismatch publish no complete acquisition', async () => {
  for (const options of [adapters({ readRecord: async () => { throw new Error('Forbidden'); } }), adapters({ readMetadata: async () => ({ ...metadata, version: 2 }) }), adapters({ downloadBytes: async () => Buffer.from('truncated') })]) {
    const target = directory();
    await assert.rejects(acquire([record], target, options), /Acquisition incomplete/);
    assert.equal(fs.existsSync(path.join(target, 'acquisition.json')), false);
  }
});
test('source changed during download and partial failure cannot be marked complete', async () => {
  let reads = 0;
  const target = directory();
  await assert.rejects(acquire([record], target, adapters({ readRecord: async () => ++reads === 1 ? record : { ...record, version: '2' } })), /changed during download/);
  assert.equal(fs.existsSync(path.join(target, 'acquisition.json')), false);
  const partial = directory();
  const second = { ...record, recordPath: 'requirements/TEST-SECOND' };
  await assert.rejects(acquire([record, second], partial, adapters({ readRecord: async key => key === record.recordPath ? record : second, downloadBytes: async value => { if (value.recordPath === second.recordPath) throw new Error('SIMULATED_NETWORK_FAILURE'); return pdf; } })), /Acquisition incomplete: 1\/2/);
  assert.equal(fs.existsSync(path.join(partial, 'acquisition.json')), false);
});
