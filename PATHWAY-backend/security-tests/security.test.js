const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { SMTPServer } = require('smtp-server');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { after, before, test } = require('node:test');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { initializeApp, deleteApp } = require('firebase/app');
const {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth,
} = require('firebase/auth');
const {
  collection, doc, getDoc, getDocs, query, where, setDoc, updateDoc, addDoc, deleteDoc,
} = require('firebase/firestore');
const { signParams } = require('../cloudinaryUploads');

const projectId = 'demo-pathway-security';
const authEmulatorPort = Number(process.env.PATHWAY_AUTH_PORT || 9199);
const firestoreEmulatorPort = Number(process.env.PATHWAY_FIRESTORE_PORT || 8180);
const backendDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(backendDir, '..');
const firestoreRules = readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const authApps = [];
const identities = {};
let testEnv;
let backend;
let backendOutput = '';
let nextPort = 3110;
let cloudinaryServer;
let cloudinaryServerUrl;
let smtpServer;
let smtpRejectCompany = false;
const smtpMessages = [];
const cloudinaryAssets = new Map();
const cloudinaryDownloadAssets = new Map();
const cloudinaryDownloadRequests = [];

async function createIdentity(key, role, department, sectionId = '') {
  const app = initializeApp({ apiKey: 'emulator-test-api-key', projectId }, `security-${key}-${Date.now()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${authEmulatorPort}`, { disableWarnings: true });
  const credential = await createUserWithEmailAndPassword(auth, `${key}-${Date.now()}@pathway.test`, 'TestPass!234');
  const user = credential.user;
  const token = await user.getIdToken(true);
  const profile = {
    uid: user.uid, role, department, sectionId,
    email: user.email, firstName: key, lastName: 'Test',
    accountApproved: true, status: 'approved',
    requirementsStatus: 'approved', requirements: {},
    hoursRendered: 0, hoursRequired: 486,
  };
  identities[key] = { uid: user.uid, token, profile, auth, app };
  authApps.push(app);
  return identities[key];
}

function clientStore(identity) {
  return testEnv.authenticatedContext(identity.uid).firestore();
}

async function seed() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    for (const identity of Object.values(identities)) {
      await setDoc(doc(store, 'users', identity.uid), identity.profile);
    }
    await setDoc(doc(store, 'sections', 'section-a'), {
      name: 'Section A', coordinatorId: identities.coordinatorA.uid, department: 'Department A', hoursRequired: 486,
    });
    await setDoc(doc(store, 'sections', 'section-b'), {
      name: 'Section B', coordinatorId: identities.coordinatorB.uid, department: 'Department B', hoursRequired: 486,
    });
    await setDoc(doc(store, 'sections', 'section-a', 'requirements', 'application_form'), {
      label: 'Application Form', required: true, category: 'Pre-OJT',
    });
    await setDoc(doc(store, 'users', identities.studentA.uid, 'attendance', '2026-09-28'), {
      date: '2026-09-28', timeIn: '2026-09-28T01:00:00.000Z', status: 'pending',
    });
    await setDoc(doc(store, 'users', identities.studentA.uid, 'logbook', 'logbook-pending'), {
      rawNotes: 'Completed assigned testing tasks.', refined: 'Completed assigned testing tasks.',
      weekNum: 1, weekRange: 'Week 1', hours: 8, status: 'pending', createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'users', identities.studentB.uid, 'logbook', 'logbook-foreign'), {
      rawNotes: 'Private student notes.', refined: 'Private student notes.',
      weekNum: 1, weekRange: 'Week 1', hours: 8, status: 'pending', createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'users', identities.studentC.uid, 'logbook', 'logbook-to-reject'), {
      rawNotes: 'Completed weekly tasks.', refined: 'Completed weekly tasks.',
      weekNum: 2, weekRange: 'Week 2', hours: 8, status: 'pending', createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'notifications', 'student-a-notification'), {
      recipientId: identities.studentA.uid, title: 'Test', message: 'For student A', read: false,
    });
    await setDoc(doc(store, 'notifications', 'student-b-notification'), {
      recipientId: identities.studentB.uid, title: 'Test', message: 'For student B', read: false,
    });
    await setDoc(doc(store, 'messages', 'message-a'), {
      conversationId: 'conversation-a', participantIds: [identities.studentA.uid, identities.coordinatorA.uid],
      studentId: identities.studentA.uid, coordinatorId: identities.coordinatorA.uid,
      senderId: identities.coordinatorA.uid, senderRole: 'coordinator',
      recipientId: identities.studentA.uid, recipientRole: 'student',
      body: 'Your placement was reviewed.', read: false, createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'companyProposals', 'proposal-a'), {
      studentId: identities.studentA.uid, department: 'Department A', sectionId: 'section-a',
      companyName: 'Test Company', companyAddress: 'Test Address', supervisorName: 'Supervisor A',
      internshipRole: 'Intern', status: 'pending_review',
    });
    await setDoc(doc(store, 'companyProposals', 'proposal-c'), {
      studentId: identities.studentC.uid, department: 'Department A', sectionId: 'section-a',
      companyName: 'Another Proposed Company', supervisorName: 'Supervisor C', status: 'pending_review',
    });
    await setDoc(doc(store, 'companyProposals', 'proposal-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      companyName: 'Other Company', status: 'pending_review',
    });
    await setDoc(doc(store, 'companyProposals', 'official-placement'), {
      studentId: identities.placementStudent.uid, department: 'Department A', sectionId: 'section-a',
      companyName: 'Official Company', status: 'approved',
    });
    await setDoc(doc(store, 'companies', 'company-a'), {
      name: 'Approved Company', address: '12 Main Road', industry: 'Technology',
      email: 'hr@approved.test', phone: '555-0100', active: true, status: 'active',
      capacity: 1, occupiedSlots: 0, availableSlots: 1,
    });
    await setDoc(doc(store, 'companies', 'company-b'), {
      name: 'Secondary Company', address: '34 Side Road', industry: 'Engineering',
      email: 'hr@secondary.test', phone: '555-0101', active: true, status: 'active',
      capacity: 4, occupiedSlots: 0, availableSlots: 4,
    });
    await setDoc(doc(store, 'placementHistory', 'history-student-a'), {
      studentId: identities.studentA.uid, department: 'Department A', sectionId: 'section-a',
      before: { companyName: 'Old Company' }, after: { companyName: 'Approved Company' }, createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'placementHistory', 'history-student-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      before: { companyName: 'Old Company' }, after: { companyName: 'Other Company' }, createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'endorsements', 'endorsement-student-a'), {
      studentId: identities.studentA.uid, department: 'Department A', sectionId: 'section-a',
      coordinatorId: identities.coordinatorA.uid, companyName: 'Test Company', status: 'awaiting_document',
    });
    await setDoc(doc(store, 'endorsements', 'endorsement-student-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      coordinatorId: identities.coordinatorB.uid, companyName: 'Other Company', status: 'awaiting_document',
    });
    await setDoc(doc(store, 'systemSettings', 'global'), { defaultHoursRequired: 486, notificationsEnabled: true });
    await setDoc(doc(store, 'academicTerms', 'term-existing'), {
      name: 'First Semester 2026-2027', startDate: '2026-08-01', endDate: '2026-12-31', isActive: true,
    });
    await setDoc(doc(store, 'auditLogs', 'audit-existing'), {
      actorId: identities.admin.uid, actorRole: 'admin', action: 'test.seeded', createdAt: new Date().toISOString(),
    });
    await setDoc(doc(store, 'finalReviewRequests', 'final-a'), {
      studentId: identities.studentA.uid, department: 'Department A', sectionId: 'section-a', status: 'pending_review',
    });
    await setDoc(doc(store, 'finalReviewRequests', 'final-needs-revision'), {
      studentId: identities.studentC.uid, department: 'Department A', sectionId: 'section-a', status: 'pending_review',
    });
    await setDoc(doc(store, 'finalReviewRequests', 'final-rejected'), {
      studentId: identities.studentC.uid, department: 'Department A', sectionId: 'section-a', status: 'pending_review',
    });
    await setDoc(doc(store, 'finalReviewRequests', 'final-foreign'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b', status: 'pending_review',
    });
    await setDoc(doc(store, 'studentRoster', '12345678'), {
      idNumber: '12345678', department: 'Department A', active: true, createdBy: identities.coordinatorA.uid,
      claimedBy: identities.studentA.uid,
    });
    await setDoc(doc(store, 'users', identities.studentA.uid), {
      ...identities.studentA.profile,
      sectionId: 'section-a', department: 'Department A', placementStatus: 'approved',
      hoursRequired: 486, hoursRendered: 486,
      company: 'Test Company',
      requirements: {
        application_form: { status: 'submitted', fileUrl: 'https://example.test/application.pdf' },
        updated_resume: { status: 'approved' },
        medical_certificate: { status: 'approved' },
        endorsement_letter: { status: 'approved' },
        signed_moa: { status: 'approved' },
      },
    });
    await setDoc(doc(store, 'users', identities.studentB.uid), {
      ...identities.studentB.profile, sectionId: 'section-b', department: 'Department B',
    });
    await setDoc(doc(store, 'users', identities.placementStudent.uid), identities.placementStudent.profile);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: firestoreRules, host: '127.0.0.1', port: firestoreEmulatorPort },
  });
  await Promise.all([
    createIdentity('studentA', 'student', 'Department A', 'section-a'),
    createIdentity('studentB', 'student', 'Department B', 'section-b'),
    createIdentity('studentC', 'student', 'Department A', 'section-a'),
    createIdentity('attendanceStudent', 'student', 'Department A', 'section-a'),
    createIdentity('placementStudent', 'student', 'Department A', 'section-a'),
    createIdentity('unapprovedStudent', 'student', 'Department A', 'section-a'),
    createIdentity('coordinatorA', 'coordinator', 'Department A'),
    createIdentity('coordinatorB', 'coordinator', 'Department B'),
    createIdentity('admin', 'admin', 'Institution'),
    createIdentity('applicant', 'student', 'Department A'),
  ]);
  identities.applicant.profile.accountApproved = false;
  identities.applicant.profile.status = 'pending_registration';
  identities.applicant.profile.requirementsStatus = 'not_submitted';
  identities.unapprovedStudent.profile.accountApproved = false;
  identities.unapprovedStudent.profile.status = 'pending_registration';
  identities.studentC.profile.preDeploymentStatus = 'pending_review';
  identities.studentC.profile.placementStatus = 'approved';
  identities.attendanceStudent.profile.preDeploymentStatus = 'approved';
  identities.attendanceStudent.profile.placementStatus = 'approved';
  Object.assign(identities.placementStudent.profile, {
    preDeploymentStatus: 'pending_review', placementStatus: 'approved',
    company: 'Official Company', companyId: 'legacy-company', companyAddress: 'Official address',
    companyIndustry: 'Public Services', companyEmail: 'office@official.test', companyPhone: '555-0199',
    supervisorName: 'Official Supervisor', supervisorPosition: 'Team Lead',
    supervisorEmail: 'supervisor@official.test', supervisorPhone: '555-0188',
    internshipRole: 'Software Intern', startDate: '2026-10-01', endDate: '2027-03-31',
    workArrangement: 'On-site', placementProposalId: 'official-placement', requirements: {
      application_form: { status: 'submitted', fileName: 'application.pdf', submittedAt: '2026-09-20T00:00:00.000Z' },
    },
  });
  await seed();

  cloudinaryServer = createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const downloadPath = '/v1_1/pathway-test/asset/download';
    if (request.method === 'GET' && requestUrl.pathname === downloadPath) {
      const signedParams = {
        asset_id: requestUrl.searchParams.get('asset_id'),
        attachment: requestUrl.searchParams.get('attachment'),
        target_filename: requestUrl.searchParams.get('target_filename'),
        timestamp: requestUrl.searchParams.get('timestamp'),
      };
      const expectedSignature = signParams(signedParams, 'emulator-only-not-a-real-secret');
      if (requestUrl.searchParams.get('api_key') !== '123456789'
        || signedParams.attachment !== 'true'
        || requestUrl.searchParams.get('signature') !== expectedSignature) {
        response.writeHead(401).end();
        return;
      }
      const bytes = cloudinaryDownloadAssets.get(signedParams.asset_id);
      if (!bytes) {
        response.writeHead(404).end();
        return;
      }
      cloudinaryDownloadRequests.push(signedParams.asset_id);
      response.writeHead(200, { 'Content-Type': 'application/pdf' }).end(bytes);
      return;
    }

    const prefix = '/v1_1/pathway-test/resources/';
    if (request.method !== 'GET' || !request.url.startsWith(prefix)
      || request.headers.authorization !== `Basic ${Buffer.from('123456789:emulator-only-not-a-real-secret').toString('base64')}`) {
      response.writeHead(401).end();
      return;
    }
    const [resourceType, deliveryType, ...encodedId] = request.url.slice(prefix.length).split('/');
    const publicId = encodedId.map(decodeURIComponent).join('/');
    const asset = deliveryType === 'upload' ? cloudinaryAssets.get(`${resourceType}/${publicId}`) : null;
    if (!asset) {
      response.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(asset));
  });
  await new Promise(resolve => cloudinaryServer.listen(0, '127.0.0.1', resolve));
  cloudinaryServerUrl = `http://127.0.0.1:${cloudinaryServer.address().port}/v1_1`;

  smtpServer = new SMTPServer({
    authOptional: true, disabledCommands: ['AUTH', 'STARTTLS'],
    onRcptTo(address, _session, callback) {
      if (smtpRejectCompany && address.address === 'hr@approved.test') {
        const error = new Error('Local test rejection');
        error.responseCode = 550;
        return callback(error);
      }
      return callback();
    },
    onData(stream, session, callback) {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => {
        smtpMessages.push({
          recipients: session.envelope.rcptTo.map(item => item.address),
          raw: Buffer.concat(chunks).toString('utf8'),
        });
        callback(null, 'Local test accepted');
      });
    },
  });
  await new Promise(resolve => smtpServer.listen(0, '127.0.0.1', resolve));

  const port = nextPort++;
  backend = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env, PORT: String(port), GOOGLE_CLOUD_PROJECT: projectId,
      CLOUDINARY_CLOUD_NAME: 'pathway-test', CLOUDINARY_API_KEY: '123456789',
      CLOUDINARY_API_SECRET: 'emulator-only-not-a-real-secret',
      CLOUDINARY_API_BASE_URL: cloudinaryServerUrl,
      PATHWAY_LOCAL_WORKFLOW: '1', SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpServer.server.address().port),
      SMTP_FROM: 'pathway-test@example.invalid', SMTP_USER: 'pathway-test-user', SMTP_PASSWORD: 'pathway-test-smtp-password-not-real',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  backend.stdout.on('data', chunk => { backendOutput += chunk.toString(); });
  backend.stderr.on('data', chunk => { backendOutput += chunk.toString(); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null) throw new Error(`Backend exited during test startup:\n${backendOutput}`);
    try {
      await fetch(`${baseUrl}/`);
      globalThis.backendUrl = baseUrl;
      break;
    } catch (_) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  if (!globalThis.backendUrl) throw new Error(`Backend did not start:\n${backendOutput}`);
});

