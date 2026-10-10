const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, runTransaction } = require('firebase/firestore');
test('production Messages patch permits participant queries and recipient acknowledgments only', async () => {
  // A captured production source can be rehearsed in this demo emulator only.
  const rulesFile = process.env.PATHWAY_ROLLBACK_RULES || path.resolve(__dirname, '../../firestore.messages-only.rules');
  const env = await initializeTestEnvironment({ projectId: 'demo-pathway-message-rules', firestore: { host: '127.0.0.1', port: 8280, rules: fs.readFileSync(rulesFile, 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [id, role] of [['coordinator', 'coordinator'], ['student', 'student'], ['outsider', 'coordinator']]) await setDoc(doc(db, 'users', id), { role });
      await updateDoc(doc(db, 'users', 'coordinator'), { department: 'Computing' });
      await updateDoc(doc(db, 'users', 'outsider'), { department: 'Computing' });
      await setDoc(doc(db, 'sections', 'owned'), { coordinatorId: 'coordinator', department: 'Computing' });
      await setDoc(doc(db, 'sections', 'unowned'), { coordinatorId: 'outsider', department: 'Computing' });
      for (const name of ['companyProposals', 'finalReviewRequests', 'endorsements']) {
        await setDoc(doc(db, name, 'scoped'), { studentId: 'student', sectionId: 'owned', department: 'Computing' });
        await setDoc(doc(db, name, 'unscoped'), { studentId: 'other', sectionId: 'unowned', department: 'Computing' });
      }
      await setDoc(doc(db, 'messages', 'one'), { participantIds: ['coordinator', 'student'], recipientId: 'coordinator', body: 'Hello', read: false });
      await setDoc(doc(db, 'companies', 'one'), { name: 'Test company' });
      await setDoc(doc(db, 'companyProposals', 'own'), { studentId: 'student', status: 'approved' });
      await setDoc(doc(db, 'companyProposals', 'other'), { studentId: 'other', status: 'approved' });
      await setDoc(doc(db, 'finalReviewRequests', 'own'), { studentId: 'student' });
      await setDoc(doc(db, 'users', 'student', 'logbook', 'revision'), { weekNum: 5, weekRange: 'Oct 5 – Oct 11', createdAt: '2026-10-10T00:00:00Z', rawNotes: 'TEST rejection', refined: 'TEST rejection', aiRefined: false, hours: 40, status: 'rejected', reviewedBy: 'coordinator' });
    });
    const db = env.authenticatedContext('coordinator').firestore();
    const studentDb = env.authenticatedContext('student').firestore();
    for (const name of ['companyProposals', 'finalReviewRequests', 'endorsements']) {
      await assertSucceeds(getDocs(query(collection(db, name), where('sectionId', '==', 'owned'), where('department', '==', 'Computing'))));
      await assertFails(getDocs(query(collection(db, name), where('sectionId', '==', 'unowned'), where('department', '==', 'Computing'))));
      await assertFails(getDocs(collection(db, name)));
      await assertFails(getDoc(doc(env.authenticatedContext('outsider').firestore(), name, 'scoped')));
      await assertFails(updateDoc(doc(db, name, 'scoped'), { status: 'approved' }));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), name, 'scoped')));
    }
    const revisionRef = doc(studentDb, 'users', 'student', 'logbook', 'revision');
    await assertSucceeds(runTransaction(studentDb, async transaction => {
      await transaction.get(doc(studentDb, 'users', 'student'));
      const entry = await transaction.get(revisionRef);
      if (entry.data().status !== 'rejected') throw new Error('Not rejected');
      transaction.update(revisionRef, { rawNotes: 'TEST resubmitted', refined: 'TEST resubmitted', aiRefined: true, hours: 35, status: 'pending' });
    }));
    const revision = (await getDoc(revisionRef)).data();
    require('node:assert/strict').equal(revision.weekNum, 5);
    require('node:assert/strict').equal(revision.createdAt, '2026-10-10T00:00:00Z');
    require('node:assert/strict').equal(revision.status, 'pending');
    await assertSucceeds(getDocs(query(collection(studentDb, 'finalReviewRequests'), where('studentId', '==', 'student'))));
    await assertFails(getDocs(collection(studentDb, 'finalReviewRequests')));
    await assertFails(setDoc(doc(studentDb, 'finalReviewRequests', 'new'), { studentId: 'student' }));
    await assertSucceeds(getDocs(collection(studentDb, 'companies')));
    await assertSucceeds(getDocs(query(collection(studentDb, 'companyProposals'), where('studentId', '==', 'student'))));
    await assertFails(getDocs(collection(studentDb, 'companyProposals')));
    await assertFails(getDocs(query(collection(studentDb, 'companyProposals'), where('studentId', '==', 'other'))));
    await assertFails(setDoc(doc(studentDb, 'companyProposals', 'new'), { studentId: 'student' }));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'companies')));
    await assertSucceeds(getDocs(query(collection(db, 'messages'), where('participantIds', 'array-contains', 'coordinator'))));
    await assertFails(getDocs(collection(db, 'messages')));
    await assertFails(getDocs(query(collection(env.authenticatedContext('outsider').firestore(), 'messages'), where('participantIds', 'array-contains', 'coordinator'))));
    await assertSucceeds(updateDoc(doc(db, 'messages', 'one'), { read: true, readAt: new Date().toISOString() }));
    await assertFails(updateDoc(doc(db, 'messages', 'one'), { body: 'Edited' }));
    await assertFails(updateDoc(doc(env.authenticatedContext('student').firestore(), 'messages', 'one'), { read: true }));
    await assertFails(setDoc(doc(db, 'messages', 'new'), { participantIds: ['coordinator', 'student'] }));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'messages')));
    await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'users', 'student'), { passwordChangeRequired: true }));
    await assertFails(getDocs(collection(studentDb, 'companies')));
    await assertFails(getDocs(query(collection(env.authenticatedContext('student').firestore(), 'messages'), where('participantIds', 'array-contains', 'student'))));
  } finally { await env.cleanup(); }
});
