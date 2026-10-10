// pathway-backend/server.js
if (process.env.NODE_ENV !== 'production' && process.env.PATHWAY_LOCAL_WORKFLOW !== '1') require('dotenv').config();
// Fail before Firebase initialization or any local QA credential loading.
require('./productionPreflight').assertProductionStartup(process.env);
// Isolated emulator suites supply their own stub credentials and provider URL.
if (process.env.PATHWAY_LOCAL_WORKFLOW === '1' && (process.env.PATHWAY_CLOUDINARY_QA === '1'
  || (process.env.PORT === '3100' && process.env.GOOGLE_CLOUD_PROJECT === 'demo-pathway-security'
    && process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8080'
    && process.env.FIREBASE_AUTH_EMULATOR_HOST === '127.0.0.1:9099'))) {
  require('./localCloudinaryQa').loadLocalCloudinaryQa();
}
const adminApp = require('./firebaseAdmin');
const { getAuth }                      = require('firebase-admin/auth');
const { FieldValue, getFirestore }     = require('firebase-admin/firestore');

const adminAuth = getAuth(adminApp);
const adminDb   = getFirestore(adminApp);

const express = require('express');
const cors    = require('cors');
const crypto  = require('crypto');
const {
  cloudinaryConfig, signParams, secureEqual, fetchCloudinaryAsset,
  fetchCloudinaryAssetDownload, validateAssetMetadata, formatFileSize,
} = require('./cloudinaryUploads');
const { validEmail, endorsementMailer, sendEndorsement } = require('./endorsementMail');

const app = express();
// Cloud Run terminates TLS in front of the container. Trust only its single
// forwarding hop so request IP-based throttles use the originating client IP.
if (process.env.K_SERVICE) app.set('trust proxy', 1);
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3001,http://localhost:8081,http://localhost:8082,http://localhost:19006')
  .split(',').map(origin => origin.trim()).filter(Boolean));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
}));
app.use(express.json({ limit: '1mb' }));

// Liveness endpoint for Cloud Run and deployment smoke checks. It intentionally
// does not expose project details or require Firebase to be reachable.
app.get('/healthz', (_req, res) => res.status(200).json({ status: 'ok' }));

const recentRequests = new Map();
function allowRate(req, res, { limit, windowMs, key }) {
  const now = Date.now();
  const bucketKey = key(req);
  const history = (recentRequests.get(bucketKey) || []).filter(time => now - time < windowMs);
  if (history.length >= limit) {
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return false;
  }
  history.push(now);
  recentRequests.set(bucketKey, history);
  if (recentRequests.size > 5000) {
    for (const [entry, times] of recentRequests) {
      if (!times.length || now - times[times.length - 1] > windowMs) recentRequests.delete(entry);
    }
  }
  return true;
}

async function requireUser(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    const decoded = await adminAuth.verifyIdToken(header.slice(7), true);
    const snap = await adminDb.collection('users').doc(decoded.uid).get();
    if (!snap.exists) return res.status(403).json({ error: 'User profile not found' });
    if (snap.data().role === 'student' && (snap.data().passwordChangeRequired === true
      || (snap.data().passwordEpoch && decoded.passwordEpoch !== snap.data().passwordEpoch))) {
      return res.status(403).json({ error: 'Change your password and sign in again before accessing student records.' });
    }
    req.user = { uid: decoded.uid, role: snap.data().role, data: snap.data() };
    return next();
  } catch (e) { return res.status(401).json({ error: 'Invalid authentication token' }); }
}

require('./studentInbox').installStudentInbox({ app, db: adminDb, requireUser, allowRate });

app.post('/register-student', async (req, res) => {
  return res.status(410).json({ error: 'Student self-registration is no longer available. Contact your coordinator for an account.' });
});

require('./studentAccounts').installStudentAccounts({
  app, auth: adminAuth, db: adminDb, requireStaff, coordinatorSection,
  coordinatorOwnsStudent, allowRate, audit: writeAuditInTransaction,
});

const defaultRequirementIds = new Set(['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa']);
const uploadIntents = adminDb.collection('cloudinaryUploadIntents');
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

async function getEditableRequirement(uid, requirementId) {
  const userRef = adminDb.collection('users').doc(uid);
  const profile = await userRef.get();
  if (!profile.exists || !profile.data().accountApproved || profile.data().preDeploymentStatus === 'approved') {
    throw Object.assign(new Error('This account cannot edit pre-deployment requirements.'), { status: 403 });
  }
  const student = profile.data();
  assertRecordsOpen(student);
  const customRequirement = student.sectionId
    ? await adminDb.collection('sections').doc(student.sectionId).collection('requirements').doc(requirementId).get()
    : null;
  if (!defaultRequirementIds.has(requirementId) && !customRequirement?.exists) {
    throw Object.assign(new Error('Requirement not found for your section.'), { status: 404 });
  }
  return { userRef, student };
}

async function issueCloudinaryIntent(req, res, { kind, requirementId = null }) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!allowRate(req, res, { limit: 12, windowMs: 60 * 60_000, key: request => `cloudinary-intent:${request.user.uid}` })) return;
  if (kind === 'requirement' && !/^[A-Za-z0-9_-]{1,80}$/.test(requirementId || '')) return res.status(400).json({ error: 'Invalid requirement.' });
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ error: 'Document uploads are not configured. Contact your administrator.' });
  try {
    let placementProposalId = null;
    if (kind === 'requirement') {
      const { student } = await getEditableRequirement(req.user.uid, requirementId);
      if (requirementId === 'endorsement_letter') {
        placementProposalId = student.placementProposalId;
        if (student.placementStatus !== 'approved' || typeof placementProposalId !== 'string'
          || !/^[A-Za-z0-9_-]{1,120}$/.test(placementProposalId)) {
          return res.status(409).json({ error: 'A current coordinator-approved placement is required before uploading its signed endorsement letter.' });
        }
        const endorsementSnap = await adminDb.collection('endorsements').doc(placementProposalId).get();
        const endorsement = endorsementSnap.exists ? endorsementSnap.data() : null;
        if (!endorsement || endorsement.status !== 'awaiting_document'
          || endorsement.proposalId !== placementProposalId || endorsement.studentId !== req.user.uid
          || endorsement.sectionId !== student.sectionId || endorsement.department !== student.department
          || endorsement.companyId !== student.companyId) {
          return res.status(409).json({ error: 'There is no active endorsement request for your current approved placement.' });
        }
      }
    } else if (req.user.data.accountApproved !== true) return res.status(403).json({ error: 'This account cannot update a profile photo.' });

    const timestamp = Math.floor(Date.now() / 1000);
    const intentId = crypto.randomUUID();
    const folder = kind === 'profile' ? `pathway/profile/${req.user.uid}` : `pathway/requirements/${req.user.uid}`;
    const publicId = `${folder}/${kind === 'profile' ? 'profile' : requirementId}-${crypto.randomBytes(16).toString('hex')}`;
    const deliveryType = kind === 'requirement' && requirementId === 'endorsement_letter' ? 'authenticated' : 'upload';
    const params = { overwrite: 'false', public_id: publicId, timestamp,
      ...(deliveryType === 'authenticated' ? { type: 'authenticated' } : {}),
    };
    const signature = signParams(params, config.apiSecret);
    await uploadIntents.doc(intentId).create({
      uid: req.user.uid, kind, requirementId, publicId, timestamp, signature, deliveryType,
      ...(placementProposalId ? { placementProposalId } : {}),
      createdAt: Date.now(), expiresAt: Date.now() + 60 * 60_000, status: 'issued',
    });
    const resourceType = kind === 'profile' ? 'image' : 'auto';
    return res.json({
      intentId, cloudName: config.cloudName, apiKey: config.apiKey,
      timestamp, signature, publicId, folder, resourceType, deliveryType,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not prepare the secure upload.' });
  }
}

async function verifyCloudinaryUpload({ req, intentId, publicId, version, responseSignature, kind }) {
  const config = cloudinaryConfig();
  if (!config) throw Object.assign(new Error('Document uploads are not configured.'), { status: 503 });
  if (typeof intentId !== 'string' || !/^[0-9a-f-]{36}$/i.test(intentId)
    || typeof publicId !== 'string' || typeof version !== 'number' || !Number.isSafeInteger(version)
    || typeof responseSignature !== 'string' || !/^[a-f0-9]{40}$/i.test(responseSignature)) {
    throw Object.assign(new Error('Invalid uploaded file details.'), { status: 400 });
  }
  const intentRef = uploadIntents.doc(intentId);
  const intentSnap = await intentRef.get();
  if (!intentSnap.exists) throw Object.assign(new Error('Upload authorization was not found.'), { status: 403 });
  const intent = intentSnap.data();
  if (intent.uid !== req.user.uid || intent.kind !== kind || intent.status !== 'issued'
    || intent.expiresAt < Date.now() || intent.publicId !== publicId) {
    throw Object.assign(new Error('Upload authorization is invalid or expired.'), { status: 403 });
  }
  const expectedSignature = signParams({ public_id: publicId, version }, config.apiSecret);
  if (!secureEqual(expectedSignature, responseSignature.toLowerCase())) {
    throw Object.assign(new Error('Cloudinary could not verify the upload response.'), { status: 400 });
  }
  const resourceType = kind === 'profile' ? 'image' : null;
  const resourceTypes = resourceType ? [resourceType] : ['raw', 'image'];
  const deliveryType = intent.deliveryType === 'authenticated' ? 'authenticated' : 'upload';
  let asset;
  for (const type of resourceTypes) {
    try {
      asset = await fetchCloudinaryAsset({ ...config, resourceType: type, publicId, deliveryType });
      if (asset) break;
    } catch (error) {
      if (error.status === 400 && type !== resourceTypes[resourceTypes.length - 1]) continue;
      throw error;
    }
  }
  if (!asset || !validateAssetMetadata(asset, {
    cloudName: config.cloudName, expectedPublicId: publicId, expectedVersion: version, kind,
    expectedDeliveryType: deliveryType,
  })) {
    throw Object.assign(new Error('The uploaded file type, size, or URL is not allowed.'), { status: 400 });
  }
  const assetCreatedAt = Date.parse(asset.created_at);
  if (!Number.isFinite(assetCreatedAt) || assetCreatedAt < intent.createdAt - 60_000 || assetCreatedAt > Date.now() + 5 * 60_000) {
    throw Object.assign(new Error('The uploaded asset does not match this upload authorization.'), { status: 400 });
  }
  return { asset, intentRef, intent, config };
}

app.post('/requirements/:requirementId/upload-signature', requireUser, (req, res) =>
  issueCloudinaryIntent(req, res, { kind: 'requirement', requirementId: req.params.requirementId }));

app.put('/requirements/:requirementId', requireUser, async (req, res) => {
  const { requirementId } = req.params;
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(requirementId)) return res.status(400).json({ error: 'Invalid requirement.' });
  const { status } = req.body || {};
  if (!['submitted', 'not_submitted'].includes(status)) return res.status(400).json({ error: 'Invalid requirement status.' });
  if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: request => `requirement-change:${request.user.uid}` })) return;
  try {
    const { userRef } = await getEditableRequirement(req.user.uid, requirementId);
    if (status === 'submitted') {
      const { intentId, publicId, version, signature, fileName } = req.body || {};
      if (typeof fileName !== 'string' || !fileName.trim() || fileName.trim().length > 180) {
        return res.status(400).json({ error: 'Enter a valid file name.' });
      }
      const verified = await verifyCloudinaryUpload({ req, intentId, publicId, version, responseSignature: signature, kind: 'requirement' });
      if (verified.intent.requirementId !== requirementId) return res.status(403).json({ error: 'Upload authorization is for a different requirement.' });
      const authenticatedEndorsement = requirementId === 'endorsement_letter'
        && verified.intent.deliveryType === 'authenticated';
      if (requirementId === 'endorsement_letter' && !authenticatedEndorsement) {
        return res.status(409).json({ error: 'The signed letter upload authorization is outdated. Start the upload again.' });
      }
      const submittedAt = new Date().toISOString();
      await adminDb.runTransaction(async transaction => {
        const intentPlacementProposalId = authenticatedEndorsement ? verified.intent.placementProposalId : null;
        const endorsementRef = intentPlacementProposalId
          ? adminDb.collection('endorsements').doc(intentPlacementProposalId) : null;
        const [freshIntent, freshUser, freshEndorsement] = await Promise.all([
          transaction.get(verified.intentRef), transaction.get(userRef),
          endorsementRef ? transaction.get(endorsementRef) : Promise.resolve(null),
        ]);
        if (!freshIntent.exists || freshIntent.data().status !== 'issued' || freshIntent.data().uid !== req.user.uid
          || freshIntent.data().expiresAt < Date.now()) throw Object.assign(new Error('Upload authorization was already used or expired.'), { status: 409 });
        if (!freshUser.exists || !freshUser.data().accountApproved || freshUser.data().preDeploymentStatus === 'approved') {
          throw Object.assign(new Error('This account cannot edit pre-deployment requirements.'), { status: 403 });
        }
        if (freshUser.data().requirements?.[requirementId]?.status === 'approved') {
          throw Object.assign(new Error('An approved document cannot be replaced.'), { status: 409 });
        }
        if (authenticatedEndorsement) {
          const currentStudent = freshUser.data();
          const currentEndorsement = freshEndorsement?.exists ? freshEndorsement.data() : null;
          if (typeof intentPlacementProposalId !== 'string'
            || !/^[A-Za-z0-9_-]{1,120}$/.test(intentPlacementProposalId)
            || currentStudent.placementStatus !== 'approved'
            || currentStudent.placementProposalId !== intentPlacementProposalId
            || !currentEndorsement || currentEndorsement.status !== 'awaiting_document'
            || currentEndorsement.proposalId !== intentPlacementProposalId
            || currentEndorsement.studentId !== req.user.uid
            || currentEndorsement.sectionId !== currentStudent.sectionId
            || currentEndorsement.department !== currentStudent.department
            || currentEndorsement.companyId !== currentStudent.companyId) {
            throw Object.assign(new Error('The approved placement changed while this file was uploading. Start the upload again for the current placement.'), { status: 409 });
          }
        }
        const previousRequirement = freshUser.data().requirements?.[requirementId] || {};
        transaction.update(userRef, { [`requirements.${requirementId}`]: {
          status: 'submitted', fileUrl: authenticatedEndorsement ? null : verified.asset.secure_url, fileName: fileName.trim(),
          fileSize: formatFileSize(verified.asset.bytes), uploadedBytes: verified.asset.bytes,
          cloudinaryPublicId: verified.asset.public_id, cloudinaryVersion: verified.asset.version, submittedAt,
          ...(authenticatedEndorsement ? {
            cloudinaryAssetId: verified.asset.asset_id,
            cloudinaryDeliveryType: 'authenticated',
            placementProposalId: intentPlacementProposalId,
          } : {}),
        } });
        transaction.update(verified.intentRef, { status: 'used', usedAt: Date.now() });
        writeAuditInTransaction(transaction, {
          actorId: req.user.uid, actorRole: 'student', action: 'requirement.submitted',
          targetType: 'requirements', targetId: requirementId,
          details: {
            studentId: req.user.uid, sectionId: freshUser.data().sectionId || null,
            previousStatus: previousRequirement.status || 'not_submitted',
            deliveryType: authenticatedEndorsement ? 'authenticated' : 'upload',
          },
        });
      });
      return res.json({ success: true, fileUrl: authenticatedEndorsement ? null : verified.asset.secure_url, fileName: fileName.trim(),
        fileSize: formatFileSize(verified.asset.bytes), submittedAt });
    }

    await adminDb.runTransaction(async transaction => {
      const profile = await transaction.get(userRef);
      if (!profile.exists || !profile.data().accountApproved || profile.data().preDeploymentStatus === 'approved') {
        throw Object.assign(new Error('This account cannot edit pre-deployment requirements.'), { status: 403 });
      }
      const student = profile.data();
      const existing = student.requirements?.[requirementId] || {};
      if (existing.status === 'approved') throw Object.assign(new Error('An approved document cannot be removed.'), { status: 409 });
      transaction.update(userRef, { [`requirements.${requirementId}`]: {
        status, fileUrl: null, fileName: null, fileSize: null, submittedAt: null, uploadedBytes: null,
        cloudinaryPublicId: null, cloudinaryVersion: null, cloudinaryAssetId: null,
        cloudinaryDeliveryType: null, placementProposalId: null,
      } });
      writeAuditInTransaction(transaction, {
        actorId: req.user.uid, actorRole: 'student', action: 'requirement.removed',
        targetType: 'requirements', targetId: requirementId,
        details: {
          studentId: req.user.uid, sectionId: student.sectionId || null,
          previousStatus: existing.status || 'not_submitted',
          previousDeliveryType: existing.cloudinaryDeliveryType || 'upload',
        },
      });
    });
    return res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(502).json({ error: 'Could not verify or save the uploaded file.' });
  }
});