after(async () => {
  if (backend && backend.exitCode === null) {
    backend.kill();
    await once(backend, 'exit').catch(() => {});
  }
  for (const app of authApps) await deleteApp(app).catch(() => {});
  if (cloudinaryServer) await new Promise(resolve => cloudinaryServer.close(resolve));
  if (smtpServer) await new Promise(resolve => smtpServer.close(resolve));
  if (testEnv) await testEnv.cleanup();
});

test('Firestore rules scope profile reads and protect privileged student fields', async () => {
  const studentStore = clientStore(identities.studentA);
  await assertSucceeds(getDoc(doc(studentStore, 'users', identities.studentA.uid)));
  await assertFails(getDoc(doc(studentStore, 'users', identities.studentB.uid)));
  await assertSucceeds(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { firstName: 'Updated' }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { role: 'admin' }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { sectionId: 'section-b' }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { hoursRendered: 99 }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { preDeploymentStatus: 'approved' }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { 'requirements.application_form.status': 'approved' }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { profilePhotoUrl: 'https://res.cloudinary.com/fake/image/upload/photo.jpg' }));
  await assertFails(getDoc(doc(studentStore, 'cloudinaryUploadIntents', 'any-intent')));
  await assertFails(setDoc(doc(studentStore, 'cloudinaryUploadIntents', 'forged-intent'), { uid: identities.studentA.uid }));

  const adminStore = clientStore(identities.admin);
  await assertSucceeds(getDoc(doc(adminStore, 'users', identities.studentA.uid)));
  await assertSucceeds(updateDoc(doc(adminStore, 'users', identities.admin.uid), { firstName: 'Updated Admin', phone: '555-0100' }));
  await assertFails(updateDoc(doc(adminStore, 'users', identities.studentA.uid), { firstName: 'Changed by admin client' }));
  await assertFails(updateDoc(doc(adminStore, 'users', identities.studentA.uid), { company: 'Unapproved Company' }));
  await assertFails(updateDoc(doc(adminStore, 'users', identities.studentA.uid), { preDeploymentStatus: 'approved' }));
  await assertFails(updateDoc(doc(adminStore, 'users', identities.studentA.uid), { accountApproved: false }));
  await assertFails(updateDoc(doc(adminStore, 'users', identities.studentA.uid), { clearanceStatus: 'cleared' }));
  await assertFails(deleteDoc(doc(adminStore, 'users', identities.admin.uid)));
  await assertFails(deleteDoc(doc(adminStore, 'users', identities.studentA.uid)));
  await assertSucceeds(getDoc(doc(adminStore, 'placementHistory', 'history-student-a')));
  await assertSucceeds(getDoc(doc(adminStore, 'endorsements', 'endorsement-student-a')));
  await assertFails(setDoc(doc(adminStore, 'companies', 'client-created-company'), { name: 'Client Forgery' }));
  await assertFails(updateDoc(doc(adminStore, 'companies', 'company-a'), { capacity: 999 }));
  await assertFails(deleteDoc(doc(adminStore, 'companies', 'company-a')));
  await assertFails(updateDoc(doc(adminStore, 'placementHistory', 'history-student-a'), { after: { companyName: 'Forged' } }));
});

test('coordinator profile and operational reads stay within assigned section', async () => {
  const coordinatorStore = clientStore(identities.coordinatorA);
  await assertSucceeds(getDoc(doc(coordinatorStore, 'users', identities.studentA.uid)));
  await assertFails(getDoc(doc(coordinatorStore, 'users', identities.studentB.uid)));
  await assertFails(updateDoc(doc(coordinatorStore, 'users', identities.studentA.uid), { preDeploymentStatus: 'approved' }));
  await assertFails(updateDoc(doc(coordinatorStore, 'users', identities.studentA.uid), { clearanceStatus: 'cleared', clearedBy: identities.coordinatorA.uid }));
  await assertFails(updateDoc(doc(coordinatorStore, 'finalReviewRequests', 'final-a'), { status: 'approved' }));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'users', identities.studentA.uid, 'attendance', '2026-09-28')));
  await assertFails(getDoc(doc(coordinatorStore, 'users', identities.studentB.uid, 'attendance', '2026-09-28')));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'companyProposals', 'proposal-a')));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'placementHistory', 'history-student-a')));
  await assertFails(getDoc(doc(coordinatorStore, 'placementHistory', 'history-student-b')));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'endorsements', 'endorsement-student-a')));
  await assertFails(getDoc(doc(coordinatorStore, 'endorsements', 'endorsement-student-b')));
  await assertFails(getDoc(doc(coordinatorStore, 'finalReviewRequests', 'foreign-review')));
});

test('coordinator list queries match section and department boundaries', async () => {
  const coordinatorStore = clientStore(identities.coordinatorA);
  const students = await assertSucceeds(getDocs(query(collection(coordinatorStore, 'users'),
    where('role', '==', 'student'), where('department', '==', 'Department A'), where('sectionId', '==', 'section-a'))));
  assert.ok(students.docs.some(item => item.id === identities.studentA.uid));
  const proposals = await assertSucceeds(getDocs(query(collection(coordinatorStore, 'companyProposals'),
    where('department', '==', 'Department A'), where('sectionId', '==', 'section-a'))));
  assert.ok(proposals.docs.some(item => item.id === 'proposal-a'));
  const finalReviews = await assertSucceeds(getDocs(query(collection(coordinatorStore, 'finalReviewRequests'),
    where('department', '==', 'Department A'), where('sectionId', '==', 'section-a'))));
  assert.ok(finalReviews.docs.some(item => item.id === 'final-a'));
  const endorsements = await assertSucceeds(getDocs(query(collection(coordinatorStore, 'endorsements'),
    where('department', '==', 'Department A'), where('sectionId', '==', 'section-a'))));
  assert.ok(endorsements.docs.some(item => item.id === 'endorsement-student-a'));
  await assertFails(getDocs(query(collection(coordinatorStore, 'users'), where('role', '==', 'student'))));
  await assertFails(getDocs(query(collection(coordinatorStore, 'companyProposals'), where('sectionId', '==', 'section-b'))));
  await assertFails(getDocs(query(collection(coordinatorStore, 'endorsements'), where('sectionId', '==', 'section-b'))));
});

test('endorsement preparation records are participant-readable and server-owned', async () => {
  const studentStore = clientStore(identities.studentA);
  const otherStudentStore = clientStore(identities.studentB);
  const coordinatorStore = clientStore(identities.coordinatorA);
  const adminStore = clientStore(identities.admin);
  await assertSucceeds(getDoc(doc(studentStore, 'endorsements', 'endorsement-student-a')));
  await assertFails(getDoc(doc(studentStore, 'endorsements', 'endorsement-student-b')));
  await assertFails(getDoc(doc(otherStudentStore, 'endorsements', 'endorsement-student-a')));
  await assertFails(getDoc(doc(coordinatorStore, 'endorsements', 'endorsement-student-b')));
  await assertSucceeds(getDoc(doc(adminStore, 'endorsements', 'endorsement-student-b')));
  await assertFails(setDoc(doc(studentStore, 'endorsements', 'forged-endorsement'), {
    studentId: identities.studentA.uid, status: 'issued',
  }));
  await assertFails(updateDoc(doc(studentStore, 'endorsements', 'endorsement-student-a'), { status: 'issued' }));
  await assertFails(updateDoc(doc(coordinatorStore, 'endorsements', 'endorsement-student-a'), { deliveryStatus: 'sent' }));
  await assertFails(deleteDoc(doc(adminStore, 'endorsements', 'endorsement-student-a')));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid), { endorsementId: 'forged-endorsement' }));
});

test('logbook writes preserve student ownership and placement proposal writes require the backend', async () => {
  const studentStore = clientStore(identities.studentA);
  await assertSucceeds(getDoc(doc(studentStore, 'users', identities.studentA.uid, 'logbook', 'logbook-pending')));
  await assertFails(getDoc(doc(studentStore, 'users', identities.studentB.uid, 'logbook', 'logbook-foreign')));
  await assertSucceeds(setDoc(doc(studentStore, 'users', identities.studentA.uid, 'logbook', 'own-draft'), {
    rawNotes: 'Draft notes', refined: 'Draft notes', hours: 4, status: 'draft',
  }));
  await assertFails(setDoc(doc(studentStore, 'users', identities.studentA.uid, 'logbook', 'forged-approval'), {
    rawNotes: 'Draft notes', refined: 'Draft notes', hours: 4, status: 'approved',
  }));
  await assertFails(updateDoc(doc(studentStore, 'users', identities.studentA.uid, 'logbook', 'logbook-pending'), { status: 'approved' }));

  await assertSucceeds(getDoc(doc(studentStore, 'companyProposals', 'proposal-a')));
  await assertFails(getDoc(doc(studentStore, 'companyProposals', 'proposal-b')));
  await assertSucceeds(getDoc(doc(studentStore, 'companies', 'company-a')));
  await assertSucceeds(getDoc(doc(studentStore, 'placementHistory', 'history-student-a')));
  await assertFails(getDoc(doc(studentStore, 'placementHistory', 'history-student-b')));
  await assertFails(setDoc(doc(studentStore, 'placementHistory', 'forged-history'), { studentId: identities.studentA.uid }));
  await assertFails(updateDoc(doc(studentStore, 'companies', 'company-a'), { active: false }));
  await assertFails(setDoc(doc(studentStore, 'companyProposals', 'student-draft'), {
    studentId: identities.studentA.uid, department: 'Department A', sectionId: 'section-a',
    companyName: 'Proposed Company', status: 'draft',
  }));
  await assertFails(setDoc(doc(studentStore, 'companyProposals', 'foreign-draft'), {
    studentId: identities.studentA.uid, department: 'Department B', sectionId: 'section-b',
    companyName: 'Forged Company', status: 'pending_review',
  }));
  await assertFails(updateDoc(doc(studentStore, 'companyProposals', 'proposal-a'), {
    status: 'pending_review', companyName: 'Updated Proposal', updatedAt: new Date().toISOString(),
  }));
  await assertFails(deleteDoc(doc(studentStore, 'companyProposals', 'proposal-a')));

  const coordinatorStore = clientStore(identities.coordinatorA);
  await assertFails(updateDoc(doc(coordinatorStore, 'users', identities.studentA.uid, 'logbook', 'logbook-pending'), {
    status: 'approved', reviewedBy: identities.coordinatorA.uid, reviewedAt: new Date().toISOString(),
  }));
  await assertFails(updateDoc(doc(coordinatorStore, 'users', identities.studentB.uid, 'logbook', 'logbook-foreign'), {
    status: 'approved', reviewedBy: identities.coordinatorA.uid, reviewedAt: new Date().toISOString(),
  }));
  await assertFails(updateDoc(doc(coordinatorStore, 'companyProposals', 'proposal-a'), {
    status: 'needs_revision', reviewReason: 'Please clarify your supervisor information.',
    reviewedBy: identities.coordinatorA.uid, reviewedAt: new Date().toISOString(),
  }));
  await assertFails(updateDoc(doc(coordinatorStore, 'companyProposals', 'proposal-b'), {
    status: 'approved', reviewedBy: identities.coordinatorA.uid, reviewedAt: new Date().toISOString(),
  }));
  await assertFails(setDoc(doc(coordinatorStore, 'studentRoster', '21-00123'), {
    idNumber: '21-00123', department: 'Department A', active: true, createdBy: identities.coordinatorA.uid,
  }));
  await assertFails(updateDoc(doc(coordinatorStore, 'studentRoster', '12345678'), { active: false }));
});

