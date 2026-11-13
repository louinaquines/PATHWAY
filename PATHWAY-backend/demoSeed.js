// Demo data for live walkthroughs. Admin-only and off unless DEMO_SEED_ENABLED=1.
// Wipes student data (keeps admins, coordinators and companies) and rebuilds one
// fully populated section owned by a dedicated demo coordinator.
const crypto = require('node:crypto');

const DEPARTMENT = 'College of Computer Studies';
const COORDINATOR = { email: 'coordinator.demo@pathway-demo.app', password: 'Demo@2026', firstName: 'Maria', lastName: 'Santos' };
const STUDENT_PASSWORD = 'Demo@2026';
const SECTION = { name: 'BSIT - 4A', hoursRequired: 486 };
const AUTH_DOMAIN = 'students.pathway.invalid';
const REQUIREMENTS = [
  { id: 'cor', label: 'Certificate of Registration (COR)', category: 'Pre-OJT' },
  { id: 'endorsement', label: 'Recommendation / Endorsement Letter', category: 'Pre-OJT' },
  { id: 'parental_consent', label: 'Notarized Parental Consent & Waiver', category: 'Pre-OJT' },
  { id: 'medical_cert', label: 'Medical Certificate', category: 'Pre-OJT' },
  { id: 'good_moral', label: 'Certificate of Good Moral Character', category: 'Pre-OJT' },
  { id: 'moa', label: 'MOA & Internship Plan', category: 'Pre-OJT' },
  { id: 'dtr', label: 'Daily Time Record (DTR)', category: 'Ongoing' },
  { id: 'logbook', label: 'OJT Journal / Logbook', category: 'Ongoing' },
  { id: 'coc', label: 'Certificate of Completion (COC)', category: 'Post-OJT' },
  { id: 'eval_sheet', label: 'Performance Evaluation Sheet', category: 'Post-OJT' },
  { id: 'narrative', label: 'OJT Narrative Report', category: 'Post-OJT' },
];
const PRE = REQUIREMENTS.filter(r => r.category === 'Pre-OJT').map(r => r.id);
const COMPANIES = [
  { key: 'lapu', name: 'Lapu-Lapu Tech Solutions', address: 'Pusok, Lapu-Lapu City, Cebu', industry: 'Software Development', phone: '0917 555 0101',
    supervisorName: 'Engr. Ramon dela Cruz', supervisorEmail: 'ramon.delacruz@lapulaputech.ph', role: 'Web Development Intern', arrangement: 'On-site', capacity: 5 },
  { key: 'mactan', name: 'Mactan Data Hub', address: 'Mactan Economic Zone, Lapu-Lapu City', industry: 'Data Center & IT Services', phone: '0917 555 0202',
    supervisorName: 'Ms. Grace Villanueva', supervisorEmail: 'grace.villanueva@mactandatahub.ph', role: 'IT Support Intern', arrangement: 'On-site', capacity: 4 },
  { key: 'creative', name: 'Cebu Creative Labs', address: 'IT Park, Lahug, Cebu City', industry: 'Digital Agency', phone: '0917 555 0303',
    supervisorName: 'Mr. Paolo Reyes', supervisorEmail: 'paolo.reyes@cebucreativelabs.ph', role: 'UI/UX Design Intern', arrangement: 'Hybrid', capacity: 3 },
  { key: 'island', name: 'Island Cloud Systems', address: 'A.S. Fortuna St, Mandaue City', industry: 'Cloud Services', phone: '0917 555 0404',
    supervisorName: 'Engr. Liza Fernandez', supervisorEmail: 'liza.fernandez@islandcloud.ph', role: 'Cloud Operations Intern', arrangement: 'Remote', capacity: 3 },
];
// stage drives everything: new | docs | proposal | finalReview | deployed | done | cleared | awaiting
const STUDENTS = [
  ['26200001', 'Bautista', 'Carlo', 'new', { mustChange: true }],
  ['26200002', 'Garcia', 'Angela', 'new'],
  ['26200003', 'Ramos', 'Miguel', 'docs', { mix: 'review' }],
  ['26200004', 'Torres', 'Christian', 'docs', { mix: 'deficient' }],
  ['26200005', 'Rivera', 'Bea', 'docs', { mix: 'almost' }],
  ['26200006', 'Fernandez', 'Andrea', 'proposal', { company: 'creative' }],
  ['26200007', 'Ocampo', 'Danica', 'finalReview', { company: 'island' }],
  ['26200008', 'Padilla', 'Adrian', 'deployed', { company: 'lapu', hours: 312, frequency: 'weekly' }],
  ['26200009', 'Manalo', 'Alyssa', 'deployed', { company: 'lapu', hours: 268, frequency: 'daily' }],
  ['26200010', 'Estrada', 'Daniel', 'deployed', { company: 'mactan', hours: 190, frequency: 'weekly', atRisk: true }],
  ['26200011', 'Sorio', 'Erica', 'deployed', { company: 'mactan', hours: 355, frequency: 'weekly' }],
  ['26200012', 'Cruz', 'Jose', 'deployed', { company: 'creative', hours: 240, frequency: 'daily', evaluation: 'sent' }],
  ['26200013', 'Abad', 'Joanna', 'done', { company: 'island', hours: 486, frequency: 'weekly', evaluation: 'submitted' }],
  ['26200014', 'Salazar', 'Gabriel', 'cleared', { company: 'lapu', hours: 492, frequency: 'weekly', evaluation: 'submitted' }],
  ['26200015', 'Pascual', 'Hannah', 'awaiting'],
];

