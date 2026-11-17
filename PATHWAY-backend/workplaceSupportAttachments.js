const { randomUUID, createHash } = require('node:crypto');
const { cloudinaryConfig, signParams, secureEqual, fetchCloudinaryAsset, fetchCloudinaryAssetDownload, validateAssetMetadata } = require('./cloudinaryUploads');
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const supportId = value => typeof value === 'string' && /^pathway\/support\/[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(value);

function validateBytes(bytes, type) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_BYTES) fail(400, 'Attachment exceeds the permitted size.');
  const valid = type === 'application/pdf'
    ? /^%PDF-(1\.[0-9]|2\.0)/.test(bytes.subarray(0, 8).toString('ascii')) && /%%EOF\s*$/.test(bytes.subarray(-1024).toString('ascii'))
    : type === 'image/png'
      ? bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
        && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0
        && bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))
      : type === 'image/jpeg' && bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
  if (!valid) fail(400, 'Attachment bytes do not match the permitted file type.');
}

// All three types use the verified raw authenticated path: no image transformations or delivery URLs.
function createSupportUploads({ config = cloudinaryConfig, env = process.env } = {}) {
  const settings = () => { const value = config(); if (!value) fail(503, 'Protected uploads are unavailable. Keep your draft.'); return value; };
  return {
    intent(publicId) {
      const c = settings(); const timestamp = Math.floor(Date.now() / 1000);
      const params = { public_id: publicId, timestamp, type: 'authenticated', overwrite: 'false' };
      return { publicId, timestamp, signature: signParams(params, c.apiSecret), apiKey: c.apiKey, cloudName: c.cloudName,
        resourceType: 'raw', deliveryType: 'authenticated', overwrite: 'false', uploadUrl: `https://api.cloudinary.com/v1_1/${c.cloudName}/raw/upload` };
    },
    async verify(intent, receipt) {
      const c = settings();
      if (!Number.isSafeInteger(receipt.version) || receipt.version < 1 || typeof receipt.signature !== 'string' || !/^[a-f0-9]{40}$/i.test(receipt.signature)
        || !secureEqual(signParams({ public_id: intent.publicId, version: receipt.version }, c.apiSecret), receipt.signature.toLowerCase())) fail(400, 'Invalid upload signature.');
      const asset = await fetchCloudinaryAsset({ ...c, env, resourceType: 'raw', deliveryType: 'authenticated', publicId: intent.publicId });
      const created = Date.parse(asset.created_at);
      if (!supportId(intent.publicId) || asset.resource_type !== 'raw'
        || (asset.format && ![TYPES[intent.contentType], ...(intent.contentType === 'image/jpeg' ? ['jpeg'] : [])].includes(asset.format))
        || !validateAssetMetadata(asset, { cloudName: c.cloudName, expectedPublicId: intent.publicId, expectedVersion: receipt.version, kind: 'requirement', expectedDeliveryType: 'authenticated' })
        || !Number.isFinite(created) || created < intent.createdAt - 60000 || created > Date.now() + 60000) fail(400, 'Invalid protected asset metadata.');
      const record = { ...intent, assetId: asset.asset_id, version: receipt.version, bytes: asset.bytes };
      const bytes = await this.download(record);
      validateBytes(bytes, intent.contentType);
      if (bytes.length !== asset.bytes) fail(400, 'Attachment size does not match verified metadata.');
      return { assetId: record.assetId, version: record.version, bytes: bytes.length, sha256: digest(bytes) };
    },
    async download(record) {
      const c = settings();
      let bytes;
      try { bytes = await fetchCloudinaryAssetDownload({ ...c, env, assetId: record.assetId, fileName: `attachment.${TYPES[record.contentType]}` }); }
      catch (error) { if (error.status === 404) fail(400, 'Protected attachment is unavailable.'); throw error; }
      validateBytes(bytes, record.contentType);
      if (bytes.length !== record.bytes || (record.sha256 && digest(bytes) !== record.sha256)) fail(400, 'Protected attachment has changed.');
      return bytes;
    },
    async destroy(record) {
      if (!supportId(record.publicId)) fail(400, 'Not a support asset.');
      const c = settings(); const params = { public_id: record.publicId, type: 'authenticated', timestamp: Math.floor(Date.now() / 1000) };
      const response = await fetch(`${(env.CLOUDINARY_API_BASE_URL || 'https://api.cloudinary.com/v1_1').replace(/\/$/, '')}/${c.cloudName}/raw/destroy`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, api_key: c.apiKey, signature: signParams(params, c.apiSecret) }), signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 4096) fail(502, 'Invalid cleanup response.'); chunks.push(chunk); }
      if (!response.ok || !['ok', 'not found'].includes(JSON.parse(Buffer.concat(chunks)).result)) fail(502, 'Orphan cleanup failed.');
    },
  };
}