test('attendance is read-only to clients; notification and message participants are enforced', async () => {
  const studentStore = clientStore(identities.studentA);
  await assertSucceeds(getDoc(doc(studentStore, 'users', identities.studentA.uid, 'attendance', '2026-09-28')));
  await assertFails(setDoc(doc(studentStore, 'users', identities.studentA.uid, 'attendance', 'new-day'), { timeIn: 'now' }));
  await assertSucceeds(getDoc(doc(studentStore, 'notifications', 'student-a-notification')));
  await assertFails(getDoc(doc(studentStore, 'notifications', 'student-b-notification')));
  await assertFails(addDoc(collection(studentStore, 'notifications'), {
    recipientId: identities.coordinatorA.uid, senderId: identities.studentA.uid, senderRole: 'student',
    title: 'Placement request', message: 'Please review my placement.', type: 'placement', read: false,
    createdAt: new Date().toISOString(),
  }));
  await assertFails(addDoc(collection(studentStore, 'notifications'), {
    recipientId: identities.coordinatorB.uid, senderId: identities.studentA.uid, senderRole: 'student',
    title: 'Placement request', message: 'Wrong coordinator.', type: 'placement', read: false,
    createdAt: new Date().toISOString(),
  }));
  await assertFails(addDoc(collection(clientStore(identities.coordinatorA), 'notifications'), {
    recipientId: identities.studentA.uid, senderId: identities.coordinatorA.uid, senderRole: 'coordinator',
    title: 'Direct coordinator notification', message: 'Must use the backend.', type: 'announcement', read: false,
    createdAt: new Date().toISOString(),
  }));
  await assertFails(addDoc(collection(clientStore(identities.admin), 'notifications'), {
    recipientId: identities.studentA.uid, senderId: identities.admin.uid, senderRole: 'admin',
    title: 'Direct admin notification', message: 'Must use the backend.', type: 'general', read: false,
    createdAt: new Date().toISOString(),
  }));
  await assertFails(addDoc(collection(studentStore, 'notifications'), {
    recipientId: identities.coordinatorA.uid, senderId: identities.studentA.uid, senderRole: 'student',
    title: 'Fake message', message: 'Cannot directly forge a message notification.', type: 'message', read: false,
    createdAt: new Date().toISOString(),
  }));
  await assertSucceeds(updateDoc(doc(studentStore, 'notifications', 'student-a-notification'), { read: true, readAt: new Date().toISOString() }));
  await assertFails(updateDoc(doc(studentStore, 'notifications', 'student-a-notification'), { recipientId: identities.studentB.uid }));
  await assertSucceeds(getDoc(doc(studentStore, 'messages', 'message-a')));
  await assertFails(getDoc(doc(clientStore(identities.studentB), 'messages', 'message-a')));
  await assertSucceeds(updateDoc(doc(studentStore, 'messages', 'message-a'), { read: true, readAt: new Date().toISOString() }));
  await assertFails(addDoc(collection(studentStore, 'messages'), {
    conversationId: 'conversation-a', participantIds: [identities.studentA.uid, identities.coordinatorA.uid],
    studentId: identities.studentA.uid, coordinatorId: identities.coordinatorA.uid,
    senderId: identities.studentA.uid, senderRole: 'student', recipientId: identities.coordinatorA.uid,
    recipientRole: 'coordinator', body: 'Hello coordinator', read: false, createdAt: new Date().toISOString(),
  }));
  await assertFails(addDoc(collection(studentStore, 'messages'), {
    participantIds: [identities.studentA.uid, identities.coordinatorB.uid],
    senderId: identities.studentA.uid, senderRole: 'student', recipientId: identities.coordinatorB.uid,
    recipientRole: 'coordinator', body: 'Unauthorized recipient',
  }));
  await assertFails(addDoc(collection(clientStore(identities.coordinatorA), 'messages'), {
    participantIds: [identities.studentA.uid, identities.coordinatorA.uid],
    senderId: identities.coordinatorA.uid, senderRole: 'coordinator', recipientId: identities.studentA.uid,
    recipientRole: 'student', body: 'Must use the authenticated backend.',
  }));
});

test('final-review records are read-only to clients and must be submitted through the backend', async () => {
  const store = clientStore(identities.studentA);
  await assertFails(updateDoc(doc(store, 'finalReviewRequests', 'final-a'), { status: 'approved' }));
  await assertFails(setDoc(doc(store, 'finalReviewRequests', 'student-a-new'), {
    studentId: identities.studentA.uid, sectionId: 'section-a', department: 'Department A',
    status: 'pending_review', submittedAt: new Date().toISOString(),
  }));
  await assertFails(setDoc(doc(store, 'finalReviewRequests', 'student-a-forged'), {
    studentId: identities.studentA.uid, sectionId: 'section-b', department: 'Department B',
    status: 'pending_review',
  }));
  await assertFails(deleteDoc(doc(store, 'finalReviewRequests', 'final-a')));
});

test('admin configuration and audit collections have role-specific client read boundaries', async () => {
  const studentStore = clientStore(identities.studentA);
  const coordinatorStore = clientStore(identities.coordinatorA);
  const adminStore = clientStore(identities.admin);
  await assertFails(getDoc(doc(studentStore, 'systemSettings', 'global')));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'systemSettings', 'global')));
  await assertSucceeds(getDoc(doc(adminStore, 'systemSettings', 'global')));
  await assertFails(setDoc(doc(adminStore, 'systemSettings', 'forged'), { defaultHoursRequired: 1 }));

  await assertFails(getDoc(doc(studentStore, 'academicTerms', 'term-existing')));
  await assertSucceeds(getDoc(doc(coordinatorStore, 'academicTerms', 'term-existing')));
  await assertSucceeds(getDoc(doc(adminStore, 'academicTerms', 'term-existing')));
  await assertFails(setDoc(doc(coordinatorStore, 'academicTerms', 'forged-term'), { name: 'Forged' }));

  await assertFails(getDoc(doc(studentStore, 'auditLogs', 'audit-existing')));
  await assertFails(getDoc(doc(coordinatorStore, 'auditLogs', 'audit-existing')));
  await assertSucceeds(getDoc(doc(adminStore, 'auditLogs', 'audit-existing')));
  await assertFails(setDoc(doc(adminStore, 'auditLogs', 'forged-audit'), { action: 'settings.updated' }));

  await assertFails(setDoc(doc(coordinatorStore, 'sections', 'client-created'), {
    name: 'Bypass audit', department: 'Department A', coordinatorId: identities.coordinatorA.uid,
  }));
  await assertFails(updateDoc(doc(coordinatorStore, 'sections', 'section-a'), { name: 'Changed without audit' }));
  await assertFails(setDoc(doc(coordinatorStore, 'sections', 'section-a', 'requirements', 'client-requirement'), { label: 'Bypass audit' }));
});