const iso = date => date.toISOString();
const daysAgo = (n, hour = 9) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); d.setUTCHours(hour - 8, 0, 0, 0); return d; };
const dateKey = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
const weekday = d => new Date(dateKey(d) + 'T00:00:00Z').getUTCDay();

function requirementState(stage, mix) {
  const out = {};
  const sub = (id, n, extra = {}) => { out[id] = { status: 'submitted', submittedAt: iso(daysAgo(n)), fileName: `${id}.pdf`, ...extra }; };
  const ok = (id, n) => { out[id] = { status: 'approved', submittedAt: iso(daysAgo(n + 2)), reviewedAt: iso(daysAgo(n)), reviewedBy: 'coordinator', fileName: `${id}.pdf` }; };
  if (stage === 'new' || stage === 'awaiting') return out;
  if (stage === 'docs') {
    if (mix === 'review') { ok('cor', 6); sub('endorsement', 1); sub('medical_cert', 1); sub('good_moral', 2); }
    if (mix === 'deficient') { ok('cor', 8); ok('medical_cert', 7);
      out.parental_consent = { status: 'rejected', submittedAt: iso(daysAgo(4)), reviewedAt: iso(daysAgo(3)), fileName: 'parental_consent.pdf',
        rejectionReason: "The waiver is not notarized and the parent's signature is missing. Please upload the notarized copy." };
      sub('good_moral', 1); }
    if (mix === 'almost') { ['cor', 'endorsement', 'parental_consent', 'medical_cert'].forEach((id, i) => ok(id, 10 - i)); sub('good_moral', 1); sub('moa', 0); }
    return out;
  }
  PRE.forEach((id, i) => ok(id, 40 - i));
  if (['done', 'cleared'].includes(stage)) ['dtr', 'logbook', 'coc', 'eval_sheet', 'narrative'].forEach((id, i) => ok(id, 5 - i));
  if (stage === 'deployed') sub('dtr', 1);
  return out;
}

const AI = {
  endorsement: { tier: 'green', status: 'checks_passed', confidence: 0.94, findings: ['Name, signature and school seal are present.'] },
  medical_cert: { tier: 'yellow', status: 'needs_review', confidence: 0.72, findings: ['Scan is blurry; the physician signature has low contrast.'] },
  good_moral: { tier: 'red', status: 'needs_review', confidence: 0.35, findings: ['Signature over printed name is missing and the date is blank.'] },
  moa: { tier: 'green', status: 'checks_passed', confidence: 0.91, findings: ['Company and student details match the placement.'] },
  dtr: { tier: 'green', status: 'checks_passed', confidence: 0.88, findings: ['Totals match the recorded attendance.'] },
};

