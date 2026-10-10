// Explicitly authorized synthetic provider check; never reads Firebase/student data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadLocalCloudinaryQa } = require('../localCloudinaryQa');
const { cloudinaryConfig, signParams, secureEqual, fetchCloudinaryAsset, fetchCloudinaryAssetDownload, validateAssetMetadata } = require('../cloudinaryUploads');

async function main() {
  const env = { PATHWAY_LOCAL_WORKFLOW: '1' };
  assert(loadLocalCloudinaryQa(env), 'Dedicated Cloudinary QA configuration is required.');
  const config = cloudinaryConfig(env);
  const publicId = `pathway-qa/private-delivery-${crypto.randomUUID()}.pdf`;
  const bytes = Buffer.from('%PDF-1.4\n% PATHWAY synthetic private-delivery check. No student data.\n%%EOF\n');
  const base = `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}`;
  let uploaded = false;
  try {
    const params = { public_id: publicId, type: 'authenticated', overwrite: 'false', timestamp: Math.floor(Date.now() / 1000) };
    const form = new FormData();
    for (const [key, value] of Object.entries(params)) form.set(key, String(value));
    form.set('api_key', config.apiKey);
    form.set('signature', signParams(params, config.apiSecret));
    form.set('file', new Blob([bytes], { type: 'application/pdf' }), 'synthetic.pdf');
    const response = await fetch(`${base}/raw/upload`, { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Synthetic upload rejected (HTTP ${response.status}).`);
    const asset = await response.json();
    uploaded = true;
    assert.equal(asset.public_id, publicId);
    assert.equal(asset.type, 'authenticated');
    assert(secureEqual(asset.signature, signParams({ public_id: asset.public_id, version: asset.version }, config.apiSecret)), 'Provider response signature mismatch.');
    console.log('PASS: authenticated synthetic upload and response signature');
    const metadata = await fetchCloudinaryAsset({ ...config, resourceType: 'raw', publicId, deliveryType: 'authenticated', env });
    const valid = validateAssetMetadata(metadata, { cloudName: config.cloudName, expectedPublicId: publicId, expectedVersion: asset.version, kind: 'requirement', expectedDeliveryType: 'authenticated' });
    console.log(JSON.stringify({ metadataAcceptedByBackend: valid, resourceType: metadata.resource_type, format: metadata.format || null, bytes: metadata.bytes }));
    const anonymous = await fetch(asset.secure_url, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert([401, 403, 404].includes(anonymous.status), `Anonymous delivery was not denied (HTTP ${anonymous.status}).`);
    console.log(`PASS: anonymous delivery blocked (HTTP ${anonymous.status})`);
    const unsigned = await fetch(`${base}/asset/download?asset_id=${encodeURIComponent(asset.asset_id)}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
    assert([400, 401, 403, 404].includes(unsigned.status), `Unsigned download was not denied (HTTP ${unsigned.status}).`);
    console.log(`PASS: unsigned API download blocked (HTTP ${unsigned.status})`);
    const downloaded = await fetchCloudinaryAssetDownload({ ...config, assetId: asset.asset_id, fileName: 'synthetic.pdf', env });
    assert.deepEqual(downloaded, bytes);
    console.log('PASS: backend signed download matches uploaded bytes');
    assert(valid, 'Live provider metadata is incompatible with backend validation.');
  } finally {
    if (uploaded) {
      const params = { public_id: publicId, type: 'authenticated', timestamp: Math.floor(Date.now() / 1000) };
      const body = new URLSearchParams({ ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) });
      const response = await fetch(`${base}/raw/destroy`, { method: 'POST', body, signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || result.result !== 'ok') throw new Error('Synthetic asset cleanup failed; manual cleanup is required.');
      console.log('PASS: only this run’s synthetic asset removed');
    }
  }
}

if (require.main === module) main().catch(error => {
  // Never print credential-bearing request URLs or provider response bodies.
  console.error(error instanceof assert.AssertionError ? error.message : 'Provider QA failed: ' + (error.message.startsWith('Synthetic') || error.message.startsWith('Cloudinary') ? error.message : 'request or validation failure'));
  process.exitCode = 1;
});