async function streamAuthenticatedRequirement(res, { studentId, requirementId, student, actorId, actorRole }) {
  const requirement = student.requirements?.[requirementId];
  if (!(requirement?.cloudinaryDeliveryType === 'authenticated' && requirement.cloudinaryAssetId)
    && !(requirement?.cloudinaryPublicId && requirement.cloudinaryVersion)) {
    return res.status(404).json({ error: 'A verified file is not available for this requirement.' });
  }
  if (!Number.isSafeInteger(requirement.uploadedBytes) || requirement.uploadedBytes < 1
    || requirement.uploadedBytes > MAX_UPLOAD_BYTES) {
    return res.status(404).json({ error: 'A private file is not available for this requirement.' });
  }
  const config = cloudinaryConfig();
  if (!config) return res.status(503).json({ error: 'Protected document delivery is not configured.' });
  const deliveryType = requirement.cloudinaryDeliveryType === 'authenticated' ? 'authenticated' : 'upload';
  let assetId = requirement.cloudinaryAssetId;
  if (deliveryType !== 'authenticated' || !assetId) {
    // Resolve older verified uploads through the provider's authenticated API,
    // never fetch an arbitrary stored/client URL or relax CDN access controls.
    const storedUrl = new URL(requirement.fileUrl || '');
    const prefix = `/${config.cloudName}/`;
    if (storedUrl.protocol !== 'https:' || storedUrl.hostname !== 'res.cloudinary.com'
      || !storedUrl.pathname.startsWith(prefix)
      || !requirement.cloudinaryPublicId.startsWith(`pathway/requirements/${studentId}/${requirementId}-`)) {
      return res.status(404).json({ error: 'A verified file is not available for this requirement.' });
    }
    const resourceType = storedUrl.pathname.slice(prefix.length).split('/')[0];
    if (!['image', 'raw'].includes(resourceType)) return res.status(404).json({ error: 'Unsupported document resource.' });
    const asset = await fetchCloudinaryAsset({ ...config, resourceType, publicId: requirement.cloudinaryPublicId, deliveryType });
    if (!validateAssetMetadata(asset, { cloudName: config.cloudName, expectedPublicId: requirement.cloudinaryPublicId,
      expectedVersion: requirement.cloudinaryVersion, kind: 'requirement', expectedDeliveryType: deliveryType })
      || asset.bytes !== requirement.uploadedBytes) {
      return res.status(404).json({ error: 'Document verification failed.' });
    }
    assetId = asset.asset_id;
  }
  const bytes = await fetchCloudinaryAssetDownload({
    ...config, assetId, fileName: requirement.fileName,
  });
  const safeFileName = String(requirement.fileName || 'endorsement-letter').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160) || 'endorsement-letter';
  await recordAudit({
    actorId, actorRole, action: 'requirement.downloaded', targetType: 'requirements', targetId: requirementId,
    details: { studentId, sectionId: student.sectionId || null, deliveryType },
  });
  res.set({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeFileName}"`,
  });
  return res.status(200).send(bytes);
}

app.get('/requirements/:requirementId/download', requireUser, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.requirementId)) return res.status(400).json({ error: 'Invalid requirement.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `private-document:${request.user.uid}` })) return;
  try {
    const studentSnap = await adminDb.collection('users').doc(req.user.uid).get();
    if (!studentSnap.exists || studentSnap.data().role !== 'student' || studentSnap.data().accountApproved !== true) {
      return res.status(403).json({ error: 'An approved student account is required.' });
    }
    return await streamAuthenticatedRequirement(res, {
      studentId: req.user.uid, requirementId: req.params.requirementId, student: studentSnap.data(),
      actorId: req.user.uid, actorRole: 'student',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 503) return res.status(error.status).json({ error: error.message });
    console.error('Student protected document download failed:', error.message);
    return res.status(502).json({ error: 'Could not retrieve the protected document.' });
  }
});

app.get('/coordinator/students/:studentId/requirements/:requirementId/download', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `private-document:${request.staff.uid}` })) return;
  if (typeof req.params.studentId !== 'string' || req.params.studentId.length > 128
    || !/^[A-Za-z0-9_-]{1,80}$/.test(req.params.requirementId)) {
    return res.status(400).json({ error: 'Invalid document request.' });
  }
  try {
    const studentSnap = await adminDb.collection('users').doc(req.params.studentId).get();
    if (!studentSnap.exists || studentSnap.data().role !== 'student') return res.status(404).json({ error: 'Student not found.' });
    const student = studentSnap.data();
    if (!(await coordinatorOwnsStudent(req.staff.uid, student))) {
      return res.status(403).json({ error: 'You can only access documents for students in your assigned sections.' });
    }
    return await streamAuthenticatedRequirement(res, {
      studentId: req.params.studentId, requirementId: req.params.requirementId, student,
      actorId: req.staff.uid, actorRole: 'coordinator',
    });
  } catch (error) {
    if (error.status === 404 || error.status === 503) return res.status(error.status).json({ error: error.message });
    console.error('Protected document download failed:', error.message);
    return res.status(502).json({ error: 'Could not retrieve the protected document.' });
  }
});

app.post('/profile/photo/upload-signature', requireUser, (req, res) =>
  issueCloudinaryIntent(req, res, { kind: 'profile' }));

app.put('/profile/photo', requireUser, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!allowRate(req, res, { limit: 10, windowMs: 60 * 60_000, key: request => `profile-photo:${request.user.uid}` })) return;
  try {
    const { intentId, publicId, version, signature } = req.body || {};
    const verified = await verifyCloudinaryUpload({ req, intentId, publicId, version, responseSignature: signature, kind: 'profile' });
    await adminDb.runTransaction(async transaction => {
      const [freshIntent, freshUser] = await Promise.all([transaction.get(verified.intentRef), transaction.get(adminDb.collection('users').doc(req.user.uid))]);
      if (!freshIntent.exists || freshIntent.data().status !== 'issued' || freshIntent.data().uid !== req.user.uid
        || freshIntent.data().expiresAt < Date.now()) throw Object.assign(new Error('Upload authorization was already used or expired.'), { status: 409 });
      if (!freshUser.exists || freshUser.data().accountApproved !== true) throw Object.assign(new Error('This account cannot update a profile photo.'), { status: 403 });
      transaction.update(freshUser.ref, { profilePhotoUrl: verified.asset.secure_url, updatedAt: new Date().toISOString() });
      transaction.update(verified.intentRef, { status: 'used', usedAt: Date.now() });
    });
    return res.json({ success: true, profilePhotoUrl: verified.asset.secure_url });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(502).json({ error: 'Could not verify or save the profile photo.' });
  }
});

const placementProposalFields = {
  companyName: 160, companyAddress: 500, companyIndustry: 120, companyEmail: 254, companyPhone: 40,
  supervisorName: 160, supervisorPosition: 120, supervisorEmail: 254, supervisorPhone: 40,
  internshipRole: 160, startDate: 10, endDate: 10, workArrangement: 80, notes: 2000,
};

function boundedText(value, field, maxLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw Object.assign(new Error(`Invalid ${field}.`), { status: 400 });
  const normalized = value.trim();
  if (normalized.length > maxLength) throw Object.assign(new Error(`${field} is too long.`), { status: 400 });
  return normalized;
}

function isIsoDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function placementStudentName(student) {
  return [student.firstName, student.lastName].filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim()).join(' ') || snapshotText(student.name, 160) || snapshotText(student.email, 254) || 'Student';
}

function snapshotText(value, maxLength = 500) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

app.post('/student/company-proposals', requireUser, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `placement-proposal:${request.user.uid}` })) return;
  const { proposalId = '', status } = req.body || {};
  if (!['draft', 'pending_review'].includes(status)) return res.status(400).json({ error: 'Invalid placement proposal status.' });
  if (proposalId && (typeof proposalId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(proposalId))) {
    return res.status(400).json({ error: 'Invalid placement proposal.' });
  }

  let fields;
  let companyId;
  try {
    fields = Object.fromEntries(Object.entries(placementProposalFields)
      .map(([field, maxLength]) => [field, boundedText(req.body?.[field], field, maxLength)]));
    companyId = boundedText(req.body?.companyId, 'company', 120);
    if (companyId && !/^[A-Za-z0-9_-]{1,120}$/.test(companyId)) throw Object.assign(new Error('Invalid company.'), { status: 400 });
    for (const field of companyId ? ['supervisorEmail'] : ['companyEmail', 'supervisorEmail']) {
      if (fields[field] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields[field])) {
        throw Object.assign(new Error(`Enter a valid ${field === 'companyEmail' ? 'company' : 'supervisor'} email.`), { status: 400 });
      }
    }
    if (!isIsoDate(fields.startDate) || !isIsoDate(fields.endDate)) {
      throw Object.assign(new Error('Enter valid placement dates in YYYY-MM-DD format.'), { status: 400 });
    }
    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {
      throw Object.assign(new Error('The placement end date must be on or after its start date.'), { status: 400 });
    }
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || 'Invalid placement details.' });
  }

  const studentRef = adminDb.collection('users').doc(req.user.uid);
  const proposalRef = proposalId ? adminDb.collection('companyProposals').doc(proposalId) : adminDb.collection('companyProposals').doc();
  const companyRef = companyId ? adminDb.collection('companies').doc(companyId) : null;
  const now = new Date().toISOString();
  try {
    const saved = await adminDb.runTransaction(async transaction => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student' || studentSnap.data().accountApproved !== true) {
        throw Object.assign(new Error('An approved student account is required to submit a placement.'), { status: 403 });
      }
      const student = studentSnap.data();
      if (typeof student.sectionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(student.sectionId)
        || typeof student.department !== 'string' || !student.department.trim()) {
        throw Object.assign(new Error('Your section assignment is required before submitting a placement.'), { status: 409 });
      }
      const sectionRef = adminDb.collection('sections').doc(student.sectionId);
      assertRecordsOpen(student);
      const sectionSnap = await transaction.get(sectionRef);
      if (!sectionSnap.exists || sectionSnap.data().department !== student.department || !sectionSnap.data().coordinatorId) {
        throw Object.assign(new Error('Your assigned coordinator could not be verified.'), { status: 409 });
      }
      const coordinatorId = sectionSnap.data().coordinatorId;
      const [coordinatorSnap, existingSnap, companySnap] = await Promise.all([
        transaction.get(adminDb.collection('users').doc(coordinatorId)),
        proposalId ? transaction.get(proposalRef) : Promise.resolve(null),
        companyRef ? transaction.get(companyRef) : Promise.resolve(null),
      ]);
      if (!coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || coordinatorSnap.data().department !== student.department) {
        throw Object.assign(new Error('Your assigned coordinator could not be verified.'), { status: 409 });
      }

      const existing = existingSnap?.exists ? existingSnap.data() : null;
      if (proposalId && !existing) throw Object.assign(new Error('Placement proposal not found.'), { status: 404 });
      if (existing && (existing.studentId !== req.user.uid || existing.sectionId !== student.sectionId
        || existing.department !== student.department)) {
        throw Object.assign(new Error('Placement proposal not found.'), { status: 404 });
      }
      if (existing && !['draft', 'needs_revision', 'rejected'].includes(existing.status)) {
        throw Object.assign(new Error('This placement proposal can no longer be edited.'), { status: 409 });
      }

      let savedFields = { ...fields, companyId };
      if (companyRef) {
        if (!companySnap?.exists || companySnap.data().active === false || companySnap.data().status === 'inactive') {
          throw Object.assign(new Error('Choose an active company from the directory.'), { status: 400 });
        }
        const company = companySnap.data();
        savedFields = {
          ...savedFields,
          companyName: boundedText(company.name, 'company name', placementProposalFields.companyName),
          companyAddress: boundedText(company.address, 'company address', placementProposalFields.companyAddress),
          companyIndustry: boundedText(company.industry, 'company industry', placementProposalFields.companyIndustry),
          companyEmail: boundedText(company.email, 'company email', placementProposalFields.companyEmail),
          companyPhone: boundedText(company.phone, 'company phone', placementProposalFields.companyPhone),
        };
      }
      if (status === 'pending_review') {
        const required = ['companyName', 'companyAddress', 'supervisorName', 'supervisorEmail', 'internshipRole', 'startDate', 'endDate'];
        if (required.some(field => !savedFields[field])) {
          throw Object.assign(new Error(companyRef
            ? 'The selected company or placement details are incomplete. Contact your coordinator if directory data is missing.'
            : 'Complete the required placement details before submitting.'), { status: companyRef ? 409 : 400 });
        }
        if (companyRef) {
          const company = companySnap.data();
          const capacity = Number(company.capacity);
          if (!Number.isSafeInteger(capacity) || capacity < 1) {
            throw Object.assign(new Error('This company is not accepting placements yet. Ask your coordinator to contact the administrator.'), { status: 409 });
          }
          const stayingAtCompany = student.placementStatus === 'approved' && student.companyId === companyId;
          const assigned = await transaction.get(adminDb.collection('users').where('companyId', '==', companyId));
          const occupied = assigned.docs.filter(item => item.data().role === 'student' && item.data().placementStatus === 'approved').length;
          if (!stayingAtCompany && occupied >= capacity) {
            throw Object.assign(new Error('This company has no internship slots available. Choose another company or contact your coordinator.'), { status: 409 });
          }
        }
      }

      const data = {
        ...savedFields,
        studentId: req.user.uid,
        studentName: placementStudentName(student),
        department: student.department,
        sectionId: student.sectionId,
        coordinatorId,
        status,
        reviewReason: status === 'pending_review' ? '' : (existing?.reviewReason || ''),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        submittedAt: status === 'pending_review' ? now : (existing?.submittedAt || null),
        reviewedBy: null,
        reviewedAt: null,
      };
      transaction.set(proposalRef, data);
      if (status === 'pending_review') {
        const isResubmission = existing && ['needs_revision', 'rejected'].includes(existing.status);
        transaction.set(adminDb.collection('notifications').doc(), {
          recipientId: coordinatorId, senderId: req.user.uid, senderRole: 'student',
          title: 'Company placement request',
          message: `${data.studentName} submitted a company placement for review.`,
          type: 'placement', read: false, createdAt: now,
        });
        writeAuditInTransaction(transaction, {
          actorId: req.user.uid, actorRole: 'student',
          action: isResubmission ? 'placement.resubmitted' : 'placement.submitted',
          targetType: 'companyProposals', targetId: proposalRef.id,
          details: { sectionId: student.sectionId },
        });
      }
      return { id: proposalRef.id, status };
    });
    return res.status(proposalId ? 200 : 201).json({ success: true, ...saved });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not save the company placement proposal.' });
  }
});