const JOURNAL_TEXT = [
  'This week I set up the local development environment and reviewed the company coding standards. I worked on the login page of the client portal and fixed form validation issues. My supervisor showed me how they use Git branches and pull requests, and I opened my first pull request for review. I also attended the daily stand-up meetings and learned how tasks are tracked on their board.',
  'I continued working on the dashboard module and connected it to the REST API. I wrote unit tests for the data formatting helpers and fixed two bugs reported by QA. I learned how to read API documentation carefully before integrating, and how to ask clearer questions during stand-up. Next week I will start on the reports page.',
  'I helped migrate old records into the new database and checked them for duplicates. It was repetitive but taught me why data validation matters. I documented the steps so the next intern can follow them. My supervisor gave feedback that my documentation was clear and easy to follow.',
  'Today I assisted in replacing network cables in the server room and labelled each port. I also updated the asset inventory spreadsheet and learned how they monitor server temperature and uptime. I logged two tickets for printers that were offline and resolved one of them myself.',
];

async function wipe(db, auth) {
  const students = await db.collection('users').where('role', '==', 'student').get();
  for (const doc of students.docs) await db.recursiveDelete(doc.ref);
  const authIds = students.docs.map(doc => doc.id);
  for (let i = 0; i < authIds.length; i += 1000) await auth.deleteUsers(authIds.slice(i, i + 1000)).catch(() => {});
  for (const name of ['studentRoster', 'companyProposals', 'endorsements', 'evaluations', 'finalReviewRequests', 'requirementReviews',
    'messages', 'announcements', 'placementHistory', 'studentJournalDays', 'studentJournalSequences', 'studentJournalReceipts',
    'dtrReviews', 'companyEmails', 'reviewChecks', 'workplaceJournalAnalysisJobs']) {
    const snap = await db.collection(name).limit(500).get();
    for (const doc of snap.docs) await db.recursiveDelete(doc.ref);
  }
  const notices = await db.collection('notifications').limit(1000).get();
  for (const doc of notices.docs) await doc.ref.delete();
  const sections = await db.collection('sections').get();
  for (const doc of sections.docs) await doc.ref.update({ studentIds: [] });
  const companies = await db.collection('companies').get();
  for (const doc of companies.docs) await doc.ref.update({ occupiedSlots: 0, availableSlots: doc.data().capacity || 1 });
  return { students: students.size };
}

async function ensureCoordinator(db, auth) {
  let user;
  try { user = await auth.getUserByEmail(COORDINATOR.email); await auth.updateUser(user.uid, { password: COORDINATOR.password }); }
  catch { user = await auth.createUser({ email: COORDINATOR.email, password: COORDINATOR.password, displayName: `${COORDINATOR.firstName} ${COORDINATOR.lastName}` }); }
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: COORDINATOR.email, firstName: COORDINATOR.firstName, lastName: COORDINATOR.lastName,
    role: 'coordinator', department: DEPARTMENT, accountApproved: true, createdAt: iso(daysAgo(60)) }, { merge: true });
  return user.uid;
}

