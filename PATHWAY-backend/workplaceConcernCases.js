const { digest, validId } = require('./workplaceJournalConsent');
const { validateConcernDecision } = require('./workplaceConcernDetector');
function localConcernEnabled(db, enabled) {
  return enabled === true && /^demo-[a-z0-9-]+$/.test(db?.projectId || '') && process.env.NODE_ENV !== 'production'
    && !process.env.K_SERVICE && /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
}
const activeCoordinator = user => user?.role === 'coordinator' && user.accountApproved === true && user.disabled !== true
  && user.passwordChangeRequired !== true && !['disabled','inactive','suspended'].includes(user.status);
async function concernAssignment(db, tx, studentId) {
  if (!validId(studentId)) return { sectionId: null, recipientId: null };
  const snap = await tx.get(db.collection('users').doc(studentId)), student = snap.data();
  if (student?.role !== 'student' || !validId(student.sectionId) || !student.department) return { sectionId: null, recipientId: null };
  const section = (await tx.get(db.collection('sections').doc(student.sectionId))).data();
  const result = { sectionId: student.sectionId, recipientId: null };
  if (!section || section.department !== student.department || !validId(section.coordinatorId)) return result;
  const coordinator = (await tx.get(db.collection('users').doc(section.coordinatorId))).data();
  if (activeCoordinator(coordinator) && coordinator.department === section.department) result.recipientId = section.coordinatorId;
  return result;
}
async function noticePlan(db, tx, caseId, priority, assignment, now) {
  if (!assignment.recipientId) return null;
  const ref = db.collection('workplaceConcernNotices').doc(digest([caseId, assignment.recipientId, priority]));
  if ((await tx.get(ref)).exists) return null;
  return { ref, data: { caseId, recipientId: assignment.recipientId, priority, title: 'Potential workplace concern—needs review', createdAt: now.toISOString(), read: false } };
}
async function planConcernOutcome({ db, tx, jobId, job, decision, now }) {
  if (!localConcernEnabled(db, true) || !validId(jobId) || !(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Concern outcome unavailable.');
  const source = await tx.get(db.collection('users').doc(job.studentId).collection('logbook').doc(job.entryId));
  const canonical = validateConcernDecision(source.data()?.rawNotes, decision);
  if (!canonical.findings.length) return null;
  const ref = db.collection('workplaceConcernCases').doc(digest([job.studentId, job.entryId, job.sourceRevision]));
  if ((await tx.get(ref)).exists) return null;
  const assignment = await concernAssignment(db, tx, job.studentId);
  const priority = canonical.findings.some(f => f.priority === 'high') ? 'high' : 'normal';
  const notice = await noticePlan(db, tx, ref.id, priority, assignment, now);
  return { ref, data: { studentId: job.studentId, entryId: job.entryId, sourceRevision: job.sourceRevision, sourceHash: job.sourceHash,
    origin: 'journal_ai', ruleVersion: canonical.version, findings: canonical.findings, history: [], state: 'open', version: 1,
    priority, reviewed: false, contacted: false, acted: false, ...assignment,
    deliveryState: assignment.recipientId ? 'delivered' : 'awaiting_assignment', createdAt: now.toISOString(),
    closedAt: null, evidenceDeleteAt: null, evidencePurged: false }, notice };
}
function applyConcernOutcome(tx, plan) {
  if (!plan) return;
  tx.create(plan.ref, plan.data); if (plan.notice) tx.create(plan.notice.ref, plan.notice.data);
}
async function routePendingConcernCases({ db, enabled, clock = () => new Date(), limit = 20 }) {
  if (!localConcernEnabled(db, enabled)) return { status: 'disabled', routed: 0 };
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid routing limit.');
  const checkpoint = db.collection('workplaceConcernWorker').doc('routing'), base = db.collection('workplaceConcernCases').orderBy('__name__');
  const saved = await checkpoint.get(), cursor = saved.data()?.cursor;
  if (cursor && !validId(cursor)) throw Error('Routing unavailable.');
  let page = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
  if (page.empty && cursor) page = await base.limit(limit).get();
  let routed = 0;
  for (const doc of page.docs) {
    const changed = await db.runTransaction(async tx => {
      const snap = await tx.get(doc.ref), item = snap.data();
      if (!item || item.state !== 'open' || item.evidencePurged) { tx.set(checkpoint, { cursor: doc.id }); return false; }
      const assignment = await concernAssignment(db, tx, item.studentId), now = clock();
      const notice = await noticePlan(db, tx, doc.id, item.priority, assignment, now);
      if (assignment.recipientId !== item.recipientId || assignment.sectionId !== item.sectionId) {
        tx.update(doc.ref, { ...assignment, deliveryState: assignment.recipientId ? 'delivered' : 'awaiting_assignment', version: item.version + 1 });
      }
      if (notice) tx.create(notice.ref, notice.data);
      tx.set(checkpoint, { cursor: doc.id }); return !!notice;
    });
    if (changed) routed++;
  }
  return { status: 'complete', routed };
}
module.exports = { localConcernEnabled, activeCoordinator, concernAssignment, planConcernOutcome, applyConcernOutcome, routePendingConcernCases, noticePlan };