async function api(pathname, identity, body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  if (identity) headers.Authorization = `Bearer ${identity.token}`;
  const response = await fetch(`${globalThis.backendUrl}${pathname}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { response, data: await response.json().catch(() => ({})) };
}

test('backend health endpoint responds without exposing deployment details', async () => {
  const health = await api('/healthz', null, undefined, 'GET');
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.data, { status: 'ok' });
});

test('admin settings and academic-term endpoints enforce role, validation, and server audit ownership', async () => {
  const settings = {
    defaultHoursRequired: 540, dailyTargetHours: 8, expectedStartTime: '08:00',
    lateGraceMinutes: 15, expectedWorkdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    notificationsEnabled: true,
  };
  const anonymousSettings = await api('/admin/settings', null, undefined, 'GET');
  assert.equal(anonymousSettings.response.status, 401);
  const studentSettings = await api('/admin/settings', identities.studentA, settings, 'PUT');
  assert.equal(studentSettings.response.status, 403);
  const coordinatorSettings = await api('/admin/settings', identities.coordinatorA, settings, 'PUT');
  assert.equal(coordinatorSettings.response.status, 403);
  const invalidSettings = await api('/admin/settings', identities.admin, { ...settings, expectedStartTime: '25:70' }, 'PUT');
  assert.equal(invalidSettings.response.status, 400);
  const savedSettings = await api('/admin/settings', identities.admin, settings, 'PUT');
  assert.equal(savedSettings.response.status, 200, JSON.stringify(savedSettings.data));
  assert.equal(savedSettings.data.settings.updatedBy, identities.admin.uid);
  const settingsAudit = await api('/admin/audit-logs', identities.admin, undefined, 'GET');
  assert.equal(settingsAudit.response.status, 200);
  assert.ok(settingsAudit.data.logs.some(log => log.action === 'settings.updated' && log.actorId === identities.admin.uid));

  const coordinatorTerm = await api('/admin/academic-terms', identities.coordinatorA, {
    name: 'Unauthorized term', startDate: '2026-08-01', endDate: '2026-12-31',
  });
  assert.equal(coordinatorTerm.response.status, 403);
  const impossibleDate = await api('/admin/academic-terms', identities.admin, {
    name: 'Impossible term', startDate: '2026-02-31', endDate: '2026-12-31',
  });
  assert.equal(impossibleDate.response.status, 400);
  const invalidActive = await api('/admin/academic-terms', identities.admin, {
    name: 'Invalid active type', startDate: '2026-08-01', endDate: '2026-12-31', isActive: 'false',
  });
  assert.equal(invalidActive.response.status, 400);
  const createdTerm = await api('/admin/academic-terms', identities.admin, {
    name: '  Second Semester 2026-2027  ', startDate: '2027-01-01', endDate: '2027-05-31', isActive: true,
  });
  assert.equal(createdTerm.response.status, 200, JSON.stringify(createdTerm.data));
  assert.equal(createdTerm.data.term.name, 'Second Semester 2026-2027');
  const terms = await api('/admin/academic-terms', identities.admin, undefined, 'GET');
  assert.equal(terms.response.status, 200);
  assert.ok(terms.data.terms.some(term => term.id === createdTerm.data.term.id));

  const studentAudit = await api('/audit-log', identities.studentA, {
    action: 'settings.updated', targetType: 'systemSettings', targetId: 'global',
  });
  const coordinatorAudit = await api('/audit-log', identities.coordinatorA, {
    action: 'academic_term.activated', targetType: 'academicTerms', targetId: createdTerm.data.term.id,
  });
  const adminAudit = await api('/audit-log', identities.admin, {
    action: 'settings.updated', targetType: 'systemSettings', targetId: 'global',
  });
  assert.equal(studentAudit.response.status, 403);
  assert.equal(coordinatorAudit.response.status, 403);
  assert.equal(adminAudit.response.status, 403);
});

test('coordinator provisioning remains admin-only', async () => {
  const payload = {
    firstName: 'New', lastName: 'Coordinator', email: `coord-${Date.now()}@pathway.test`,
    password: 'TestPass!234', department: `Unused Department ${Date.now()}`,
  };
  const anonymous = await api('/create-coordinator', null, payload);
  const student = await api('/create-coordinator', identities.studentA, payload);
  const coordinator = await api('/create-coordinator', identities.coordinatorA, payload);
  assert.equal(anonymous.response.status, 401);
  assert.equal(student.response.status, 403);
  assert.equal(coordinator.response.status, 403);
});

test('admin account activation is authenticated, student-only, and audited with the mutation', async () => {
  const path = `/admin/students/${identities.studentB.uid}/account-status`;
  const unauthenticated = await api(path, null, { accountApproved: false }, 'PATCH');
  const student = await api(path, identities.studentA, { accountApproved: false }, 'PATCH');
  const coordinator = await api(path, identities.coordinatorA, { accountApproved: false }, 'PATCH');
  assert.equal(unauthenticated.response.status, 401);
  assert.equal(student.response.status, 403);
  assert.equal(coordinator.response.status, 403);
  const invalid = await api(path, identities.admin, { accountApproved: 'false' }, 'PATCH');
  assert.equal(invalid.response.status, 400);
  const changed = await api(path, identities.admin, { accountApproved: false }, 'PATCH');
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));

  let state;
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const [profile, logs] = await Promise.all([
      getDoc(doc(db, 'users', identities.studentB.uid)),
      getDocs(query(collection(db, 'auditLogs'), where('targetId', '==', identities.studentB.uid), where('action', '==', 'account.activation_changed'))),
    ]);
    state = { profile: profile.data(), logs };
  });
  assert.equal(state.profile.accountApproved, false);
  assert.equal(state.logs.size, 1);
  assert.equal(state.logs.docs[0].data().actorId, identities.admin.uid);
  const restored = await api(path, identities.admin, { accountApproved: true }, 'PATCH');
  assert.equal(restored.response.status, 200, JSON.stringify(restored.data));
});

test('coordinator clearance is section-scoped, checks eligibility, and atomically notifies and audits', async () => {
  const path = `/coordinator/students/${identities.studentA.uid}/clearance`;
  const wrongCoordinator = await api(path, identities.coordinatorB, {});
  const student = await api(path, identities.studentA, {});
  const notReady = await api(`/coordinator/students/${identities.studentC.uid}/clearance`, identities.coordinatorA, {});
  assert.equal(wrongCoordinator.response.status, 403);
  assert.equal(student.response.status, 403);
  assert.equal(notReady.response.status, 409);

  const allowed = await api(path, identities.coordinatorA, {});
  assert.equal(allowed.response.status, 200, JSON.stringify(allowed.data));
  assert.equal(allowed.data.clearanceStatus, 'cleared');
  const duplicate = await api(path, identities.coordinatorA, {});
  assert.equal(duplicate.response.status, 409);

  let state;
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const [profile, notifications, logs] = await Promise.all([
      getDoc(doc(db, 'users', identities.studentA.uid)),
      getDocs(query(collection(db, 'notifications'), where('recipientId', '==', identities.studentA.uid), where('type', '==', 'clearance'))),
      getDocs(query(collection(db, 'auditLogs'), where('targetId', '==', identities.studentA.uid), where('action', '==', 'clearance.updated'))),
    ]);
    state = { profile: profile.data(), notifications, logs };
  });
  assert.equal(state.profile.clearanceStatus, 'cleared');
  assert.equal(state.profile.clearedBy, identities.coordinatorA.uid);
  assert.equal(state.notifications.size, 1);
  assert.equal(state.logs.size, 1);
});

test('coordinator section and requirement mutations enforce ownership and create audit records', async () => {
  const createByStudent = await api('/coordinator/sections', identities.studentA, {
    name: 'Unauthorized', department: 'Department A', hoursRequired: 486,
  });
  assert.equal(createByStudent.response.status, 403);
  const foreignDepartment = await api('/coordinator/sections', identities.coordinatorA, {
    name: 'Wrong Department', department: 'Department B', hoursRequired: 486,
  });
  assert.equal(foreignDepartment.response.status, 400);

  const created = await api('/coordinator/sections', identities.coordinatorA, {
    name: 'Section Security Test', department: 'Department A', hoursRequired: 486, messengerLink: '',
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.data));
  const sectionId = created.data.section.id;
  const seeded = await api(`/coordinator/sections/${sectionId}/requirements/defaults`, identities.coordinatorA, {});
  assert.equal(seeded.response.status, 200, JSON.stringify(seeded.data));
  assert.equal(seeded.data.requirements.length, 11);
  const duplicateDefaults = await api(`/coordinator/sections/${sectionId}/requirements/defaults`, identities.coordinatorA, {});
  assert.equal(duplicateDefaults.response.status, 409);

  const foreignAttempt = await api(`/coordinator/sections/${sectionId}/requirements`, identities.coordinatorB, {
    label: 'Foreign', category: 'Pre-OJT', deadline: '',
  });
  assert.equal(foreignAttempt.response.status, 403);
  const invalid = await api(`/coordinator/sections/${sectionId}/requirements`, identities.coordinatorA, {
    label: 'Invalid', category: 'Other', deadline: '',
  });
  assert.equal(invalid.response.status, 400);
  const added = await api(`/coordinator/sections/${sectionId}/requirements`, identities.coordinatorA, {
    label: 'Security Test Requirement', category: 'Ongoing', deadline: '2026-10-15',
  });
  assert.equal(added.response.status, 200, JSON.stringify(added.data));
  const requirementId = added.data.requirement.id;
  const changed = await api(`/coordinator/sections/${sectionId}/requirements/${requirementId}`, identities.coordinatorA, {
    deadline: '2026-10-20',
  }, 'PATCH');
  const deleted = await api(`/coordinator/sections/${sectionId}/requirements/${requirementId}`, identities.coordinatorA, undefined, 'DELETE');
  assert.equal(changed.response.status, 200);
  assert.equal(deleted.response.status, 200);

  let state;
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const [section, requirement, logs] = await Promise.all([
      getDoc(doc(db, 'sections', sectionId)),
      getDoc(doc(db, 'sections', sectionId, 'requirements', requirementId)),
      getDocs(query(collection(db, 'auditLogs'), where('targetType', '==', 'sectionRequirements'), where('details.sectionId', '==', sectionId))),
    ]);
    state = { section: section.data(), requirement, logs };
  });
  assert.equal(state.section.coordinatorId, identities.coordinatorA.uid);
  assert.equal(typeof state.section.termId, 'string');
  assert.ok(state.section.termId.length > 0);
  assert.equal(state.requirement.exists(), false);
  assert.equal(state.logs.size, 3);
  let coordinatorCreatedAudit;
  await testEnv.withSecurityRulesDisabled(async context => {
    coordinatorCreatedAudit = await getDocs(query(collection(context.firestore(), 'auditLogs'), where('targetId', '==', sectionId), where('action', '==', 'section.created')));
  });
  assert.equal(coordinatorCreatedAudit.size, 1);
});

test('attendance requires final approval and records time server-side without replay', async () => {
  const lockedStudent = await api('/attendance/time-in', identities.studentC, {});
  assert.equal(lockedStudent.response.status, 403);
  const coordinator = await api('/attendance/time-in', identities.coordinatorA, {});
  assert.equal(coordinator.response.status, 403);

  const timeIn = await api('/attendance/time-in', identities.attendanceStudent, {});
  assert.equal(timeIn.response.status, 201, JSON.stringify(timeIn.data));
  assert.equal(timeIn.data.status, 'pending');
  assert.ok(timeIn.data.timeIn);
  const duplicateTimeIn = await api('/attendance/time-in', identities.attendanceStudent, {});
  assert.equal(duplicateTimeIn.response.status, 409);

  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', identities.attendanceStudent.uid, 'attendance', timeIn.data.id), {
      timeIn: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
  });

  const timeOut = await api('/attendance/time-out', identities.attendanceStudent, {});
  assert.equal(timeOut.response.status, 200, JSON.stringify(timeOut.data));
  assert.ok(timeOut.data.hoursToday > 0);
  const duplicateTimeOut = await api('/attendance/time-out', identities.attendanceStudent, {});
  assert.equal(duplicateTimeOut.response.status, 409);

  let stored;
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const [attendance, profile, timeInAudit, timeOutAudit] = await Promise.all([
      getDoc(doc(db, 'users', identities.attendanceStudent.uid, 'attendance', timeIn.data.id)),
      getDoc(doc(db, 'users', identities.attendanceStudent.uid)),
      getDocs(query(collection(db, 'auditLogs'), where('actorId', '==', identities.attendanceStudent.uid), where('action', '==', 'attendance.time_in'))),
      getDocs(query(collection(db, 'auditLogs'), where('actorId', '==', identities.attendanceStudent.uid), where('action', '==', 'attendance.time_out'))),
    ]);
    stored = { attendance: attendance.data(), profile: profile.data(), timeInAudit, timeOutAudit };
  });
  assert.equal(stored.attendance.status, 'pending');
  assert.equal(stored.attendance.hoursToday, timeOut.data.hoursToday);
  assert.equal(stored.profile.hoursRendered, timeOut.data.hoursToday);
  assert.equal(stored.timeInAudit.size, 1);
  assert.equal(stored.timeInAudit.docs[0].data().targetId, timeIn.data.id);
  assert.equal(stored.timeInAudit.docs[0].data().details.sectionId, 'section-a');
  assert.equal(stored.timeOutAudit.size, 1);
  assert.equal(stored.timeOutAudit.docs[0].data().targetId, timeOut.data.id);
  assert.equal(stored.timeOutAudit.docs[0].data().details.hoursToday, timeOut.data.hoursToday);
});

test('Cloudinary upload authorization is server-signed, student-scoped, and single-use', async () => {
  const path = '/requirements/application_form/upload-signature';
  const unauthenticated = await api(path, null, {});
  assert.equal(unauthenticated.response.status, 401);
  const coordinator = await api(path, identities.coordinatorA, {});
  assert.equal(coordinator.response.status, 403);

  const signed = await api(path, identities.studentA, {});
  assert.equal(signed.response.status, 200, JSON.stringify(signed.data));
  assert.equal(signed.data.cloudName, 'pathway-test');
  assert.equal(signed.data.apiKey, '123456789');
  assert.match(signed.data.publicId, new RegExp(`^pathway/requirements/${identities.studentA.uid}/application_form-[a-f0-9]{32}$`));
  assert.equal(signed.data.resourceType, 'auto');
  assert.equal(typeof signed.data.signature, 'string');
  assert.equal(Object.hasOwn(signed.data, 'apiSecret'), false);

  const unsignedSpoof = await api('/requirements/application_form', identities.studentA, {
    status: 'submitted', fileUrl: 'https://res.cloudinary.com/pathway-test/image/upload/fake.pdf',
    fileName: 'fake.pdf', fileSize: '1.0 MB',
  }, 'PUT');
  assert.equal(unsignedSpoof.response.status, 400);

  const forgedFinalize = await api('/requirements/application_form', identities.studentA, {
    status: 'submitted', intentId: signed.data.intentId, publicId: signed.data.publicId,
    version: 1, signature: '0'.repeat(40), fileName: 'fake.pdf',
  }, 'PUT');
  assert.equal(forgedFinalize.response.status, 400);

  const version = 1712345678;
  const asset = {
    public_id: signed.data.publicId, version, resource_type: 'raw', format: 'pdf', bytes: 512 * 1024,
    secure_url: `https://res.cloudinary.com/pathway-test/raw/upload/v${version}/${signed.data.publicId}.pdf`,
    created_at: new Date().toISOString(),
  };
  cloudinaryAssets.set(`raw/${asset.public_id}`, asset);
  const responseSignature = signParams({ public_id: asset.public_id, version }, 'emulator-only-not-a-real-secret');
  const finalized = await api('/requirements/application_form', identities.studentA, {
    status: 'submitted', intentId: signed.data.intentId, publicId: asset.public_id,
    version, signature: responseSignature, fileName: 'my-application.pdf',
  }, 'PUT');
  assert.equal(finalized.response.status, 200, JSON.stringify(finalized.data));
  assert.equal(finalized.data.fileSize, '0.5 MB');
  const replay = await api('/requirements/application_form', identities.studentA, {
    status: 'submitted', intentId: signed.data.intentId, publicId: asset.public_id,
    version, signature: responseSignature, fileName: 'my-application.pdf',
  }, 'PUT');
  assert.equal(replay.response.status, 403);

  const photoIntent = await api('/profile/photo/upload-signature', identities.studentA, {});
  assert.equal(photoIntent.response.status, 200, JSON.stringify(photoIntent.data));
  assert.equal(photoIntent.data.resourceType, 'image');
  assert.match(photoIntent.data.publicId, new RegExp(`^pathway/profile/${identities.studentA.uid}/profile-[a-f0-9]{32}$`));

  const removed = await api('/requirements/application_form', identities.studentA, { status: 'not_submitted' }, 'PUT');
  assert.equal(removed.response.status, 200, JSON.stringify(removed.data));
  const staleLink = await api('/requirements/application_form/download', identities.studentA, undefined, 'GET');
  assert.equal(staleLink.response.status, 404);

  let requirementAudit;
  let removedRequirement;
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const [profile, events] = await Promise.all([
      getDoc(doc(db, 'users', identities.studentA.uid)),
      getDocs(query(collection(db, 'auditLogs'), where('actorId', '==', identities.studentA.uid), where('targetId', '==', 'application_form'))),
    ]);
    removedRequirement = profile.data().requirements.application_form;
    requirementAudit = events.docs.map(snapshot => snapshot.data());
  });
  assert.equal(removedRequirement.status, 'not_submitted');
  assert.equal(removedRequirement.cloudinaryPublicId, null);
  assert.equal(removedRequirement.cloudinaryAssetId, null);
  assert.deepEqual(requirementAudit.map(event => event.action).sort(), ['requirement.removed', 'requirement.submitted']);
  assert.equal(requirementAudit.find(event => event.action === 'requirement.submitted').details.deliveryType, 'upload');
});

