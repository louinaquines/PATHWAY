const assert = require('node:assert/strict');

const PROJECT_ID = 'demo-pathway-security';
const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8080';
const API_URL = 'http://127.0.0.1:3100';
const PASSWORD = 'PathwayLocal!2026';
const STUDENT_EMAIL = 'student.emulator@pathway.test';
const COORDINATOR_EMAIL = 'coordinator.emulator@pathway.test';

process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;
process.env.PATHWAY_LOCAL_WORKFLOW = '1';

const { initializeApp, deleteApp } = require('firebase/app');
const {
  connectAuthEmulator, getAuth, signInWithEmailAndPassword,
} = require('firebase/auth');
const {
  collection, connectFirestoreEmulator, doc, getDocFromServer, getDocs, getFirestore, query, where,
} = require('firebase/firestore');
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require('firebase-admin/app');
const { getFirestore: getAdminFirestore } = require('firebase-admin/firestore');

function createClient(name) {
  const app = initializeApp({ apiKey: 'emulator-only-api-key', projectId: PROJECT_ID }, name);
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, auth, db };
}

async function authenticatedPost(auth, path, payload) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await auth.currentUser.getIdToken(true)}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${path}: ${body.error || response.status}`);
  return body;
}

async function main() {
  assert.equal(process.env.PATHWAY_LOCAL_WORKFLOW, '1', 'Run this only inside npm run dev:emulator.');
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, PROJECT_ID);
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, AUTH_EMULATOR);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR);

  const studentClient = createClient('pathway-workflow-student');
  const coordinatorClient = createClient('pathway-workflow-coordinator');
  try {
    await Promise.all([
      signInWithEmailAndPassword(studentClient.auth, STUDENT_EMAIL, PASSWORD),
      signInWithEmailAndPassword(coordinatorClient.auth, COORDINATOR_EMAIL, PASSWORD),
    ]);
    const studentId = studentClient.auth.currentUser.uid;
    const coordinatorId = coordinatorClient.auth.currentUser.uid;
    const studentRef = doc(studentClient.db, 'users', studentId);
    const coordinatorRef = doc(coordinatorClient.db, 'users', coordinatorId);
    const [studentSnap, coordinatorSnap, companiesSnap] = await Promise.all([
      getDocFromServer(studentRef),
      getDocFromServer(coordinatorRef),
      getDocs(collection(studentClient.db, 'companies')),
    ]);
    assert.equal(studentSnap.data()?.role, 'student');
    assert.equal(coordinatorSnap.data()?.role, 'coordinator');
    assert.ok(companiesSnap.docs.some(item => item.id === 'pathway-emulator-company'));

    const aiResponse = await fetch(`${API_URL}/refine-logbook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await studentClient.auth.currentUser.getIdToken(true)}`,
      },
      body: JSON.stringify({ notes: 'Local emulator AI isolation check.' }),
    });
    assert.equal(aiResponse.status, 503, 'AI refinement must not make external API calls in local workflow mode.');

    const existing = await getDocs(query(
      collection(studentClient.db, 'companyProposals'),
      where('studentId', '==', studentId),
    ));
    assert.equal(existing.docs.some(item => item.data().status === 'pending_review'), false,
      'A clean emulator session is required; a placement request is already pending.');

    const placement = await authenticatedPost(studentClient.auth, '/student/company-proposals', {
      companyId: 'pathway-emulator-company',
      companyName: 'Emulator Host Co.',
      companyAddress: '100 Emulator Avenue, Lapu-Lapu City',
      companyIndustry: 'Software and Technology',
      companyEmail: 'hello@emulator-host.test',
      companyPhone: '032-555-0100',
      supervisorName: 'Jordan Supervisor',
      supervisorPosition: 'Engineering Lead',
      supervisorEmail: 'jordan@emulator-host.test',
      supervisorPhone: '032-555-0101',
      internshipRole: 'Workflow Test Intern',
      startDate: '2026-10-01',
      endDate: '2026-12-15',
      workArrangement: 'On-site',
      notes: 'Local emulator integration test.',
      status: 'pending_review',
    });
    const proposalRef = doc(studentClient.db, 'companyProposals', placement.id);
    assert.equal((await getDocFromServer(proposalRef)).data()?.status, 'pending_review');

    await authenticatedPost(coordinatorClient.auth,
      `/coordinator/company-placements/${encodeURIComponent(placement.id)}/decision`,
      { status: 'needs_revision', reason: 'Please confirm the proposed internship role.' });
    assert.equal((await getDocFromServer(proposalRef)).data()?.status, 'needs_revision');

    await authenticatedPost(studentClient.auth, '/student/company-proposals', {
      companyId: 'pathway-emulator-company',
      companyName: 'Emulator Host Co.',
      companyAddress: '100 Emulator Avenue, Lapu-Lapu City',
      companyIndustry: 'Software and Technology',
      companyEmail: 'hello@emulator-host.test',
      companyPhone: '032-555-0100',
      supervisorName: 'Jordan Supervisor',
      supervisorPosition: 'Engineering Lead',
      supervisorEmail: 'jordan@emulator-host.test',
      supervisorPhone: '032-555-0101',
      internshipRole: 'Software QA Intern',
      startDate: '2026-10-01',
      endDate: '2026-12-15',
      workArrangement: 'On-site',
      notes: 'Updated after coordinator feedback.',
      proposalId: placement.id,
      status: 'pending_review',
    });
    await authenticatedPost(coordinatorClient.auth,
      `/coordinator/company-placements/${encodeURIComponent(placement.id)}/decision`,
      { status: 'approved' });

    const assignedStudent = (await getDocFromServer(studentRef)).data();
    assert.equal(assignedStudent.placementStatus, 'approved');
    assert.equal(assignedStudent.company, 'Emulator Host Co.');
    assert.equal(assignedStudent.internshipRole, 'Software QA Intern');
    assert.equal(assignedStudent.requirements.endorsement_letter.status, 'needs_revision');
    assert.equal(assignedStudent.requirements.signed_moa.status, 'needs_revision');

    // The local workflow has no Cloudinary uploads. Only in this isolated demo,
    // simulate completion of the now-required document review before Step 4.
    const fixtureApp = initializeAdminApp({ projectId: PROJECT_ID }, 'pathway-workflow-document-fixture');
    try {
      const fixtureDb = getAdminFirestore(fixtureApp);
      await fixtureDb.collection('users').doc(studentId).update({
        'requirements.endorsement_letter.status': 'approved',
        'requirements.endorsement_letter.placementProposalId': placement.id,
        'requirements.signed_moa.status': 'approved',
        requirementsStatus: 'approved',
      });
    } finally { await deleteAdminApp(fixtureApp); }

    const finalReview = await authenticatedPost(studentClient.auth, '/student/final-reviews', {});
    const finalReviewRef = doc(studentClient.db, 'finalReviewRequests', finalReview.requestId);
    const pendingFinalReview = (await getDocFromServer(finalReviewRef)).data();
    assert.equal(pendingFinalReview?.status, 'pending_review');
    assert.equal(pendingFinalReview?.studentName, 'Taylor Student');
    await authenticatedPost(coordinatorClient.auth,
      `/coordinator/final-reviews/${encodeURIComponent(finalReview.requestId)}/decision`,
      { status: 'approved' });

    const approvedStudent = (await getDocFromServer(studentRef)).data();
    assert.equal(approvedStudent.preDeploymentStatus, 'approved');
    const studentNotifications = await getDocs(query(
      collection(studentClient.db, 'notifications'),
      where('recipientId', '==', studentId),
    ));
    assert.ok(studentNotifications.size >= 2, 'Student placement/final-review notifications should be visible.');

    console.log('PASS: Student and coordinator Auth/Firestore clients connected to local emulators.');
    console.log('PASS: Placement proposal → coordinator revision → student resubmission → official approval.');
    console.log('PASS: Placement invalidates endorsement/MOA; emulator-only document review fixture → final approval → student dashboard eligibility.');
    console.log('PASS: Student-scoped Firestore reads include the workflow notifications.');
  } finally {
    await Promise.all([deleteApp(studentClient.app), deleteApp(coordinatorClient.app)]);
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
