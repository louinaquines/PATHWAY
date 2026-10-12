// Scoped operator workflow: adapters must enforce source authorization.
// No arbitrary URL fetches, provider uploads or database writes are performed here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateAssetMetadata } = require('./cloudinaryUploads');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_BYTES = 5 * 1024 * 1024;
function identity(record) {
  const fields = ['recordPath', 'cloudName', 'publicId', 'version', 'assetId', 'resourceType', 'deliveryType'];
  return JSON.stringify(fields.map(key => record?.[key]));
}
function validate(record) {
  if (!record || typeof record.recordPath !== 'string' || !/^(?:[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)*$/.test(record.recordPath)
    || !/^[A-Za-z0-9_-]{1,100}$/.test(record.cloudName) || typeof record.publicId !== 'string' || !record.publicId || record.publicId.includes('..')
    || !/^\d{1,20}$/.test(String(record.version)) || !/^[A-Za-z0-9_-]{16,80}$/.test(record.assetId)
    || !['image', 'raw'].includes(record.resourceType) || !['authenticated', 'upload'].includes(record.deliveryType)) throw new Error('Invalid version-bound attachment selection');
}
async function acquire(records, directory, { readRecord, readMetadata, downloadBytes }) {
  if (!Array.isArray(records) || !records.length || records.length > 100) throw new Error('Select one to 100 attachments');
  records.forEach(validate);
  if (new Set(records.map(record => record.recordPath)).size !== records.length) throw new Error('Duplicate record selection');
  const target = path.resolve(directory);
  if (fs.existsSync(target)) throw new Error('Acquisition destination must not exist');
  for (let ancestor = path.dirname(target); ; ancestor = path.dirname(ancestor)) {
    if (fs.existsSync(ancestor) && fs.lstatSync(ancestor).isSymbolicLink()) throw new Error('Symlink destination refused');
    if (ancestor === path.dirname(ancestor)) break;
  }
  fs.mkdirSync(target, { mode: 0o700 });
  const attachments = [];
  try {
    for (const selected of records) {
      const record = { ...selected };
      if (identity(await readRecord(record.recordPath)) !== identity(record)) throw new Error('Source record changed');
      const asset = await readMetadata(record);
      if (!validateAssetMetadata(asset, { cloudName: record.cloudName, expectedPublicId: record.publicId, expectedVersion: record.version, kind: 'requirement', expectedDeliveryType: record.deliveryType })
        || asset.asset_id !== record.assetId || asset.resource_type !== record.resourceType) throw new Error('Provider asset/version mismatch');
      // Adapter must impose streaming size/time limits and refuse redirects.
      const bytes = await downloadBytes(record, { maxBytes: MAX_BYTES });
      if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES || bytes.length !== asset.bytes) throw new Error('Attachment byte count mismatch');
      // Recheck both identities after download to detect replacement during acquisition.
      if (identity(await readRecord(record.recordPath)) !== identity(record)) throw new Error('Source record changed during download');
      const current = await readMetadata(record);
      if (current.asset_id !== asset.asset_id || current.public_id !== asset.public_id || String(current.version) !== String(asset.version) || current.bytes !== asset.bytes) throw new Error('Provider changed during download');
      const sha256 = hash(bytes), source = path.join(target, `${attachments.length}-${sha256}.bin`);
      fs.writeFileSync(source, bytes, { flag: 'wx', mode: 0o600 });
      attachments.push({ source, recordPath: record.recordPath, version: String(record.version), sha256, size: bytes.length, originalAssetId: record.assetId });
    }
    fs.writeFileSync(path.join(target, 'acquisition.json'), JSON.stringify({ version: 1, attachments }), { flag: 'wx', mode: 0o600 });
    return attachments;
  } catch (error) {
    throw new Error(`Acquisition incomplete: ${attachments.length}/${records.length}. Keep staging isolated; no complete manifest was published. ${error.message}`);
  }
}
function reconciliationPlan(mapping, bytes, currentRecord, replacement) {
  validate(currentRecord);
  if (!mapping || mapping.recordPath !== currentRecord.recordPath || mapping.originalAssetId !== currentRecord.assetId || String(mapping.version) !== String(currentRecord.version)
    || !Buffer.isBuffer(bytes) || hash(bytes) !== mapping.sha256 || bytes.length !== mapping.size) throw new Error('Restored bytes or source version mismatch');
  if (!replacement || replacement.verifiedSha256 !== mapping.sha256 || !/^[A-Za-z0-9_-]{16,80}$/.test(replacement.assetId) || !/^\d{1,20}$/.test(String(replacement.version)) || replacement.assetId === currentRecord.assetId) throw new Error('Replacement requires independently verified bytes and new identity');
  return { dryRun: true, recordPath: mapping.recordPath, expectedSource: { assetId: currentRecord.assetId, version: String(currentRecord.version) }, replacement: { assetId: replacement.assetId, version: String(replacement.version) }, sha256: mapping.sha256, databaseWrites: 0, providerUploads: 0 };
}
module.exports = { acquire, reconciliationPlan };