test('protected endorsement downloads enforce student ownership and coordinator section scope', async () => {
  const requirementId = 'endorsement_letter';
  const assetId = 'asset-id-student-a-000001';
  const expectedBytes = Buffer.from('%PDF-1.7\nPATHWAY emulator protected endorsement\n%%EOF');
  cloudinaryDownloadAssets.set(assetId, expectedBytes);
  const baselineRequestCount = cloudinaryDownloadRequests.length;

  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', identities.studentA.uid), {
      [`requirements.${requirementId}`]: {
        status: 'submitted', fileName: 'Signed Endorsement A.pdf',
        cloudinaryDeliveryType: 'authenticated', cloudinaryAssetId: assetId,
        uploadedBytes: expectedBytes.length,
      },
    });
  });

  const studentPath = `/requirements/${requirementId}/download`;
  const unauthenticated = await api(studentPath, null, undefined, 'GET');
  assert.equal(unauthenticated.response.status, 401);

  const coordinatorUsingStudentRoute = await api(studentPath, identities.coordinatorA, undefined, 'GET');
  assert.equal(coordinatorUsingStudentRoute.response.status, 403);

  const otherStudent = await api(studentPath, identities.studentB, undefined, 'GET');
  assert.equal(otherStudent.response.status, 404);

  const studentResponse = await fetch(`${globalThis.backendUrl}${studentPath}`, {
    headers: { Authorization: `Bearer ${identities.studentA.token}` },
  });
  assert.equal(studentResponse.status, 200);
  assert.equal(studentResponse.headers.get('cache-control'), 'private, no-store');
  assert.equal(studentResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.match(studentResponse.headers.get('content-disposition') || '', /^attachment; filename="Signed_Endorsement_A\.pdf"$/);
  assert.deepEqual(Buffer.from(await studentResponse.arrayBuffer()), expectedBytes);

  const coordinatorPath = `/coordinator/students/${identities.studentA.uid}/requirements/${requirementId}/download`;
  const wrongRole = await api(coordinatorPath, identities.studentB, undefined, 'GET');
  assert.equal(wrongRole.response.status, 403);
  const otherSection = await api(coordinatorPath, identities.coordinatorB, undefined, 'GET');
  assert.equal(otherSection.response.status, 403);

  const coordinatorResponse = await fetch(`${globalThis.backendUrl}${coordinatorPath}`, {
    headers: { Authorization: `Bearer ${identities.coordinatorA.token}` },
  });
  assert.equal(coordinatorResponse.status, 200);
  assert.deepEqual(Buffer.from(await coordinatorResponse.arrayBuffer()), expectedBytes);
  assert.deepEqual(cloudinaryDownloadRequests.slice(baselineRequestCount), [assetId, assetId]);

  let downloadAudits;
  await testEnv.withSecurityRulesDisabled(async context => {
    downloadAudits = await getDocs(query(
      collection(context.firestore(), 'auditLogs'),
      where('action', '==', 'requirement.downloaded'),
      where('targetId', '==', requirementId),
    ));
  });
  assert.equal(downloadAudits.size, 2);
  const actors = downloadAudits.docs.map(snapshot => [snapshot.data().actorId, snapshot.data().actorRole]);
  assert.deepEqual(actors.sort((left, right) => left[1].localeCompare(right[1])), [
    [identities.coordinatorA.uid, 'coordinator'],
    [identities.studentA.uid, 'student'],
  ]);
});

test('backend rejects unauthenticated, wrong-section, and unauthorized role actions', async () => {
  const unauthenticated = await api('/coordinator/assign-student', null, { studentId: identities.applicant.uid, sectionId: 'section-a' });
  assert.equal(unauthenticated.response.status, 401);

  const studentDecision = await api(`/coordinator/registrations/${identities.applicant.uid}/decision`, identities.studentA, { status: 'approved' });
  assert.equal(studentDecision.response.status, 403);

  const foreignRegistration = await api(`/coordinator/registrations/${identities.applicant.uid}/decision`, identities.coordinatorB, { status: 'approved' });
  assert.equal(foreignRegistration.response.status, 403);

  const foreignAssignment = await api('/coordinator/assign-student', identities.coordinatorB, { studentId: identities.applicant.uid, sectionId: 'section-a' });
  assert.equal(foreignAssignment.response.status, 403);

  const foreignRequirement = await api(`/coordinator/students/${identities.studentA.uid}/requirements/application_form/decision`, identities.coordinatorB, { status: 'approved' });
  assert.equal(foreignRequirement.response.status, 403);
});

test('messages are created only by the backend for assigned student-coordinator pairs with atomic notifications', async () => {
  const noAuth = await api('/messages', null, { recipientId: identities.coordinatorA.uid, body: 'Hello' });
  assert.equal(noAuth.response.status, 401);
  const admin = await api('/messages', identities.admin, { recipientId: identities.studentA.uid, body: 'Hello' });
  assert.equal(admin.response.status, 403);
  const foreignStudentPair = await api('/messages', identities.studentA, { recipientId: identities.coordinatorB.uid, body: 'Wrong section' });
  assert.equal(foreignStudentPair.response.status, 403);
  const foreignCoordinatorPair = await api('/messages', identities.coordinatorA, { recipientId: identities.studentB.uid, body: 'Wrong section' });
  assert.equal(foreignCoordinatorPair.response.status, 403);
  const tooLong = await api('/messages', identities.studentA, { recipientId: identities.coordinatorA.uid, body: 'x'.repeat(4001) });
  assert.equal(tooLong.response.status, 400);

  const studentMessage = await api('/messages', identities.studentA, { recipientId: identities.coordinatorA.uid, body: 'Placement update, please.' });
  assert.equal(studentMessage.response.status, 201, JSON.stringify(studentMessage.data));
  const coordinatorMessage = await api('/messages', identities.coordinatorA, { recipientId: identities.studentA.uid, body: 'I will review it today.' });
  assert.equal(coordinatorMessage.response.status, 201, JSON.stringify(coordinatorMessage.data));
  assert.equal(studentMessage.data.conversationId, coordinatorMessage.data.conversationId);

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [messages, studentNotifications, coordinatorNotifications] = await Promise.all([
      getDocs(query(collection(store, 'messages'), where('conversationId', '==', studentMessage.data.conversationId))),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentA.uid))),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.coordinatorA.uid))),
    ]);
    assert.equal(messages.size, 2);
    assert.ok(messages.docs.every(item => item.data().participantIds.includes(identities.studentA.uid)
      && item.data().participantIds.includes(identities.coordinatorA.uid)));
    assert.ok(studentNotifications.docs.some(item => item.data().type === 'message' && item.data().senderId === identities.coordinatorA.uid));
    assert.ok(coordinatorNotifications.docs.some(item => item.data().type === 'message' && item.data().senderId === identities.studentA.uid));
  });
});

test('coordinator announcements are section-scoped, bounded, and audited in the same transaction', async () => {
  const noAuth = await api('/coordinator/announcements', null, { sectionId: 'section-a', title: 'Notice', message: 'Hello' });
  assert.equal(noAuth.response.status, 401);
  const wrongRole = await api('/coordinator/announcements', identities.studentA, { sectionId: 'section-a', title: 'Notice', message: 'Hello' });
  assert.equal(wrongRole.response.status, 403);
  const foreignSection = await api('/coordinator/announcements', identities.coordinatorA, { sectionId: 'section-b', title: 'Notice', message: 'Hello' });
  assert.equal(foreignSection.response.status, 403);
  const invalid = await api('/coordinator/announcements', identities.coordinatorA, { sectionId: 'section-a', title: '', message: 'Hello' });
  assert.equal(invalid.response.status, 400);
  const sent = await api('/coordinator/announcements', identities.coordinatorA, {
    sectionId: 'section-a', title: 'Schedule update', message: 'Please check the updated schedule.',
  });
  assert.equal(sent.response.status, 200, JSON.stringify(sent.data));
  assert.ok(sent.data.count >= 2);
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [studentNotifications, foreignNotifications, audits] = await Promise.all([
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentA.uid))),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentB.uid))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'announcement.sent'))),
    ]);
    assert.ok(studentNotifications.docs.some(item => item.data().title === 'Schedule update'));
    assert.ok(!foreignNotifications.docs.some(item => item.data().title === 'Schedule update'));
    assert.equal(audits.size, 1);
  });
});

test('student registration endpoint claims only an active matching roster entry', async () => {
  const registration = await createIdentity('newRegistration', 'student', 'Department A');
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'studentRoster', '87654321'), {
      idNumber: '87654321', department: 'Department A', active: true,
    });
  });
  const created = await api('/register-student', registration, {
    idNumber: '87654321', department: 'Department A',
    firstName: 'New', lastName: 'Student', email: registration.profile.email,
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  let state;
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [profile, roster] = await Promise.all([
      getDoc(doc(store, 'users', registration.uid)),
      getDoc(doc(store, 'studentRoster', '87654321')),
    ]);
    state = { profile: profile.data(), roster: roster.data() };
  });
  assert.equal(state.profile.role, 'student');
  assert.equal(state.profile.accountApproved, false);
  assert.equal(state.roster.claimedBy, registration.uid);
  const repeat = await api('/register-student', registration, {
    idNumber: '87654321', department: 'Department A',
    firstName: 'New', lastName: 'Student', email: registration.profile.email,
  });
  assert.equal(repeat.response.status, 201);

  const hyphenatedRegistration = await createIdentity('hyphenatedRegistration', 'student', 'Department A');
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'studentRoster', '21-00999'), {
      idNumber: '21-00999', department: 'Department A', active: true,
    });
  });
  const hyphenated = await api('/register-student', hyphenatedRegistration, {
    idNumber: '21-00999', department: 'Department A',
    firstName: 'Hyphenated', lastName: 'Student', email: hyphenatedRegistration.profile.email,
  });
  assert.equal(hyphenated.response.status, 201, JSON.stringify(hyphenated.data));
});

test('authorized registration, assignment, and requirement review use server-owned writes', async () => {
  const reg = await api(`/coordinator/registrations/${identities.applicant.uid}/decision`, identities.coordinatorA, { status: 'approved' });
  assert.equal(reg.response.status, 200, JSON.stringify(reg.data));
  const assigned = await api('/coordinator/assign-student', identities.coordinatorA, { studentId: identities.applicant.uid, sectionId: 'section-a' });
  assert.equal(assigned.response.status, 200, JSON.stringify(assigned.data));

  // Earlier upload/removal tests intentionally clear this fixture's submitted
  // requirement. Restore a realistic pending submission for this independent review test.
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', identities.studentA.uid), {
      'requirements.application_form': {
        status: 'submitted', fileUrl: 'https://example.test/application.pdf',
        fileName: 'application.pdf', fileSize: '0.5 MB', submittedAt: new Date().toISOString(),
      },
    });
  });
  const reviewed = await api(`/coordinator/students/${identities.studentA.uid}/requirements/application_form/decision`, identities.coordinatorA, { status: 'approved' });
  assert.equal(reviewed.response.status, 200, JSON.stringify(reviewed.data));

  let stored;
  await testEnv.withSecurityRulesDisabled(async context => {
    stored = await getDoc(doc(context.firestore(), 'users', identities.studentA.uid));
  });
  assert.equal(stored.data().requirements.application_form.status, 'approved');
  assert.equal(stored.data().requirementsStatus, 'approved');
});

