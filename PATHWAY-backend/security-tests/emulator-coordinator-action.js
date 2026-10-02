const PROJECT_ID = 'demo-pathway-security';
const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8080';
const API_URL = 'http://127.0.0.1:3100';
const STUDENT_EMAIL = 'student.emulator@pathway.test';
const COORDINATOR_EMAIL = 'coordinator.emulator@pathway.test';
const PASSWORD = 'PathwayLocal!2026';

process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;

const { getAuth: getAdminAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeApp: initializeAdminApp } = require('firebase-admin/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const { initializeApp } = require('firebase/app');

const validDecisions = new Set(['approved', 'needs_revision', 'rejected']);

async function main() {
  const [kind, status, ...reasonParts] = process.argv.slice(2);
  if (!['placement', 'final-review'].includes(kind) || !validDecisions.has(status)) {
    throw new Error('Usage: npm run emulator:decision -- <placement|final-review> <approved|needs_revision|rejected> [reason]');
  }
  const reason = reasonParts.join(' ').trim()
    || (status === 'approved' ? '' : 'Please update this submission and resubmit for coordinator review.');

  const adminApp = initializeAdminApp({ projectId: PROJECT_ID }, 'pathway-emulator-coordinator-inspector');
  const adminAuth = getAdminAuth(adminApp);
  const adminDb = getFirestore(adminApp);
  const [student, coordinator] = await Promise.all([
    adminAuth.getUserByEmail(STUDENT_EMAIL),
    adminAuth.getUserByEmail(COORDINATOR_EMAIL),
  ]);
  const collectionName = kind === 'placement' ? 'companyProposals' : 'finalReviewRequests';
  const snapshot = await adminDb.collection(collectionName).where('studentId', '==', student.uid).get();
  const pending = snapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.status === 'pending_review')
    .sort((left, right) => String(right.updatedAt || right.submittedAt || '').localeCompare(String(left.updatedAt || left.submittedAt || '')))[0];
  if (!pending) throw new Error(`No pending ${kind} request was found for the seeded student.`);

  const clientApp = initializeApp({ apiKey: 'emulator-only-api-key', projectId: PROJECT_ID }, 'pathway-emulator-coordinator-client');
  const clientAuth = getAuth(clientApp);
  connectAuthEmulator(clientAuth, `http://${AUTH_EMULATOR}`, { disableWarnings: true });
  const credential = await signInWithEmailAndPassword(clientAuth, COORDINATOR_EMAIL, PASSWORD);
  const endpoint = kind === 'placement'
    ? `/coordinator/company-placements/${encodeURIComponent(pending.id)}/decision`
    : `/coordinator/final-reviews/${encodeURIComponent(pending.id)}/decision`;
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await credential.user.getIdToken(true)}`,
    },
    body: JSON.stringify({ status, reason }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${kind} decision failed (${response.status}).`);

  const studentProfile = await adminDb.collection('users').doc(student.uid).get();
  const profile = studentProfile.data() || {};
  console.log(`${kind} ${status}: ${pending.id}`);
  if (kind === 'placement') {
    console.log(`Official placement status: ${profile.placementStatus || 'not set'}`);
    console.log(`Official company: ${profile.company || 'not set'}`);
  } else {
    console.log(`Student pre-deployment status: ${profile.preDeploymentStatus || 'not set'}`);
  }

  await require('firebase/app').deleteApp(clientApp);
  await require('firebase-admin/app').deleteApp(adminApp);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