app.post('/student/final-reviews', requireUser, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  if (!allowRate(req, res, { limit: 12, windowMs: 60 * 60_000, key: request => `final-review-submission:${request.user.uid}` })) return;
  const { requestId = '' } = req.body || {};
  if (Object.keys(req.body || {}).some(key => key !== 'requestId')
    || (requestId && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(requestId)))) {
    return res.status(400).json({ error: 'Invalid final-review submission.' });
  }

  const studentRef = adminDb.collection('users').doc(req.user.uid);
  const requestRef = requestId ? adminDb.collection('finalReviewRequests').doc(requestId) : adminDb.collection('finalReviewRequests').doc();
  const now = new Date().toISOString();
  try {
    const submitted = await adminDb.runTransaction(async transaction => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student' || studentSnap.data().accountApproved !== true) {
        throw Object.assign(new Error('An approved student account is required for final review.'), { status: 403 });
      }
      const student = studentSnap.data();
      if (student.preDeploymentStatus === 'approved') throw Object.assign(new Error('Final review has already been approved.'), { status: 409 });
      assertRecordsOpen(student);
      if (student.placementStatus !== 'approved' || typeof student.sectionId !== 'string'
        || !/^[A-Za-z0-9_-]{1,120}$/.test(student.sectionId)
        || typeof student.department !== 'string' || !student.department.trim()) {
        throw Object.assign(new Error('An approved company placement and section assignment are required.'), { status: 409 });
      }

      const sectionRef = adminDb.collection('sections').doc(student.sectionId);
      const requirementsRef = sectionRef.collection('requirements');
      const pendingQuery = adminDb.collection('finalReviewRequests').where('studentId', '==', req.user.uid);
      const [sectionSnap, configuredRequirements, pendingRequests, existingSnap] = await Promise.all([
        transaction.get(sectionRef), transaction.get(requirementsRef), transaction.get(pendingQuery),
        requestId ? transaction.get(requestRef) : Promise.resolve(null),
      ]);
      if (!sectionSnap.exists || sectionSnap.data().department !== student.department || !sectionSnap.data().coordinatorId) {
        throw Object.assign(new Error('Your assigned coordinator could not be verified.'), { status: 409 });
      }
      const coordinatorId = sectionSnap.data().coordinatorId;
      const coordinatorSnap = await transaction.get(adminDb.collection('users').doc(coordinatorId));
      if (!coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || coordinatorSnap.data().department !== student.department) {
        throw Object.assign(new Error('Your assigned coordinator could not be verified.'), { status: 409 });
      }

      const existing = existingSnap?.exists ? existingSnap.data() : null;
      if (requestId && !existing) throw Object.assign(new Error('Final review request not found.'), { status: 404 });
      if (existing && (existing.studentId !== req.user.uid || existing.sectionId !== student.sectionId
        || existing.department !== student.department)) {
        throw Object.assign(new Error('Final review request not found.'), { status: 404 });
      }
      if (existing && !['needs_revision', 'rejected'].includes(existing.status)) {
        throw Object.assign(new Error('This final review request cannot be resubmitted.'), { status: 409 });
      }
      if (pendingRequests.docs.some(item => item.id !== requestRef.id && item.data().status === 'pending_review')) {
        throw Object.assign(new Error('A final review request is already awaiting coordinator review.'), { status: 409 });
      }

      const companyProposalId = typeof student.placementProposalId === 'string' ? student.placementProposalId : '';
      if (companyProposalId) {
        if (!/^[A-Za-z0-9_-]{1,120}$/.test(companyProposalId)) {
          throw Object.assign(new Error('The official company placement could not be verified.'), { status: 409 });
        }
        const officialProposalSnap = await transaction.get(adminDb.collection('companyProposals').doc(companyProposalId));
        if (!officialProposalSnap.exists || officialProposalSnap.data().studentId !== req.user.uid
          || officialProposalSnap.data().sectionId !== student.sectionId
          || officialProposalSnap.data().department !== student.department
          || officialProposalSnap.data().status !== 'approved') {
          throw Object.assign(new Error('The official company placement could not be verified.'), { status: 409 });
        }
      }

      const companySnapshot = {
        companyId: snapshotText(student.companyId, 120), companyName: snapshotText(student.company || student.companyName, 160),
        companyAddress: snapshotText(student.companyAddress), companyIndustry: snapshotText(student.companyIndustry, 120),
        companyEmail: snapshotText(student.companyEmail, 254), companyPhone: snapshotText(student.companyPhone, 40),
        supervisorName: snapshotText(student.supervisorName, 160), supervisorPosition: snapshotText(student.supervisorPosition, 120),
        supervisorEmail: snapshotText(student.supervisorEmail, 254), supervisorPhone: snapshotText(student.supervisorPhone, 40),
        internshipRole: snapshotText(student.internshipRole, 160), startDate: snapshotText(student.startDate, 10),
        endDate: snapshotText(student.endDate, 10), workArrangement: snapshotText(student.workArrangement, 80),
        status: 'approved',
      };
      const requiredCompanyFields = ['companyName', 'companyAddress', 'supervisorName', 'supervisorEmail', 'internshipRole', 'startDate', 'endDate'];
      if (requiredCompanyFields.some(field => typeof companySnapshot[field] !== 'string' || !companySnapshot[field].trim())) {
        throw Object.assign(new Error('The approved placement is missing required company or supervisor details.'), { status: 409 });
      }

      const definitions = configuredRequirements.empty
        ? [...defaultRequirementIds].map(id => ({ id, label: id.replace(/_/g, ' '), required: true, category: 'Pre-OJT' }))
        : configuredRequirements.docs.map(item => ({ id: item.id, ...item.data() }));
      if (definitions.length > 100) throw Object.assign(new Error('The section requirement list is too large for final review. Contact your coordinator.'), { status: 409 });
      const preDeploymentRequirements = definitions.filter(item => item.required !== false
        && (!item.category || /pre|deploy/i.test(item.category)));
      const savedRequirements = student.requirements || {};
      const missing = preDeploymentRequirements.filter(item => !['submitted', 'approved'].includes(savedRequirements[item.id]?.status));
      if (missing.length) throw Object.assign(new Error('Complete all required pre-deployment documents before submitting final review.'), { status: 409 });
      const requirementSnapshot = definitions.map(item => ({
        id: snapshotText(item.id, 120), label: snapshotText(item.label || item.id, 160),
        status: snapshotText(savedRequirements[item.id]?.status, 40) || 'not_submitted',
        fileName: typeof savedRequirements[item.id]?.fileName === 'string' ? savedRequirements[item.id].fileName.slice(0, 180) : '',
        submittedAt: typeof savedRequirements[item.id]?.submittedAt === 'string' ? savedRequirements[item.id].submittedAt : '',
      }));

      const data = {
        studentId: req.user.uid, studentName: placementStudentName(student),
        sectionId: student.sectionId, department: student.department,
        coordinatorId, companyProposalId, status: 'pending_review', submittedAt: now, updatedAt: now,
        requirementSnapshot, companySnapshot, reviewReason: '',
        createdAt: existing?.createdAt || now, reviewedBy: null, reviewedAt: null,
      };
      transaction.set(requestRef, data);
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: coordinatorId, senderId: req.user.uid, senderRole: 'student',
        title: existing ? 'Final review resubmitted' : 'Final review submitted',
        message: `${placementStudentName(student)} submitted a pre-deployment package for review.`,
        type: 'review', read: false, createdAt: now,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.user.uid, actorRole: 'student',
        action: existing ? 'final_review.resubmitted' : 'final_review.submitted',
        targetType: 'finalReviewRequests', targetId: requestRef.id,
        details: { sectionId: student.sectionId },
      });
      return { requestId: requestRef.id, status: 'pending_review', submittedAt: now };
    });
    return res.status(requestId ? 200 : 201).json({ success: true, ...submitted });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not submit the final review package.' });
  }
});

app.post('/coordinator/final-reviews/:requestId/decision', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator approval is required.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `final-review:${request.staff.uid}` })) return;
  const { status, reason = '' } = req.body || {};
  const note = typeof reason === 'string' ? reason.trim().slice(0, 2000) : '';
  if (!['approved', 'needs_revision', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid decision.' });
  if (status !== 'approved' && !note) return res.status(400).json({ error: 'A reason is required for this decision.' });
  try {
    const requestRef = adminDb.collection('finalReviewRequests').doc(req.params.requestId);
    const now = new Date().toISOString();
    let studentId;
    await adminDb.runTransaction(async transaction => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw Object.assign(new Error('Final review request not found.'), { status: 404 });
      const review = requestSnap.data();
      const studentRef = adminDb.collection('users').doc(review.studentId);
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      if (review.sectionId !== studentSnap.data().sectionId || review.department !== studentSnap.data().department) {
        throw Object.assign(new Error('The submitted review assignment no longer matches the student profile.'), { status: 409 });
      }
      if (req.staff.role === 'coordinator' && !(await coordinatorOwnsStudent(req.staff.uid, studentSnap.data()))) {
        throw Object.assign(new Error('You cannot review a student outside your assigned section.'), { status: 403 });
      }
      if (review.status !== 'pending_review') throw Object.assign(new Error('This request has already been reviewed.'), { status: 409 });
      assertRecordsOpen(studentSnap.data());
      if (status === 'approved') {
        if (studentSnap.data().accountApproved !== true) throw Object.assign(new Error('The student account must be approved before final approval.'), { status: 409 });
        const student = studentSnap.data();
        if (student.placementStatus !== 'approved') throw Object.assign(new Error('The official company placement must be approved first.'), { status: 409 });
        if ((review.companyProposalId && review.companyProposalId !== student.placementProposalId)
          || (review.companySnapshot?.companyId && review.companySnapshot.companyId !== student.companyId)) {
          throw Object.assign(new Error('The placement changed after this review was submitted. Ask the student to submit a new final review.'), { status: 409 });
        }
        const requirementsRef = adminDb.collection('sections').doc(studentSnap.data().sectionId).collection('requirements');
        const configuredRequirements = await transaction.get(requirementsRef);
        const requiredIds = configuredRequirements.empty
          ? ['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa']
          : configuredRequirements.docs
            .filter(item => item.data().required !== false && (!item.data().category || /pre|deploy/i.test(item.data().category)))
            .map(item => item.id);
        const submissions = student.requirements || {};
        const missing = requiredIds.filter(id => submissions[id]?.status !== 'approved');
        if (missing.length) throw Object.assign(new Error('Required student documents are still missing or incomplete.'), { status: 409 });
      }
      studentId = review.studentId;
      transaction.update(requestRef, { status, reviewReason: note, reviewedBy: req.staff.uid, reviewedAt: now, updatedAt: now });
      if (status === 'approved') transaction.update(studentRef, { preDeploymentStatus: 'approved' });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: studentId,
        senderId: req.staff.uid,
        senderRole: req.staff.role,
        title: `Final review ${status === 'needs_revision' ? 'needs changes' : status}`,
        message: status === 'approved' ? 'Your final review was approved.' : note,
        type: 'review', read: false, createdAt: now,
      });
    });
    return res.json({ success: true, status, studentId });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not record final-review decision.' });
  }
});

app.post('/coordinator/students/:studentId/logbook/:entryId/decision', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 60, windowMs: 60 * 60_000, key: request => `logbook-review:${request.staff.uid}` })) return;
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid logbook decision.' });
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(req.params.entryId)) return res.status(400).json({ error: 'Invalid logbook entry.' });
  const studentRef = adminDb.collection('users').doc(req.params.studentId);
  const coordinatorRef = adminDb.collection('users').doc(req.staff.uid);
  const entryRef = studentRef.collection('logbook').doc(req.params.entryId);
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const [studentSnap, coordinatorSnap] = await Promise.all([transaction.get(studentRef), transaction.get(coordinatorRef)]);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = studentSnap.data();
      if (!coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || coordinatorSnap.data().department !== student.department || !student.sectionId) {
        throw Object.assign(new Error('You can only review students in your assigned sections.'), { status: 403 });
      }
      const sectionSnap = await transaction.get(adminDb.collection('sections').doc(student.sectionId));
      if (!sectionSnap.exists || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== coordinatorSnap.data().department) {
        throw Object.assign(new Error('You can only review students in your assigned sections.'), { status: 403 });
      }
      const entrySnap = await transaction.get(entryRef);
      assertRecordsOpen(student);
      if (!entrySnap.exists) throw Object.assign(new Error('Logbook entry not found.'), { status: 404 });
      if (entrySnap.data().status !== 'pending') throw Object.assign(new Error('This entry is no longer awaiting review.'), { status: 409 });
      const reviewReason = status === 'rejected' ? 'Please revise and resubmit this weekly entry.' : '';
      transaction.update(entryRef, { status, reviewedBy: req.staff.uid, reviewedAt: now, reviewReason });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: req.params.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: status === 'approved' ? 'Logbook approved' : 'Logbook rejected',
        message: status === 'approved' ? 'Your logbook entry was approved.' : reviewReason,
        type: 'logbook', read: false, createdAt: now,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'logbook.reviewed',
        targetType: 'logbook', targetId: req.params.entryId,
        details: { studentId: req.params.studentId, sectionId: student.sectionId, status },
      });
    });
    return res.json({ success: true, status });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not process this logbook review.' });
  }
});

app.get('/coordinator/companies', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  try {
    const [companySnapshot, studentSnapshot] = await Promise.all([
      adminDb.collection('companies').get(),
      adminDb.collection('users').where('placementStatus', '==', 'approved').get(),
    ]);
    const occupiedByCompany = new Map();
    studentSnapshot.docs.forEach(snapshot => {
      const student = snapshot.data();
      if (student.role === 'student' && typeof student.companyId === 'string' && student.companyId) {
        occupiedByCompany.set(student.companyId, (occupiedByCompany.get(student.companyId) || 0) + 1);
      }
    });
    const companies = companySnapshot.docs.map(snapshot => {
      const company = snapshot.data();
      const capacity = Number.isSafeInteger(company.capacity) ? company.capacity : null;
      const occupiedSlots = occupiedByCompany.get(snapshot.id) || 0;
      return { id: snapshot.id, name: snapshotText(company.name, 160), address: snapshotText(company.address, 300),
        industry: snapshotText(company.industry, 120), email: snapshotText(company.email, 254), phone: snapshotText(company.phone, 60),
        active: company.active !== false && company.status !== 'inactive', capacity, occupiedSlots,
        availableSlots: capacity === null ? null : Math.max(0, capacity - occupiedSlots) };
    }).filter(company => company.active).sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ companies });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not load companies for placement review.' });
  }
});

app.get('/coordinator/placement-history', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 60, windowMs: 60 * 60_000, key: request => `placement-history:${request.staff.uid}` })) return;
  const sectionId = req.query.sectionId;
  if (typeof sectionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(sectionId)) {
    return res.status(400).json({ error: 'Choose a valid section.' });
  }
  try {
    const [coordinatorSnapshot, sectionSnapshot] = await Promise.all([
      adminDb.collection('users').doc(req.staff.uid).get(),
      adminDb.collection('sections').doc(sectionId).get(),
    ]);
    if (!coordinatorSnapshot.exists || coordinatorSnapshot.data().role !== 'coordinator'
      || !sectionSnapshot.exists || sectionSnapshot.data().coordinatorId !== req.staff.uid
      || sectionSnapshot.data().department !== coordinatorSnapshot.data().department) {
      return res.status(403).json({ error: 'You can only view placement history for your assigned sections.' });
    }
    const snapshot = await adminDb.collection('placementHistory')
      .where('sectionId', '==', sectionId)
      .where('department', '==', coordinatorSnapshot.data().department)
      .get();
    const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return res.json({ history: items });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not load placement history.' });
  }
});

app.post('/coordinator/endorsements/:proposalId/draft', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  res.set('Cache-Control', 'no-store');
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `endorsement-draft:${request.staff.uid}` })) return;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(req.params.proposalId)
    || Object.keys(req.body || {}).length > 0) {
    return res.status(400).json({ error: 'Invalid endorsement draft request.' });
  }

  const proposalId = req.params.proposalId;
  const templateVersion = 'pathway-endorsement-draft-v1';
  const endorsementRef = adminDb.collection('endorsements').doc(proposalId);
  const proposalRef = adminDb.collection('companyProposals').doc(proposalId);
  try {
    const draft = await adminDb.runTransaction(async transaction => {
      const endorsementSnap = await transaction.get(endorsementRef);
      if (!endorsementSnap.exists) throw Object.assign(new Error('Endorsement record not found.'), { status: 404 });
      const endorsement = endorsementSnap.data();
      if (endorsement.status !== 'awaiting_document' || endorsement.proposalId !== proposalId) {
        throw Object.assign(new Error('This placement no longer needs an endorsement draft.'), { status: 409 });
      }
      if (typeof endorsement.studentId !== 'string' || typeof endorsement.sectionId !== 'string') {
        throw Object.assign(new Error('The endorsement record is incomplete.'), { status: 409 });
      }

      const coordinatorRef = adminDb.collection('users').doc(req.staff.uid);
      const studentRef = adminDb.collection('users').doc(endorsement.studentId);
      const sectionRef = adminDb.collection('sections').doc(endorsement.sectionId);
      const [coordinatorSnap, studentSnap, sectionSnap, proposalSnap] = await Promise.all([
        transaction.get(coordinatorRef), transaction.get(studentRef), transaction.get(sectionRef), transaction.get(proposalRef),
      ]);
      if (!coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || !sectionSnap.exists || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== coordinatorSnap.data().department
        || endorsement.department !== coordinatorSnap.data().department) {
        throw Object.assign(new Error('You can only prepare letters for your assigned sections.'), { status: 403 });
      }
      assertRecordsOpen(studentSnap.data());
      if (!studentSnap.exists || studentSnap.data().role !== 'student' || studentSnap.data().accountApproved !== true
        || studentSnap.data().placementStatus !== 'approved' || studentSnap.data().placementProposalId !== proposalId
        || studentSnap.data().companyId !== endorsement.companyId
        || !proposalSnap.exists || proposalSnap.data().status !== 'approved'
        || proposalSnap.data().studentId !== endorsement.studentId
        || proposalSnap.data().sectionId !== endorsement.sectionId
        || proposalSnap.data().department !== endorsement.department
        || proposalSnap.data().companyId !== endorsement.companyId
        || proposalSnap.data().companyName !== endorsement.companyName) {
        throw Object.assign(new Error('The approved placement has changed. Refresh the placement queue before preparing a draft.'), { status: 409 });
      }

      const requiredFields = ['studentName', 'companyName', 'companyAddress', 'supervisorName', 'internshipRole', 'startDate', 'endDate'];
      if (requiredFields.some(field => typeof endorsement[field] !== 'string' || !endorsement[field].trim())) {
        throw Object.assign(new Error('The approved placement is missing information required for the letter.'), { status: 409 });
      }

      const preparedAt = new Date().toISOString();
      const currentVersion = Number.isSafeInteger(endorsement.draftVersion) && endorsement.draftVersion > 0
        ? endorsement.draftVersion : 0;
      const draftVersion = currentVersion + 1;
      const coordinator = coordinatorSnap.data();
      const coordinatorName = placementStudentName(coordinator);
      const draftSnapshot = {
        studentName: endorsement.studentName, department: endorsement.department,
        sectionName: snapshotText(sectionSnap.data().name, 160), companyName: endorsement.companyName,
        companyAddress: endorsement.companyAddress, supervisorName: endorsement.supervisorName,
        internshipRole: endorsement.internshipRole, startDate: endorsement.startDate, endDate: endorsement.endDate,
      };
      transaction.update(endorsementRef, {
        draftStatus: 'prepared', draftPreparedAt: preparedAt,
        draftPreparedBy: req.staff.uid, draftPreparedByName: coordinatorName,
        draftVersion, draftTemplateVersion: templateVersion, draftSnapshot,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'endorsement.draft_prepared',
        targetType: 'endorsements', targetId: proposalId,
        details: { studentId: endorsement.studentId, sectionId: endorsement.sectionId, draftVersion, templateVersion },
      });

      return {
        proposalId, draftVersion, templateVersion, preparedAt, preparedBy: coordinatorName, ...draftSnapshot,
      };
    });
    return res.json({ success: true, draft });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not prepare the endorsement draft.' });
  }
});