test('coordinator logbook reviews are authenticated, section-scoped, and atomic with audit and notification', async () => {
  const unauthenticated = await api(`/coordinator/students/${identities.studentA.uid}/logbook/logbook-pending/decision`, null, { status: 'approved' });
  assert.equal(unauthenticated.response.status, 401);
  const wrongRole = await api(`/coordinator/students/${identities.studentA.uid}/logbook/logbook-pending/decision`, identities.studentA, { status: 'approved' });
  assert.equal(wrongRole.response.status, 403);
  const foreign = await api(`/coordinator/students/${identities.studentA.uid}/logbook/logbook-pending/decision`, identities.coordinatorB, { status: 'approved' });
  assert.equal(foreign.response.status, 403);
  const invalid = await api(`/coordinator/students/${identities.studentA.uid}/logbook/logbook-pending/decision`, identities.coordinatorA, { status: 'complete' });
  assert.equal(invalid.response.status, 400);
  const approved = await api(`/coordinator/students/${identities.studentA.uid}/logbook/logbook-pending/decision`, identities.coordinatorA, { status: 'approved' });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
  const rejected = await api(`/coordinator/students/${identities.studentC.uid}/logbook/logbook-to-reject/decision`, identities.coordinatorA, { status: 'rejected' });
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.data));
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [entry, rejectedEntry, notifications, audits] = await Promise.all([
      getDoc(doc(store, 'users', identities.studentA.uid, 'logbook', 'logbook-pending')),
      getDoc(doc(store, 'users', identities.studentC.uid, 'logbook', 'logbook-to-reject')),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentC.uid))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'logbook.reviewed'))),
    ]);
    assert.equal(entry.data().status, 'approved');
    assert.equal(entry.data().reviewedBy, identities.coordinatorA.uid);
    assert.equal(rejectedEntry.data().status, 'rejected');
    assert.ok(notifications.docs.some(item => item.data().title === 'Logbook rejected'));
    assert.equal(audits.size, 2);
  });
});

test('company placement review validates ownership and atomically updates official assignment', async () => {
  const unauthenticated = await api('/coordinator/company-placements/proposal-a/decision', null, { status: 'approved' });
  assert.equal(unauthenticated.response.status, 401);
  const wrongRole = await api('/coordinator/company-placements/proposal-a/decision', identities.studentA, { status: 'approved' });
  assert.equal(wrongRole.response.status, 403);
  const foreign = await api('/coordinator/company-placements/proposal-a/decision', identities.coordinatorB, { status: 'approved' });
  assert.equal(foreign.response.status, 403);
  const noReason = await api('/coordinator/company-placements/proposal-a/decision', identities.coordinatorA, { status: 'rejected' });
  assert.equal(noReason.response.status, 400);
  const approved = await api('/coordinator/company-placements/proposal-a/decision', identities.coordinatorA, { status: 'approved', companyId: 'company-a' });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
  const fullCompany = await api('/coordinator/company-placements/proposal-c/decision', identities.coordinatorA, { status: 'approved', companyId: 'company-a' });
  assert.equal(fullCompany.response.status, 409, JSON.stringify(fullCompany.data));
  const replay = await api('/coordinator/company-placements/proposal-a/decision', identities.coordinatorA, { status: 'rejected', reason: 'duplicate' });
  assert.equal(replay.response.status, 409);
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [proposal, student, notifications, audits, company, history, endorsement, deniedProposal, deniedHistory, deniedEndorsement] = await Promise.all([
      getDoc(doc(store, 'companyProposals', 'proposal-a')),
      getDoc(doc(store, 'users', identities.studentA.uid)),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentA.uid))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'placement.reviewed'))),
      getDoc(doc(store, 'companies', 'company-a')),
      getDocs(query(collection(store, 'placementHistory'), where('proposalId', '==', 'proposal-a'))),
      getDoc(doc(store, 'endorsements', 'proposal-a')),
      getDoc(doc(store, 'companyProposals', 'proposal-c')),
      getDocs(query(collection(store, 'placementHistory'), where('proposalId', '==', 'proposal-c'))),
      getDoc(doc(store, 'endorsements', 'proposal-c')),
    ]);
    assert.equal(proposal.data().status, 'approved');
    assert.equal(student.data().company, 'Approved Company');
    assert.equal(student.data().placementStatus, 'approved');
    assert.equal(student.data().endorsementId, 'proposal-a');
    assert.equal(student.data().requirements.endorsement_letter.status, 'needs_revision');
    assert.equal(student.data().requirements.signed_moa.status, 'needs_revision');
    assert.equal(student.data().requirementsStatus, 'needs_revision');
    assert.ok(notifications.docs.some(item => item.data().title === 'Company placement approved'));
    assert.ok(notifications.docs.some(item => item.data().message?.includes('Endorsement paperwork is pending preparation')));
    assert.equal(audits.size, 1);
    assert.equal(company.data().occupiedSlots, 1);
    assert.equal(company.data().availableSlots, 0);
    assert.equal(history.size, 1);
    assert.equal(history.docs[0].data().before.companyName, 'Test Company');
    assert.equal(history.docs[0].data().after.companyName, 'Approved Company');
    assert.equal(endorsement.data().status, 'awaiting_document');
    assert.equal(endorsement.data().deliveryStatus, 'not_sent');
    assert.equal(endorsement.data().companyName, 'Approved Company');
    assert.equal(endorsement.data().studentId, identities.studentA.uid);
    assert.equal(deniedProposal.data().status, 'pending_review');
    assert.equal(deniedHistory.size, 0);
    assert.equal(deniedEndorsement.exists(), false);
  });
});

test('company directory is admin-managed, audited, and available to coordinators for assignments', async () => {
  const unauthenticated = await api('/admin/companies', null, undefined, 'GET');
  assert.equal(unauthenticated.response.status, 401);
  const studentDenied = await api('/admin/companies', identities.studentA, undefined, 'GET');
  assert.equal(studentDenied.response.status, 403);
  const initialDirectory = await api('/admin/companies', identities.admin, undefined, 'GET');
  assert.equal(initialDirectory.response.status, 200, JSON.stringify(initialDirectory.data));
  assert.equal(initialDirectory.data.companies.find(company => company.id === 'company-a').occupiedSlots, 1);

  const invalid = await api('/admin/companies', identities.admin, { name: 'Invalid Capacity Co.', capacity: 0, active: true });
  assert.equal(invalid.response.status, 400);
  const created = await api('/admin/companies', identities.admin, {
    name: 'New Directory Company', address: '1 Test Road', industry: 'Technology',
    email: 'hello@newcompany.test', phone: '555-0150', capacity: 5, active: true,
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.company.availableSlots, 5);
  const duplicate = await api('/admin/companies', identities.admin, { name: '  NEW   DIRECTORY COMPANY ', capacity: 5, active: true });
  assert.equal(duplicate.response.status, 409);
  const deactivated = await api(`/admin/companies/${created.data.company.id}`, identities.admin, {
    name: 'New Directory Company', address: '1 Test Road', industry: 'Technology',
    email: 'hello@newcompany.test', phone: '555-0150', capacity: 5, active: false,
  }, 'PATCH');
  assert.equal(deactivated.response.status, 200, JSON.stringify(deactivated.data));
  assert.equal(deactivated.data.company.active, false);
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await Promise.all(['capacity-user-one', 'capacity-user-two'].map(id => setDoc(doc(store, 'users', id), {
      role: 'student', placementStatus: 'approved', companyId: created.data.company.id,
    })));
  });
  const belowOccupancy = await api(`/admin/companies/${created.data.company.id}`, identities.admin, {
    name: 'New Directory Company', address: '1 Test Road', industry: 'Technology',
    email: 'hello@newcompany.test', phone: '555-0150', capacity: 1, active: true,
  }, 'PATCH');
  assert.equal(belowOccupancy.response.status, 409);
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await Promise.all(['capacity-user-one', 'capacity-user-two'].map(id => deleteDoc(doc(store, 'users', id))));
  });
  const wrongRoleDirectory = await api('/coordinator/companies', identities.studentA, undefined, 'GET');
  assert.equal(wrongRoleDirectory.response.status, 403);
  const coordinatorDirectory = await api('/coordinator/companies', identities.coordinatorA, undefined, 'GET');
  assert.equal(coordinatorDirectory.response.status, 200);
  assert.ok(coordinatorDirectory.data.companies.some(company => company.id === 'company-b'));
  assert.ok(!coordinatorDirectory.data.companies.some(company => company.id === created.data.company.id));
  const history = await api('/coordinator/placement-history?sectionId=section-a', identities.coordinatorA, undefined, 'GET');
  assert.equal(history.response.status, 200, JSON.stringify(history.data));
  assert.ok(history.data.history.some(item => item.studentId === identities.studentA.uid && item.after.companyName === 'Approved Company'));
  const crossSectionHistory = await api('/coordinator/placement-history?sectionId=section-a', identities.coordinatorB, undefined, 'GET');
  assert.equal(crossSectionHistory.response.status, 403);
  const studentHistory = await api('/coordinator/placement-history?sectionId=section-a', identities.studentA, undefined, 'GET');
  assert.equal(studentHistory.response.status, 403);
  await testEnv.withSecurityRulesDisabled(async context => {
    const audits = await getDocs(query(collection(context.firestore(), 'auditLogs'), where('action', 'in', ['company.created', 'company.updated'])));
    assert.equal(audits.size, 2);
  });
});

test('student placement drafts, submissions, and resubmissions are validated and audited by the backend', async () => {
  const student = identities.placementStudent;
  const unauthenticated = await api('/student/company-proposals', null, { status: 'draft' });
  assert.equal(unauthenticated.response.status, 401);
  const wrongRole = await api('/student/company-proposals', identities.coordinatorA, { status: 'draft' });
  assert.equal(wrongRole.response.status, 403);
  const invalidDate = await api('/student/company-proposals', student, { status: 'draft', startDate: '2026-02-31' });
  assert.equal(invalidDate.response.status, 400);
  const foreignProposal = await api('/student/company-proposals', student, {
    proposalId: 'proposal-b', status: 'draft', companyName: 'Not mine',
  });
  assert.equal(foreignProposal.response.status, 404);

  const draft = await api('/student/company-proposals', student, {
    status: 'draft', companyName: 'New proposal draft', notes: 'Student-authored notes',
  });
  assert.equal(draft.response.status, 201, JSON.stringify(draft.data));
  assert.equal(draft.data.status, 'draft');

  const submitted = await api('/student/company-proposals', student, {
    proposalId: draft.data.id, status: 'pending_review', companyId: 'company-b',
    companyName: 'Forged directory name', companyAddress: 'Forged directory address',
    companyIndustry: 'Forged industry', companyEmail: 'forged@example.test', companyPhone: '000',
    supervisorName: 'Supervisor B', supervisorPosition: 'Manager',
    supervisorEmail: 'supervisor@approved.test', supervisorPhone: '555-0111',
    internshipRole: 'Software Intern', startDate: '2026-10-01', endDate: '2027-03-31',
    workArrangement: 'On-site', studentId: identities.studentB.uid, department: 'Department B',
    sectionId: 'section-b', coordinatorId: identities.coordinatorB.uid, reviewedBy: identities.coordinatorB.uid,
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.data));

  await testEnv.withSecurityRulesDisabled(async context => {
    const proposal = await getDoc(doc(context.firestore(), 'companyProposals', draft.data.id));
    assert.equal(proposal.data().studentId, student.uid);
    assert.equal(proposal.data().department, 'Department A');
    assert.equal(proposal.data().sectionId, 'section-a');
    assert.equal(proposal.data().coordinatorId, identities.coordinatorA.uid);
    assert.equal(proposal.data().companyName, 'Secondary Company');
    assert.equal(proposal.data().companyAddress, '34 Side Road');
    assert.equal(proposal.data().companyIndustry, 'Engineering');
    assert.equal(proposal.data().companyEmail, 'hr@secondary.test');
    assert.equal(proposal.data().reviewedBy, null);
  });

  const revision = await api(`/coordinator/company-placements/${draft.data.id}/decision`, identities.coordinatorA, {
    status: 'needs_revision', reason: 'Please confirm the proposed placement details.',
  });
  assert.equal(revision.response.status, 200, JSON.stringify(revision.data));
  const resubmitted = await api('/student/company-proposals', student, {
    proposalId: draft.data.id, status: 'pending_review', companyId: 'company-b',
    supervisorName: 'Supervisor B', supervisorEmail: 'supervisor@approved.test',
    internshipRole: 'Software Intern', startDate: '2026-10-01', endDate: '2027-03-31',
  });
  assert.equal(resubmitted.response.status, 200, JSON.stringify(resubmitted.data));

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [proposal, notifications, submittedAudit, resubmittedAudit] = await Promise.all([
      getDoc(doc(store, 'companyProposals', draft.data.id)),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.coordinatorA.uid), where('type', '==', 'placement'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'placement.submitted'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'placement.resubmitted'))),
    ]);
    assert.equal(proposal.data().status, 'pending_review');
    assert.equal(proposal.data().reviewReason, '');
    assert.equal(notifications.size, 2);
    assert.equal(submittedAudit.size, 1);
    assert.equal(resubmittedAudit.size, 1);
  });
});

