const { FieldPath } = require('firebase-admin/firestore');
const { createHash } = require('node:crypto');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

async function supportRecipient(tx, db, student) {
  if (student?.role !== 'student' || !validId(student.sectionId)) return null;
  const section = (await tx.get(db.collection('sections').doc(student.sectionId))).data();
  if (!validId(section?.coordinatorId) || section.department !== student.department) return null;
  const coordinator = (await tx.get(db.collection('users').doc(section.coordinatorId))).data();
  if (coordinator?.role !== 'coordinator' || coordinator.department !== student.department || coordinator.accountApproved !== true || coordinator.passwordChangeRequired === true || coordinator.disabled === true
    || ['disabled', 'inactive', 'suspended'].includes(coordinator.status)) return null;
  return { id: section.coordinatorId, name: [coordinator.firstName, coordinator.lastName].filter(Boolean).join(' ') || coordinator.name || 'OJT Coordinator' };
}

function writeSupportNotice(tx, db, { id, reportId, recipientId, priority, time }) {
  if (!recipientId) return;
  // Deterministic opaque IDs preserve delivery deduplication.
  tx.create(db.collection('workplaceSupportNotices').doc(createHash('sha256').update(id).digest('hex')), {
    type: 'workplace_support', reportId, recipientId, priority,
    title: 'Workplace support update', createdAt: time, read: false,
  });
}

// One persisted page per pass, including resolved reports; no roster/history expansion.
// Authorization always reads live assignment, independent of this eventual delivery scan.
async function reconcileSupport({ db, audit, limit = 25, queued = false }) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw Error('Invalid reconciliation bound');
  return db.runTransaction(async tx => {
    let stateRef = db.collection('workplaceSupportMaintenance').doc('reconciliation');
    if (queued) {
      const pending = await tx.get(db.collection('workplaceSupportAssignmentQueue').orderBy(FieldPath.documentId()).limit(1));
      if (pending.empty) return { scanned: 0, transferred: 0 };
      stateRef = pending.docs[0].ref;
    }
    const state = (await tx.get(stateRef)).data();
    let query = db.collection('workplaceSupportReports').orderBy(FieldPath.documentId());
    if (queued) query = query.where('studentId', '==', stateRef.id);
    if (state?.cursor) query = query.startAfter(state.cursor);
    const page = await tx.get(query.limit(limit));
    const changes = [];
    for (const snapshot of page.docs) {
      const report = snapshot.data();
      const student = (await tx.get(db.collection('users').doc(report.studentId))).data();
      const current = (await supportRecipient(tx, db, student))?.id || null;
      const previous = Object.hasOwn(report, 'assignedCoordinatorId') ? report.assignedCoordinatorId : report.recipientIdAtSubmission || null;
      if (previous !== current) changes.push({ snapshot, report, current, previous });
    }
    const now = new Date().toISOString();
    for (const { snapshot, report, current, previous } of changes) {
      const revision = (report.assignmentRevision || 0) + 1;
      tx.update(snapshot.ref, { assignedCoordinatorId: current, assignmentRevision: revision });
      writeSupportNotice(tx, db, { id: `${snapshot.id}_transfer_${revision}`, reportId: snapshot.id, recipientId: current, priority: report.priority, time: now });
      audit(tx, { actorId: 'system', actorRole: 'system', action: 'workplace_support.transferred', targetType: 'workplaceSupportReports', targetId: snapshot.id,
        details: { previousCoordinatorId: previous, coordinatorId: current, assignmentRevision: revision } });
    }
    if (queued && page.size < limit) tx.delete(stateRef);
    else tx.set(stateRef, { cursor: page.size === limit ? page.docs.at(-1).id : null, checkedAt: now });
    return { scanned: page.size, transferred: changes.length };
  });
}

function markSupportAssignment(tx, db, studentId) {
  // A durable marker commits with assignment; the periodic full scan also catches console/Admin SDK bypasses.
  tx.set(db.collection('workplaceSupportAssignmentQueue').doc(studentId), { cursor: null, changedAt: new Date().toISOString() });
}

function installSupportNotices({ app, db, requireUser, requireStaff, guard, profile, readyStudent, authorized, reports, cursors }) {
  const notices = db.collection('workplaceSupportNotices');
  const fail = () => { throw Object.assign(Error('Notice unavailable.'), { status: 403 }); };
  async function actor(tx, req, staff) {
    const data = await profile(tx, req.user.uid, req.user.data);
    if (data?.role !== (staff ? 'coordinator' : 'student')) fail();
    if (!staff) readyStudent(data, req.user.data);
    return { uid: req.user.uid, data };
  }
  async function visible(tx, current, notice, staff) {
    if (notice.recipientId !== current.uid) return false;
    const report = (await tx.get(reports.doc(notice.reportId))).data();
    return !!report && await authorized(tx, current, report, staff);
  }
  const project = snapshot => {
    const n = snapshot.data();
    return { id: snapshot.id, type: n.type, reportId: n.reportId, priority: n.priority, title: n.title, createdAt: n.createdAt, read: n.read };
  };
  for (const staff of [false, true]) {
    const prefix = `/${staff ? 'coordinator' : 'student'}/workplace-support-notices`;
    const auth = staff ? requireStaff : requireUser;
    app.get(prefix, auth, guard(staff, 'notices', async (req, res) => {
      const scope = [req.user.uid, staff, 'notices'];
      const position = cursors.decode(scope, req.query.cursor);
      const result = await db.runTransaction(async tx => {
        const current = await actor(tx, req, staff);
        let query = notices.where('recipientId', '==', current.uid).orderBy(FieldPath.documentId());
        if (position) query = query.startAfter(position);
        const page = await tx.get(query.limit(26));
        const records = [];
        for (const n of page.docs.slice(0, 25)) if (await visible(tx, current, n.data(), staff)) records.push(project(n));
        return { records, hasMore: page.size > 25, cursor: page.size > 25 ? cursors.encode(scope, page.docs[24].id) : null };
      });
      res.json(result);
    }));
    app.post(`${prefix}/:id/read`, auth, guard(staff, 'notice-read', async (req, res) => {
      if (!validId(req.params.id)) fail();
      if (Object.keys(req.body || {}).length) throw Object.assign(Error('Unsupported notice fields.'), { status: 400 });
      await db.runTransaction(async tx => {
        const current = await actor(tx, req, staff);
        const ref = notices.doc(req.params.id); const notice = (await tx.get(ref)).data();
        if (!notice || !await visible(tx, current, notice, staff)) fail();
        tx.update(ref, { read: true });
      });
      res.json({ success: true });
    }));
  }
}
module.exports = { supportRecipient, writeSupportNotice, reconcileSupport, markSupportAssignment, installSupportNotices };
