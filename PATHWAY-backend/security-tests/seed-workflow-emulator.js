const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { getApp, getApps, initializeApp } = require('firebase-admin/app');

const PROJECT_ID = 'demo-pathway-security';
const AUTH_EMULATOR = '127.0.0.1:9099';
const FIRESTORE_EMULATOR = '127.0.0.1:8080';
const DEPARTMENT = 'PATHWAY Emulator Lab';
const SECTION_ID = 'pathway-emulator-section';
const PASSWORD = 'PathwayLocal!2026';

// Hard-pin this utility to the local demo project before loading Admin SDKs.
process.env.GOOGLE_CLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_EMULATOR;
process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_EMULATOR;

function requireLocalEmulators() {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_EMULATOR
    || process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_EMULATOR
    || process.env.GOOGLE_CLOUD_PROJECT !== PROJECT_ID) {
    throw new Error('Refusing to seed: this command is restricted to the PATHWAY demo Auth/Firestore emulators.');
  }
}

async function ensureAccount(auth, email, firstName, lastName, role, extra = {}) {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, {
      password: PASSWORD,
      displayName: `${firstName} ${lastName}`,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({
      email,
      password: PASSWORD,
      displayName: `${firstName} ${lastName}`,
      emailVerified: true,
    });
  }

  const profile = {
    uid: user.uid,
    email,
    firstName,
    lastName,
    role,
    department: DEPARTMENT,
    sectionId: SECTION_ID,
    accountApproved: true,
    status: 'approved',
    ...extra,
  };
  await getFirestore().collection('users').doc(user.uid).set(profile, { merge: true });
  return { uid: user.uid, ...profile };
}

async function main() {
  requireLocalEmulators();
  const app = getApps().length
    ? getApp()
    : initializeApp({ projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  const administrator = await ensureAccount(
    auth,
    'admin.emulator@pathway.test',
    'Alex',
    'Administrator',
    'admin',
  );
  if (process.argv.includes('--admin-only')) {
    console.log(`Seeded emulator admin: ${administrator.email} / ${PASSWORD}`);
    return;
  }
  const coordinator = await ensureAccount(
    auth,
    'coordinator.emulator@pathway.test',
    'Casey',
    'Coordinator',
    'coordinator',
  );
  const requirementIds = [
    'application_form',
    'updated_resume',
    'medical_certificate',
    'endorsement_letter',
    'signed_moa',
  ];
  const fixtureSubmittedAt = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const requirements = Object.fromEntries(requirementIds.map(id => [id, {
    status: 'approved',
    fileName: `${id}.pdf`,
    submittedAt: fixtureSubmittedAt,
  }]));
  const student = await ensureAccount(
    auth,
    'student.emulator@pathway.test',
    'Taylor',
    'Student',
    'student',
    {
      idNumber: 'EMU-0001',
      requirementsStatus: 'approved',
      requirements,
      preDeploymentStatus: 'pending_review',
      placementStatus: 'approved',
      placementProposalId: 'pathway-emulator-placement',
      company: 'Emulator Host Co.',
      companyId: 'pathway-emulator-company',
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
      endDate: '2026-12-01',
      workArrangement: 'On-site',
      notes: '',
      hoursRendered: 0,
      hoursRequired: 486,
    },
  );
  const approvedStudent = await ensureAccount(
    auth,
    'student.approved@pathway.test',
    'Avery',
    'Demo',
    'student',
    {
      idNumber: 'EMU-0002',
      isEmulatorDemo: true,
      requirementsStatus: 'approved',
      requirements,
      preDeploymentStatus: 'approved',
      placementStatus: 'approved',
      placementProposalId: 'pathway-emulator-approved-placement',
      company: 'Emulator Host Co.',
      companyId: 'pathway-emulator-company',
      companyAddress: '100 Emulator Avenue, Lapu-Lapu City',
      companyIndustry: 'Software and Technology',
      companyEmail: 'hello@emulator-host.test',
      companyPhone: '032-555-0100',
      supervisorName: 'Jordan Supervisor',
      supervisorPosition: 'Engineering Lead',
      supervisorEmail: 'jordan@emulator-host.test',
      supervisorPhone: '032-555-0101',
      internshipRole: 'Frontend Developer Intern',
      startDate: '2026-09-01',
      endDate: '2026-12-01',
      workArrangement: 'Hybrid',
      notes: '',
      hoursRendered: 16,
      hoursRequired: 486,
    },
  );

  await db.collection('sections').doc(SECTION_ID).set({
    name: 'Emulator Test Section',
    coordinatorId: coordinator.uid,
    department: DEPARTMENT,
    hoursRequired: 486,
  }, { merge: true });
  for (const id of requirementIds) {
    await db.collection('sections').doc(SECTION_ID).collection('requirements').doc(id).set({
      label: id.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
      required: true,
      category: 'Pre-Deployment',
    }, { merge: true });
  }
  await db.collection('companies').doc('pathway-emulator-company').set({
    name: 'Emulator Host Co.',
    address: '100 Emulator Avenue, Lapu-Lapu City',
    industry: 'Software and Technology',
    email: 'hello@emulator-host.test',
    phone: '032-555-0100',
    capacity: 3,
    occupiedSlots: 2,
    availableSlots: 1,
    active: true,
    status: 'active',
  }, { merge: true });
  await db.collection('companyProposals').doc('pathway-emulator-placement').set({
    studentId: student.uid,
    studentName: `${student.firstName} ${student.lastName}`,
    department: DEPARTMENT,
    sectionId: SECTION_ID,
    coordinatorId: coordinator.uid,
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
    endDate: '2026-12-01',
    workArrangement: 'On-site',
    notes: '',
    status: 'approved',
    createdAt: fixtureSubmittedAt,
    updatedAt: fixtureSubmittedAt,
    reviewedBy: coordinator.uid,
    reviewedAt: fixtureSubmittedAt,
  }, { merge: true });

  await db.collection('companyProposals').doc('pathway-emulator-approved-placement').set({
    studentId: approvedStudent.uid,
    studentName: `${approvedStudent.firstName} ${approvedStudent.lastName}`,
    department: DEPARTMENT,
    sectionId: SECTION_ID,
    coordinatorId: coordinator.uid,
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
    internshipRole: 'Frontend Developer Intern',
    startDate: '2026-09-01',
    endDate: '2026-12-01',
    workArrangement: 'Hybrid',
    notes: '',
    status: 'approved',
    createdAt: fixtureSubmittedAt,
    updatedAt: fixtureSubmittedAt,
    reviewedBy: coordinator.uid,
    reviewedAt: fixtureSubmittedAt,
  }, { merge: true });

  console.log('Seeded isolated PATHWAY emulator workflow.');
  console.log(`Student: ${student.email} / ${PASSWORD}`);
  console.log(`Approved dashboard preview: ${approvedStudent.email} / ${PASSWORD}`);
  console.log(`Coordinator: ${coordinator.email} / ${PASSWORD}`);
  console.log(`Admin: ${administrator.email} / ${PASSWORD}`);
  console.log(`Section: ${SECTION_ID} (${DEPARTMENT})`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
