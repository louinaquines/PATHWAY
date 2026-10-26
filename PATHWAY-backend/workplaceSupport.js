const { createHash } = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { createSupportCursors } = require('./workplaceSupportCursors');
const { supportRecipient, writeSupportNotice, installSupportNotices } = require('./workplaceSupportNotifications');

function installWorkplaceSupport({ app, db, requireUser, requireStaff, allowRate, audit, uploads }) {
  const reports = db.collection('workplaceSupportReports');
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const profile = async (tx, uid, authenticated) => {
    const value = (await tx.get(db.collection('users').doc(uid))).data();
    if (value?.disabled === true || ['disabled', 'inactive', 'suspended'].includes(value?.status)) fail(403, 'Account access is disabled.');
    if (authenticated && value?.role === 'coordinator' && (value.accountApproved !== true || value.passwordChangeRequired === true
      || (value.passwordEpoch || '') !== (authenticated.passwordEpoch || ''))) fail(403, 'Coordinator access is unavailable. Sign in again.');
    return value;
  };
  const readyStudent = (student, authenticated) => {
    if (student?.role !== 'student' || student.passwordChangeRequired === true
      || (student.passwordEpoch || '') !== (authenticated.passwordEpoch || '')) fail(403, 'Sign in again before accessing student records.');
  };
  const cursors = createSupportCursors();
  const cursorScope = (req, staff) => [req.user.uid, staff, 'reports'];
  function encodeCursor(req, staff, snapshot) {
    const data = snapshot.data();
    const position = staff ? [data.priority, data.createdAt, snapshot.id] : [data.createdAt, snapshot.id];
    return cursors.encode(cursorScope(req, staff), position);
  }
  const recipient = (tx, student) => supportRecipient(tx, db, student);
  async function authorized(tx, actor, report, staff) {
    if (!staff) return actor.uid === report.studentId && actor.data.role === 'student';
    const student = (await tx.get(db.collection('users').doc(report.studentId))).data();
    if (student?.role !== 'student' || student.disabled === true || ['disabled', 'inactive', 'suspended'].includes(student.status)) return false;
    if ((await recipient(tx, student))?.id !== actor.uid) return false;
    // Reuse the freshly authorized profile; never copy the whole student record.
    actor.summaries ||= new Map();
    actor.summaries.set(report.studentId, {
      studentName: [student.firstName, student.lastName].filter(v => typeof v === 'string').join(' ') || (typeof student.name === 'string' ? student.name : ''),
      companyName: typeof (student.company || student.companyName) === 'string' ? (student.company || student.companyName) : '',
      idNumber: typeof student.idNumber === 'string' ? student.idNumber : '',
    });
    return true;
  }
  const project = (snapshot, detail, staff) => {
    const r = snapshot.data();
    return { id: snapshot.id, status: r.status, priority: r.priority, version: r.version,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      ...(staff ? { studentId: r.studentId } : {}),
      ...(detail ? { description: r.description, incidentDate: r.incidentDate, immediateSafety: r.immediateSafety, attachment: r.attachment } : {}) };
  };
  const guard = (staff, operation, handler) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.user.role !== (staff ? 'coordinator' : 'student')) return res.status(403).json({ error: 'Access denied.' });
    if (!allowRate(req, res, { limit: req.method === 'POST' ? 30 : 180, windowMs: 60000, key: r => `workplace-support:${r.method}:${r.user.uid}` })) return;
    try { await handler(req, res); }
    catch (error) {
      if (!error.status) console.error('Workplace support request failed', {
        operation: `${staff ? 'coordinator' : 'student'}.${operation}`,
        code: [4, 8, 14].includes(error.code) ? `firestore_${error.code}` : 'internal',
      });
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not process workplace support. Please try again.',
        ...(error.reason === 'attachment_uncommitted' ? { reason: error.reason } : {}) });
    }
  };

  const attachments = require('./workplaceSupportAttachments').installSupportAttachments({
    app, db, requireUser, requireStaff, uploads, guard, profile, readyStudent, authorized, validId, reports,
  });
  installSupportNotices({ app, db, requireUser, requireStaff, guard, profile, readyStudent, authorized, reports, cursors });
  require('./workplaceSupportWorkflow').installSupportWorkflow({ app, db, requireStaff, guard, profile, authorized, reports, validId, audit, cursors });

  app.get('/student/workplace-support/context', requireUser, guard(false, 'context', async (req, res) => {
    const coordinator = await db.runTransaction(async tx => {
      const student = await profile(tx, req.user.uid, req.user.data); readyStudent(student, req.user.data);
      return recipient(tx, student);
    });
    res.json({ available: !!coordinator, coordinator: coordinator ? { name: coordinator.name } : null });
  }));
  app.post('/student/workplace-support', requireUser, guard(false, 'create', async (req, res) => {
    const body = req.body || {};
    if (!validId(body.requestId)) fail(400, 'Invalid requestId.');
    if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 8000) fail(400, 'Description must contain 1–8,000 trimmed characters.');
    if (typeof body.immediateSafety !== 'boolean') fail(400, 'Invalid immediateSafety.');
    if (Object.hasOwn(body, 'attachmentIntentId') && !validId(body.attachmentIntentId)) fail(400, 'Invalid attachment intent.');
    if (Object.keys(body).some(key => !['requestId', 'description', 'incidentDate', 'immediateSafety', 'attachmentIntentId'].includes(key))) fail(400, 'Unsupported report fields.');
    const incidentDate = body.incidentDate ?? null;
    if (incidentDate !== null) {
      const date = typeof incidentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(incidentDate) ? new Date(`${incidentDate}T00:00:00Z`) : null;
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== incidentDate || incidentDate > today) fail(400, 'Invalid incident date.');
    }
    const content = { description: body.description.trim(), incidentDate, immediateSafety: body.immediateSafety, attachment: null };
    const fingerprint = createHash('sha256').update(JSON.stringify(body.attachmentIntentId ? { ...content, attachmentIntentId: body.attachmentIntentId } : content)).digest('hex');
    const id = createHash('sha256').update(JSON.stringify([req.user.uid, body.requestId])).digest('hex');
    if (body.attachmentIntentId) await attachments.prepare(req, body.attachmentIntentId, id, fingerprint);
    const result = await db.runTransaction(async tx => {
      const student = await profile(tx, req.user.uid, req.user.data); readyStudent(student, req.user.data);
      const coordinator = await recipient(tx, student);
      const existing = await tx.get(reports.doc(id));
      if (existing.exists) {
        if (existing.data().fingerprint !== fingerprint) fail(409, 'requestId already used for a different report.');
        return { created: false, status: existing.data().status };
      }
      if (!coordinator) fail(409, 'Your coordinator is unavailable. Keep your draft and try again later.');
      const attachment = body.attachmentIntentId ? await attachments.claim(tx, req, body.attachmentIntentId, id) : null;
      const now = new Date().toISOString();
      tx.create(reports.doc(id), { ...content, attachment, studentId: req.user.uid, department: student.department,
        sectionIdAtSubmission: student.sectionId, recipientIdAtSubmission: coordinator.id, fingerprint,
        assignedCoordinatorId: coordinator.id, assignmentRevision: 0,
        priority: content.immediateSafety ? 'high' : 'normal', status: 'Submitted', version: 1, createdAt: now, updatedAt: now });
      writeSupportNotice(tx, db, { id: `${id}_submission`, reportId: id, recipientId: coordinator.id, priority: content.immediateSafety ? 'high' : 'normal', time: now });
      audit(tx, { actorId: req.user.uid, actorRole: 'student', action: 'workplace_support.submitted', targetType: 'workplaceSupportReports', targetId: id, details: {} });
      return { created: true, status: 'Submitted' };
    });
    res.status(result.created ? 201 : 200).json({ id, status: result.status });
  }));

  for (const staff of [false, true]) {
    const prefix = `/${staff ? 'coordinator' : 'student'}/workplace-support`;
    const auth = staff ? requireStaff : requireUser;
    app.get(prefix, auth, guard(staff, 'list', async (req, res) => {
      const size = req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isSafeInteger(size) || size < 1 || size > 100) fail(400, 'Invalid pagination.');
      const position = cursors.decode(cursorScope(req, staff), req.query.cursor);
      const result = await db.runTransaction(async tx => {
        const fresh = await profile(tx, req.user.uid, req.user.data);
        if (fresh?.role !== (staff ? 'coordinator' : 'student')) fail(403, 'Access denied.');
        if (!staff) readyStudent(fresh, req.user.data);
        const actor = { uid: req.user.uid, data: fresh };
        // Global staff candidates preserve cross-department transfers without roster scans.
        let query = staff ? reports.orderBy('priority', 'asc') : reports.where('studentId', '==', req.user.uid);
        query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'asc');
        if (position) query = query.startAfter(...position);
        const budget = staff ? Math.max(25, size) : size;
        const candidates = await tx.get(query.limit(budget + 1));
        const visible = [];
        let last = null;
        for (const snapshot of candidates.docs.slice(0, budget)) {
          last = snapshot;
          if (!staff || await authorized(tx, actor, snapshot.data(), true)) visible.push(snapshot);
          if (visible.length === size) break;
        }
        // Empty pages can continue: hasMore describes unscanned candidates, not authorized matches.
        const hasMore = !!last && last.id !== candidates.docs.at(-1).id;
        return { records: visible.map(item => ({ ...project(item, false, staff), ...(staff ? actor.summaries.get(item.data().studentId) : {}) })), cursor: hasMore ? encodeCursor(req, staff, last) : null, hasMore };
      });
      res.json(result);
    }));
    app.get(`${prefix}/:id`, auth, guard(staff, 'detail', async (req, res) => {
      if (!validId(req.params.id)) fail(400, 'Invalid report.');
      const result = await db.runTransaction(async tx => {
        const fresh = await profile(tx, req.user.uid, req.user.data);
        if (fresh?.role !== (staff ? 'coordinator' : 'student')) fail(403, 'Access denied.');
        if (!staff) readyStudent(fresh, req.user.data);
        const snapshot = await tx.get(reports.doc(req.params.id));
        const actor = { uid: req.user.uid, data: fresh };
        if (!snapshot.exists || !await authorized(tx, actor, snapshot.data(), staff)) fail(403, 'Report unavailable.');
        return { ...project(snapshot, true, staff), ...(staff ? actor.summaries.get(snapshot.data().studentId) : {}) };
      });
      res.json(result);
    }));
  }
}
module.exports = { installWorkplaceSupport };