// The draft is not an issued letter. Only the coordinator-verified private
// upload for the student's *current* placement can be mailed externally.
app.post('/coordinator/endorsements/:proposalId/send', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 10, windowMs: 60 * 60_000, key: request => `endorsement-send:${request.staff.uid}` })) return;
  const proposalId = req.params.proposalId;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(proposalId) || Object.keys(req.body || {}).length) {
    return res.status(400).json({ error: 'Invalid endorsement delivery request.' });
  }
  const endorsementRef = adminDb.collection('endorsements').doc(proposalId);
  const mailer = endorsementMailer();
  try {
    const endorsementSnap = await endorsementRef.get();
    if (!endorsementSnap.exists) return res.status(404).json({ error: 'Endorsement not found.' });
    const endorsement = endorsementSnap.data();
    const studentRef = adminDb.collection('users').doc(endorsement.studentId);
    const proposalRef = adminDb.collection('companyProposals').doc(proposalId);
    const [studentSnap, proposalSnap] = await Promise.all([studentRef.get(), proposalRef.get()]);
    const student = studentSnap.exists ? studentSnap.data() : null;
    if (!student || student.role !== 'student') return res.status(404).json({ error: 'Student not found.' });
    if (!(await coordinatorOwnsStudent(req.staff.uid, student))
      || endorsement.sectionId !== student.sectionId || endorsement.department !== student.department) {
      return res.status(403).json({ error: 'You can only deliver endorsements for students in your assigned sections.' });
    }
    const proposal = proposalSnap.exists ? proposalSnap.data() : null;
    const signedCopy = student.requirements?.endorsement_letter;
    const currentPlacement = proposal?.status === 'approved' && proposal.studentId === endorsement.studentId
      && proposal.sectionId === student.sectionId && proposal.department === student.department
      && proposal.companyId === endorsement.companyId && student.companyId === endorsement.companyId
      && student.placementProposalId === proposalId && student.endorsementId === proposalId
      && student.placementStatus === 'approved' && endorsement.proposalId === proposalId
      && endorsement.status === 'signed_copy_verified';
    const privateSignedCopy = signedCopy?.status === 'approved'
      && signedCopy.placementProposalId === proposalId
      && signedCopy.reviewedAt === endorsement.signedCopyVerifiedAt
      && signedCopy.cloudinaryDeliveryType === 'authenticated'
      && typeof signedCopy.cloudinaryAssetId === 'string'
      && /^[A-Za-z0-9_-]{16,80}$/.test(signedCopy.cloudinaryAssetId)
      && Number.isSafeInteger(signedCopy.uploadedBytes) && signedCopy.uploadedBytes > 0
      && signedCopy.uploadedBytes <= MAX_UPLOAD_BYTES;
    if (!currentPlacement || !privateSignedCopy) {
      return res.status(409).json({ error: 'The current placement needs a coordinator-verified private signed endorsement copy before email delivery.' });
    }
    const authStudent = await adminAuth.getUser(endorsement.studentId);
    const studentEmail = authStudent.email?.trim() || '';
    const companyEmail = endorsement.companyEmail?.trim() || '';
    if (!validEmail(studentEmail) || !validEmail(companyEmail)
      || studentEmail.toLowerCase() === companyEmail.toLowerCase()
      || studentEmail.toLowerCase() !== String(student.email || '').trim().toLowerCase()
      || companyEmail.toLowerCase() !== String(student.companyEmail || '').trim().toLowerCase()) {
      return res.status(409).json({ error: 'Confirm the student and official company email addresses before delivery.' });
    }
    if (!mailer || !cloudinaryConfig()) {
      return res.status(503).json({ error: 'Email or protected document delivery is not configured on the backend.' });
    }
    if (endorsement.deliveryStatus === 'sent' || endorsement.deliveryStatus === 'sending') {
      return res.status(409).json({ error: endorsement.deliveryStatus === 'sent'
        ? 'This signed copy has already been sent to both recipients.'
        : 'A delivery is in progress or needs reconciliation. Check the mail provider and delivery record before retrying.' });
    }
    const fileName = String(signedCopy.fileName || 'signed-endorsement.pdf').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 160);
    const bytes = await fetchCloudinaryAssetDownload({
      ...cloudinaryConfig(), assetId: signedCopy.cloudinaryAssetId, fileName,
    });
    if (bytes.length !== signedCopy.uploadedBytes) {
      return res.status(502).json({ error: 'The protected signed copy did not match its verified upload size.' });
    }

    const attemptId = crypto.randomUUID();
    const now = new Date().toISOString();
    const reserved = await adminDb.runTransaction(async transaction => {
      const [freshEndorsementSnap, freshStudentSnap, freshProposalSnap, sectionSnap] = await Promise.all([
        transaction.get(endorsementRef), transaction.get(studentRef), transaction.get(proposalRef),
        transaction.get(adminDb.collection('sections').doc(student.sectionId)),
      ]);
      const fresh = freshEndorsementSnap.data();
      const freshStudent = freshStudentSnap.data();
      assertRecordsOpen(freshStudent);
      const freshProposal = freshProposalSnap.data();
      if (!fresh || !freshStudent || !freshProposal || !sectionSnap.exists
        || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== req.staff.data.department
        || freshStudent.sectionId !== student.sectionId || freshStudent.department !== student.department
        || String(freshStudent.email || '').trim().toLowerCase() !== studentEmail.toLowerCase()
        || String(freshStudent.companyEmail || '').trim().toLowerCase() !== companyEmail.toLowerCase()
        || freshStudent.placementProposalId !== proposalId || freshStudent.endorsementId !== proposalId
        || freshStudent.placementStatus !== 'approved' || freshStudent.companyId !== endorsement.companyId
        || freshProposal.status !== 'approved' || freshProposal.studentId !== endorsement.studentId
        || freshProposal.companyId !== endorsement.companyId
        || freshProposal.sectionId !== student.sectionId || freshProposal.department !== student.department
        || fresh.sectionId !== student.sectionId || fresh.department !== student.department
        || fresh.companyId !== endorsement.companyId
        || fresh.status !== 'signed_copy_verified' || fresh.signedCopyVerifiedAt !== signedCopy.reviewedAt
        || freshStudent.requirements?.endorsement_letter?.status !== 'approved'
        || freshStudent.requirements.endorsement_letter.cloudinaryDeliveryType !== 'authenticated'
        || freshStudent.requirements.endorsement_letter.placementProposalId !== proposalId
        || freshStudent.requirements.endorsement_letter.cloudinaryAssetId !== signedCopy.cloudinaryAssetId
        || freshStudent.requirements.endorsement_letter.uploadedBytes !== bytes.length
        || fresh.companyEmail !== companyEmail) {
        throw Object.assign(new Error('The placement or verified signed copy changed. Refresh before sending.'), { status: 409 });
      }
      if (!['not_sent', 'failed', 'partial_failed'].includes(fresh.deliveryStatus)) {
        throw Object.assign(new Error('This delivery was already sent or is awaiting reconciliation.'), { status: 409 });
      }
      const previous = fresh.deliveryRecipients || {};
      const addresses = { student: studentEmail, company: companyEmail };
      const recipients = {};
      for (const kind of ['student', 'company']) {
        const prior = previous[kind];
        if (prior && prior.email !== addresses[kind]) {
          throw Object.assign(new Error('A recipient address changed after an attempt. Reconcile the delivery before retrying.'), { status: 409 });
        }
        if (fresh.deliveryStatus !== 'not_sent' && !prior) {
          throw Object.assign(new Error('The prior delivery record is incomplete. Reconcile it before retrying.'), { status: 409 });
        }
        if (prior?.status === 'sent') { recipients[kind] = prior; continue; }
        if (prior && prior.status !== 'failed') {
          throw Object.assign(new Error('The prior delivery outcome is uncertain. Reconcile it before retrying.'), { status: 409 });
        }
        recipients[kind] = {
          email: addresses[kind], status: 'pending',
          messageId: `<endorsement-${proposalId}-${attemptId}-${kind}@${mailer.from.split('@')[1]}>`,
          attemptId,
        };
      }
      if (!Object.values(recipients).some(recipient => recipient.status === 'pending')) {
        throw Object.assign(new Error('Both recipients have already received this letter.'), { status: 409 });
      }
      transaction.update(endorsementRef, {
        deliveryStatus: 'sending', deliveryRecipients: recipients,
        deliveryAttemptId: attemptId, deliveryAttemptedAt: now, deliveryAttemptedBy: req.staff.uid,
        signedCopyAssetId: signedCopy.cloudinaryAssetId,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'endorsement.delivery_started',
        targetType: 'endorsements', targetId: proposalId,
        details: { studentId: endorsement.studentId, sectionId: student.sectionId, attemptId,
          recipientKinds: Object.entries(recipients).filter(([, value]) => value.status === 'pending').map(([kind]) => kind) },
      });
      return recipients;
    });

    for (const kind of ['student', 'company']) {
      const recipient = reserved[kind];
      if (recipient.status !== 'pending') continue;
      let sentMessageId = recipient.messageId;
      let accepted = false;
      try {
        sentMessageId = await sendEndorsement({
          mailer, to: recipient.email, studentName: endorsement.studentName || 'the student',
          companyName: endorsement.companyName, fileName, bytes, messageId: recipient.messageId,
        });
        accepted = true;
      } catch (mailError) {
        console.error('Endorsement SMTP delivery failed:', mailError.code || mailError.name || 'unknown');
      }
      const recordedAt = new Date().toISOString();
      await adminDb.runTransaction(async transaction => {
        const snapshot = await transaction.get(endorsementRef);
        const current = snapshot.data();
        if (!current || current.deliveryStatus !== 'sending' || current.deliveryAttemptId !== attemptId
          || current.deliveryRecipients?.[kind]?.status !== 'pending') {
          throw Object.assign(new Error('The delivery outcome could not be recorded. Reconcile with the mail provider.'), { status: 409 });
        }
        const recipients = { ...current.deliveryRecipients, [kind]: {
          ...current.deliveryRecipients[kind], status: accepted ? 'sent' : 'failed',
          ...(accepted ? { sentAt: recordedAt, messageId: sentMessageId } : { failedAt: recordedAt }),
        } };
        transaction.update(endorsementRef, { deliveryRecipients: recipients });
        if (accepted && kind === 'student') transaction.set(adminDb.collection('notifications').doc(), {
          recipientId: endorsement.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
          title: 'Signed endorsement sent', message: 'Your verified signed endorsement copy was emailed to you.',
          type: 'endorsement', read: false, createdAt: recordedAt,
        });
        writeAuditInTransaction(transaction, {
          actorId: req.staff.uid, actorRole: 'coordinator',
          action: accepted ? 'endorsement.email_accepted' : 'endorsement.email_failed',
          targetType: 'endorsements', targetId: proposalId,
          details: { studentId: endorsement.studentId, sectionId: student.sectionId, attemptId, recipientKind: kind },
        });
      });
    }
    const deliveryStatus = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(endorsementRef);
      const current = snapshot.data();
      if (!current || current.deliveryStatus !== 'sending' || current.deliveryAttemptId !== attemptId) {
        throw Object.assign(new Error('Delivery status needs reconciliation.'), { status: 409 });
      }
      const statuses = ['student', 'company'].map(kind => current.deliveryRecipients?.[kind]?.status);
      if (statuses.some(status => !['sent', 'failed'].includes(status))) {
        throw Object.assign(new Error('Delivery status needs reconciliation.'), { status: 409 });
      }
      const status = statuses.every(value => value === 'sent') ? 'sent'
        : statuses.some(value => value === 'sent') ? 'partial_failed' : 'failed';
      transaction.update(endorsementRef, {
        deliveryStatus: status,
        ...(status === 'sent' ? { emailAcceptedAt: new Date().toISOString() } : {}),
      });
      return status;
    });
    return res.status(deliveryStatus === 'sent' ? 200 : 502).json({
      success: deliveryStatus === 'sent', deliveryStatus,
      ...(deliveryStatus !== 'sent' ? { error: 'Some recipients were not accepted by the email server. Review the status and retry failed recipients only.' } : {}),
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Endorsement delivery failed:', error.code || error.name || 'unknown');
    return res.status(502).json({ error: 'Endorsement delivery could not finish. Check the delivery record before retrying.' });
  }
});

