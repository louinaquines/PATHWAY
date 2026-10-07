// Local-only fixtures and coordinator actions for browser QA. Each seed creates
// a separate student and company; existing demo students are never rewritten.
const assert = require('node:assert/strict');
process.env.GOOGLE_CLOUD_PROJECT = 'demo-pathway-security';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ projectId: 'demo-pathway-security' });
const db = getFirestore(app);
const auth = getAuth(app);
const PASSWORD = 'PathwayLocal!2026';
const [command, uid] = process.argv.slice(2);

async function tokenFor(email) {
  const login = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const session = await login.json();
  assert.ok(session.idToken, 'Demo sign-in failed.');
  return session.idToken;
}
async function post(token, path, payload, expectedStatus) {
  const response = await fetch(`http://127.0.0.1:3100${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (expectedStatus) assert.equal(response.status, expectedStatus, result.error);
  else assert.equal(response.ok, true, result.error || JSON.stringify(result));
  return result;
}
async function reviewedDocuments(ref, profile) {
  const configured = await db.collection(`sections/${profile.sectionId}/requirements`).get();
  const requirements = Object.fromEntries(configured.docs.map(item => [item.id, {
    status: 'approved', fileName: `qa-${item.id}.pdf`, submittedAt: new Date().toISOString(),
    ...(item.id === 'endorsement_letter' && profile.placementProposalId ? { placementProposalId: profile.placementProposalId } : {}),
  }]));
  await ref.update({ requirements, requirementsStatus: 'approved' });
}

async function main() {
  if (command === 'seed') {
    const id = `qa-student-${Date.now()}`;
    const email = `${id}@pathway.test`;
    const source = await auth.getUserByEmail('student.emulator@pathway.test');
    const profile = (await db.doc(`users/${source.uid}`).get()).data();
    assert.ok(profile?.sectionId, 'The demo workflow must be running.');
    const companyId = `${id}-company`;
    await auth.createUser({ uid: id, email, password: PASSWORD, emailVerified: true });
    await db.doc(`users/${id}`).set({
      uid: id, email, firstName: 'Journey', lastName: 'QA', role: 'student',
      department: profile.department, sectionId: profile.sectionId,
      accountApproved: true, status: 'approved', isEmulatorDemo: true,
      idNumber: 'QA-JOURNEY', hoursRequired: 486, hoursRendered: 0,
      requirementsStatus: 'not_submitted', requirements: {},
      placementStatus: 'not_started', preDeploymentStatus: 'not_submitted',
      qaFixture: true, qaCompanyId: companyId,
    });
    await db.doc(`companies/${companyId}`).set({
      name: 'Journey QA Host', address: '100 Demo Avenue', industry: 'Software',
      email: 'host@pathway.test', phone: '032-555-0100', status: 'active',
      active: true, capacity: 10, occupiedSlots: 0, availableSlots: 10, qaFixture: true,
    });
    console.log(JSON.stringify({ uid: id, email, companyId }));
    return;
  }
  assert.match(uid || '', /^qa-student-\d+$/);
  const ref = db.doc(`users/${uid}`);
  const profile = (await ref.get()).data();
  assert.equal(profile?.qaFixture, true, 'Only this script’s QA fixtures may be changed.');
  if (command === 'completion-qa') {
    assert.equal(profile.preDeploymentStatus, 'approved');
    const studentToken = await tokenFor(profile.email);
    const coordinatorToken = await tokenFor('coordinator.emulator@pathway.test');
    await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {}, 409);
    const punch = await post(studentToken, '/attendance/time-in', {}, 201);
    await post(studentToken, '/attendance/time-in', {}, 409);
    // Fixture-only clock adjustment tests hour arithmetic without waiting a shift.
    await ref.collection('attendance').doc(punch.id).update({ timeIn: new Date(Date.now() - 8 * 3600000).toISOString() });
    const out = await post(studentToken, '/attendance/time-out', {});
    assert.equal(out.hoursToday, 8);
    await post(studentToken, '/attendance/time-out', {}, 409);
    assert.equal((await ref.get()).data().hoursRendered, 8);
    const journal = ref.collection('logbook').doc('qa-completion');
    await journal.set({ rawNotes: 'Completed QA testing.', refined: 'Completed QA testing.', weekNum: 1, weekRange: 'QA Week', hours: 8, status: 'pending', createdAt: new Date().toISOString() });
    await post(coordinatorToken, `/coordinator/students/${uid}/logbook/${journal.id}/decision`, { status: 'approved' });
    assert.equal((await journal.get()).data().status, 'approved');
    const evaluation = await post(coordinatorToken, '/create-evaluation-token', { studentId: uid, supervisorName: 'QA Supervisor', supervisorEmail: 'supervisor@pathway.test', companyName: 'Journey QA Host' });
    await post(null, `/evaluation/${evaluation.token}/submit`, { ratings: {}, comments: 'QA' }, 400);
    const ratings = { technicalSkills: 4, workQuality: 4, professionalism: 4, communication: 4, attendance: 4 };
    await post(null, `/evaluation/${evaluation.token}/submit`, { ratings, comments: 'QA fixture evaluation.' });
    await post(null, `/evaluation/${evaluation.token}/submit`, { ratings, comments: 'Duplicate.' }, 410);
    await post(coordinatorToken, `/coordinator/students/${uid}/clearance`, {}, 409);
    console.log('PASS: insufficient-hours clearance blocked; attendance duplicate protection and 8-hour arithmetic; coordinator journal approval; evaluation validation and single-use protection. No real email or student upload was exercised.');
    return;
  }
  if (command === 'documents-reviewed') {
    // Cloudinary is intentionally unconfigured in the demo. Model reviewed
    // document metadata here; the multipart upload helper is tested separately.
    await reviewedDocuments(ref, profile);
    console.log('PASS: emulator-only reviewed-document fixture prepared.');
    return;
  }
  if (command === 'workflow') {
    assert.equal(profile.placementStatus, 'not_started', 'Use a newly seeded QA student.');
    const studentToken = await tokenFor(profile.email);
    const coordinatorToken = await tokenFor('coordinator.emulator@pathway.test');
    const company = (await db.doc(`companies/${profile.qaCompanyId}`).get()).data();
    const placement = {
      companyId: profile.qaCompanyId, companyName: company.name, companyAddress: company.address,
      companyIndustry: company.industry, companyEmail: company.email, companyPhone: company.phone,
      supervisorName: 'QA Supervisor', supervisorEmail: 'supervisor@pathway.test',
      internshipRole: 'QA Intern', startDate: '2026-10-06', endDate: '2026-12-15', workArrangement: 'On-site',
    };
    await post(studentToken, '/student/final-reviews', {}, 409);
    await reviewedDocuments(ref, profile);
    const draft = await post(studentToken, '/student/company-proposals', { ...placement, status: 'draft' });
    await post(studentToken, '/student/company-proposals', { ...placement, proposalId: draft.id, status: 'pending_review' });
    await post(coordinatorToken, `/coordinator/company-placements/${draft.id}/decision`, { status: 'needs_revision', reason: 'QA: clarify the internship role.' });
    await post(studentToken, '/student/company-proposals', { ...placement, internshipRole: 'Software QA Intern', proposalId: draft.id, status: 'pending_review' });
    await post(coordinatorToken, `/coordinator/company-placements/${draft.id}/decision`, { status: 'approved' });
    const change = await post(studentToken, '/student/company-proposals', { ...placement, internshipRole: 'Updated Software QA Intern', status: 'pending_review' });
    await post(coordinatorToken, `/coordinator/company-placements/${change.id}/decision`, { status: 'approved' });
    const assigned = (await ref.get()).data();
    assert.equal(assigned.requirements.endorsement_letter.status, 'needs_revision');
    assert.equal(assigned.requirements.signed_moa.status, 'needs_revision');
    await post(studentToken, '/student/final-reviews', {}, 409);
    await reviewedDocuments(ref, assigned);
    const review = await post(studentToken, '/student/final-reviews', {});
    await post(coordinatorToken, `/coordinator/final-reviews/${review.requestId}/decision`, { status: 'needs_revision', reason: 'QA: verify the updated package.' });
    await post(studentToken, '/student/final-reviews', { requestId: review.requestId });
    await post(coordinatorToken, `/coordinator/final-reviews/${review.requestId}/decision`, { status: 'approved' });
    const final = (await ref.get()).data();
    assert.equal(final.preDeploymentStatus, 'approved');
    assert.equal(final.placementStatus, 'approved');
    assert.equal(final.companyId, profile.qaCompanyId);
    assert.equal(final.requirementsStatus, 'approved');
    const notices = await db.collection('notifications').where('recipientId', '==', uid).get();
    assert.ok(notices.size >= 4);
    console.log(`PASS: blocked incomplete review → placement draft/submission → revision/resubmission → official placement → document invalidation → reviewed fixture → final review revision/resubmission → final approval; ${notices.size} notifications.`);
    return;
  }
  if (command === 'verify') {
    assert.equal(profile.preDeploymentStatus, 'approved');
    assert.equal(profile.placementStatus, 'approved');
    assert.equal(profile.requirementsStatus, 'approved');
    const notices = await db.collection('notifications').where('recipientId', '==', uid).get();
    assert.ok(notices.size >= 2);
    console.log(`PASS: final approval, official placement, reviewed documents, and ${notices.size} student notifications.`);
    return;
  }
  const placement = command.startsWith('placement-');
  const records = await db.collection(placement ? 'companyProposals' : 'finalReviewRequests').where('studentId', '==', uid).get();
  const record = records.docs.map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
  assert.ok(record, 'Submit the student’s form in the browser first.');
  const validCommands = ['placement-revise', 'placement-approve', 'review-revise', 'review-approve'];
  assert.ok(validCommands.includes(command));
  const token = await tokenFor('coordinator.emulator@pathway.test');
  const status = command.endsWith('-revise') ? 'needs_revision' : 'approved';
  const path = placement ? 'company-placements' : 'final-reviews';
  await post(token, `/coordinator/${path}/${record.id}/decision`, { status, ...(status === 'needs_revision' ? { reason: 'QA: confirm the internship role before resubmitting.' } : {}) });
  console.log(`PASS: coordinator ${path} decision ${status}.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => deleteApp(app));
