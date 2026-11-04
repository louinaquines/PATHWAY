const policy = require('./companyMatchingPolicy');
const MAX_STUDENTS = 40;
const MAX_COMPANIES = 200;
const MAX_RELATED = 500;
const conflict = 'Placement records changed. Generate a new preview and review your assignments again.';

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
const record = snapshot => ({ ...snapshot.data(), id: snapshot.id });
const courseOf = (student, section) => student.course || section.courseCode || section.course || section.name;
const approved = doc => doc.data().role === 'student' && doc.data().placementStatus === 'approved';
const readyForBatch = (company, course) => Boolean(company.matching?.internshipRole)
  && policy.companyReadiness(company, course).length === 0;
const companyOption = ({ id, name, matching }) => ({ id, name, location: matching.location });

function installCompanyMatching({ app, db, requireUser, requireStaff, snapshotText, placementStudentName, writeAuditInTransaction, isIsoDate }) {
  const users = db.collection('users');
  const companies = db.collection('companies');
  const sections = db.collection('sections');
  const proposals = db.collection('companyProposals');
  const plans = db.collection('placementBatchPlans');

  const handle = handler => async (req, res) => {
    try { return res.json(await handler(req)); }
    catch (error) {
      if (!error.status) console.error('Company matching error:', error);
      return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not complete the placement request.' });
    }
  };

  async function scope(reader, uid, sectionId) {
    if (!policy.validId(sectionId)) fail(400, 'Choose a valid section.');
    const [staff, section] = await Promise.all([reader(users.doc(uid)), reader(sections.doc(sectionId))]);
    if (!section.exists || !staff.exists || staff.data().role !== 'coordinator'
      || section.data().coordinatorId !== uid || section.data().department !== staff.data().department) {
      fail(403, 'You can only match students in your assigned sections.');
    }
    return record(section);
  }

  async function directory(read) {
    const result = await read(companies.limit(MAX_COMPANIES + 1));
    if (result.size > MAX_COMPANIES) fail(409, 'The directory is too large for batch matching.');
    return result.docs.map(record);
  }

  async function studentProfile(read, uid) {
    const snapshot = await read(users.doc(uid));
    if (!snapshot.exists || snapshot.data().role !== 'student' || snapshot.data().accountApproved !== true
      || ['inactive', 'disabled', 'rejected'].includes(snapshot.data().status)) fail(403, 'Student access required.');
    const student = record(snapshot);
    if (!policy.validId(student.sectionId)) fail(409, 'A section is required before choosing preferences.');
    const section = await read(sections.doc(student.sectionId));
    if (!section.exists || section.data().department !== student.department) fail(409, 'Your assigned section could not be verified.');
    return { student, course: courseOf(student, section.data()), locked: Boolean(policy.studentSkipReason(student)) };
  }

  app.get('/student/placement-preferences', requireUser, handle(async req => {
    const read = ref => ref.get();
    const { student, course, locked } = await studentProfile(read, req.user.uid);
    const options = (await directory(read)).filter(company => readyForBatch(company, course));
    return { preferences: student.placementPreferences || { companyIds: [], location: '' }, locked,
      companies: options.map(companyOption) };
  }));

  app.put('/student/placement-preferences', requireUser, handle(req => {
    const preferences = policy.normalizePreferences(req.body);
    return db.runTransaction(async transaction => {
      const read = ref => transaction.get(ref);
      const { student, course, locked } = await studentProfile(read, req.user.uid);
      if (locked) fail(409, 'Placement preferences are locked.');
      const selected = await Promise.all(preferences.companyIds.map(id => read(companies.doc(id))));
      if (selected.some(doc => !doc.exists || !readyForBatch(record(doc), course))) fail(400, 'Choose eligible companies.');
      transaction.update(users.doc(student.id), { placementPreferences: preferences });
      return { preferences, locked: false };
    });
  }));

  async function occupancy(read, companyId) {
    const snapshot = await read(users.where('companyId', '==', companyId).limit(MAX_RELATED + 1));
    if (snapshot.size > MAX_RELATED) fail(409, 'Company occupancy is too large to verify in a batch.');
    return snapshot.docs.filter(approved).length;
  }

  app.post('/coordinator/company-matching/preview', requireStaff, handle(async req => {
    const section = await scope(ref => ref.get(), req.staff.uid, req.body?.sectionId);
    const { studentIds } = req.body;
    if (!Array.isArray(studentIds) || !studentIds.length || studentIds.length > MAX_STUDENTS
      || studentIds.some(id => !policy.validId(id)) || new Set(studentIds).size !== studentIds.length) {
      fail(400, 'Select up to 40 distinct students.');
    }
    const selected = await db.getAll(...studentIds.map(id => users.doc(id)));
    if (selected.some(doc => !doc.exists || doc.data().role !== 'student'
      || doc.data().sectionId !== section.id || doc.data().department !== section.department)) fail(403, 'One or more students are outside your selected section.');
    const course = courseOf(selected[0].data(), section);
    const students = selected.map(doc => ({ ...record(doc), name: placementStudentName(doc.data()), course: courseOf(doc.data(), section) }));
    const eligible = (await directory(ref => ref.get())).filter(company => readyForBatch(company, course));
    const [occupiedCompanies, recentProposals] = await Promise.all([
      Promise.all(eligible.map(async company => ({ ...company, occupiedSlots: await occupancy(ref => ref.get(), company.id) }))),
      proposals.where('sectionId', '==', section.id).limit(MAX_RELATED + 1).get(),
    ]);
    if (recentProposals.size > MAX_RELATED) fail(409, 'Too many section placement proposals to generate a batch.');
    const suggestions = policy.suggestCompanyAssignments({ students, companies: occupiedCompanies, course, proposals: recentProposals.docs.map(record) });
    const byId = new Map(students.map(student => [student.id, student]));
    const plan = plans.doc();
    await plan.create({
      coordinatorId: req.staff.uid, sectionId: section.id, department: section.department,
      expiresAt: Date.now() + 15 * 60 * 1000,
      students: Object.fromEntries(suggestions.rows.map(row => [row.studentId, policy.studentMatchingFingerprint(byId.get(row.studentId))])),
      companies: Object.fromEntries(eligible.map(company => [company.id, policy.companyMatchingFingerprint(company)])),
    });
    return { planId: plan.id, ...suggestions, companies: occupiedCompanies.map(company => ({
      ...companyOption(company), availableSlots: Math.max(0, company.capacity - company.occupiedSlots),
    })) };
  }));

  app.post('/coordinator/company-matching/:planId/confirm', requireStaff, handle(req => {
    if (!policy.validId(req.params.planId)) fail(400, 'Invalid placement preview.');
    const planRef = plans.doc(req.params.planId);
    return db.runTransaction(async transaction => {
      const read = ref => transaction.get(ref);
      const planSnapshot = await read(planRef);
      if (!planSnapshot.exists || planSnapshot.data().coordinatorId !== req.staff.uid) fail(404, 'Placement preview not found.');
      const plan = planSnapshot.data();
      const section = await scope(read, req.staff.uid, plan.sectionId);
      if (section.department !== plan.department) fail(409, conflict);
      const assignments = policy.validateBatchSelection(plan, req.body?.assignments);
      const { startDate, endDate } = req.body || {};
      if (typeof startDate !== 'string' || typeof endDate !== 'string' || !startDate || !endDate
        || !isIsoDate(startDate) || !isIsoDate(endDate) || startDate > endDate) {
        fail(400, 'Enter a valid internship start and end date for this batch.');
      }
      const selectionKey = JSON.stringify({ assignments, startDate, endDate });
      if (plan.result) {
        if (plan.selectionKey !== selectionKey) fail(409, 'This preview was already confirmed with different assignments.');
        return plan.result;
      }
      if (plan.expiresAt <= Date.now()) fail(409, 'This preview expired. Generate a new one.');
      const companyIds = [...new Set(assignments.map(row => row.companyId))];
      const [studentDocs, companyDocs, occupied, sectionProposals] = await Promise.all([
        Promise.all(assignments.map(row => read(users.doc(row.studentId)))),
        Promise.all(companyIds.map(id => read(companies.doc(id)))),
        Promise.all(companyIds.map(id => occupancy(read, id))),
        read(proposals.where('sectionId', '==', section.id).limit(MAX_RELATED + 1)),
      ]);
      if (sectionProposals.size > MAX_RELATED) fail(409, 'Too many placement proposals to verify this batch.');
      const companyMap = new Map(companyDocs.map((doc, index) => {
        const company = record(doc);
        if (!doc.exists || policy.companyMatchingFingerprint(company) !== plan.companies[doc.id]) fail(409, conflict);
        return [doc.id, { company, occupied: occupied[index] }];
      }));
      const updates = assignments.map((row, index) => {
        const doc = studentDocs[index];
        const student = { ...record(doc), name: placementStudentName(doc.data() || {}), course: courseOf(doc.data() || {}, section) };
        const target = companyMap.get(row.companyId);
        if (!doc.exists || student.department !== section.department || student.sectionId !== section.id
          || policy.studentSkipReason(student) || policy.studentMatchingFingerprint(student) !== plan.students[doc.id]
          || !readyForBatch(target.company, student.course)) fail(409, conflict);
        if (++target.occupied > target.company.capacity) fail(409, 'An internship slot was filled. Generate a new preview.');
        const prior = sectionProposals.docs.filter(proposal => proposal.data().studentId === doc.id);
        if (prior.some(proposal => proposal.data().status === 'approved')) fail(409, conflict);
        return { student, company: target.company, prior: prior.filter(proposal => proposal.data().status === 'pending_review') };
      });
      if (updates.reduce((sum, item) => sum + item.prior.length, 0) > 100) fail(409, 'Too many pending proposals to supersede in one batch.');
      const now = new Date().toISOString();
      for (const { student, company, prior } of updates) {
        const proposal = proposals.doc();
        const contact = {
          companyId: company.id, companyName: snapshotText(company.name, 160),
          companyAddress: snapshotText(company.address, 300), companyIndustry: snapshotText(company.industry, 120),
          companyEmail: snapshotText(company.email, 254), companyPhone: snapshotText(company.phone, 60),
        };
        const placement = Object.fromEntries(['supervisorName', 'supervisorEmail', 'supervisorPhone', 'supervisorPosition', 'internshipRole']
          .map(field => [field, company.matching[field] || '']));
        Object.assign(placement, { startDate, endDate, workArrangement: '' });
        const identity = { studentId: student.id, studentName: student.name, sectionId: section.id,
          department: section.department, coordinatorId: req.staff.uid };
        const after = { ...contact, ...placement };
        const { companyName, ...profile } = after;
        transaction.update(users.doc(student.id), { ...profile, company: companyName, placementStatus: 'approved',
          placementProposalId: proposal.id, endorsementId: proposal.id });
        transaction.create(proposal, { ...identity, ...after, status: 'approved', createdAt: now, updatedAt: now,
          reviewedAt: now, reviewedBy: req.staff.uid, source: 'batch_matching' });
        transaction.create(db.collection('endorsements').doc(proposal.id), { ...identity, ...after, proposalId: proposal.id,
          status: 'awaiting_document', deliveryStatus: 'not_sent', createdAt: now });
        transaction.create(db.collection('placementHistory').doc(), { ...identity, proposalId: proposal.id,
          status: 'approved', createdAt: now, before: { companyId: '', companyName: '' }, after });
        for (const old of prior) transaction.update(old.ref, { status: 'superseded', updatedAt: now, supersededByProposalId: proposal.id });
        transaction.create(db.collection('notifications').doc(), {
          recipientId: student.id, senderId: req.staff.uid, senderRole: 'coordinator', type: 'placement',
          title: 'Company placement approved',
          message: 'Your company placement was approved. Endorsement paperwork is pending preparation.',
          read: false, createdAt: now,
        });
        writeAuditInTransaction(transaction, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'placement.reviewed',
          targetType: 'companyProposals', targetId: proposal.id,
          details: { studentId: student.id, sectionId: section.id, companyId: company.id, status: 'approved', planId: planRef.id } });
      }
      for (const [id, { company, occupied }] of companyMap) transaction.update(companies.doc(id), {
        occupiedSlots: occupied, availableSlots: company.capacity - occupied, updatedAt: now,
      });
      const result = { success: true, assignedCount: updates.length };
      transaction.update(planRef, { result, selectionKey, confirmedAt: now });
      return result;
    });
  }));
}
module.exports = { installCompanyMatching };