app.post('/coordinator/company-placements/:proposalId/decision', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 40, windowMs: 60 * 60_000, key: request => `placement-review:${request.staff.uid}` })) return;
  const { status, reason = '' } = req.body || {};
  const requestedCompanyId = req.body?.companyId;
  if (requestedCompanyId !== undefined && (typeof requestedCompanyId !== 'string'
    || !/^[A-Za-z0-9_-]{1,120}$/.test(requestedCompanyId))) {
    return res.status(400).json({ error: 'Choose a valid company directory entry.' });
  }
  const note = typeof reason === 'string' ? reason.trim().slice(0, 2000) : '';
  if (!['approved', 'needs_revision', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid placement decision.' });
  if (status !== 'approved' && !note) return res.status(400).json({ error: 'A reason is required for this decision.' });
  const proposalRef = adminDb.collection('companyProposals').doc(req.params.proposalId);
  const coordinatorRef = adminDb.collection('users').doc(req.staff.uid);
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const proposalSnap = await transaction.get(proposalRef);
      if (!proposalSnap.exists) throw Object.assign(new Error('Placement proposal not found.'), { status: 404 });
      const proposal = proposalSnap.data();
      const studentRef = adminDb.collection('users').doc(proposal.studentId);
      const [studentSnap, coordinatorSnap] = await Promise.all([transaction.get(studentRef), transaction.get(coordinatorRef)]);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = studentSnap.data();
      if (!coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || coordinatorSnap.data().department !== student.department || !student.sectionId
        || proposal.sectionId !== student.sectionId || proposal.department !== student.department) {
        throw Object.assign(new Error('You can only review placement proposals from your assigned sections.'), { status: 403 });
      }
      const sectionSnap = await transaction.get(adminDb.collection('sections').doc(student.sectionId));
      if (!sectionSnap.exists || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== coordinatorSnap.data().department) {
        throw Object.assign(new Error('You can only review placement proposals from your assigned sections.'), { status: 403 });
      }
      if (proposal.status !== 'pending_review') throw Object.assign(new Error('This placement proposal has already been reviewed.'), { status: 409 });
      assertRecordsOpen(student);
      const decisionFields = { status, reviewReason: note, reviewedBy: req.staff.uid, reviewedAt: now, updatedAt: now };
      let needsFreshFinalReview = false;
      if (status === 'approved') {
        const companyId = requestedCompanyId || proposal.companyId;
        if (!companyId) throw Object.assign(new Error('Map this proposal to an active company directory entry before approval.'), { status: 409 });
        const companyRef = adminDb.collection('companies').doc(companyId);
        const currentCompanyId = student.placementStatus === 'approved' && typeof student.companyId === 'string'
          ? student.companyId : '';
        const currentCompanyRef = currentCompanyId && currentCompanyId !== companyId
          ? adminDb.collection('companies').doc(currentCompanyId) : null;
        const [companySnap, currentCompanySnap] = await Promise.all([
          transaction.get(companyRef),
          currentCompanyRef ? transaction.get(currentCompanyRef) : Promise.resolve(null),
        ]);
        if (!companySnap.exists || companySnap.data().active === false || companySnap.data().status === 'inactive') {
          throw Object.assign(new Error('The selected company is not active in the company directory.'), { status: 409 });
        }
        const company = companySnap.data();
        const capacity = Number(company.capacity);
        if (!Number.isSafeInteger(capacity) || capacity < 1) {
          throw Object.assign(new Error('Set a valid company capacity before approving this placement.'), { status: 409 });
        }
        const targetAssignments = await transaction.get(adminDb.collection('users').where('companyId', '==', companyId));
        const targetOccupied = targetAssignments.docs.filter(item => item.data().role === 'student' && item.data().placementStatus === 'approved').length;
        const alreadyAtCompany = currentCompanyId === companyId;
        if (!alreadyAtCompany && targetOccupied >= capacity) {
          throw Object.assign(new Error('This company has no internship slots available.'), { status: 409 });
        }

        // A new approval starts a new endorsement preparation record. Preserve
        // the prior record for audit, but do not leave old pending paperwork in
        // the coordinator's active queue after a placement change.
        const priorEndorsementId = typeof student.endorsementId === 'string' ? student.endorsementId : '';
        const priorEndorsementRef = priorEndorsementId && /^[A-Za-z0-9_-]{1,120}$/.test(priorEndorsementId)
          && priorEndorsementId !== proposalRef.id ? adminDb.collection('endorsements').doc(priorEndorsementId) : null;
        const priorEndorsementSnap = priorEndorsementRef ? await transaction.get(priorEndorsementRef) : null;
        if (priorEndorsementSnap?.data()?.deliveryStatus === 'sending') {
          throw Object.assign(new Error('The previous placement has an endorsement email attempt in progress or awaiting reconciliation. Resolve it before changing the official assignment.'), { status: 409 });
        }
        const replacingApprovedPlacement = student.placementStatus === 'approved'
          && student.placementProposalId !== proposalRef.id;
        const priorReviewSnaps = replacingApprovedPlacement
          ? await transaction.get(adminDb.collection('finalReviewRequests').where('studentId', '==', proposal.studentId))
          : null;
        if (priorReviewSnaps && priorReviewSnaps.size > 100) {
          throw Object.assign(new Error('Too many prior final reviews to update safely. Contact the administrator.'), { status: 409 });
        }
        const staleReviews = priorReviewSnaps?.docs.filter(item =>
          ['pending_review', 'approved'].includes(item.data().status)
          && item.data().companyProposalId !== proposalRef.id) || [];
        needsFreshFinalReview = replacingApprovedPlacement
          && (student.preDeploymentStatus === 'approved' || staleReviews.length > 0);

        const oldCompanyUpdates = [];
        if (currentCompanyRef && currentCompanySnap?.exists) {
          const oldCompany = currentCompanySnap.data();
          const oldAssignments = await transaction.get(adminDb.collection('users').where('companyId', '==', currentCompanyId));
          let oldOccupied = oldAssignments.docs.filter(item => item.data().role === 'student' && item.data().placementStatus === 'approved').length;
          oldOccupied = Math.max(0, oldOccupied - 1);
          const oldCapacity = Number(oldCompany.capacity);
          oldCompanyUpdates.push({ ref: currentCompanyRef, occupiedSlots: oldOccupied,
            ...(Number.isSafeInteger(oldCapacity) ? { availableSlots: Math.max(0, oldCapacity - oldOccupied) } : {}) });
        }

        const placementFields = [
          'supervisorName', 'supervisorPosition', 'supervisorEmail', 'supervisorPhone', 'internshipRole',
          'startDate', 'endDate', 'workArrangement',
        ];
        const updates = Object.fromEntries(placementFields.map(field => [field,
          typeof proposal[field] === 'string' ? proposal[field].slice(0, 500) : '',
        ]));
        Object.assign(updates, {
          company: snapshotText(company.name, 160), companyId,
          companyAddress: snapshotText(company.address, 300),
          companyIndustry: snapshotText(company.industry, 120),
          companyEmail: snapshotText(company.email, 254), companyPhone: snapshotText(company.phone, 60),
        });
        updates.placementStatus = 'approved';
        updates.placementProposalId = proposalRef.id;
        updates.endorsementId = proposalRef.id;
        if (needsFreshFinalReview) updates.preDeploymentStatus = 'needs_revision';
        if (replacingApprovedPlacement) {
          // Endorsement and MOA documents refer to a specific host company.
          // Preserve the previous file metadata for review, but require a new
          // upload and coordinator approval before the next final review.
          for (const requirementId of ['endorsement_letter', 'signed_moa']) {
            if (['approved', 'submitted'].includes(student.requirements?.[requirementId]?.status)) {
              updates[`requirements.${requirementId}.status`] = 'needs_revision';
              updates[`requirements.${requirementId}.invalidatedByPlacementProposalId`] = proposalRef.id;
              updates.requirementsStatus = 'needs_revision';
            }
          }
        }
        transaction.update(studentRef, updates);
        const nextOccupied = alreadyAtCompany ? targetOccupied : targetOccupied + 1;
        transaction.update(companyRef, {
          occupiedSlots: nextOccupied, availableSlots: Math.max(0, capacity - nextOccupied), updatedAt: now,
        });
        oldCompanyUpdates.forEach(update => transaction.update(update.ref, {
          occupiedSlots: update.occupiedSlots,
          ...(Number.isSafeInteger(update.availableSlots) ? { availableSlots: update.availableSlots } : {}),
          updatedAt: now,
        }));

        Object.assign(decisionFields, {
          companyId,
          companyName: updates.company,
          companyAddress: updates.companyAddress,
          companyIndustry: updates.companyIndustry,
          companyEmail: updates.companyEmail,
          companyPhone: updates.companyPhone,
        });
        if (priorEndorsementSnap?.exists && priorEndorsementSnap.data().studentId === proposal.studentId
          && ['awaiting_document', 'signed_copy_verified'].includes(priorEndorsementSnap.data().status)) {
          transaction.update(priorEndorsementRef, {
            priorStatus: priorEndorsementSnap.data().status, status: 'superseded',
            supersededAt: now, supersededByProposalId: proposalRef.id,
          });
        }
        transaction.create(adminDb.collection('endorsements').doc(proposalRef.id), {
          studentId: proposal.studentId, studentName: placementStudentName(student),
          department: student.department, sectionId: student.sectionId,
          coordinatorId: req.staff.uid, proposalId: proposalRef.id,
          companyId, companyName: updates.company, companyAddress: updates.companyAddress,
          companyEmail: updates.companyEmail, supervisorName: updates.supervisorName,
          supervisorEmail: updates.supervisorEmail, internshipRole: updates.internshipRole,
          startDate: updates.startDate, endDate: updates.endDate,
          status: 'awaiting_document', deliveryStatus: 'not_sent', createdAt: now,
        });
        staleReviews.forEach(item => transaction.update(item.ref, {
          priorStatus: item.data().status, status: 'superseded', updatedAt: now,
          supersededAt: now, supersededByProposalId: proposalRef.id,
        }));
        const historyRef = adminDb.collection('placementHistory').doc();
        transaction.create(historyRef, {
          studentId: proposal.studentId, studentName: placementStudentName(student),
          department: student.department, sectionId: student.sectionId,
          proposalId: proposalRef.id, coordinatorId: req.staff.uid, status: 'approved', createdAt: now,
          before: {
            companyId: snapshotText(student.companyId, 120), companyName: snapshotText(student.company || student.companyName, 160),
            companyAddress: snapshotText(student.companyAddress, 300), companyIndustry: snapshotText(student.companyIndustry, 120),
            companyEmail: snapshotText(student.companyEmail, 254), companyPhone: snapshotText(student.companyPhone, 60),
            supervisorName: snapshotText(student.supervisorName, 160), supervisorPosition: snapshotText(student.supervisorPosition, 120),
            supervisorEmail: snapshotText(student.supervisorEmail, 254), supervisorPhone: snapshotText(student.supervisorPhone, 60),
            internshipRole: snapshotText(student.internshipRole, 160), workArrangement: snapshotText(student.workArrangement, 80),
            startDate: snapshotText(student.startDate, 30), endDate: snapshotText(student.endDate, 30),
          },
          after: {
            companyId, companyName: updates.company, companyAddress: updates.companyAddress,
            companyIndustry: updates.companyIndustry, companyEmail: updates.companyEmail, companyPhone: updates.companyPhone,
            supervisorName: updates.supervisorName, supervisorPosition: updates.supervisorPosition,
            supervisorEmail: updates.supervisorEmail, supervisorPhone: updates.supervisorPhone,
            internshipRole: updates.internshipRole, workArrangement: updates.workArrangement,
            startDate: updates.startDate, endDate: updates.endDate,
          },
        });
      }
      transaction.update(proposalRef, decisionFields);
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: proposal.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: `Company placement ${status === 'needs_revision' ? 'needs changes' : status}`,
        message: status === 'approved'
          ? `Your company placement was approved. Endorsement paperwork is pending preparation; no letter has been issued or emailed yet.${needsFreshFinalReview ? ' Your previous final review was superseded. Update the endorsement letter and signed MOA, then submit a new review for this placement.' : ''}`
          : note,
        type: 'placement', read: false, createdAt: now,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'placement.reviewed',
        targetType: 'companyProposals', targetId: proposalRef.id,
        details: { studentId: proposal.studentId, sectionId: student.sectionId, status,
          ...(decisionFields.companyId ? { companyId: decisionFields.companyId } : {}),
          ...(needsFreshFinalReview ? { finalReviewReset: true } : {}) },
      });
    });
    return res.json({ success: true, status });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not process this placement review.' });
  }
});

app.post('/coordinator/student-roster', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `roster:${request.staff.uid}` })) return;
  const { idNumbers } = req.body || {};
  if (!Array.isArray(idNumbers) || idNumbers.length < 1 || idNumbers.length > 250
    || idNumbers.some(id => typeof id !== 'string' || !/^[A-Za-z0-9-]{4,20}$/.test(id.trim()))) {
    return res.status(400).json({ error: 'Provide 1–250 valid student IDs.' });
  }
  const ids = [...new Set(idNumbers.map(id => id.trim()))];
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const refs = ids.map(id => adminDb.collection('studentRoster').doc(id));
      const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
      for (let index = 0; index < snapshots.length; index += 1) {
        const snapshot = snapshots[index];
        const id = ids[index];
        if (snapshot.exists && snapshot.data().department !== req.staff.data.department) {
          throw Object.assign(new Error(`Student ID ${id} is already owned by another department.`), { status: 409 });
        }
        if (snapshot.exists && snapshot.data().claimedBy) {
          throw Object.assign(new Error(`Student ID ${id} is already claimed by a registered account.`), { status: 409 });
        }
      }
      refs.forEach((ref, index) => {
        const snapshot = snapshots[index];
        transaction.set(ref, {
          idNumber: ids[index], department: req.staff.data.department, active: true,
          ...(snapshot.exists ? { updatedBy: req.staff.uid, updatedAt: now } : { createdBy: req.staff.uid, createdAt: now }),
        }, { merge: true });
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'roster.updated',
        targetType: 'studentRoster', targetId: null,
        details: { operation: 'activate', count: ids.length, department: req.staff.data.department },
      });
    });
    return res.json({ success: true, count: ids.length });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not update the authorized roster.' });
  }
});

app.delete('/coordinator/student-roster/:studentId', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 60, windowMs: 60 * 60_000, key: request => `roster:${request.staff.uid}` })) return;
  const studentId = req.params.studentId;
  if (!/^[A-Za-z0-9-]{4,20}$/.test(studentId)) return res.status(400).json({ error: 'Invalid student ID.' });
  const rosterRef = adminDb.collection('studentRoster').doc(studentId);
  try {
    await adminDb.runTransaction(async transaction => {
      const rosterSnap = await transaction.get(rosterRef);
      if (!rosterSnap.exists) throw Object.assign(new Error('Student ID was not found.'), { status: 404 });
      if (rosterSnap.data().department !== req.staff.data.department) throw Object.assign(new Error('You cannot change a roster from another department.'), { status: 403 });
      if (rosterSnap.data().active !== true) throw Object.assign(new Error('This student ID is already inactive.'), { status: 409 });
      const now = new Date().toISOString();
      transaction.update(rosterRef, { active: false, updatedBy: req.staff.uid, updatedAt: now });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'roster.updated',
        targetType: 'studentRoster', targetId: studentId, details: { operation: 'deactivate' },
      });
    });
    return res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not update the authorized roster.' });
  }
});

app.post('/coordinator/assign-student', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 40, windowMs: 60 * 60_000, key: request => `assignment:${request.staff.uid}` })) return;
  const { studentId, sectionId } = req.body || {};
  if (typeof studentId !== 'string' || typeof sectionId !== 'string') return res.status(400).json({ error: 'Student and section are required.' });
  try {
    const sectionRef = adminDb.collection('sections').doc(sectionId);
    const studentRef = adminDb.collection('users').doc(studentId);
    const now = new Date().toISOString();
    await adminDb.runTransaction(async transaction => {
      const [sectionSnap, studentSnap] = await Promise.all([transaction.get(sectionRef), transaction.get(studentRef)]);
      if (!sectionSnap.exists || sectionSnap.data().coordinatorId !== req.staff.uid) throw Object.assign(new Error('You can only assign students to your sections.'), { status: 403 });
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = studentSnap.data();
      if (student.department !== sectionSnap.data().department || student.sectionId) throw Object.assign(new Error('Student must be unassigned and belong to this department.'), { status: 409 });
      assertRecordsOpen(student);
      const hoursRequired = Number(sectionSnap.data().hoursRequired);
      if (!Number.isFinite(hoursRequired) || hoursRequired <= 0) throw Object.assign(new Error('Section has an invalid required-hours setting.'), { status: 409 });
      transaction.update(studentRef, { sectionId, hoursRequired });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: 'Section assignment updated', message: `You have been assigned to ${sectionSnap.data().name || 'your OJT section'}.`,
        type: 'registration', read: false, createdAt: now,
      });
    });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'student.assigned', targetType: 'users', targetId: studentId, details: { sectionId } });
    return res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not assign student.' });
  }
});

app.post('/coordinator/registrations/:studentId/decision', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 40, windowMs: 60 * 60_000, key: request => `registration:${request.staff.uid}` })) return;
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid registration decision.' });
  const studentRef = adminDb.collection('users').doc(req.params.studentId);
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student registration not found.'), { status: 404 });
      const student = studentSnap.data();
      if (student.department !== req.staff.data.department) throw Object.assign(new Error('This registration is outside your assigned department.'), { status: 403 });
      if (student.sectionId !== '') {
        if (typeof student.sectionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(student.sectionId)) {
          throw Object.assign(new Error('This registration has an invalid section assignment.'), { status: 403 });
        }
        const section = await transaction.get(adminDb.collection('sections').doc(student.sectionId));
        if (!section.exists || section.data().coordinatorId !== req.staff.uid
          || section.data().department !== student.department) {
          throw Object.assign(new Error('You can only review registrations in your assigned sections.'), { status: 403 });
        }
      }
      if (student.accountApproved === true || student.status === 'approved') throw Object.assign(new Error('This registration has already been approved.'), { status: 409 });
      transaction.update(studentRef, status === 'approved' ? {
        accountApproved: true, status: 'not_submitted', approvedBy: req.staff.uid, approvedAt: now,
        rejectedBy: null, rejectedAt: null,
      } : {
        accountApproved: false, status: 'rejected_registration', rejectedBy: req.staff.uid, rejectedAt: now,
      });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: req.params.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: status === 'approved' ? 'Registration approved' : 'Registration needs attention',
        message: status === 'approved' ? 'Your student registration was approved by your OJT Coordinator.' : 'Your student registration was not approved. Please contact your OJT Coordinator.',
        type: 'registration', read: false, createdAt: now,
      });
    });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: status === 'approved' ? 'registration.approved' : 'registration.rejected', targetType: 'users', targetId: req.params.studentId, details: { department: req.staff.data.department } });
    return res.json({ success: true, status });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not process this registration.' });
  }
});

