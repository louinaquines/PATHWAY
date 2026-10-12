// Deliberately isolated: no production database or provider mutations.
const crypto = require('node:crypto');
const { reconciliationPlan } = require('./attachmentRecovery');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
function legacyUrl(value, asset) {
  try {
    const url = new URL(value);
    const id = asset.publicId.split('/').map(encodeURIComponent).join('/');
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || url.port || url.username || url.password || url.search || url.hash
      || url.pathname !== `/${asset.cloudName}/${asset.resourceType}/upload/v${asset.version}/${id}`) throw new Error();
    return value;
  } catch { throw new Error('Invalid version-bound public file URL'); }
}
async function restoreLink({ db, mapping, bytes, source, replacement, operationId, dryRun = true }) {
  if (db.projectId !== 'demo-pathway-security' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Only the dedicated isolated restore emulator is allowed');
  if (!/^requirements\/TEST-ONLY-[A-Za-z0-9_-]+$/.test(source?.recordPath || '') || !/^[A-Za-z0-9_-]{8,80}$/.test(operationId || '')) throw new Error('Explicit TEST ONLY record and operation ID required');
  reconciliationPlan(mapping, bytes, source, replacement);
  // Full replacement identity is mandatory; minimal dry-run plans cannot be applied.
  if (replacement.cloudName !== source.cloudName || replacement.resourceType !== source.resourceType || replacement.deliveryType !== 'authenticated'
    || typeof replacement.publicId !== 'string' || !replacement.publicId.startsWith('pathway/test-only-recovery-restored/') || replacement.publicId.includes('..')) throw new Error('Replacement identity is outside the test namespace');
  const expected = { cloudName: source.cloudName, publicId: source.publicId, version: String(source.version), assetId: source.assetId, resourceType: source.resourceType, deliveryType: source.deliveryType };
  const next = { cloudName: replacement.cloudName, publicId: replacement.publicId, version: String(replacement.version), assetId: replacement.assetId, resourceType: replacement.resourceType, deliveryType: replacement.deliveryType, sha256: mapping.sha256 };
  const requestHash = fingerprint({ recordPath: source.recordPath, expected, next });
  const recordRef = db.doc(source.recordPath), receiptRef = db.doc(`attachmentRecoveryReceipts/${operationId}`);
  return db.runTransaction(async transaction => {
    const record = await transaction.get(recordRef), receipt = await transaction.get(receiptRef);
    if (!record.exists) throw new Error('Restore record does not exist');
    const current = record.data().attachment;
    if (receipt.exists) {
      if (receipt.data().requestHash !== requestHash) throw new Error('Operation ID already belongs to a different restore');
      if (fingerprint(current) !== fingerprint(next)) throw new Error('Previously restored record changed');
      return { replay: true, writes: 0 };
    }
    if (fingerprint(current) !== fingerprint(expected)) throw new Error('Stale source link; nothing changed');
    if (dryRun) return { dryRun: true, writes: 0 };
    transaction.update(recordRef, { attachment: next });
    transaction.create(receiptRef, { recordPath: source.recordPath, requestHash, before: expected, after: next, testOnly: true, restoredAt: new Date().toISOString() });
    return { restored: true, writes: 2 };
  });
}
async function restoreStudentRequirement({ db, mapping, bytes, source, replacement, operationId, requirementId, dryRun = true }) {
  if (db.projectId !== 'demo-pathway-security' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180') throw new Error('Only the dedicated isolated restore emulator is allowed');
  if (!/^users\/TEST-ONLY-[A-Za-z0-9_-]+$/.test(source?.recordPath || '') || !/^[A-Za-z0-9_-]{1,100}$/.test(requirementId || '') || !/^[A-Za-z0-9_-]{8,80}$/.test(operationId || '')) throw new Error('Explicit test student, requirement and operation required');
  reconciliationPlan(mapping, bytes, source, replacement);
  const legacy = source.deliveryType === 'upload';
  if (!Number.isSafeInteger(Number(replacement.version)) || Number(replacement.version) < 1) throw new Error('Invalid numeric provider version');
  if (!['upload', 'authenticated'].includes(source.deliveryType) || replacement.deliveryType !== source.deliveryType || replacement.cloudName !== source.cloudName || replacement.resourceType !== source.resourceType
    || typeof replacement.publicId !== 'string' || !replacement.publicId.startsWith('pathway/test-only-recovery-restored/') || replacement.publicId.includes('..')) throw new Error('Replacement is outside the isolated recovery scope');
  const expected = { cloudinaryPublicId: source.publicId, cloudinaryVersion: String(source.version), cloudinaryAssetId: legacy ? source.storedAssetId || null : source.assetId, cloudinaryDeliveryType: source.deliveryType, uploadedBytes: bytes.length, fileUrl: legacy ? legacyUrl(source.fileUrl, source) : null };
  const next = { ...expected, cloudinaryPublicId: replacement.publicId, cloudinaryVersion: String(replacement.version), cloudinaryAssetId: replacement.assetId, fileUrl: legacy ? legacyUrl(replacement.fileUrl, replacement) : null };
  const projectLink = requirement => requirement && ({ cloudinaryPublicId: requirement.cloudinaryPublicId, cloudinaryVersion: String(requirement.cloudinaryVersion), cloudinaryAssetId: requirement.cloudinaryAssetId || null, cloudinaryDeliveryType: requirement.cloudinaryDeliveryType || 'upload', uploadedBytes: requirement.uploadedBytes, fileUrl: requirement.fileUrl });
  const requestHash = fingerprint({ recordPath: source.recordPath, requirementId, expected, next, sha256: mapping.sha256 });
  const userRef = db.doc(source.recordPath), receiptRef = db.doc(`attachmentRecoveryReceipts/${operationId}`);
  return db.runTransaction(async transaction => {
    const profile = await transaction.get(userRef), receipt = await transaction.get(receiptRef);
    if (!profile.exists || profile.data().role !== 'student') throw new Error('Test student not found');
    const requirement = profile.data().requirements?.[requirementId];
    if (!requirement) throw new Error('Requirement not found');
    const current = projectLink(requirement);
    if (receipt.exists) {
      if (receipt.data().requestHash !== requestHash) throw new Error('Operation ID already belongs to a different restore');
      if (fingerprint(current) !== fingerprint(next)) throw new Error('Previously restored requirement changed');
      return { replay: true, writes: 0 };
    }
    if (fingerprint(current) !== fingerprint(expected)) throw new Error('Stale source requirement; nothing changed');
    if (dryRun) return { dryRun: true, writes: 0 };
    // Update only file identity. Review decisions and submission metadata are preserved.
    transaction.update(userRef, {
      [`requirements.${requirementId}.cloudinaryPublicId`]: replacement.publicId,
      [`requirements.${requirementId}.cloudinaryVersion`]: Number(replacement.version),
      [`requirements.${requirementId}.cloudinaryAssetId`]: replacement.assetId,
      ...(legacy ? { [`requirements.${requirementId}.fileUrl`]: next.fileUrl, [`requirements.${requirementId}.cloudinaryDeliveryType`]: 'upload' } : {}),
    });
    transaction.create(receiptRef, { recordPath: source.recordPath, requirementId, requestHash, before: expected, after: next, sha256: mapping.sha256, testOnly: true, restoredAt: new Date().toISOString() });
    return { restored: true, writes: 2 };
  });
}
module.exports = { restoreLink, restoreStudentRequirement };
