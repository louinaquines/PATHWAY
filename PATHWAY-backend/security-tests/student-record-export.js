// Fixed live test-account reads only. REST field values preserve Firestore types.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const uid = 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2';
async function main() {
  require('dotenv').config({ path: path.resolve(__dirname, '../../PATHWAY-web/.env'), quiet: true });
  assert.equal(process.env.REACT_APP_FIREBASE_PROJECT_ID, 'pathway-57400');
  const root = path.resolve(__dirname, '../.env-backup-restore-tests');
  const source = path.resolve(process.env.PATHWAY_ACQUIRED_TEST_DOCUMENT || '');
  assert.equal(path.dirname(source), root); assert.match(path.basename(source), /^student-document-[a-f0-9-]{36}$/);
  const binding = JSON.parse(fs.readFileSync(path.join(source, 'student-binding.json')));
  assert.equal(binding.studentId, uid); assert.equal(binding.requirementId, 'endorsement');
  assert.equal(binding.requirement.fileName, 'test-only-fictional-signature.pdf');
  const { initializeApp, deleteApp } = require('../../PATHWAY-web/node_modules/firebase/app');
  const { getAuth, signInWithEmailAndPassword, signOut } = require('../../PATHWAY-web/node_modules/firebase/auth');
  const app = initializeApp({ apiKey: process.env.REACT_APP_FIREBASE_API_KEY, projectId: 'pathway-57400' }, 'scoped-record-export');
  const auth = getAuth(app);
  try {
    const signed = await signInWithEmailAndPassword(auth, 'loui@test.com', process.env.PATHWAY_TEST_COORDINATOR_PASSWORD);
    assert.equal(signed.user.uid, '6hNIQRfTVzXDPPHetPTEqZFelCm2');
    const token = await signed.user.getIdToken();
    const base = 'https://firestore.googleapis.com/v1/projects/pathway-57400/databases/(default)/documents/';
    async function get(relative) {
      const response = await fetch(base + relative, { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('Scoped read refused');
      const chunks = []; let count = 0;
      for await (const chunk of response.body) { count += chunk.length; if (count > 4 * 1024 * 1024) throw new Error('Read limit'); chunks.push(chunk); }
      return JSON.parse(Buffer.concat(chunks));
    }
    async function inventory() {
      const profile = await get('users/' + uid);
      assert.equal(profile.fields.email.stringValue, 'dex@gmail.com'); assert.equal(profile.fields.role.stringValue, 'student');
      const req = profile.fields.requirements.mapValue.fields.endorsement.mapValue.fields;
      assert.equal(req.fileName.stringValue, binding.requirement.fileName);
      assert.equal(req.cloudinaryPublicId.stringValue, binding.requirement.cloudinaryPublicId);
      assert.equal(String(req.cloudinaryVersion.integerValue || req.cloudinaryVersion.doubleValue), String(binding.requirement.cloudinaryVersion));
      const documents = [profile]; const counts = {};
      for (const collection of ['attendance', 'logbook']) {
        let pageToken = ''; let pages = 0; let total = 0;
        do {
          assert.ok(++pages <= 20);
          const result = await get(`users/${uid}/${collection}?pageSize=100` + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''));
          for (const item of result.documents || []) {
            assert.ok(item.name.startsWith(`projects/pathway-57400/databases/(default)/documents/users/${uid}/${collection}/`));
            documents.push(item); total++;
          }
          pageToken = result.nextPageToken || '';
        } while (pageToken);
        counts[collection] = total;
      }
      documents.sort((a,b) => a.name.localeCompare(b.name));
      // Do not export credential-like fields, even from a testing profile.
      function checkFields(fields) {
        for (const [key, value] of Object.entries(fields || {})) {
          assert.ok(!/password|secret|refresh.?token|access.?token|private.?key/i.test(key));
          if (value.mapValue) checkFields(value.mapValue.fields);
          for (const item of value.arrayValue?.values || []) if (item.mapValue) checkFields(item.mapValue.fields);
        }
      }
      documents.forEach(item => checkFields(item.fields));
      return { documents, counts };
    }
    const first = await inventory(); const second = await inventory();
    assert.deepEqual(second, first); // Detect changed records and membership; not a global point-in-time snapshot.
    const bytes = fs.readFileSync(binding.attachment.source);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), binding.attachment.sha256);
    const destination = path.join(root, 'student-document-' + crypto.randomUUID());
    fs.mkdirSync(destination, { mode: 0o700 });
    const newSource = path.join(destination, path.basename(binding.attachment.source));
    fs.writeFileSync(newSource, bytes, { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(path.join(destination, 'student-binding.json'), JSON.stringify({ ...binding, attachment: { ...binding.attachment, source: newSource } }), { flag: 'wx', mode: 0o600 });
    const exportData = { version: 1, project: 'pathway-57400', studentId: uid, exportedAt: new Date().toISOString(),
      coverage: ['student-profile', 'attendance', 'logbook', 'fictional-endorsement-bytes'],
      excluded: ['Auth credentials/password hashes', 'other uploaded files including resume', 'notifications', 'messages', 'company and section documents', 'other collections'],
      consistency: 'two matching sequential reads; not point-in-time', ...first };
    fs.writeFileSync(path.join(destination, 'scoped-records.json'), JSON.stringify(exportData), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ scopedRecordsExported: first.documents.length, ...first.counts, twoReadsMatched: true, sourceDocumentBindingMatched: true,
      databaseWrites: 0, authExported: false, productionBackupComplete: false, protectedStaging: destination }));
  } finally { await signOut(auth); await deleteApp(app); }
}
main().then(() => process.exit(0)).catch(() => { console.error('Scoped export incomplete; no credentials or record contents logged. Do not use partial staging.'); process.exit(1); });