app.post('/coordinator/students/:studentId/requirements/:requirementId/decision', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 60, windowMs: 60 * 60_000, key: request => `requirement-review:${request.staff.uid}` })) return;
  const { status, reason = '' } = req.body || {};
  const note = typeof reason === 'string' ? reason.trim().slice(0, 2000) : '';
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid requirement decision.' });
  if (status === 'rejected' && !note) return res.status(400).json({ error: 'A reason is required to reject a document.' });
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(req.params.requirementId)) return res.status(400).json({ error: 'Invalid requirement.' });
  const studentRef = adminDb.collection('users').doc(req.params.studentId);
  const now = new Date().toISOString();
  try {
    let sectionId = '';
    await adminDb.runTransaction(async transaction => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = studentSnap.data();
      if (!(await coordinatorOwnsStudent(req.staff.uid, student))) throw Object.assign(new Error('You can only review students in your assigned sections.'), { status: 403 });
      sectionId = student.sectionId;
      const configuredRef = adminDb.collection('sections').doc(sectionId).collection('requirements');
      assertRecordsOpen(student);
      const hasCurrentPlacement = typeof student.placementProposalId === 'string'
        && /^[A-Za-z0-9_-]{1,120}$/.test(student.placementProposalId);
      const endorsementRef = req.params.requirementId === 'endorsement_letter' && hasCurrentPlacement
        ? adminDb.collection('endorsements').doc(student.placementProposalId) : null;
      const [configured, target, endorsementSnap] = await Promise.all([
        transaction.get(configuredRef), transaction.get(configuredRef.doc(req.params.requirementId)),
        endorsementRef ? transaction.get(endorsementRef) : Promise.resolve(null),
      ]);
      const fallbackIds = ['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa'];
      const validId = configured.empty ? fallbackIds.includes(req.params.requirementId) : target.exists;
      if (!validId) throw Object.assign(new Error('Requirement not found for this section.'), { status: 404 });
      const requirements = { ...(student.requirements || {}) };
      const current = requirements[req.params.requirementId] || {};
      if (!['submitted', 'rejected'].includes(current.status)) throw Object.assign(new Error('This document is not awaiting review.'), { status: 409 });
      const currentEndorsement = endorsementSnap?.exists ? endorsementSnap.data() : null;
      const matchesCurrentEndorsement = currentEndorsement
        && student.placementStatus === 'approved'
        && currentEndorsement.status === 'awaiting_document'
        && currentEndorsement.studentId === studentRef.id
        && currentEndorsement.proposalId === student.placementProposalId
        && currentEndorsement.sectionId === student.sectionId
        && currentEndorsement.department === student.department
        && currentEndorsement.companyId === student.companyId;
      if (status === 'approved' && req.params.requirementId === 'endorsement_letter') {
        const hasPrivateAuthenticatedCopy = current.cloudinaryDeliveryType === 'authenticated'
          && typeof current.cloudinaryAssetId === 'string'
          && /^[A-Za-z0-9_-]{16,80}$/.test(current.cloudinaryAssetId)
          && Number.isSafeInteger(current.uploadedBytes) && current.uploadedBytes > 0
          && current.uploadedBytes <= MAX_UPLOAD_BYTES;
        if (!matchesCurrentEndorsement || current.placementProposalId !== student.placementProposalId
          || !current.fileName || (!current.fileUrl && !hasPrivateAuthenticatedCopy)) {
          throw Object.assign(new Error('This signed copy is not linked to the student’s current approved placement. Ask the student to upload the signed letter again before approving it.'), { status: 409 });
        }
      }
      requirements[req.params.requirementId] = {
        ...current, status, reviewedBy: req.staff.uid, reviewedAt: now,
        rejectionReason: status === 'rejected' ? note : '',
      };
      const requiredItems = configured.empty
        ? fallbackIds
        : configured.docs.filter(item => item.data().required !== false && (!item.data().category || /pre|deploy/i.test(item.data().category))).map(item => item.id);
      const allPreDeploymentApproved = requiredItems.length > 0
        && requiredItems.every(id => requirements[id]?.status === 'approved');
      transaction.update(studentRef, {
        [`requirements.${req.params.requirementId}`]: requirements[req.params.requirementId],
        ...(allPreDeploymentApproved ? { requirementsStatus: 'approved' } : {}),
      });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: req.params.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: status === 'approved' ? 'Requirement approved' : 'Requirement needs attention',
        message: status === 'approved' ? 'Your submitted requirement was approved.' : `Your document needs attention: ${note}`,
        type: 'requirement', read: false, createdAt: now,
      });
      if (status === 'approved' && req.params.requirementId === 'endorsement_letter' && matchesCurrentEndorsement) {
        transaction.update(endorsementRef, {
          status: 'signed_copy_verified',
          signedCopyRequirementId: 'endorsement_letter',
          signedCopySubmittedAt: current.submittedAt || null,
          signedCopyVerifiedAt: now,
          signedCopyVerifiedBy: req.staff.uid,
        });
      }
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: req.staff.role, action: 'requirement.updated',
        targetType: 'requirements', targetId: req.params.requirementId,
        details: {
          studentId: req.params.studentId, sectionId, status,
          ...(status === 'approved' && req.params.requirementId === 'endorsement_letter' && matchesCurrentEndorsement
            ? { endorsementStatus: 'signed_copy_verified', proposalId: student.placementProposalId } : {}),
        },
      });
    });
    return res.json({ success: true, status });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not process this document review.' });
  }
});

async function requireStaff(req, res, next) {
  return requireUser(req, res, () => {
    if (!['admin', 'coordinator'].includes(req.user.role)) return res.status(403).json({ error: 'Staff access required' });
    req.staff = req.user;
    return next();
  });
}

async function coordinatorOwnsStudent(coordinatorId, student) {
  if (!student || student.role !== 'student' || !student.sectionId) return false;
  const [section, coordinator] = await Promise.all([
    adminDb.collection('sections').doc(student.sectionId).get(),
    adminDb.collection('users').doc(coordinatorId).get(),
  ]);
  return section.exists && coordinator.exists
    && coordinator.data().role === 'coordinator'
    && section.data().coordinatorId === coordinatorId
    && section.data().department === coordinator.data().department
    && student.department === coordinator.data().department;
}

// Messaging needs a display name, not access to the coordinator's private profile.
app.post('/student/assigned-coordinator', requireUser, async (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
  try {
    const student = (await adminDb.collection('users').doc(req.user.uid).get()).data();
    if (!student?.sectionId) return res.json({ coordinator: null });
    const section = (await adminDb.collection('sections').doc(student.sectionId).get()).data();
    if (!section?.coordinatorId || section.department !== student.department) return res.json({ coordinator: null });
    const coordinator = (await adminDb.collection('users').doc(section.coordinatorId).get()).data();
    if (coordinator?.role !== 'coordinator' || coordinator.department !== student.department) return res.json({ coordinator: null });
    return res.json({ coordinator: {
      id: section.coordinatorId,
      name: [coordinator.firstName, coordinator.lastName].filter(Boolean).join(' ') || coordinator.name || 'OJT Coordinator',
    } });
  } catch (error) {
    console.error('Assigned coordinator lookup failed:', error);
    return res.status(500).json({ error: 'Could not load your assigned coordinator.' });
  }
});

app.post('/messages', requireUser, async (req, res) => {
  if (!['student', 'coordinator'].includes(req.user.role)) return res.status(403).json({ error: 'Only students and coordinators can send messages.' });
  if (!allowRate(req, res, { limit: 60, windowMs: 60 * 60_000, key: request => `message:${request.user.uid}` })) return;
  const { recipientId, body } = req.body || {};
  const messageBody = typeof body === 'string' ? body.trim() : '';
  if (typeof recipientId !== 'string' || !recipientId || recipientId === req.user.uid
    || !messageBody || messageBody.length > 4000) {
    return res.status(400).json({ error: 'Choose a recipient and enter a message of 1–4,000 characters.' });
  }
  const senderRef = adminDb.collection('users').doc(req.user.uid);
  const recipientRef = adminDb.collection('users').doc(recipientId);
  const messageRef = adminDb.collection('messages').doc();
  const notificationRef = adminDb.collection('notifications').doc();
  const now = new Date().toISOString();
  try {
    let responseData;
    await adminDb.runTransaction(async transaction => {
      const [senderSnap, recipientSnap] = await Promise.all([transaction.get(senderRef), transaction.get(recipientRef)]);
      if (!senderSnap.exists || !recipientSnap.exists) throw Object.assign(new Error('Conversation participant was not found.'), { status: 404 });
      const sender = senderSnap.data();
      const recipient = recipientSnap.data();
      let studentId;
      let coordinatorId;
      let sectionId;
      if (sender.role === 'student' && recipient.role === 'coordinator') {
        studentId = senderRef.id;
        coordinatorId = recipientRef.id;
        sectionId = sender.sectionId;
      } else if (sender.role === 'coordinator' && recipient.role === 'student') {
        studentId = recipientRef.id;
        coordinatorId = senderRef.id;
        sectionId = recipient.sectionId;
      } else {
        throw Object.assign(new Error('Messages are only available between a student and their assigned coordinator.'), { status: 403 });
      }
      if (!sectionId || recipient.sectionId && recipient.role === 'student' && recipient.sectionId !== sectionId) {
        throw Object.assign(new Error('Conversation participant assignment is invalid.'), { status: 403 });
      }
      const sectionSnap = await transaction.get(adminDb.collection('sections').doc(sectionId));
      const student = sender.role === 'student' ? sender : recipient;
      const coordinator = sender.role === 'coordinator' ? sender : recipient;
      if (!sectionSnap.exists || sectionSnap.data().coordinatorId !== coordinatorId
        || sectionSnap.data().department !== student.department
        || sectionSnap.data().department !== coordinator.department) {
        throw Object.assign(new Error('You can only message students and coordinators assigned to the same section.'), { status: 403 });
      }
      const participantIds = [studentId, coordinatorId].sort();
      const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || (sender.role === 'student' ? 'Student' : 'OJT Coordinator');
      const recipientName = [recipient.firstName, recipient.lastName].filter(Boolean).join(' ').trim() || (recipient.role === 'student' ? 'Student' : 'OJT Coordinator');
      const message = {
        conversationId: participantIds.join('__'), participantIds, studentId, coordinatorId,
        senderId: senderRef.id, senderRole: sender.role, senderName,
        recipientId: recipientRef.id, recipientRole: recipient.role, recipientName,
        body: messageBody, message: messageBody, read: false, createdAt: now, type: 'direct_message',
      };
      transaction.create(messageRef, message);
      transaction.create(notificationRef, {
        recipientId: recipientRef.id, senderId: senderRef.id, senderRole: sender.role,
        senderName, title: `New ${sender.role === 'student' ? 'student' : 'coordinator'} message`,
        message: messageBody, type: 'message', read: false, createdAt: now,
      });
      responseData = { messageId: messageRef.id, conversationId: message.conversationId, createdAt: now };
    });
    return res.status(201).json({ success: true, ...responseData });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not send the message.' });
  }
});

app.post('/coordinator/announcements', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: request => `announcement:${request.staff.uid}` })) return;
  const { sectionId, title, message } = req.body || {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';
  if (typeof sectionId !== 'string' || !sectionId || cleanTitle.length < 1 || cleanTitle.length > 120
    || cleanMessage.length < 1 || cleanMessage.length > 4000) {
    return res.status(400).json({ error: 'Choose a section and enter a title (up to 120 characters) and message (up to 4,000 characters).' });
  }
  const sectionRef = adminDb.collection('sections').doc(sectionId);
  const coordinatorRef = adminDb.collection('users').doc(req.staff.uid);
  const studentsQuery = adminDb.collection('users').where('sectionId', '==', sectionId);
  const now = new Date().toISOString();
  try {
    let recipientCount = 0;
    await adminDb.runTransaction(async transaction => {
      const [sectionSnap, coordinatorSnap, studentQuerySnap] = await Promise.all([
        transaction.get(sectionRef), transaction.get(coordinatorRef), transaction.get(studentsQuery),
      ]);
      if (!sectionSnap.exists || !coordinatorSnap.exists || coordinatorSnap.data().role !== 'coordinator'
        || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== coordinatorSnap.data().department) {
        throw Object.assign(new Error('You can only announce to your assigned sections.'), { status: 403 });
      }
      const students = studentQuerySnap.docs.filter(item => item.data().role === 'student'
        && item.data().department === coordinatorSnap.data().department);
      if (students.length > 450) throw Object.assign(new Error('This section exceeds the safe one-request announcement limit.'), { status: 413 });
      recipientCount = students.length;
      for (const student of students) {
        transaction.create(adminDb.collection('notifications').doc(), {
          recipientId: student.id, senderId: req.staff.uid, senderRole: 'coordinator',
          title: cleanTitle, message: cleanMessage, type: 'announcement', read: false, createdAt: now,
        });
      }
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'announcement.sent',
        targetType: 'sections', targetId: sectionId, details: { recipients: recipientCount },
      });
    });
    return res.json({ success: true, count: recipientCount });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not send the announcement.' });
  }
});

function manilaDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function canTrackAttendance(user) {
  return user?.role === 'student' && user.accountApproved === true
    && user.clearanceStatus !== 'cleared'
    && user.preDeploymentStatus === 'approved';
}

function assertRecordsOpen(student) {
  if (student?.clearanceStatus === 'cleared') throw Object.assign(new Error('Cleared OJT records are locked.'), { status: 409 });
}

async function requireAdmin(req, res, next) {
  await requireStaff(req, res, () => {
    if (req.staff.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

const AUDIT_ACTIONS = new Set([
  'account.activation_changed', 'coordinator.created',
  'student.provisioned', 'student.password_changed', 'student.password_reset',
  'company.created', 'company.updated', 'evaluation.email_accepted', 'evaluation.email_unknown',
  'registration.approved', 'registration.rejected',
  'section.created', 'section.updated', 'section.deleted',
  'requirement.updated', 'requirement.submitted', 'requirement.removed', 'requirement.downloaded',
  'attendance.time_in', 'attendance.time_out', 'student.assigned', 'clearance.updated',
  'logbook.reviewed', 'placement.reviewed', 'placement.submitted', 'placement.resubmitted',
  'endorsement.draft_prepared', 'endorsement.delivery_started',
  'endorsement.email_accepted', 'endorsement.email_failed',
  'final_review.submitted', 'final_review.resubmitted', 'roster.updated', 'announcement.sent',
  'academic_term.created', 'academic_term.updated', 'academic_term.activated',
  'settings.updated',
]);

async function recordAudit({ actorId, actorRole, action, targetType, targetId, details = {} }) {
  if (!AUDIT_ACTIONS.has(action)) throw new Error(`Unsupported audit action: ${action}`);
  await adminDb.collection('auditLogs').add(auditEntry({ actorId, actorRole, action, targetType, targetId, details }));
}

function auditEntry({ actorId, actorRole, action, targetType, targetId, details = {} }) {
  if (!AUDIT_ACTIONS.has(action)) throw new Error(`Unsupported audit action: ${action}`);
  return {
    actorId, actorRole, action, targetType, targetId: targetId || null,
    details: typeof details === 'object' && details !== null ? details : {},
    createdAt: new Date().toISOString(),
  };
}

function writeAuditInTransaction(transaction, event) {
  transaction.set(adminDb.collection('auditLogs').doc(), auditEntry(event));
}

app.patch('/admin/students/:studentId/account-status', requireAdmin, async (req, res) => {
  const { accountApproved } = req.body || {};
  if (typeof accountApproved !== 'boolean') return res.status(400).json({ error: 'Account status must be true or false.' });
  const studentRef = adminDb.collection('users').doc(req.params.studentId);
  try {
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(studentRef);
      if (!snapshot.exists || snapshot.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = snapshot.data();
      if (student.accountApproved === accountApproved) throw Object.assign(new Error('Account already has that status.'), { status: 409 });
      transaction.update(studentRef, { accountApproved, accountStatusUpdatedAt: new Date().toISOString(), accountStatusUpdatedBy: req.staff.uid });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: req.staff.role, action: 'account.activation_changed',
        targetType: 'users', targetId: req.params.studentId, details: { accountApproved },
      });
    });
    return res.json({ success: true, accountApproved });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not update student account status.' });
  }
});

app.post('/coordinator/students/:studentId/clearance', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 30, windowMs: 60 * 60_000, key: request => `clearance:${request.staff.uid}` })) return;
  const studentRef = adminDb.collection('users').doc(req.params.studentId);
  try {
    await adminDb.runTransaction(async transaction => {
      const studentSnap = await transaction.get(studentRef);
      if (!studentSnap.exists || studentSnap.data().role !== 'student') throw Object.assign(new Error('Student not found.'), { status: 404 });
      const student = studentSnap.data();
      const sectionRef = adminDb.collection('sections').doc(student.sectionId || '__unassigned__');
      const sectionSnap = await transaction.get(sectionRef);
      if (!sectionSnap.exists || sectionSnap.data().coordinatorId !== req.staff.uid
        || sectionSnap.data().department !== req.staff.data.department
        || student.department !== req.staff.data.department) throw Object.assign(new Error('You can only clear students in your assigned sections.'), { status: 403 });
      const requiredHours = Number(student.hoursRequired || sectionSnap.data().hoursRequired || 486);
      if (student.accountApproved !== true || student.requirementsStatus !== 'approved'
        || student.preDeploymentStatus !== 'approved' || student.placementStatus !== 'approved'
        || Number(student.hoursRendered || 0) < requiredHours) throw Object.assign(new Error('Student has not met the clearance requirements.'), { status: 409 });
      const evaluations = await transaction.get(adminDb.collection('evaluations').where('studentId', '==', req.params.studentId));
      if (!evaluations.docs.some(item => item.data().used === true && item.data().submittedAt)) {
        throw Object.assign(new Error('A submitted supervisor evaluation is required before clearance.'), { status: 409 });
      }
      if (student.clearanceStatus === 'cleared') throw Object.assign(new Error('Clearance is already approved.'), { status: 409 });
      const now = new Date().toISOString();
      transaction.update(studentRef, { clearanceStatus: 'cleared', clearedBy: req.staff.uid, clearedAt: now });
      transaction.set(adminDb.collection('notifications').doc(), {
        recipientId: req.params.studentId, senderId: req.staff.uid, senderRole: 'coordinator',
        title: 'Clearance approved', message: 'Your OJT clearance has been approved by your coordinator.',
        type: 'clearance', read: false, createdAt: now,
      });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: req.staff.role, action: 'clearance.updated',
        targetType: 'users', targetId: req.params.studentId, details: { clearanceStatus: 'cleared' },
      });
    });
    return res.json({ success: true, clearanceStatus: 'cleared' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not approve clearance.' });
  }
});