async function cleanupSupportAttachments({ db, uploads, now = Date.now(), limit = 10 }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25) fail(400, 'Invalid cleanup bound.');
  const intents = db.collection('workplaceSupportAttachmentIntents');
  const candidates = await intents.where('cleanupAfter', '<=', now).orderBy('cleanupAfter').limit(limit).get();
  for (const candidate of candidates.docs) {
    const record = await db.runTransaction(async tx => {
      const current = (await tx.get(candidate.ref)).data();
      if (!current || !['issued', 'ready', 'deleting'].includes(current.status) || current.expiresAt > now || current.cleanupAfter > now || !supportId(current.publicId)) return null;
      // Revoking the claim transactionally precedes provider I/O; failed deletes remain retryable.
      tx.update(candidate.ref, { status: 'deleting', cleanupAfter: now + 60000 }); return current;
    });
    if (!record) continue;
    try { await uploads.destroy(record); await candidate.ref.update({ status: 'deleted', cleanupAfter: null }); }
    catch { /* Retry on the next bounded pass; never discard the orphan record. */ }
  }
}

function installSupportAttachments({ app, db, requireUser, requireStaff, uploads, guard, profile, readyStudent, authorized, validId, reports }) {
  const intents = db.collection('workplaceSupportAttachmentIntents');
  async function owned(tx, req, id, status, confirmedUncommitted = false) {
    if (!validId(id)) fail(400, 'Invalid attachment intent.');
    const student = await profile(tx, req.user.uid, req.user.data); readyStudent(student, req.user.data);
    const ref = intents.doc(id); const record = (await tx.get(ref)).data();
    if (!record || record.uid !== req.user.uid) fail(403, 'Attachment unavailable.');
    if (!(Array.isArray(status) ? status.includes(record.status) : record.status === status) || record.expiresAt <= Date.now()) {
      throw Object.assign(new Error('Attachment is incomplete, expired or already used. Explicitly renew, replace or remove it.'), {
        status: 409, ...(confirmedUncommitted ? { reason: 'attachment_uncommitted' } : {}),
      });
    }
    return { ref, record };
  }
  app.post('/student/workplace-support/attachments/intents', requireUser, guard(false, 'attachment-intent', async (req, res) => {
    if (!uploads) fail(503, 'Protected uploads are unavailable.');
    const body = req.body || {};
    if (!Object.hasOwn(TYPES, body.contentType) || Object.keys(body).some(k => k !== 'contentType')) fail(400, 'Choose one PDF, JPEG or PNG up to 5 MB.');
    const intentId = randomUUID(); const now = Date.now(); const publicId = `pathway/support/${intentId}.${TYPES[body.contentType]}`;
    const signed = uploads.intent(publicId);
    await db.runTransaction(async tx => {
      readyStudent(await profile(tx, req.user.uid, req.user.data), req.user.data);
      tx.create(intents.doc(intentId), { uid: req.user.uid, publicId, contentType: body.contentType, createdAt: now, expiresAt: now + 3600000, cleanupAfter: now + 7200000, status: 'issued' });
    });
    // One-hour extra cleanup grace outlasts the provider's signed-upload acceptance window.
    res.status(201).json({ intentId, ...signed, maxBytes: MAX_BYTES, expiresAt: now + 3600000 });
  }));
  app.post('/student/workplace-support/attachments/:intentId/finalize', requireUser, guard(false, 'attachment-finalize', async (req, res) => {
    if (!uploads) fail(503, 'Protected uploads are unavailable.');
    const receipt = req.body || {};
    if (Object.keys(receipt).some(k => !['version', 'signature'].includes(k))) fail(400, 'Unsupported attachment fields.');
    const { record } = await db.runTransaction(tx => owned(tx, req, req.params.intentId, ['issued', 'ready']));
    const verified = await uploads.verify(record, receipt);
    await db.runTransaction(async tx => {
      const current = await owned(tx, req, req.params.intentId, ['issued', 'ready']);
      if (current.record.publicId !== record.publicId || current.record.contentType !== record.contentType) fail(409, 'Attachment changed during verification.');
      if (current.record.status === 'ready') {
        if (['assetId', 'version', 'bytes', 'sha256'].some(key => current.record[key] !== verified[key])) fail(409, 'Protected attachment has changed.');
        return;
      }
      tx.update(current.ref, { ...verified, status: 'ready' });
    });
    res.json({ attachmentIntentId: req.params.intentId, status: 'ready' });
  }));
  for (const staff of [false, true]) {
    app.get(`/${staff ? 'coordinator' : 'student'}/workplace-support/:id/attachment`, staff ? requireStaff : requireUser, guard(staff, 'attachment-download', async (req, res) => {
      if (!uploads) fail(503, 'Protected downloads are unavailable.');
      if (!validId(req.params.id)) fail(400, 'Invalid report.');
      const authorize = () => db.runTransaction(async tx => {
        const fresh = await profile(tx, req.user.uid, req.user.data);
        if (fresh?.role !== (staff ? 'coordinator' : 'student')) fail(403, 'Access denied.');
        if (!staff) readyStudent(fresh, req.user.data);
        const report = (await tx.get(reports.doc(req.params.id))).data();
        if (!report || !await authorized(tx, { uid: req.user.uid, data: fresh }, report, staff)) fail(403, 'Attachment unavailable.');
        if (!validId(report.attachment?.assetRef)) fail(404, 'Attachment unavailable.');
        const record = (await tx.get(intents.doc(report.attachment.assetRef))).data();
        if (record?.status !== 'claimed' || record.reportId !== req.params.id || record.uid !== report.studentId) fail(404, 'Attachment unavailable.');
        return record;
      });
      const record = await authorize(); const bytes = await uploads.download(record);
      await authorize(); // Reassignment/password changes during provider I/O revoke delivery before any bytes are sent.
      res.set({ 'Content-Type': record.contentType, 'Content-Disposition': `attachment; filename="attachment.${TYPES[record.contentType]}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store', 'Content-Security-Policy': "sandbox; default-src 'none'" });
      res.send(bytes);
    }));
  }
  return {
    async prepare(req, intentId, reportId, fingerprint) {
      const record = await db.runTransaction(async tx => {
        readyStudent(await profile(tx, req.user.uid, req.user.data), req.user.data);
        const existing = await tx.get(reports.doc(reportId));
        if (existing.exists) {
          if (existing.data().fingerprint !== fingerprint) fail(409, 'requestId already used for a different report.');
          return null;
        }
        return (await owned(tx, req, intentId, 'ready', true)).record;
      });
      if (record) {
        if (!uploads) fail(503, 'Protected uploads are unavailable. Keep your draft.');
        await uploads.download(record);
      }
    },
    async claim(tx, req, intentId, reportId) {
      const current = await owned(tx, req, intentId, 'ready', true);
      tx.update(current.ref, { status: 'claimed', reportId, cleanupAfter: null });
      return { assetRef: intentId, contentType: current.record.contentType, bytes: current.record.bytes, fileName: `attachment.${TYPES[current.record.contentType]}` };
    },
  };
}
module.exports = { createSupportUploads, installSupportAttachments, cleanupSupportAttachments };