test('final-review submission derives official snapshots and atomically handles coordinator resubmission', async () => {
  const student = identities.placementStudent;
  const unauthenticated = await api('/student/final-reviews', null, {});
  assert.equal(unauthenticated.response.status, 401);
  const wrongRole = await api('/student/final-reviews', identities.coordinatorA, {});
  assert.equal(wrongRole.response.status, 403);
  const unapproved = await api('/student/final-reviews', identities.unapprovedStudent, {});
  assert.equal(unapproved.response.status, 403);
  const forgedSnapshot = await api('/student/final-reviews', student, {
    companySnapshot: { companyName: 'Forged Company' }, coordinatorId: identities.coordinatorB.uid,
  });
  assert.equal(forgedSnapshot.response.status, 400);
  const foreignRequest = await api('/student/final-reviews', student, { requestId: 'final-a' });
  assert.equal(foreignRequest.response.status, 404);

  const created = await api('/student/final-reviews', student, {});
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const duplicate = await api('/student/final-reviews', student, {});
  assert.equal(duplicate.response.status, 409);
  const foreignCoordinator = await api(`/coordinator/final-reviews/${created.data.requestId}/decision`, identities.coordinatorB, {
    status: 'needs_revision', reason: 'Not my student.',
  });
  assert.equal(foreignCoordinator.response.status, 403);

  let initialRequest;
  await testEnv.withSecurityRulesDisabled(async context => {
    initialRequest = await getDoc(doc(context.firestore(), 'finalReviewRequests', created.data.requestId));
  });
  assert.equal(initialRequest.data().studentId, student.uid);
  assert.equal(initialRequest.data().studentName, 'placementStudent Test');
  assert.equal(initialRequest.data().coordinatorId, identities.coordinatorA.uid);
  assert.equal(initialRequest.data().companyProposalId, 'official-placement');
  assert.equal(initialRequest.data().companySnapshot.companyName, 'Official Company');
  assert.equal(initialRequest.data().companySnapshot.supervisorName, 'Official Supervisor');
  assert.deepEqual(initialRequest.data().requirementSnapshot.map(item => item.id), ['application_form']);

  const decision = await api(`/coordinator/final-reviews/${created.data.requestId}/decision`, identities.coordinatorA, {
    status: 'needs_revision', reason: 'Please update your supporting details.',
  });
  assert.equal(decision.response.status, 200, JSON.stringify(decision.data));
  const resubmitted = await api('/student/final-reviews', student, { requestId: created.data.requestId });
  assert.equal(resubmitted.response.status, 200, JSON.stringify(resubmitted.data));

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [request, notifications, submittedAudit, resubmittedAudit] = await Promise.all([
      getDoc(doc(store, 'finalReviewRequests', created.data.requestId)),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.coordinatorA.uid), where('type', '==', 'review'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'final_review.submitted'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'final_review.resubmitted'))),
    ]);
    assert.equal(request.data().status, 'pending_review');
    assert.equal(request.data().reviewReason, '');
    assert.equal(request.data().reviewedBy, null);
    assert.equal(notifications.size, 2);
    assert.equal(submittedAudit.size, 1);
    assert.equal(resubmittedAudit.size, 1);
  });
});

test('coordinator roster changes are department-bound, audited, and retain claimed rows', async () => {
  const noAuth = await api('/coordinator/student-roster', null, { idNumbers: ['21-00123'] });
  assert.equal(noAuth.response.status, 401);
  const wrongRole = await api('/coordinator/student-roster', identities.studentA, { idNumbers: ['21-00123'] });
  assert.equal(wrongRole.response.status, 403);
  const invalid = await api('/coordinator/student-roster', identities.coordinatorA, { idNumbers: ['x'] });
  assert.equal(invalid.response.status, 400);
  const claimed = await api('/coordinator/student-roster', identities.coordinatorA, { idNumbers: ['12345678'] });
  assert.equal(claimed.response.status, 409);
  const add = await api('/coordinator/student-roster', identities.coordinatorA, { idNumbers: ['21-00123', '21-00124', '21-00123'] });
  assert.equal(add.response.status, 200, JSON.stringify(add.data));
  assert.equal(add.data.count, 2);
  const crossDepartment = await api('/coordinator/student-roster/21-00123', identities.coordinatorB, {}, 'DELETE');
  assert.equal(crossDepartment.response.status, 403);
  const remove = await api('/coordinator/student-roster/21-00123', identities.coordinatorA, {}, 'DELETE');
  assert.equal(remove.response.status, 200, JSON.stringify(remove.data));
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [deactivated, audit] = await Promise.all([
      getDoc(doc(store, 'studentRoster', '21-00123')),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'roster.updated'))),
    ]);
    assert.equal(deactivated.data().active, false);
    assert.equal(deactivated.data().department, 'Department A');
    assert.equal((await getDoc(doc(store, 'studentRoster', '12345678'))).data().claimedBy, identities.studentA.uid);
    assert.equal(audit.size, 2);
  });
});

test('final approval requires all required documents, then records decision and dashboard unlock atomically', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    // Simulate a fresh final-review package for the newly approved placement;
    // the original seeded request was correctly superseded by that approval.
    await updateDoc(doc(store, 'finalReviewRequests', 'final-a'), {
      status: 'pending_review', companyProposalId: 'proposal-a',
      companySnapshot: { companyId: 'company-a' },
    });
    await updateDoc(doc(store, 'users', identities.studentA.uid), {
      'requirements.application_form.status': 'submitted',
      preDeploymentStatus: 'pending_review',
    });
  });
  const denied = await api('/coordinator/final-reviews/final-a/decision', identities.coordinatorA, { status: 'approved' });
  assert.equal(denied.response.status, 409);
  let studentSnap;
  await testEnv.withSecurityRulesDisabled(async context => {
    studentSnap = await getDoc(doc(context.firestore(), 'users', identities.studentA.uid));
  });
  assert.notEqual(studentSnap.data().preDeploymentStatus, 'approved');

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const userRef = doc(store, 'users', identities.studentA.uid);
    await updateDoc(userRef, {
      'requirements.application_form.status': 'approved',
      'requirements.endorsement_letter.status': 'approved',
      'requirements.signed_moa.status': 'approved',
      requirementsStatus: 'approved',
    });
  });
  const approved = await api('/coordinator/final-reviews/final-a/decision', identities.coordinatorA, { status: 'approved' });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.data));
  await testEnv.withSecurityRulesDisabled(async context => {
    studentSnap = await getDoc(doc(context.firestore(), 'users', identities.studentA.uid));
  });
  assert.equal(studentSnap.data().preDeploymentStatus, 'approved');
  let reviewState;
  await testEnv.withSecurityRulesDisabled(async context => {
    reviewState = await getDoc(doc(context.firestore(), 'finalReviewRequests', 'final-a'));
  });
  assert.equal(reviewState.data().status, 'approved');
  assert.equal(reviewState.data().reviewedBy, identities.coordinatorA.uid);
  assert.ok(reviewState.data().reviewedAt);
  let notifications;
  await testEnv.withSecurityRulesDisabled(async context => {
    notifications = await getDocs(query(
      collection(context.firestore(), 'notifications'), where('recipientId', '==', identities.studentA.uid),
    ));
  });
  assert.ok(notifications.docs.some(item => /final review approved/i.test(item.data().title)));

  const invalidReason = await api('/coordinator/final-reviews/missing-review/decision', identities.coordinatorA, { status: 'rejected' });
  assert.equal(invalidReason.response.status, 400);
});

test('coordinator final-review changes and rejection require a reason and stay section-scoped', async () => {
  const missingReason = await api('/coordinator/final-reviews/final-needs-revision/decision', identities.coordinatorA, {
    status: 'needs_revision', reason: '   ',
  });
  assert.equal(missingReason.response.status, 400);

  const foreignSection = await api('/coordinator/final-reviews/final-foreign/decision', identities.coordinatorA, {
    status: 'rejected', reason: 'Not my assigned student',
  });
  assert.equal(foreignSection.response.status, 403);

  const foreignCoordinator = await api('/coordinator/final-reviews/final-a/decision', identities.coordinatorB, {
    status: 'needs_revision', reason: 'Not my assigned student',
  });
  assert.equal(foreignCoordinator.response.status, 403);

  const revision = await api('/coordinator/final-reviews/final-needs-revision/decision', identities.coordinatorA, {
    status: 'needs_revision', reason: 'Please correct the placement dates.',
  });
  assert.equal(revision.response.status, 200, JSON.stringify(revision.data));

  const rejected = await api('/coordinator/final-reviews/final-rejected/decision', identities.coordinatorA, {
    status: 'rejected', reason: 'The submitted documents could not be verified.',
  });
  assert.equal(rejected.response.status, 200, JSON.stringify(rejected.data));

  let revisionState;
  let rejectedState;
  let studentState;
  let notifications;
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    [revisionState, rejectedState, studentState, notifications] = await Promise.all([
      getDoc(doc(store, 'finalReviewRequests', 'final-needs-revision')),
      getDoc(doc(store, 'finalReviewRequests', 'final-rejected')),
      getDoc(doc(store, 'users', identities.studentC.uid)),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentC.uid))),
    ]);
  });
  assert.equal(revisionState.data().status, 'needs_revision');
  assert.equal(revisionState.data().reviewReason, 'Please correct the placement dates.');
  assert.equal(revisionState.data().reviewedBy, identities.coordinatorA.uid);
  assert.ok(revisionState.data().reviewedAt);
  assert.equal(rejectedState.data().status, 'rejected');
  assert.equal(rejectedState.data().reviewReason, 'The submitted documents could not be verified.');
  assert.notEqual(studentState.data().preDeploymentStatus, 'approved');
  assert.ok(notifications.docs.some(item => item.data().title === 'Final review needs changes'));
  assert.ok(notifications.docs.some(item => item.data().title === 'Final review rejected'));
});