const DEFAULT_SECTION_REQUIREMENTS = [
  { id: 'cor', label: 'Certificate of Registration (COR)', category: 'Pre-OJT' },
  { id: 'endorsement', label: 'Recommendation / Endorsement Letter', category: 'Pre-OJT' },
  { id: 'parental_consent', label: 'Notarized Parental Consent & Waiver', category: 'Pre-OJT' },
  { id: 'medical_cert', label: 'Medical Certificate', category: 'Pre-OJT' },
  { id: 'good_moral', label: 'Certificate of Good Moral Character', category: 'Pre-OJT' },
  { id: 'moa', label: 'MOA & Internship Plan', category: 'Pre-OJT' },
  { id: 'dtr', label: 'Daily Time Record (DTR)', category: 'Ongoing' },
  { id: 'logbook', label: 'OJT Journal / Logbook', category: 'Ongoing' },
  { id: 'coc', label: 'Certificate of Completion (COC)', category: 'Post-OJT' },
  { id: 'eval_sheet', label: 'Performance Evaluation Sheet', category: 'Post-OJT' },
  { id: 'narrative', label: 'OJT Narrative Report', category: 'Post-OJT' },
];

async function coordinatorSection(req, sectionId) {
  if (req.staff.role !== 'coordinator') throw Object.assign(new Error('Coordinator access required.'), { status: 403 });
  const snapshot = await adminDb.collection('sections').doc(sectionId).get();
  if (!snapshot.exists || snapshot.data().coordinatorId !== req.staff.uid
    || snapshot.data().department !== req.staff.data.department) throw Object.assign(new Error('Section not found or not assigned to you.'), { status: 403 });
  return snapshot;
}

app.post('/coordinator/sections', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  const { name, department, hoursRequired, messengerLink = '' } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 120
    || !Number.isFinite(Number(hoursRequired)) || Number(hoursRequired) <= 0 || Number(hoursRequired) > 10000
    || department !== req.staff.data.department
    || typeof messengerLink !== 'string' || messengerLink.length > 500) return res.status(400).json({ error: 'Enter valid section details for your assigned department.' });
  try {
    const sectionRef = adminDb.collection('sections').doc();
    const activeTerm = await adminDb.collection('academicTerms').where('isActive', '==', true).limit(1).get();
    const section = {
      name: name.trim(), department: req.staff.data.department, hoursRequired: Number(hoursRequired),
      messengerLink: messengerLink.trim(), coordinatorId: req.staff.uid, studentIds: [], createdAt: new Date().toISOString(),
      ...(activeTerm.empty ? {} : { termId: activeTerm.docs[0].id, termName: activeTerm.docs[0].data().name }),
    };
    const auditRef = adminDb.collection('auditLogs').doc();
    await adminDb.runTransaction(async transaction => {
      transaction.set(sectionRef, section);
      transaction.set(auditRef, auditEntry({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'section.created', targetType: 'sections', targetId: sectionRef.id, details: { name: section.name, department: section.department } }));
    });
    return res.json({ success: true, section: { id: sectionRef.id, ...section } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not create section.' });
  }
});

app.post('/coordinator/sections/:sectionId/requirements/defaults', requireStaff, async (req, res) => {
  try {
    await coordinatorSection(req, req.params.sectionId);
    const requirementsRef = adminDb.collection('sections').doc(req.params.sectionId).collection('requirements');
    const existing = await requirementsRef.get();
    if (!existing.empty) return res.status(409).json({ error: 'Requirements are already configured.' });
    const now = new Date().toISOString();
    const auditRef = adminDb.collection('auditLogs').doc();
    await adminDb.runTransaction(async transaction => {
      const latest = await transaction.get(requirementsRef);
      if (!latest.empty) throw Object.assign(new Error('Requirements are already configured.'), { status: 409 });
      DEFAULT_SECTION_REQUIREMENTS.forEach(item => transaction.set(requirementsRef.doc(item.id), { ...item, deadline: '', createdAt: now }));
      transaction.set(auditRef, auditEntry({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'requirement.updated', targetType: 'sectionRequirements', targetId: req.params.sectionId, details: { action: 'defaults_seeded' } }));
    });
    return res.json({ success: true, requirements: DEFAULT_SECTION_REQUIREMENTS.map(item => ({ ...item, deadline: '', createdAt: now })) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not initialize section requirements.' });
  }
});

app.post('/coordinator/sections/:sectionId/requirements', requireStaff, async (req, res) => {
  const { label, category, deadline = '' } = req.body || {};
  if (typeof label !== 'string' || !label.trim() || label.trim().length > 160
    || !['Pre-OJT', 'Ongoing', 'Post-OJT'].includes(category)
    || typeof deadline !== 'string' || (deadline && !validTermDates(deadline, deadline))) return res.status(400).json({ error: 'Enter a valid requirement.' });
  try {
    await coordinatorSection(req, req.params.sectionId);
    const ref = adminDb.collection('sections').doc(req.params.sectionId).collection('requirements').doc(`req_${crypto.randomBytes(12).toString('hex')}`);
    const item = { id: ref.id, label: label.trim(), category, deadline, createdAt: new Date().toISOString() };
    const auditRef = adminDb.collection('auditLogs').doc();
    await adminDb.runTransaction(async transaction => {
      transaction.set(ref, item);
      transaction.set(auditRef, auditEntry({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'requirement.updated', targetType: 'sectionRequirements', targetId: ref.id, details: { sectionId: req.params.sectionId, action: 'created' } }));
    });
    return res.json({ success: true, requirement: item });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not add requirement.' });
  }
});

app.patch('/coordinator/sections/:sectionId/requirements/:requirementId', requireStaff, async (req, res) => {
  const { deadline } = req.body || {};
  if (typeof deadline !== 'string' || (deadline && !validTermDates(deadline, deadline))) return res.status(400).json({ error: 'Enter a valid deadline.' });
  try {
    await coordinatorSection(req, req.params.sectionId);
    const ref = adminDb.collection('sections').doc(req.params.sectionId).collection('requirements').doc(req.params.requirementId);
    const auditRef = adminDb.collection('auditLogs').doc();
    await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (!existing.exists) throw Object.assign(new Error('Requirement not found.'), { status: 404 });
      transaction.update(ref, { deadline });
      transaction.set(auditRef, auditEntry({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'requirement.updated', targetType: 'sectionRequirements', targetId: req.params.requirementId, details: { sectionId: req.params.sectionId, action: 'deadline_changed' } }));
    });
    return res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not update requirement.' });
  }
});

app.delete('/coordinator/sections/:sectionId/requirements/:requirementId', requireStaff, async (req, res) => {
  try {
    await coordinatorSection(req, req.params.sectionId);
    const ref = adminDb.collection('sections').doc(req.params.sectionId).collection('requirements').doc(req.params.requirementId);
    const auditRef = adminDb.collection('auditLogs').doc();
    await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(ref);
      if (!existing.exists) throw Object.assign(new Error('Requirement not found.'), { status: 404 });
      transaction.delete(ref);
      transaction.set(auditRef, auditEntry({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'requirement.updated', targetType: 'sectionRequirements', targetId: req.params.requirementId, details: { sectionId: req.params.sectionId, action: 'deleted' } }));
    });
    return res.json({ success: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not delete requirement.' });
  }
});

app.get('/admin/settings', requireStaff, async (req, res) => {
  try {
    const snap = await adminDb.collection('systemSettings').doc('global').get();
    res.json({ settings: snap.exists ? snap.data() : {
      defaultHoursRequired: 486, dailyTargetHours: 8, expectedStartTime: '08:00',
      lateGraceMinutes: 15, expectedWorkdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      notificationsEnabled: true,
    } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load system settings' }); }
});

app.put('/admin/settings', requireAdmin, async (req, res) => {
  const { defaultHoursRequired, dailyTargetHours, expectedStartTime, lateGraceMinutes, expectedWorkdays, notificationsEnabled } = req.body || {};
  const validTime = typeof expectedStartTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(expectedStartTime);
  const validDays = Array.isArray(expectedWorkdays) && expectedWorkdays.length > 0 && expectedWorkdays.every(day => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].includes(day));
  if (!Number.isFinite(Number(defaultHoursRequired)) || Number(defaultHoursRequired) <= 0
    || !Number.isFinite(Number(dailyTargetHours)) || Number(dailyTargetHours) <= 0 || Number(dailyTargetHours) > 24
    || !Number.isFinite(Number(lateGraceMinutes)) || Number(lateGraceMinutes) < 0 || Number(lateGraceMinutes) > 240
    || !validTime || !validDays || typeof notificationsEnabled !== 'boolean') {
    return res.status(400).json({ error: 'Invalid system settings' });
  }
  const settings = {
    defaultHoursRequired: Number(defaultHoursRequired), dailyTargetHours: Number(dailyTargetHours),
    expectedStartTime, lateGraceMinutes: Number(lateGraceMinutes), expectedWorkdays,
    notificationsEnabled, updatedBy: req.staff.uid, updatedAt: new Date().toISOString(),
  };
  try {
    await adminDb.collection('systemSettings').doc('global').set(settings, { merge: true });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'settings.updated', targetType: 'systemSettings', targetId: 'global', details: { fields: Object.keys(settings).filter(key => !['updatedBy', 'updatedAt'].includes(key)) } });
    res.json({ success: true, settings });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not save system settings' }); }
});

function normalizedCompanyName(value) {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
}

function parseCompanyPayload(body = {}) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const industry = typeof body.industry === 'string' ? body.industry.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const capacity = body.capacity;
  const active = body.active;
  if (!name || name.length > 160 || address.length > 300 || industry.length > 120
    || email.length > 254 || phone.length > 60
    || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    || !Number.isSafeInteger(capacity) || capacity < 1 || typeof active !== 'boolean') {
    throw Object.assign(new Error('Enter a company name, valid contact details, a positive whole-number capacity, and an active status.'), { status: 400 });
  }
  return { name, normalizedName: normalizedCompanyName(name), address, industry, email, phone,
    capacity, active, status: active ? 'active' : 'inactive',
    ...(body.geofence === undefined ? {} : { geofence: require('./geofence').parseGeofence(body.geofence) }) };
}

app.post('/attendance/location-policy', requireUser, async (req, res) => {
  if (!canTrackAttendance(req.user.data)) return res.status(403).json({ error: 'Attendance is unavailable for this account.' });
  try {
    const company = req.user.data.companyId ? await adminDb.collection('companies').doc(req.user.data.companyId).get() : null;
    return res.json({ enabled: company?.data()?.geofence?.enabled === true });
  } catch (_) { return res.status(500).json({ error: 'Could not load attendance location policy.' }); }
});

async function attendanceLocation(transaction, student, location) {
  if (!student.companyId) return { enforced: false };
  const company = await transaction.get(adminDb.collection('companies').doc(student.companyId));
  return require('./geofence').verifyLocation(company.data()?.geofence, location);
}

app.get(['/admin/companies', '/coordinator/company-directory'], requireStaff, async (req, res) => {
  if ((req.path === '/admin/companies' && req.staff.role !== 'admin')
    || (req.path === '/coordinator/company-directory' && req.staff.role !== 'coordinator')) {
    return res.status(403).json({ error: 'Access denied for this company directory.' });
  }
  try {
    const [companySnapshot, studentSnapshot] = await Promise.all([
      adminDb.collection('companies').get(),
      adminDb.collection('users').where('placementStatus', '==', 'approved').get(),
    ]);
    const occupiedByCompany = new Map();
    studentSnapshot.docs.forEach(snapshot => {
      const student = snapshot.data();
      if (student.role === 'student' && typeof student.companyId === 'string' && student.companyId) {
        occupiedByCompany.set(student.companyId, (occupiedByCompany.get(student.companyId) || 0) + 1);
      }
    });
    const companies = companySnapshot.docs.map(snapshot => {
      const company = snapshot.data();
      const capacity = Number.isSafeInteger(company.capacity) ? company.capacity : null;
      const occupiedSlots = occupiedByCompany.get(snapshot.id) || 0;
      return { id: snapshot.id, ...company,
        active: company.active !== false && company.status !== 'inactive', capacity, occupiedSlots,
        availableSlots: capacity === null ? null : Math.max(0, capacity - occupiedSlots) };
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return res.json({ companies });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not load the company directory.' });
  }
});

app.post('/admin/companies', requireAdmin, (req, res) => res.status(403).json({ error: 'Company management is coordinator-only. Admin company access is read-only.' }));
app.patch('/admin/companies/:companyId', requireAdmin, (req, res) => res.status(403).json({ error: 'Company management is coordinator-only. Admin company access is read-only.' }));

app.post('/coordinator/companies', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  let company;
  try { company = parseCompanyPayload(req.body); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  const companyRef = adminDb.collection('companies').doc();
  const now = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(adminDb.collection('companies'));
      if (existing.docs.some(snapshot => normalizedCompanyName(String(snapshot.data().name || '')) === company.normalizedName)) {
        throw Object.assign(new Error('A company with this name already exists.'), { status: 409 });
      }
      const data = { ...company, occupiedSlots: 0, availableSlots: company.capacity,
        createdBy: req.staff.uid, createdAt: now, updatedBy: req.staff.uid, updatedAt: now };
      transaction.create(companyRef, data);
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'company.created',
        targetType: 'companies', targetId: companyRef.id, details: { name: company.name, capacity: company.capacity },
      });
    });
    return res.status(201).json({ success: true, company: { id: companyRef.id, ...company, occupiedSlots: 0, availableSlots: company.capacity } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not create company.' });
  }
});