async function seed({ db, auth }) {
  const wiped = await wipe(db, auth);
  const coordinatorId = await ensureCoordinator(db, auth);
  const now = iso(new Date());
  const term = await db.collection('academicTerms').where('isActive', '==', true).limit(1).get();
  const termFields = term.empty ? {} : { termId: term.docs[0].id, termName: term.docs[0].data().name };

  // Section (replace any previous demo section of the same name for this coordinator)
  const old = await db.collection('sections').where('coordinatorId', '==', coordinatorId).get();
  for (const doc of old.docs) await db.recursiveDelete(doc.ref);
  const sectionRef = db.collection('sections').doc();
  const sectionId = sectionRef.id;
  await sectionRef.set({ name: SECTION.name, department: DEPARTMENT, hoursRequired: SECTION.hoursRequired, messengerLink: 'https://m.me/j/demo-bsit4a',
    coordinatorId, studentIds: [], createdAt: iso(daysAgo(60)), ...termFields });
  for (const [i, r] of REQUIREMENTS.entries()) {
    await sectionRef.collection('requirements').doc(r.id).set({ ...r, deadline: r.category === 'Pre-OJT' ? dateKey(daysAgo(-7 + i)) : '', createdAt: iso(daysAgo(60)) });
  }

  // Companies (upsert by name)
  const companyIds = {};
  for (const c of COMPANIES) {
    const existing = await db.collection('companies').where('name', '==', c.name).limit(1).get();
    const ref = existing.empty ? db.collection('companies').doc() : existing.docs[0].ref;
    companyIds[c.key] = ref.id;
    await ref.set({ name: c.name, normalizedName: c.name.toLowerCase(), address: c.address, industry: c.industry, email: c.supervisorEmail, phone: c.phone,
      capacity: c.capacity, active: true, occupiedSlots: 0, availableSlots: c.capacity, geofence: { enabled: false },
      placementDefaults: { supervisorName: c.supervisorName, supervisorEmail: c.supervisorEmail, internshipRole: c.role, workArrangement: c.arrangement, startDate: '', endDate: '' },
      createdBy: coordinatorId, createdAt: iso(daysAgo(50)), updatedBy: coordinatorId, updatedAt: now }, { merge: true });
  }
  const occupied = {};

  const studentIds = [];
  for (const [idNumber, lastName, firstName, stage, opts = {}] of STUDENTS) {
    const username = `uclm-${idNumber}`;
    const uid = `roster-${idNumber}`;
    const epoch = crypto.randomUUID();
    await auth.deleteUser(uid).catch(() => {});
    await auth.createUser({ uid, email: `${username}@${AUTH_DOMAIN}`, password: STUDENT_PASSWORD });
    await auth.setCustomUserClaims(uid, { passwordEpoch: epoch });
    const company = opts.company ? COMPANIES.find(c => c.key === opts.company) : null;
    const placed = ['deployed', 'done', 'cleared', 'finalReview'].includes(stage);
    const requirements = requirementState(stage, opts.mix);
    const approvedAll = PRE.every(id => requirements[id]?.status === 'approved');
    const start = daysAgo(opts.hours ? Math.ceil(opts.hours / 8 * 1.4) + 3 : 30);
    const profile = {
      uid, username, authEmail: `${username}@${AUTH_DOMAIN}`, email: '', idNumber, firstName, lastName, role: 'student', department: DEPARTMENT,
      sectionId, coordinatorId, ...termFields, accountApproved: stage !== 'awaiting', status: stage === 'awaiting' ? 'pending' : 'active',
      passwordChangeRequired: !!opts.mustChange, passwordEpoch: epoch, provisioningStatus: 'ready',
      hoursRendered: opts.hours || 0, hoursRequired: SECTION.hoursRequired, company: placed ? company.name : '', createdAt: iso(daysAgo(55)),
      requirements, requirementsStatus: approvedAll ? 'approved' : Object.values(requirements).some(r => r.status === 'rejected') ? 'needs_revision'
        : Object.values(requirements).some(r => r.status === 'submitted') ? 'pending' : 'not_submitted',
    };
    if (placed) {
      occupied[company.key] = (occupied[company.key] || 0) + 1;
      Object.assign(profile, { placementStatus: 'approved', companyId: companyIds[company.key], companyAddress: company.address, companyIndustry: company.industry,
        companyEmail: company.supervisorEmail, companyPhone: company.phone, supervisorName: company.supervisorName, supervisorEmail: company.supervisorEmail,
        internshipRole: company.role, workArrangement: company.arrangement, startDate: dateKey(start), endDate: dateKey(daysAgo(-60)),
        placementProposalId: `demo-${idNumber}`, endorsementId: `demo-${idNumber}`,
        preDeploymentStatus: stage === 'finalReview' ? 'pending' : 'approved', clearanceStatus: stage === 'cleared' ? 'cleared' : 'in_progress' });
    }
    await db.collection('users').doc(uid).set(profile);
    await db.collection('studentRoster').doc(idNumber).set({ idNumber, firstName, lastName, department: DEPARTMENT, sectionId, active: true,
      claimedBy: stage === 'awaiting' ? '' : uid, createdBy: coordinatorId, createdAt: iso(daysAgo(56)) });
    studentIds.push(uid);

    // AI reviews for submitted documents
    for (const [reqId, r] of Object.entries(requirements)) {
      if (r.status !== 'submitted' || !AI[reqId]) continue;
      const a = AI[reqId];
      await db.collection('requirementReviews').doc(`${uid}__${reqId}`).set({ studentId: uid, requirementId: reqId, sectionId, status: a.status, tier: a.tier,
        nameCheck: { result: a.tier === 'red' ? 'missing' : 'match' }, reason: a.status === 'needs_review' ? 'incomplete' : null, checks: [], findings: a.findings,
        confidence: a.confidence, reviewedAt: r.submittedAt, advisoryOnly: true });
    }

    // Placement proposal / history
    if (company && (placed || stage === 'proposal')) {
      await db.collection('companyProposals').doc(`demo-${idNumber}`).set({ studentId: uid, studentName: `${lastName}, ${firstName}`, sectionId, department: DEPARTMENT,
        coordinatorId, companyId: companyIds[company.key], companyName: company.name, companyAddress: company.address, companyEmail: company.supervisorEmail,
        supervisorName: company.supervisorName, supervisorEmail: company.supervisorEmail, internshipRole: company.role, workArrangement: company.arrangement,
        startDate: dateKey(start), endDate: dateKey(daysAgo(-60)), status: placed ? 'approved' : 'pending_review',
        source: placed ? 'coordinator_assignment' : 'student_request', createdAt: iso(daysAgo(placed ? 45 : 2)), ...(placed ? { reviewedAt: iso(daysAgo(44)) } : {}) });
    }
    if (stage === 'finalReview') {
      await db.collection('finalReviewRequests').doc(`demo-${idNumber}`).set({ studentId: uid, studentName: `${lastName}, ${firstName}`, sectionId, department: DEPARTMENT,
        coordinatorId, companyId: companyIds[company.key], companySnapshot: { companyName: company.name, supervisorName: company.supervisorName },
        requirementSnapshot: PRE.map(id => ({ id, status: 'approved' })), status: 'pending', createdAt: iso(daysAgo(1)) });
    }

    // Attendance + journals for deployed students
    if (opts.hours) {
      const userRef = db.collection('users').doc(uid);
      const lastDays = stage === 'deployed' ? 18 : 10;
      let weekNum = 0;
      for (let n = lastDays; n >= (stage === 'deployed' ? 0 : 3); n--) {
        const day = daysAgo(n);
        if ([0, 6].includes(weekday(day))) continue;
        if (opts.atRisk && n % 3 === 0) continue;
        if (n === 0 && idNumber !== '26200008') continue; // leave today free so students can time in live
        const date = dateKey(day);
        const timeIn = daysAgo(n, 8); timeIn.setUTCMinutes(opts.atRisk && n % 2 ? 25 : 2);
        const timeOut = daysAgo(n, 17);
        const today = n === 0;
        await userRef.collection('attendance').doc(date).set({ date, timeIn: iso(timeIn), timeOut: today ? null : iso(timeOut), hoursToday: today ? 0 : 8,
          status: n > 4 ? 'approved' : 'pending', createdAt: iso(timeIn), companyId: companyIds[company.key] });
      }
      const entries = opts.frequency === 'daily' ? [9, 8, 7, 4, 3, 2, 1] : [21, 14, 7];
      for (const [i, n] of entries.entries()) {
        const at = daysAgo(n, 18);
        if ([0, 6].includes(weekday(at)) && opts.frequency === 'daily') continue;
        weekNum += 1;
        const last = i === entries.length - 1;
        const status = last ? 'pending' : (i === 1 && idNumber === '26200010') ? 'rejected' : 'approved';
        const periodStart = opts.frequency === 'daily' ? dateKey(at) : dateKey(daysAgo(n + 4));
        const text = JOURNAL_TEXT[(i + Number(idNumber.slice(-1))) % JOURNAL_TEXT.length];
        await userRef.collection('logbook').add({ rawNotes: text, refined: text, aiRefined: false, hours: opts.frequency === 'daily' ? 8 : 40, status,
          sourceRevision: 1, analysisStatus: 'not-enabled', frequency: opts.frequency, periodStart, periodEnd: dateKey(at),
          weekNum, weekRange: `${periodStart} – ${dateKey(at)}`, createdAt: iso(at), submittedAt: iso(at), updatedAt: iso(at),
          ...(status === 'rejected' ? { rejectionReason: 'Please describe what you actually did each day and what you learned, not only the tasks given.' } : {}) });
      }
    }

    // Evaluations
    if (opts.evaluation) {
      const submitted = opts.evaluation === 'submitted';
      await db.collection('evaluations').add({ studentId: uid, studentName: `${lastName}, ${firstName}`, sectionId, department: DEPARTMENT,
        supervisorName: company.supervisorName, supervisorEmail: company.supervisorEmail, companyName: company.name,
        tokenHash: crypto.randomBytes(32).toString('hex'), expiresAt: iso(daysAgo(-10)), used: submitted, createdBy: coordinatorId, createdAt: iso(daysAgo(submitted ? 9 : 2)),
        emailStatus: 'accepted', emailAcceptedAt: iso(daysAgo(submitted ? 9 : 2)),
        ...(submitted ? { submittedAt: iso(daysAgo(6)), ratings: { technicalSkills: 5, workQuality: 4, professionalism: 5, communication: 4, attendance: 5 },
          comments: `${firstName} was dependable and quick to learn. Communicated clearly with the team and finished tasks on time.` } : {}) });
    }
  }

  await sectionRef.update({ studentIds: studentIds.filter((_, i) => STUDENTS[i][3] !== 'awaiting') });
  for (const c of COMPANIES) {
    const used = occupied[c.key] || 0;
    await db.collection('companies').doc(companyIds[c.key]).update({ occupiedSlots: used, availableSlots: Math.max(0, c.capacity - used) });
  }

  // Announcements, messages, notifications, company emails
  const announce = async (title, message, n) => db.collection('announcements').add({ coordinatorId, sectionId, title, message, createdAt: iso(daysAgo(n)), emailRecipients: {} });
  await announce('Orientation for deployed interns', 'All deployed interns must attend the online check-in this Friday at 4:00 PM. The link is in our group chat.', 5);
  await announce('Requirement deadline reminder', 'Please upload your remaining Pre-OJT requirements before the deadline. Contact me if you have problems with your documents.', 1);
  const message = async (studentUid, studentName, fromStudent, body, n) => {
    const participantIds = [studentUid, coordinatorId].sort();
    await db.collection('messages').add({ conversationId: participantIds.join('__'), participantIds, studentId: studentUid, coordinatorId,
      senderId: fromStudent ? studentUid : coordinatorId, senderRole: fromStudent ? 'student' : 'coordinator', senderName: fromStudent ? studentName : `${COORDINATOR.firstName} ${COORDINATOR.lastName}`,
      recipientId: fromStudent ? coordinatorId : studentUid, recipientRole: fromStudent ? 'coordinator' : 'student', recipientName: fromStudent ? `${COORDINATOR.firstName} ${COORDINATOR.lastName}` : studentName,
      body, message: body, read: !fromStudent || n > 1, createdAt: iso(daysAgo(n, 10 + n)), type: 'direct_message' });
  };
  await message('roster-26200004', 'Christian Torres', true, 'Good morning Ma\'am, where can I get the parental waiver notarized?', 2);
  await message('roster-26200004', 'Christian Torres', false, 'Any notary public near the school works. Upload the notarized copy once it is ready.', 1);
  await message('roster-26200010', 'Daniel Estrada', true, 'Ma\'am, I was absent on Monday because I was sick. Should I send a medical certificate?', 0);
  await message('roster-26200009', 'Alyssa Manalo', true, 'Thank you for approving my journals, Ma\'am!', 3);
  const notice = async (title, msg, type, n) => db.collection('notifications').add({ ...require('./coordinatorInbox').inboxFields({ title, message: msg, type }),
    recipientId: coordinatorId, title, message: msg, type, read: false, createdAt: iso(daysAgo(n)) });
  await notice('Company placement request', 'Fernandez, Andrea submitted a company placement for review.', 'placement', 2);
  await notice('Final review submitted', 'Ocampo, Danica submitted a pre-deployment package for review.', 'review', 1);
  await db.collection('companyEmails').doc(`demo-email-1`).set({ gmailId: 'demo-email-1', from: 'Engr. Ramon dela Cruz', fromEmail: COMPANIES[0].supervisorEmail,
    subject: 'Schedule change for Adrian and Alyssa', text: 'Good day Ma\'am Santos,\n\nOur office will be closed next Monday for maintenance. Can Adrian and Alyssa render their hours on Saturday instead? Please confirm so we can prepare their access cards.\n\nThank you,\nRamon',
    receivedAt: iso(daysAgo(0, 9)), attachments: [], companyIds: [companyIds.lapu], companyName: COMPANIES[0].name, studentIds: ['roster-26200008', 'roster-26200009', 'roster-26200014'],
    studentNames: ['Padilla, Adrian', 'Manalo, Alyssa', 'Salazar, Gabriel'], sectionIds: [sectionId], coordinatorIds: [coordinatorId], matched: true,
    summary: 'The office is closed next Monday; the company asks if Adrian and Alyssa can make up their hours on Saturday.', action: 'Reply to confirm whether Saturday hours are allowed.', readBy: [], createdAt: now });
  await db.collection('companyEmails').doc(`demo-email-2`).set({ gmailId: 'demo-email-2', from: 'Ms. Grace Villanueva', fromEmail: COMPANIES[1].supervisorEmail,
    subject: 'Concern about Daniel\'s attendance', text: 'Hello,\n\nDaniel has been late several times this week and was absent twice. Could you please talk to him? He is doing good work when present.\n\nRegards,\nGrace Villanueva\nMactan Data Hub',
    receivedAt: iso(daysAgo(1, 14)), attachments: [], companyIds: [companyIds.mactan], companyName: COMPANIES[1].name, studentIds: ['roster-26200010', 'roster-26200011'],
    studentNames: ['Estrada, Daniel', 'Sorio, Erica'], sectionIds: [sectionId], coordinatorIds: [coordinatorId], matched: true,
    summary: 'The supervisor reports Daniel was late several times and absent twice this week, though his work is good.', action: 'Talk to Daniel about his attendance.', readBy: [coordinatorId], createdAt: now });

  return { wipedStudents: wiped.students, coordinator: COORDINATOR.email, coordinatorPassword: COORDINATOR.password, section: SECTION.name,
    students: STUDENTS.length, studentPassword: STUDENT_PASSWORD, companies: COMPANIES.map(c => c.name) };
}

function installDemoSeed({ app, db, auth, requireAdmin, env = process.env }) {
  app.get('/admin/demo-seed', requireAdmin, (req, res) => res.json({ enabled: env.DEMO_SEED_ENABLED === '1' }));
  let running = false;
  app.post('/admin/demo-seed', requireAdmin, async (req, res) => {
    if (env.DEMO_SEED_ENABLED !== '1') return res.status(403).json({ error: 'Demo data is turned off on this server.' });
    if (req.body?.confirm !== 'RESET DEMO') return res.status(400).json({ error: 'Type RESET DEMO to confirm.' });
    if (running) return res.status(409).json({ error: 'Demo data is already being created.' });
    running = true;
    try { return res.json({ ok: true, ...(await seed({ db, auth })) }); }
    catch (error) { console.error('Demo seed failed:', error); return res.status(500).json({ error: 'Demo data could not be created: ' + error.message }); }
    finally { running = false; }
  });
}

module.exports = { installDemoSeed, seed, STUDENTS, COMPANIES };
