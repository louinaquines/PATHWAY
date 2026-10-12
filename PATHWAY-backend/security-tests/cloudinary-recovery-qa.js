// Authorized one-asset TEST ONLY upload and readback. No student/database writes.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { loadLocalCloudinaryQa } = require('../localCloudinaryQa');
const { cloudinaryConfig, signParams } = require('../cloudinaryUploads');
const { acquire, reconciliationPlan } = require('../attachmentRecovery');
const { packageSnapshot, restore } = require('../operatorBackup');
const { latestSnapshot } = require('./emulator-persistence');
const statePath = path.resolve(__dirname, '../.env.cloudinary-recovery-qa-state.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function bounded(url, options = {}, maxBytes = 5 * 1024 * 1024) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Provider request failed (${response.status})`);
  const chunks = []; let total = 0;
  try {
    for await (const chunk of response.body) { total += chunk.length; if (total > maxBytes) throw new Error('Provider response exceeds limit'); chunks.push(chunk); }
  } catch (error) { await response.body?.cancel().catch(() => {}); throw error; }
  return Buffer.concat(chunks);
}
async function main() {
  const replacementTest = process.argv[2] === '--approved-restored-upload';
  if (!replacementTest && process.argv[2] !== '--approved-test-upload') throw new Error('Explicit TEST ONLY flag required');
  if (replacementTest && !fs.existsSync(statePath)) throw new Error('Original verified test asset required');
  const env = { PATHWAY_LOCAL_WORKFLOW: '1' };
  if (!loadLocalCloudinaryQa(env)) throw new Error('Dedicated QA Cloudinary configuration unavailable');
  const config = cloudinaryConfig(env);
  const snapshot = latestSnapshot(); if (!snapshot) throw new Error('Synthetic snapshot required');
  const pdf = fs.readFileSync(path.resolve(__dirname, '../../output/pdf/test-only-endorsement.pdf'));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  let state;
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath));
    if (state.status !== 'uploaded' && state.status !== 'verified') throw new Error('Prior upload outcome uncertain. Do not automatically retry');
    if (state.cloudName !== config.cloudName || state.sha256 !== hash(pdf)) throw new Error('QA source changed');
  } else {
    const publicId = `pathway/test-only-recovery/${crypto.randomUUID()}.pdf`;
    state = { status: 'attempting', publicId, cloudName: config.cloudName, sha256: hash(pdf), attemptedAt: new Date().toISOString() };
    fs.writeFileSync(statePath, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    const params = { public_id: publicId, type: 'authenticated', overwrite: 'false', timestamp: Math.floor(Date.now() / 1000) };
    const form = new FormData();
    form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'TEST-ONLY-recovery.pdf');
    for (const [key, value] of Object.entries(params)) form.set(key, String(value));
    form.set('api_key', config.apiKey); form.set('signature', signParams(params, config.apiSecret));
    const uploaded = JSON.parse((await bounded(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`, { method: 'POST', body: form }, 1024 * 1024)).toString());
    if (uploaded.public_id !== publicId || uploaded.type !== 'authenticated' || uploaded.resource_type !== 'raw' || uploaded.bytes !== pdf.length || !uploaded.asset_id || !uploaded.version) throw new Error('Upload identity mismatch; review prior attempt');
    state = { ...state, status: 'uploaded', assetId: uploaded.asset_id, version: String(uploaded.version) };
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  }
  const record = { recordPath: 'requirements/TEST-ONLY-RECOVERY', cloudName: config.cloudName, publicId: state.publicId, version: state.version, assetId: state.assetId, resourceType: 'raw', deliveryType: 'authenticated' };
  async function metadata(selected = record) {
    const publicId = selected.publicId.split('/').map(encodeURIComponent).join('/');
    return JSON.parse((await bounded(`https://api.cloudinary.com/v1_1/${config.cloudName}/resources/raw/authenticated/${publicId}`, { headers: { Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}` } }, 1024 * 1024)).toString());
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pathway-provider-recovery-'));
  const attachments = await acquire([record], path.join(directory, 'acquired'), {
    readRecord: async () => record, readMetadata: metadata,
    downloadBytes: async (_record, { maxBytes }) => {
      const params = { asset_id: record.assetId, attachment: 'true', target_filename: 'TEST-ONLY-recovery.pdf', timestamp: Math.floor(Date.now() / 1000) };
      const query = new URLSearchParams({ ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) });
      return bounded(`https://api.cloudinary.com/v1_1/${config.cloudName}/asset/download?${query}`, {}, maxBytes);
    },
  });
  assert.equal(attachments[0].sha256, hash(pdf));
  const secret = crypto.randomBytes(32).toString('hex'), encrypted = path.join(directory, 'backup.enc'), restored = path.join(directory, 'restored');
  packageSnapshot(snapshot, encrypted, secret, 'demo-pathway-security', attachments);
  restore(encrypted, restored, secret, { project: 'demo-pathway-security' });
  restore(encrypted, restored, secret, { project: 'demo-pathway-security', dryRun: false });
  const mapping = JSON.parse(fs.readFileSync(path.join(restored, 'attachment-recovery.json'))).attachments[0];
  const recoveredBytes = fs.readFileSync(path.join(restored, mapping.name));
  assert.deepEqual(recoveredBytes, pdf);
  if (replacementTest) {
    const receipt = path.resolve(__dirname, '../.env.cloudinary-restored-upload-qa-state.json');
    let replacement;
    if (fs.existsSync(receipt)) {
      replacement = JSON.parse(fs.readFileSync(receipt));
      if (!['uploaded', 'verified'].includes(replacement.status) || replacement.originalAssetId !== record.assetId || replacement.sha256 !== hash(recoveredBytes) || replacement.cloudName !== config.cloudName) throw new Error('Replacement outcome uncertain or source changed; do not retry upload');
    } else {
      const publicId = `pathway/test-only-recovery-restored/${crypto.randomUUID()}.pdf`;
      replacement = { status: 'attempting', publicId, originalAssetId: record.assetId, cloudName: config.cloudName, sha256: hash(recoveredBytes), attemptedAt: new Date().toISOString() };
      fs.writeFileSync(receipt, JSON.stringify(replacement), { flag: 'wx', mode: 0o600 });
      const params = { public_id: publicId, type: 'authenticated', overwrite: 'false', timestamp: Math.floor(Date.now() / 1000) };
      const form = new FormData();
      form.set('file', new Blob([recoveredBytes], { type: 'application/pdf' }), 'TEST-ONLY-restored-recovery.pdf');
      for (const [key, value] of Object.entries(params)) form.set(key, String(value));
      form.set('api_key', config.apiKey); form.set('signature', signParams(params, config.apiSecret));
      const result = JSON.parse((await bounded(`https://api.cloudinary.com/v1_1/${config.cloudName}/raw/upload`, { method: 'POST', body: form }, 1024 * 1024)).toString());
      if (result.public_id !== publicId || result.type !== 'authenticated' || result.resource_type !== 'raw' || result.bytes !== recoveredBytes.length || !result.asset_id || result.asset_id === record.assetId || !result.version) throw new Error('Replacement upload mismatch');
      replacement = { ...replacement, status: 'uploaded', assetId: result.asset_id, version: String(result.version) };
      fs.writeFileSync(receipt, JSON.stringify(replacement), { mode: 0o600 });
    }
    const replacementRecord = { ...record, publicId: replacement.publicId, assetId: replacement.assetId, version: replacement.version };
    const readback = await acquire([replacementRecord], path.join(directory, 'replacement-readback'), {
      readRecord: async () => replacementRecord, readMetadata: metadata,
      downloadBytes: async (selected, { maxBytes }) => {
        const params = { asset_id: selected.assetId, attachment: 'true', target_filename: 'TEST-ONLY-restored-recovery.pdf', timestamp: Math.floor(Date.now() / 1000) };
        const query = new URLSearchParams({ ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) });
        return bounded(`https://api.cloudinary.com/v1_1/${config.cloudName}/asset/download?${query}`, {}, maxBytes);
      },
    });
    assert.deepEqual(fs.readFileSync(readback[0].source), recoveredBytes);
    const plan = reconciliationPlan(mapping, recoveredBytes, record, { ...replacement, verifiedSha256: readback[0].sha256 });
    assert.equal(plan.databaseWrites, 0);
    const original = await metadata(record);
    assert.equal(original.asset_id, record.assetId); assert.equal(String(original.version), record.version);
    replacement.status = 'verified'; replacement.verifiedAt = new Date().toISOString();
    fs.writeFileSync(receipt, JSON.stringify(replacement), { mode: 0o600 });
    console.log(JSON.stringify({ restoredPdfUploadedAsSeparateAsset: true, readbackBytes: recoveredBytes.length, exactByteMatch: true, originalAssetUnchanged: true, reconciliationDryRunVerified: true, databaseWrites: 0, studentLinksChanged: 0, testAssetsRetained: 2 }));
    return;
  }
  state.status = 'verified'; state.verifiedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  console.log(JSON.stringify({ newTestAssetVerified: true, downloadedBytes: pdf.length, encryptedRecoveryVerified: true, sourceDatabaseWrites: 0, studentLinksChanged: 0, assetRetainedForReview: true }));
}
main().catch(() => { console.error('Cloudinary recovery QA did not complete. No credentials logged; inspect protected receipt before any retry.'); process.exitCode = 1; });
