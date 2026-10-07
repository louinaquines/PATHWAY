// Explicitly local-only: creates a new synthetic fixture, never rewrites Journey QA.
const assert = require('node:assert/strict');
process.env.GOOGLE_CLOUD_PROJECT = 'demo-pathway-security';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-pathway-security' });
const auth = getAuth(app);
const db = getFirestore(app);
const password = 'PathwayLocal!2026';
const originalId = 'qa-student-1791394168775';

async function tokenFor(email) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only-api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const session = await response.json();
  assert.ok(session.idToken, 'Local demo sign-in failed');
  return session.idToken;
}
async function post(token, path, payload, expected = 200) {
  const response = await fetch(`http://127.0.0.1:3100${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${result.error || response.status}`);
  return result;
}
async function main() {
  const originalRef = db.doc(`users/${originalId}`);
  const original = (await originalRef.get()).data();
  assert.equal(original?.qaFixture, true);
  assert.equal(original.preDeploymentStatus, 'approved');
  const originalEvaluations = await db.collection('evaluations').where('studentId', '==', originalId).get();
  const submitted = originalEvaluations.docs.filter(item => item.data().used && item.data().submittedAt);
  assert.ok(submitted.length, 'The active Journey QA account must have a submitted evaluation.');
  const section = (await db.doc(`sections/${original.sectionId}`).get()).data();
  assert.ok(section?.coordinatorId);
  const coordinator = await auth.getUser(section.coordinatorId);
  const coordinatorToken = await tokenFor(coordinator.email);
  const uid = `qa-clearance-${Date.now()}`;
  const email = `${uid}@pathway.test`;
  await auth.createUser({ uid, email, password, emailVerified: true });
  const ref = db.doc(`users/${uid}`);
  const required = Number(original.hoursRequired || section.hoursRequired || 486);
  await ref.set({ uid, email, firstName: 'Clearance', lastName: 'QA', idNumber: `QA-CLEARANCE-${Date.now()}`, role: 'student', department: original.department, sectionId: original.sectionId, accountApproved: true, status: 'approved', requirementsStatus: 'approved', placementStatus: 'approved', preDeploymentStatus: 'approved', hoursRequired: required, hoursRendered: .03, clearanceStatus: 'not_cleared', qaFixture: true, isEmulatorDemo: true, qaPurpose: 'Synthetic clearance and record-lock test; hours are not real attendance.' });
  const studentToken = await tokenFor(email);
  await ref.collection('logbook').doc('qa-lock-check').set({ weekNum: 1, hours: 1, rawNotes: 'Synthetic QA entry', refined: 'Synthetic QA entry', status: 'pending', createdAt: new Date().toISOString() });
  await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {}, 409);
  console.log('PASS: insufficient hours block clearance.');
  await ref.update({ hoursRendered: required });
  await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {}, 409);
  console.log('PASS: completed hours without a supervisor evaluation still block clearance.');
  const invitation = await post(coordinatorToken, '/create-evaluation-token', { studentId: uid, supervisorName: 'Local QA Supervisor', supervisorEmail: 'supervisor@pathway.test', companyName: 'Synthetic Clearance QA Host' });
  const ratings = { technicalSkills: 4, workQuality: 4, professionalism: 4, communication: 4, attendance: 4 };
  await post(null, `/evaluation/${invitation.token}/submit`, { ratings, comments: 'Synthetic local clearance test, not a real supervisor assessment.' });
  await post(null, `/evaluation/${invitation.token}/submit`, { ratings, comments: 'Duplicate' }, 410);
  await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {});
  const cleared = (await ref.get()).data();
  assert.equal(cleared.clearanceStatus, 'cleared');
  assert.equal(cleared.clearedBy, section.coordinatorId);
  assert.ok(cleared.clearedAt);
  const notices = await db.collection('notifications').where('recipientId', '==', uid).where('type', '==', 'clearance').get();
  assert.equal(notices.size, 1);
  console.log('PASS: eligible fixture clears; coordinator identity, timestamp, and student notification are recorded.');
  await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {}, 409);
  await post(studentToken, '/attendance/time-in', {}, 403);
  await post(studentToken, '/attendance/time-out', {}, 403);
  await post(studentToken, '/student/final-reviews', {}, 409);
  await post(coordinatorToken, `/coordinator/students/${uid}/logbook/qa-lock-check/decision`, { status: 'approved' }, 409);
  await post(coordinatorToken, '/create-evaluation-token', { studentId: uid, supervisorName: 'Local QA Supervisor', supervisorEmail: 'supervisor@pathway.test', companyName: 'Synthetic Clearance QA Host' }, 409);
  assert.equal((await ref.collection('logbook').doc('qa-lock-check').get()).data().status, 'pending');
  console.log('PASS: duplicate clearance, attendance, final-review submission, journal decisions, and new evaluation invitations are blocked after clearance.');
  assert.equal((await originalRef.get()).data().hoursRendered, original.hoursRendered);
  assert.equal((await originalRef.get()).data().clearanceStatus, original.clearanceStatus);
  console.log(`PASS: active Journey QA has ${submitted.length} submitted evaluation(s); attendance and clearance were not changed.`);
  console.log(`Fixture retained for coordinator UI review: Clearance QA (${uid}). Its completed hours are explicitly synthetic.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await deleteApp(app); });
