// Read-only, fixed test student + fictional endorsement; never crawls other files.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { acquire } = require('../attachmentRecovery');
const { loadLocalCloudinaryQa } = require('../localCloudinaryQa');
const { cloudinaryConfig, signParams } = require('../cloudinaryUploads');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
async function bounded(url, options, maxBytes) {
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Provider request refused');
  const chunks = []; let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Provider response exceeds limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../PATHWAY-web/.env'), quiet: true });
  assert.equal(process.env.REACT_APP_FIREBASE_PROJECT_ID, 'pathway-57400');
  assert.ok(process.env.PATHWAY_TEST_COORDINATOR_PASSWORD);
  const { initializeApp, deleteApp } = require('../../PATHWAY-web/node_modules/firebase/app');
  const { getAuth, signInWithEmailAndPassword, signOut } = require('../../PATHWAY-web/node_modules/firebase/auth');
  const { getFirestore, doc, getDocFromServer } = require('../../PATHWAY-web/node_modules/firebase/firestore');
  const app = initializeApp({ apiKey: process.env.REACT_APP_FIREBASE_API_KEY, projectId: 'pathway-57400' }, 'scoped-document-read');
  const auth = getAuth(app);
  try {
    const signedIn = await signInWithEmailAndPassword(auth, 'loui@test.com', process.env.PATHWAY_TEST_COORDINATOR_PASSWORD);
    assert.equal(signedIn.user.uid, '6hNIQRfTVzXDPPHetPTEqZFelCm2');
    const db = getFirestore(app);
    async function read() {
      const profile = (await getDocFromServer(doc(db, 'users', uid))).data();
      assert.equal(profile.email, 'dex@gmail.com'); assert.equal(profile.role, 'student');
      const requirement = profile.requirements?.endorsement;
      assert.equal(requirement?.fileName, 'test-only-fictional-signature.pdf');
      assert.ok(requirement.cloudinaryPublicId.startsWith(`pathway/requirements/${uid}/endorsement-`));
      return requirement;
    }
    const original = await read();
    const url = new URL(original.fileUrl);
    assert.equal(url.protocol, 'https:'); assert.equal(url.hostname, 'res.cloudinary.com');
    assert.ok(!url.username && !url.password && !url.port && !url.search && !url.hash);
    const parts = url.pathname.slice(1).split('/');
    const [cloudName, resourceType, deliveryType, version] = parts;
    assert.ok(['raw', 'image'].includes(resourceType)); assert.ok(['upload', 'authenticated'].includes(deliveryType));
    assert.equal(version, 'v' + original.cloudinaryVersion);
    assert.equal(parts.slice(4).map(decodeURIComponent).join('/'), original.cloudinaryPublicId + (resourceType === 'image' ? '.pdf' : ''));
    const env = { PATHWAY_LOCAL_WORKFLOW: '1' };
    assert.ok(loadLocalCloudinaryQa(env));
    const config = cloudinaryConfig(env); assert.equal(config.cloudName, cloudName);
    async function metadata() {
      const id = original.cloudinaryPublicId.split('/').map(encodeURIComponent).join('/');
      return JSON.parse((await bounded(`https://api.cloudinary.com/v1_1/${cloudName}/resources/${resourceType}/${deliveryType}/${id}`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64') },
      }, 1024 * 1024)).toString());
    }
    const asset = await metadata();
    const record = { recordPath: `users/${uid}`, cloudName, resourceType, deliveryType,
      publicId: original.cloudinaryPublicId, version: String(original.cloudinaryVersion), assetId: asset.asset_id };
    const root = path.resolve(__dirname, '../.env-backup-restore-tests');
    assert.ok(fs.statSync(root).isDirectory());
    assert.ok(!fs.lstatSync(root).isSymbolicLink());
    const destination = path.join(root, 'student-document-' + crypto.randomUUID());
    const attachments = await acquire([record], destination, {
      readRecord: async () => { assert.deepEqual(await read(), original); return record; },
      readMetadata: metadata,
      downloadBytes: async (_, { maxBytes }) => {
        const params = { asset_id: record.assetId, attachment: 'true', target_filename: 'TEST-ONLY-fictional-signature.pdf', timestamp: Math.floor(Date.now() / 1000) };
        const query = new URLSearchParams({ ...params, api_key: config.apiKey, signature: signParams(params, config.apiSecret) });
        return bounded(`https://api.cloudinary.com/v1_1/${cloudName}/asset/download?${query}`, {}, maxBytes);
      },
    });
    const bytes = fs.readFileSync(attachments[0].source);
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    fs.writeFileSync(path.join(destination, 'student-binding.json'), JSON.stringify({
      project: 'pathway-57400', studentId: uid, requirementId: 'endorsement', requirement: original,
      attachment: attachments[0], synthetic: false, testAccountOnly: true,
    }), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ acquiredTestStudentDocument: true, bytes: bytes.length,
      providerIdentityVerified: true, sourceUnchanged: true, databaseWrites: 0, providerUploads: 0,
      protectedStaging: destination, encryptedBackupCreated: false }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().then(() => process.exit(0)).catch(() => { console.error('Scoped acquisition failed; no credentials logged. Any partial staging must stay isolated.'); process.exit(1); });