test('evaluation links are coordinator-scoped, single-use, and validate complete feedback', async () => {
  const coordinatorCannotCreateForForeignStudent = await api('/create-evaluation-token', identities.coordinatorB, {
    studentId: identities.studentA.uid, supervisorName: 'Supervisor A',
    supervisorEmail: 'supervisor@example.test', companyName: 'Test Company',
  });
  assert.equal(coordinatorCannotCreateForForeignStudent.response.status, 403);

  const studentCannotCreateLink = await api('/create-evaluation-token', identities.studentA, {
    studentId: identities.studentA.uid, supervisorName: 'Supervisor A',
    supervisorEmail: 'supervisor@example.test', companyName: 'Test Company',
  });
  assert.equal(studentCannotCreateLink.response.status, 403);

  const malformed = await api('/create-evaluation-token', identities.coordinatorA, {
    studentId: identities.studentA.uid, supervisorName: { name: 'Supervisor A' },
    supervisorEmail: 'invalid-address', companyName: 'Test Company',
  });
  assert.equal(malformed.response.status, 400);

  const created = await api('/create-evaluation-token', identities.coordinatorA, {
    studentId: identities.studentA.uid, supervisorName: '  Supervisor A  ',
    supervisorEmail: ' supervisor@example.test ', companyName: '  Test Company  ',
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.data));
  assert.match(created.data.token, /^[a-f0-9]{64}$/);
  const otherCoordinatorCreated = await api('/create-evaluation-token', identities.coordinatorB, {
    studentId: identities.studentB.uid, supervisorName: 'Supervisor B',
    supervisorEmail: 'supervisor-b@example.test', companyName: 'Other Company',
  });
  assert.equal(otherCoordinatorCreated.response.status, 200, JSON.stringify(otherCoordinatorCreated.data));

  let records;
  await testEnv.withSecurityRulesDisabled(async context => {
    records = await getDocs(query(collection(context.firestore(), 'evaluations'), where('studentId', '==', identities.studentA.uid)));
  });
  assert.equal(records.size, 1);
  const saved = records.docs[0].data();
  assert.notEqual(saved.tokenHash, created.data.token);
  assert.match(saved.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(saved.createdBy, identities.coordinatorA.uid);
  assert.equal(saved.supervisorName, 'Supervisor A');
  assert.equal(saved.supervisorEmail, 'supervisor@example.test');
  assert.equal(saved.companyName, 'Test Company');

  const invalidToken = await api('/evaluation/not-a-token', null, undefined, 'GET');
  assert.equal(invalidToken.response.status, 404);
  const info = await api(`/evaluation/${created.data.token}`, null, undefined, 'GET');
  assert.equal(info.response.status, 200, JSON.stringify(info.data));
  assert.deepEqual(info.data, {
    studentName: 'Updated Test', companyName: 'Test Company',
    supervisorName: 'Supervisor A', expiresAt: saved.expiresAt,
  });

  const invalidRatings = await api(`/evaluation/${created.data.token}/submit`, null, {
    ratings: { notARealCriterion: 5 }, comments: 'Feedback',
  });
  assert.equal(invalidRatings.response.status, 400);
  const invalidComments = await api(`/evaluation/${created.data.token}/submit`, null, {
    ratings: { technicalSkills: 5, workQuality: 4, professionalism: 4, communication: 5, attendance: 5 },
    comments: 'x'.repeat(4001),
  });
  assert.equal(invalidComments.response.status, 400);

  const validRatings = { technicalSkills: 5, workQuality: 4, professionalism: 4, communication: 5, attendance: 5 };
  const submitted = await api(`/evaluation/${created.data.token}/submit`, null, {
    ratings: validRatings, comments: '  Strong progress and professional conduct.  ',
  });
  assert.equal(submitted.response.status, 200, JSON.stringify(submitted.data));
  const replay = await api(`/evaluation/${created.data.token}/submit`, null, {
    ratings: validRatings, comments: 'Second submission',
  });
  assert.equal(replay.response.status, 410);
  const usedLink = await api(`/evaluation/${created.data.token}`, null, undefined, 'GET');
  assert.equal(usedLink.response.status, 410);

  const listed = await api('/coordinator-evaluations', identities.coordinatorA, undefined, 'GET');
  assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
  assert.equal(listed.data.evaluations.length, 1);
  assert.equal(listed.data.evaluations[0].studentId, identities.studentA.uid);
  assert.equal(listed.data.evaluations[0].comments, 'Strong progress and professional conduct.');

  let notifications;
  let evaluationState;
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    [notifications, evaluationState] = await Promise.all([
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentA.uid), where('type', '==', 'evaluation'))),
      getDoc(doc(store, 'evaluations', records.docs[0].id)),
    ]);
  });
  assert.equal(notifications.size, 1);
  assert.equal(evaluationState.data().used, true);
  assert.deepEqual(evaluationState.data().ratings, validRatings);
  assert.equal(evaluationState.data().comments, 'Strong progress and professional conduct.');
});

test('a new official placement supersedes old endorsement paperwork and final-review approval', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await setDoc(doc(store, 'companies', 'company-reassignment'), {
      name: 'Reassignment Company', address: '5 New Road', industry: 'Technology',
      email: 'office@reassignment.test', active: true, status: 'active',
      capacity: 2, occupiedSlots: 0, availableSlots: 2,
    });
    await updateDoc(doc(store, 'users', identities.studentB.uid), {
      placementStatus: 'approved', placementProposalId: 'old-approved-b', companyId: 'company-b',
      company: 'Secondary Company', preDeploymentStatus: 'approved', endorsementId: 'old-endorsement-b',
      requirementsStatus: 'approved',
      requirements: Object.fromEntries([
        'application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa',
      ].map(id => [id, { status: 'approved', fileName: `${id}.pdf` }])),
    });
    await updateDoc(doc(store, 'companyProposals', 'proposal-b'), {
      supervisorName: 'New Supervisor', supervisorEmail: 'supervisor@reassignment.test',
      internshipRole: 'QA Intern', startDate: '2026-10-01', endDate: '2026-12-01',
    });
    await setDoc(doc(store, 'endorsements', 'old-endorsement-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      proposalId: 'old-approved-b', status: 'awaiting_document', deliveryStatus: 'sending',
    });
    await setDoc(doc(store, 'finalReviewRequests', 'old-final-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      companyProposalId: 'old-approved-b', companySnapshot: { companyId: 'company-b' },
      status: 'approved', updatedAt: new Date(Date.now() - 60_000).toISOString(),
    });
  });
  const inProgress = await api('/coordinator/company-placements/proposal-b/decision', identities.coordinatorB, {
    status: 'approved', companyId: 'company-reassignment',
  });
  assert.equal(inProgress.response.status, 409);
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'endorsements', 'old-endorsement-b'), { deliveryStatus: 'not_sent' });
  });
  const changed = await api('/coordinator/company-placements/proposal-b/decision', identities.coordinatorB, {
    status: 'approved', companyId: 'company-reassignment',
  });
  assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [student, oldEndorsement, newEndorsement, oldReview, notifications] = await Promise.all([
      getDoc(doc(store, 'users', identities.studentB.uid)),
      getDoc(doc(store, 'endorsements', 'old-endorsement-b')),
      getDoc(doc(store, 'endorsements', 'proposal-b')),
      getDoc(doc(store, 'finalReviewRequests', 'old-final-b')),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentB.uid))),
    ]);
    assert.equal(student.data().companyId, 'company-reassignment');
    assert.equal(student.data().preDeploymentStatus, 'needs_revision');
    assert.equal(student.data().endorsementId, 'proposal-b');
    assert.equal(student.data().requirements.endorsement_letter.status, 'needs_revision');
    assert.equal(student.data().requirements.signed_moa.status, 'needs_revision');
    assert.equal(student.data().requirementsStatus, 'needs_revision');
    assert.equal(oldEndorsement.data().status, 'superseded');
    assert.equal(newEndorsement.data().status, 'awaiting_document');
    assert.equal(oldReview.data().status, 'superseded');
    assert.equal(oldReview.data().priorStatus, 'approved');
    assert.ok(notifications.docs.some(item => item.data().message?.includes('previous final review was superseded')));
  });
  const outdatedDocuments = await api('/student/final-reviews', identities.studentB, {});
  assert.equal(outdatedDocuments.response.status, 409);
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), 'users', identities.studentB.uid), {
      'requirements.endorsement_letter.status': 'approved',
      'requirements.signed_moa.status': 'approved',
      requirementsStatus: 'approved',
    });
  });
  const freshReview = await api('/student/final-reviews', identities.studentB, {});
  assert.equal(freshReview.response.status, 201, JSON.stringify(freshReview.data));
  await testEnv.withSecurityRulesDisabled(async context => {
    const review = await getDoc(doc(context.firestore(), 'finalReviewRequests', freshReview.data.requestId));
    assert.equal(review.data().companyProposalId, 'proposal-b');
    assert.equal(review.data().companySnapshot.companyId, 'company-reassignment');
  });
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'finalReviewRequests', 'stale-final-b'), {
      studentId: identities.studentB.uid, department: 'Department B', sectionId: 'section-b',
      companyProposalId: 'old-approved-b', companySnapshot: { companyId: 'company-b' }, status: 'pending_review',
    });
  });
  const staleApproval = await api('/coordinator/final-reviews/stale-final-b/decision', identities.coordinatorB, {
    status: 'approved',
  });
  assert.equal(staleApproval.response.status, 409);
});

test('verified private endorsements are emailed only by the assigned coordinator with safe partial retries', async () => {
  const path = '/coordinator/endorsements/proposal-a/send';
  const assetId = 'asset-id-verified-letter-0001';
  const bytes = Buffer.from('%PDF-1.7\nPATHWAY signed endorsement local test\n%%EOF');
  const reviewedAt = '2026-09-30T08:00:00.000Z';
  cloudinaryDownloadAssets.set(assetId, bytes);
  const firstMailIndex = smtpMessages.length;
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await updateDoc(doc(store, 'users', identities.studentA.uid), {
      'requirements.endorsement_letter': {
        status: 'approved', placementProposalId: 'proposal-a',
        fileName: 'Signed Endorsement A.pdf', cloudinaryDeliveryType: 'authenticated',
        cloudinaryAssetId: assetId, uploadedBytes: bytes.length, reviewedAt,
      },
    });
  });

  const unauthenticated = await api(path, null, {});
  assert.equal(unauthenticated.response.status, 401);
  const student = await api(path, identities.studentA, {});
  assert.equal(student.response.status, 403);
  const foreignCoordinator = await api(path, identities.coordinatorB, {});
  assert.equal(foreignCoordinator.response.status, 403);
  const recipientOverride = await api(path, identities.coordinatorA, { companyEmail: 'attacker@example.test' });
  assert.equal(recipientOverride.response.status, 400);
  const unverified = await api(path, identities.coordinatorA, {});
  assert.equal(unverified.response.status, 409);
  assert.equal(smtpMessages.length, firstMailIndex);

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await updateDoc(doc(store, 'endorsements', 'proposal-a'), {
      status: 'signed_copy_verified', signedCopyVerifiedAt: reviewedAt,
      signedCopyVerifiedBy: identities.coordinatorA.uid, deliveryStatus: 'not_sent',
      companyEmail: 'hr@approved.test,attacker@example.test',
    });
    await updateDoc(doc(store, 'users', identities.studentA.uid), {
      companyEmail: 'hr@approved.test,attacker@example.test',
    });
  });
  const addressList = await api(path, identities.coordinatorA, {});
  assert.equal(addressList.response.status, 409);
  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    await updateDoc(doc(store, 'endorsements', 'proposal-a'), { companyEmail: 'hr@approved.test' });
    await updateDoc(doc(store, 'users', identities.studentA.uid), { companyEmail: 'hr@approved.test' });
  });
  smtpRejectCompany = true;
  try {
    const partial = await api(path, identities.coordinatorA, {});
    assert.equal(partial.response.status, 502, JSON.stringify(partial.data));
    assert.equal(partial.data.deliveryStatus, 'partial_failed');
    assert.deepEqual(smtpMessages.slice(firstMailIndex).map(item => item.recipients), [[identities.studentA.profile.email]]);
    const firstMessage = smtpMessages[firstMailIndex].raw;
    assert.match(firstMessage, /Content-Type: application\/pdf/i);
    assert.match(firstMessage, /Signed_Endorsement_A\.pdf/i);
    assert.ok(firstMessage.replace(/\s/g, '').includes(bytes.toString('base64')));

    await testEnv.withSecurityRulesDisabled(async context => {
      const stored = await getDoc(doc(context.firestore(), 'endorsements', 'proposal-a'));
      assert.equal(stored.data().deliveryRecipients.student.status, 'sent');
      assert.equal(stored.data().deliveryRecipients.company.status, 'failed');
    });
  } finally { smtpRejectCompany = false; }

  const retried = await api(path, identities.coordinatorA, {});
  assert.equal(retried.response.status, 200, JSON.stringify(retried.data));
  assert.equal(retried.data.deliveryStatus, 'sent');
  assert.deepEqual(smtpMessages.slice(firstMailIndex).map(item => item.recipients), [
    [identities.studentA.profile.email], ['hr@approved.test'],
  ]);
  const duplicate = await api(path, identities.coordinatorA, {});
  assert.equal(duplicate.response.status, 409);

  await testEnv.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const [stored, notifications, acceptedAudits, failedAudits] = await Promise.all([
      getDoc(doc(store, 'endorsements', 'proposal-a')),
      getDocs(query(collection(store, 'notifications'), where('recipientId', '==', identities.studentA.uid), where('type', '==', 'endorsement'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'endorsement.email_accepted'), where('targetId', '==', 'proposal-a'))),
      getDocs(query(collection(store, 'auditLogs'), where('action', '==', 'endorsement.email_failed'), where('targetId', '==', 'proposal-a'))),
    ]);
    assert.equal(stored.data().deliveryStatus, 'sent');
    assert.ok(stored.data().emailAcceptedAt);
    assert.equal(stored.data().deliveryRecipients.student.status, 'sent');
    assert.equal(stored.data().deliveryRecipients.company.status, 'sent');
    assert.equal(notifications.size, 1);
    assert.equal(acceptedAudits.size, 2);
    assert.equal(failedAudits.size, 1);
  });
});