app.patch('/coordinator/companies/:companyId', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(req.params.companyId)) return res.status(400).json({ error: 'Invalid company.' });
  let company;
  try { company = parseCompanyPayload(req.body); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  const companyRef = adminDb.collection('companies').doc(req.params.companyId);
  const now = new Date().toISOString();
  try {
    let occupiedSlots = 0;
    await adminDb.runTransaction(async transaction => {
      const [companySnapshot, assignedSnapshot, directorySnapshot] = await Promise.all([
        transaction.get(companyRef),
        transaction.get(adminDb.collection('users').where('companyId', '==', req.params.companyId)),
        transaction.get(adminDb.collection('companies')),
      ]);
      if (!companySnapshot.exists) throw Object.assign(new Error('Company not found.'), { status: 404 });
      const duplicate = directorySnapshot.docs.some(snapshot => snapshot.id !== req.params.companyId
        && normalizedCompanyName(String(snapshot.data().name || '')) === company.normalizedName);
      if (duplicate) throw Object.assign(new Error('A company with this name already exists.'), { status: 409 });
      occupiedSlots = assignedSnapshot.docs.filter(snapshot => snapshot.data().role === 'student'
        && snapshot.data().placementStatus === 'approved').length;
      if (company.capacity < occupiedSlots) {
        throw Object.assign(new Error(`Capacity cannot be lower than the ${occupiedSlots} currently approved placement(s).`), { status: 409 });
      }
      transaction.update(companyRef, { ...company, occupiedSlots, availableSlots: company.capacity - occupiedSlots,
        updatedBy: req.staff.uid, updatedAt: now });
      writeAuditInTransaction(transaction, {
        actorId: req.staff.uid, actorRole: 'coordinator', action: 'company.updated',
        targetType: 'companies', targetId: companyRef.id,
        details: { name: company.name, capacity: company.capacity, active: company.active },
      });
    });
    return res.json({ success: true, company: { id: companyRef.id, ...company, occupiedSlots, availableSlots: company.capacity - occupiedSlots } });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not update company.' });
  }
});

app.get('/admin/academic-terms', requireAdmin, async (req, res) => {
  try {
    const snap = await adminDb.collection('academicTerms').get();
    const terms = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    res.json({ terms });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load academic terms' }); }
});

function validTermDates(startDate, endDate) {
  const isRealDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  };
  return isRealDate(startDate) && isRealDate(endDate) && startDate <= endDate;
}

app.post('/admin/academic-terms', requireAdmin, async (req, res) => {
  const { name, startDate, endDate, isActive = false } = req.body || {};
  if (!String(name || '').trim() || typeof isActive !== 'boolean' || !validTermDates(startDate, endDate)) return res.status(400).json({ error: 'Enter a valid term name and date range' });
  try {
    const ref = adminDb.collection('academicTerms').doc();
    const term = { name: String(name).trim(), startDate, endDate, isActive: Boolean(isActive), createdBy: req.staff.uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await adminDb.runTransaction(async tx => {
      if (term.isActive) {
        const active = await adminDb.collection('academicTerms').where('isActive', '==', true).get();
        active.docs.forEach(docSnap => tx.update(docSnap.ref, { isActive: false, updatedAt: new Date().toISOString() }));
      }
      tx.set(ref, term);
    });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: term.isActive ? 'academic_term.activated' : 'academic_term.created', targetType: 'academicTerms', targetId: ref.id, details: { name: term.name } });
    res.json({ success: true, term: { id: ref.id, ...term } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not create academic term' }); }
});

app.patch('/admin/academic-terms/:termId', requireAdmin, async (req, res) => {
  const { name, startDate, endDate, isActive } = req.body || {};
  if (!String(name || '').trim() || !validTermDates(startDate, endDate) || typeof isActive !== 'boolean') return res.status(400).json({ error: 'Enter valid term details' });
  try {
    const ref = adminDb.collection('academicTerms').doc(req.params.termId);
    const existing = await ref.get();
    if (!existing.exists) return res.status(404).json({ error: 'Academic term not found' });
    const update = { name: String(name).trim(), startDate, endDate, isActive, updatedAt: new Date().toISOString() };
    await adminDb.runTransaction(async tx => {
      if (isActive) {
        const active = await adminDb.collection('academicTerms').where('isActive', '==', true).get();
        active.docs.filter(docSnap => docSnap.id !== req.params.termId).forEach(docSnap => tx.update(docSnap.ref, { isActive: false, updatedAt: new Date().toISOString() }));
      }
      tx.update(ref, update);
    });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: isActive ? 'academic_term.activated' : 'academic_term.updated', targetType: 'academicTerms', targetId: req.params.termId, details: { name: update.name } });
    res.json({ success: true, term: { id: req.params.termId, ...existing.data(), ...update } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not update academic term' }); }
});

app.post('/audit-log', requireStaff, async (req, res) => {
  return res.status(403).json({ error: 'Audit events can only be written by authorized server operations.' });
});

app.get('/admin/audit-logs', requireAdmin, async (req, res) => {
  try {
    const snap = await adminDb.collection('auditLogs').limit(250).get();
    const logs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    res.json({ logs });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load audit logs' }); }
});

app.post('/attendance/time-in', requireUser, async (req, res) => {
  if (!canTrackAttendance(req.user.data)) return res.status(403).json({ error: 'Your student account is not cleared to log attendance.' });
  if (!allowRate(req, res, { limit: 10, windowMs: 60_000, key: request => `attendance:${request.user.uid}` })) return;

  const date = manilaDateKey();
  const userRef = adminDb.collection('users').doc(req.user.uid);
  const attendanceRef = userRef.collection('attendance').doc(date);
  const timeIn = new Date().toISOString();
  try {
    await adminDb.runTransaction(async transaction => {
      const [profile, existing] = await Promise.all([transaction.get(userRef), transaction.get(attendanceRef)]);
      if (!profile.exists || !canTrackAttendance(profile.data())) throw Object.assign(new Error('Your student account is not cleared to log attendance.'), { status: 403 });
      if (existing.exists) throw Object.assign(new Error('Attendance has already been started for today.'), { status: 409 });
      const locationEvidence = await attendanceLocation(transaction, profile.data(), req.body?.location);
      transaction.create(attendanceRef, { date, timeIn, timeOut: null, hoursToday: 0, status: 'pending', createdAt: timeIn, timeInLocation: locationEvidence });
      writeAuditInTransaction(transaction, {
        actorId: req.user.uid, actorRole: 'student', action: 'attendance.time_in',
        targetType: 'attendance', targetId: date,
        details: { sectionId: profile.data().sectionId || null, date },
      });
    });
    return res.status(201).json({ id: date, date, timeIn, timeOut: null, hoursToday: 0, status: 'pending' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not record time-in.' });
  }
});

app.post('/attendance/time-out', requireUser, async (req, res) => {
  if (!canTrackAttendance(req.user.data)) return res.status(403).json({ error: 'Your student account is not cleared to log attendance.' });
  if (!allowRate(req, res, { limit: 10, windowMs: 60_000, key: request => `attendance:${request.user.uid}` })) return;

  const date = manilaDateKey();
  const userRef = adminDb.collection('users').doc(req.user.uid);
  const attendanceRef = userRef.collection('attendance').doc(date);
  const timeOut = new Date().toISOString();
  try {
    const result = await adminDb.runTransaction(async transaction => {
      const [profile, attendance] = await Promise.all([transaction.get(userRef), transaction.get(attendanceRef)]);
      if (!profile.exists || !canTrackAttendance(profile.data())) throw Object.assign(new Error('Your student account is not cleared to log attendance.'), { status: 403 });
      if (!attendance.exists || attendance.data().timeOut) throw Object.assign(new Error('There is no active time-in for today.'), { status: 409 });
      const timeIn = new Date(attendance.data().timeIn).getTime();
      const elapsed = new Date(timeOut).getTime() - timeIn;
      if (!Number.isFinite(timeIn) || elapsed <= 0 || elapsed > 24 * 60 * 60 * 1000) {
        throw Object.assign(new Error('Time-out must be after time-in and within 24 hours.'), { status: 400 });
      }
      const hoursToday = Math.round((elapsed / 3_600_000) * 100) / 100;
      const locationEvidence = await attendanceLocation(transaction, profile.data(), req.body?.location);
      transaction.update(attendanceRef, { timeOut, hoursToday, status: 'pending', timeOutLocation: locationEvidence });
      transaction.update(userRef, { hoursRendered: FieldValue.increment(hoursToday) });
      writeAuditInTransaction(transaction, {
        actorId: req.user.uid, actorRole: 'student', action: 'attendance.time_out',
        targetType: 'attendance', targetId: date,
        details: { sectionId: profile.data().sectionId || null, date, hoursToday },
      });
      return { id: date, date, timeIn: attendance.data().timeIn, timeOut, hoursToday, status: 'pending' };
    });
    return res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Could not record time-out.' });
  }
});

require('./evaluationMail').installEvaluationMail({ app, db: adminDb, requireStaff, coordinatorOwnsStudent, allowRate, writeAuditInTransaction });

app.post('/create-evaluation-token', requireStaff, async (req, res) => {
  if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
  if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: request => `evaluation:${request.staff.uid}` })) return;
  const { studentId, supervisorName, supervisorEmail, companyName, formDefinition: requestedForm } = req.body || {};
  const cleanSupervisorName = typeof supervisorName === 'string' ? supervisorName.trim() : '';
  const cleanSupervisorEmail = typeof supervisorEmail === 'string' ? supervisorEmail.trim() : '';
  const cleanCompanyName = typeof companyName === 'string' ? companyName.trim() : '';
  if (typeof studentId !== 'string' || !studentId.trim()
    || !cleanSupervisorName || cleanSupervisorName.length > 120
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanSupervisorEmail) || cleanSupervisorEmail.length > 254
    || !cleanCompanyName || cleanCompanyName.length > 200) {
    return res.status(400).json({ error: 'Enter a valid student, supervisor name/email, and company name.' });
  }
  try {
    const formDefinition = requestedForm === undefined ? null : require('./evaluationForm').validateForm(requestedForm);
    const studentSnap = await adminDb.collection('users').doc(studentId).get();
    if (!studentSnap.exists || studentSnap.data().role !== 'student') return res.status(404).json({ error: 'Student not found' });
    const student = studentSnap.data();
    if (req.staff.role === 'coordinator' && !(await coordinatorOwnsStudent(req.staff.uid, student))) {
      return res.status(403).json({ error: 'You can only create evaluations for students in your assigned sections.' });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    assertRecordsOpen(student);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const evaluation = adminDb.collection('evaluations').doc();
    await adminDb.runTransaction(async transaction => {
      const freshStudent = await transaction.get(studentSnap.ref);
      assertRecordsOpen(freshStudent.data());
      transaction.create(evaluation, { ...(formDefinition ? { formDefinition } : {}), studentId, studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(), sectionId: student.sectionId || '', department: student.department || '', supervisorName: cleanSupervisorName, supervisorEmail: cleanSupervisorEmail, companyName: cleanCompanyName, tokenHash, expiresAt, used: false, createdBy: req.staff.uid, createdAt: new Date().toISOString() });
    });
    res.set('Cache-Control', 'no-store').json({ id: evaluation.id, token: rawToken, expiresAt });
  } catch (e) { if (e.status) return res.status(e.status).json({ error: e.message }); console.error(e); res.status(500).json({ error: 'Could not create evaluation link' }); }
});

app.get('/coordinator-evaluations', requireStaff, async (req, res) => {
  try {
    const snap = await adminDb.collection('evaluations').where('createdBy', '==', req.staff.uid).get();
    const evaluations = snap.docs.map(d => {
      const data = d.data();
      return { id: d.id, formDefinition: data.formDefinition || null, answers: data.answers || null, studentId: data.studentId, studentName: data.studentName, supervisorName: data.supervisorName, supervisorEmail: data.supervisorEmail, companyName: data.companyName, expiresAt: data.expiresAt, used: data.used, submitted: Boolean(data.submittedAt || data.used), ratings: data.ratings || null, comments: data.comments || '', submittedAt: data.submittedAt || null, emailStatus: data.emailStatus || 'not_sent', emailAcceptedAt: data.emailAcceptedAt || null };
    });
    res.json({ evaluations });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not load evaluations' }); }
});

app.get('/evaluation/:token', async (req, res) => {
  if (!allowRate(req, res, { limit: 60, windowMs: 10 * 60_000, key: request => `evaluation-read:${request.ip}` })) return;
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({ error: 'Evaluation link is invalid' });
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const snap = await adminDb.collection('evaluations').where('tokenHash', '==', tokenHash).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Evaluation link is invalid' });
    const data = snap.docs[0].data();
    if (data.used || new Date(data.expiresAt) < new Date()) return res.status(410).json({ error: 'Evaluation link is expired or already submitted' });
    res.json({ formDefinition: data.formDefinition || null, studentName: data.studentName, companyName: data.companyName, supervisorName: data.supervisorName, expiresAt: data.expiresAt });
  } catch (e) { res.status(500).json({ error: 'Could not load evaluation' }); }
});

app.post('/evaluation/:token/submit', async (req, res) => {
  if (!allowRate(req, res, { limit: 20, windowMs: 10 * 60_000, key: request => `evaluation-submit:${request.ip}` })) return;
  if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(404).json({ error: 'Evaluation link is invalid' });
  const { ratings, comments } = req.body || {};
  const requiredRatingFields = ['technicalSkills', 'workQuality', 'professionalism', 'communication', 'attendance'];
  const validRatings = ratings && typeof ratings === 'object' && !Array.isArray(ratings)
    && Object.keys(ratings).length === requiredRatingFields.length
    && requiredRatingFields.every(field => Number.isInteger(ratings[field]) && ratings[field] >= 1 && ratings[field] <= 5);
  try {
    const tokenHash = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const snap = await adminDb.collection('evaluations').where('tokenHash', '==', tokenHash).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Evaluation link is invalid' });
    const ref = snap.docs[0].ref;
    const notificationRef = adminDb.collection('notifications').doc();
    await adminDb.runTransaction(async transaction => {
      const evaluation = await transaction.get(ref);
      if (!evaluation.exists) throw Object.assign(new Error('Evaluation link is invalid'), { status: 404 });
      const data = evaluation.data();
      const student = await transaction.get(adminDb.collection('users').doc(data.studentId));
      assertRecordsOpen(student.data());
      if (data.used || new Date(data.expiresAt) < new Date()) {
        throw Object.assign(new Error('Evaluation link is expired or already submitted'), { status: 410 });
      }
      const submittedAt = new Date().toISOString();
      let submission;
      if (data.formDefinition) {
        submission = { answers: require('./evaluationForm').validateAnswers(data.formDefinition, req.body?.answers) };
      } else {
        if (!validRatings || typeof comments !== 'string' || !comments.trim() || comments.trim().length > 4000) throw Object.assign(new Error('Complete all five ratings and enter comments up to 4,000 characters.'), { status: 400 });
        submission = { ratings, comments: comments.trim() };
      }
      transaction.update(ref, { ...submission, submittedAt, used: true });
      transaction.create(notificationRef, { recipientId: data.studentId, title: 'Supervisor evaluation submitted', message: `Your supervisor submitted an evaluation for ${data.companyName}.`, type: 'evaluation', read: false, createdAt: submittedAt });
    });
    res.json({ success: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Could not submit evaluation' });
  }
});

app.post('/refine-logbook', requireUser, async (req, res) => {
  const { notes } = req.body || {};
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required' });
  if (!allowRate(req, res, { limit: 5, windowMs: 60_000, key: request => `refine:${request.user.uid}` })) return;
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 8000) return res.status(400).json({ error: 'Enter logbook notes up to 8,000 characters.' });
  if (process.env.PATHWAY_LOCAL_WORKFLOW === '1' || !process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI refinement is unavailable in this environment.' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            process.env.ANTHROPIC_API_KEY,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role:    'user',
          content: `You are an OJT logbook assistant. Rewrite the following student's informal weekly notes into a professional, formal OJT logbook entry. Keep it concise, use past tense, and maintain all the key activities. Do not add information that wasn't mentioned. Return only the refined entry, no preamble.\n\nStudent notes:\n${notes.trim()}`
        }]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: 'AI refinement is temporarily unavailable.' });
    return res.json({ refined: data.content?.[0]?.text || '' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'AI request failed' });
  }
});




app.post('/create-coordinator', requireStaff, async (req, res) => {
  if (req.staff.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  const { firstName, lastName, email, password, department } = req.body;
  if (!firstName || !lastName || !email || !password || !department)
    return res.status(400).json({ error: 'All fields required' });
  try {
    const existing = await adminDb.collection('users')
      .where('role', '==', 'coordinator')
      .where('department', '==', department)
      .get();
    if (!existing.empty)
      return res.status(400).json({ error: 'This department already has a coordinator.' });
    const user = await adminAuth.createUser({ email, password });
    await adminDb.collection('users').doc(user.uid).set({
      uid: user.uid, email, firstName, lastName,
      role: 'coordinator', department, accountApproved: true,
      createdAt: new Date().toISOString(),
    });
    await recordAudit({ actorId: req.staff.uid, actorRole: req.staff.role, action: 'coordinator.created', targetType: 'users', targetId: user.uid, details: { department, email } });
    res.json({ success: true, uid: user.uid });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST?.trim();
const onListening = () => {
  console.log(`Backend running on ${host ? `${host}:` : ''}${port}`);
};
if (host) app.listen(port, host, onListening);
else app.listen(port, onListening);
