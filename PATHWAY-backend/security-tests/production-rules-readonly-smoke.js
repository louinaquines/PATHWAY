// Approved test coordinator or Dexter only. No Firestore writes or account changes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, doc, collection, query, where, orderBy, limit, getDocFromServer, getDocsFromServer, terminate } = require('firebase/firestore');
async function main() {
  const config = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../../PATHWAY-web/.env')));
  assert.equal(config.REACT_APP_FIREBASE_PROJECT_ID, 'pathway-57400');
  const password = process.env.PATHWAY_QA_PASSWORD;
  const studentMode = process.env.PATHWAY_QA_ROLE === 'student';
  delete process.env.PATHWAY_QA_PASSWORD;
  assert.ok(password, 'Private test password required');
  const app = initializeApp({ apiKey: config.REACT_APP_FIREBASE_API_KEY, projectId: config.REACT_APP_FIREBASE_PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);
  try {
    const { user } = await signInWithEmailAndPassword(auth, studentMode ? 'dex@gmail.com' : 'loui@test.com', password);
    assert.equal(user.uid, studentMode ? 'CEIKzqvDGQfkp1FyidGZ1ftUTRi2' : '6hNIQRfTVzXDPPHetPTEqZFelCm2');
    const profile = await getDocFromServer(doc(db, 'users', user.uid));
    if (studentMode) {
      assert.equal(profile.data().role, 'student');
      assert.ok(profile.data().sectionId, 'Assigned section required');
      await getDocFromServer(doc(db, 'sections', profile.data().sectionId));
      const reads = [
        query(collection(db, 'sections', profile.data().sectionId, 'requirements')),
        query(collection(db, 'users', user.uid, 'attendance'), orderBy('date', 'desc'), limit(10)),
        query(collection(db, 'users', user.uid, 'logbook'), orderBy('createdAt', 'desc'), limit(5)),
        query(collection(db, 'notifications'), where('recipientId', '==', user.uid), orderBy('createdAt', 'desc'), limit(15)),
        query(collection(db, 'messages'), where('participantIds', 'array-contains', user.uid), orderBy('createdAt', 'desc'), limit(15)),
        query(collection(db, 'companyProposals'), where('studentId', '==', user.uid)),
        query(collection(db, 'finalReviewRequests'), where('studentId', '==', user.uid)),
      ];
      for (const target of reads) await getDocsFromServer(target);
      await assert.rejects(getDocFromServer(doc(db, 'users', '6hNIQRfTVzXDPPHetPTEqZFelCm2')), error => error.code === 'permission-denied');
      await assert.rejects(getDocsFromServer(query(collection(db, 'users'), where('role', '==', 'student'), limit(1))), error => error.code === 'permission-denied');
      await signOut(auth);
      await assert.rejects(getDocFromServer(doc(db, 'users', user.uid)), error => error.code === 'permission-denied');
      console.log(JSON.stringify({ studentProfileRead: true, assignedSectionRead: true, studentQueryChecks: reads.length,
        otherProfileDenied: true, unscopedStudentQueryDenied: true, signedOutProfileDenied: true, firestoreWrites: 0, studentApprovalChanged: false }));
      return;
    }
    assert.equal(profile.data().role, 'coordinator');
    const sections = await getDocsFromServer(query(collection(db, 'sections'), where('coordinatorId', '==', user.uid)));
    assert.ok(sections.size > 0, 'No assigned section available for acceptance');
    for (const section of sections.docs) {
      await getDocsFromServer(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id), where('department', '==', section.data().department), limit(5)));
    }
    await assert.rejects(getDocsFromServer(query(collection(db, 'users'), where('role', '==', 'student'), limit(1))), error => error.code === 'permission-denied');
    await signOut(auth);
    await assert.rejects(getDocFromServer(doc(db, 'users', user.uid)), error => error.code === 'permission-denied');
    console.log(JSON.stringify({ coordinatorProfileRead: true, assignedSectionQueries: true, unscopedStudentQueryDenied: true, signedOutProfileDenied: true, firestoreWrites: 0, studentApprovalChanged: false }));
  } finally { await terminate(db); await deleteApp(app); }
}
main().catch(error => { console.error('Production read-only smoke failed: ' + (error.code || 'assertion failed')); process.exitCode = 1; });
