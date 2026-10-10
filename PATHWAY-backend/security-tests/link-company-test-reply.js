// Fixed, user-authorized test conversation. Dry-run by default; no student updates.
const crypto = require('node:crypto');
const { findTestMessage } = require('./company-inbox-live-qa');
const normalizeSection = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
function verifyMapping(owner, section, student) {
  if (owner.email !== 'loui@test.com' || owner.role !== 'coordinator' || !owner.uid
    || section.coordinatorId !== owner.uid || section.department !== owner.department
    || normalizeSection(section.name) !== 'bsit4g'
    || student.role !== 'student' || student.sectionId !== section.id || student.department !== owner.department
    || `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase() !== 'dexter tampus') {
    throw new Error('Test coordinator, section or student assignment does not match.');
  }
}
async function main(apply = false) {
  if (process.env.GOOGLE_CLOUD_PROJECT !== 'pathway-57400' || process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Explicit pathway-57400 project configuration required.');
  }
  const app = require('../firebaseAdmin');
  const auth = require('firebase-admin/auth').getAuth(app);
  const db = require('firebase-admin/firestore').getFirestore(app);
  const user = await auth.getUserByEmail('loui@test.com');
  const ownerRef = db.collection('users').doc(user.uid);
  const owner = { ...(await ownerRef.get()).data(), uid: user.uid, email: user.email };
  const sections = await db.collection('sections').where('coordinatorId', '==', user.uid).get();
  const candidates = sections.docs.filter(doc => normalizeSection(doc.data().name) === 'bsit4g');
  if (candidates.length !== 1) throw new Error('Expected one assigned BSIT 4G section.');
  const sectionRef = candidates[0].ref;
  const studentRef = db.collection('users').doc('CEIKzqvDGQfkp1FyidGZ1ftUTRi2');
  const section = { ...candidates[0].data(), id: candidates[0].id };
  verifyMapping(owner, section, (await studentRef.get()).data() || {});
  const { found } = await findTestMessage();
  const conversationId = crypto.createHash('sha256').update(`${user.uid}:${section.id}:${found.id}`).digest('hex');
  const mappingRef = sectionRef.collection('companyConversations').doc(conversationId);
  if (apply) await db.runTransaction(async tx => {
    const [freshOwner, freshSection, freshStudent, existing] = await Promise.all([tx.get(ownerRef), tx.get(sectionRef), tx.get(studentRef), tx.get(mappingRef)]);
    verifyMapping({ ...freshOwner.data(), uid: user.uid }, { ...freshSection.data(), id: section.id }, freshStudent.data() || {});
    if (existing.exists) {
      const saved = existing.data();
      if (saved.providerThreadId !== found.id || saved.studentId !== studentRef.id || saved.coordinatorId !== user.uid || saved.sectionId !== section.id) throw new Error('Conflicting mapping; refusing overwrite.');
      return;
    }
    tx.create(mappingRef, { coordinatorId: user.uid, sectionId: section.id, studentId: studentRef.id,
      companyName: 'TEST ONLY — Company reply', providerThreadId: found.id, testOnly: true,
      createdAt: new Date().toISOString(), sourceMailbox: 'pathwaysystem4@gmail.com' });
  });
  console.log(JSON.stringify({ assignmentVerified: true, testMessageVerified: true, mappingSaved: apply,
    studentChanged: false, emailsSent: false, productionInboxEnabled: false, ownerId: user.uid }));
}
if (require.main === module) main(process.argv.includes('--apply')).catch(error => {
  console.error(error.code === 'app/invalid-credential' ? 'Firebase authorization is unavailable. No mapping saved.' : 'Test reply linking failed. No credentials or provider details logged.');
  process.exitCode = 1;
});
module.exports = { verifyMapping, normalizeSection };
