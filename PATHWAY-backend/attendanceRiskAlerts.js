const crypto = require('node:crypto');
const { FieldPath } = require('firebase-admin/firestore');
const { attendanceAnalytics } = require('./attendanceAnalytics');
const { loadAttendanceInputs } = require('./attendanceAiReview');
const { assertAttendanceAccess } = require('./attendanceExcusedDates');
const RULE = 'attendance-risk-v1';
const REASONS = new Set(['OVERDUE', 'INVALID_SCHEDULE', 'UNCERTAIN_ATTENDANCE', 'INSUFFICIENT_ATTENDANCE',
  'INSUFFICIENT_CREDIT_HISTORY', 'INVALID_TOTALS', 'ATTENDANCE_BELOW_80', 'ATTENDANCE_BELOW_90',
  'CONSECUTIVE_ABSENCES', 'ZERO_VELOCITY', 'PROJECTION_HORIZON', 'CREDIT_PROJECTION', 'PROJECTED_SHORTFALL', 'SOURCE_UNAVAILABLE']);
const idValid = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const denied = () => Object.assign(new Error('Notice unavailable.'), { status: 403 });
const active = actor => actor?.role === 'coordinator' && actor.accountApproved === true && actor.disabled !== true
  && !['disabled', 'inactive', 'suspended'].includes(actor.status) && typeof actor.department === 'string' && actor.department.length > 0;
function latestDueContext(now) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid evaluation time.');
  // asOf is the calculator's exclusive upper date. Before 00:15 use yesterday's context.
  return new Date(date.getTime() + 8 * 3600000 - 15 * 60000).toISOString().slice(0, 10);
}
function localFirestore(db, env = process.env) {
  const project = db.projectId;
  return env.NODE_ENV !== 'production' && !env.K_SERVICE && env.PATHWAY_LOCAL_WORKFLOW === '1'
    && /^demo-[a-z0-9-]+$/.test(project || '')
    && /^(127\.0\.0\.1|localhost):\d{2,5}$/.test(env.FIRESTORE_EMULATOR_HOST || '')
    && (!env.GOOGLE_CLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT === project)
    && (!env.GCLOUD_PROJECT || env.GCLOUD_PROJECT === project);
}
function riskAlertsEnabled(db, env = process.env) {
  return env.ATTENDANCE_RISK_ALERTS_ENABLED === '1' && localFirestore(db, env);
}
function projectNotice(snapshot) {
  const n = snapshot.data();
  // Explicit response allowlist: no identity, source snapshots or private record fields.
  return { id: snapshot.id, title: 'Attendance risk update', kind: n.kind, riskTier: n.riskTier,
    progressStatus: n.progressStatus, dataStatus: n.dataStatus, reasonCodes: n.reasonCodes.filter(c => REASONS.has(c)),
    ruleVersion: n.ruleVersion, asOf: n.asOf, createdAt: n.createdAt, read: n.read === true };
}
function installAttendanceRiskAlerts({ app, db, requireStaff, allowRate, audit, clock = () => new Date() }) {
  const states = db.collection('attendanceRiskStates'), notices = db.collection('attendanceRiskNotices');
  const checkpoint = db.collection('attendanceRiskWorker').doc('daily');
  const cursorKey = crypto.randomBytes(32);
  let running = false;
  function encodeCursor(actor, after) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', cursorKey, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify({ actor, scope: 'attendance-risk-notices-v1', after, expires: new Date(clock()).getTime() + 3600000 })), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url');
  }
  function decodeCursor(value, actor) {
    if (value === undefined) return null;
    try {
      if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
      const bytes = Buffer.from(value, 'base64url'), decipher = crypto.createDecipheriv('aes-256-gcm', cursorKey, bytes.subarray(0,12));
      decipher.setAuthTag(bytes.subarray(12,28));
      const result = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
      if (result.actor !== actor || result.scope !== 'attendance-risk-notices-v1' || !idValid(result.after) || result.expires < new Date(clock()).getTime()) throw new Error();
      return result.after;
    } catch { throw Object.assign(new Error('Invalid or expired cursor; reload notices.'), { status: 400 }); }
  }
  async function actorAccess(uid, tx) {
    if (!idValid(uid)) throw denied();
    const snapshot = await tx.get(db.collection('users').doc(uid));
    if (!active(snapshot.data())) throw denied();
  }
  async function noticeAccess(snapshot, uid, tx) {
    if (!snapshot.exists) throw denied();
    const n = snapshot.data();
    if (n.recipientId !== uid || !idValid(n.studentId) || !idValid(n.sectionId)) throw denied();
    await assertAttendanceAccess(db, uid, n.sectionId, n.studentId, tx);
  }
  const path = '/coordinator/attendance-risk-notices';
  async function route(req, res, read) {
    res.set('Cache-Control', 'private, no-store');
    if (!allowRate(req, res, { limit: 60, windowMs: 60000, key: r => `risk-notices:${r.staff.uid}` })) return;
    try {
      if (read && (!idValid(req.params.id) || !req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length)) return res.status(400).json({ error: 'Expected empty object.' });
      if (Object.keys(req.query).some(k => k !== 'cursor') || (read && Object.keys(req.query).length)) return res.status(400).json({ error: 'Invalid query.' });
      const uid = req.staff.uid, after = read ? null : decodeCursor(req.query.cursor, uid);
      const result = await db.runTransaction(async tx => {
        await actorAccess(uid, tx);
        if (read) {
          const snapshot = await tx.get(notices.doc(req.params.id)); await noticeAccess(snapshot, uid, tx);
          if (!snapshot.data().read) {
            tx.update(snapshot.ref, { read: true });
            audit(tx, { actorId: uid, actorRole: 'coordinator', action: 'attendance.risk_notice_read', targetType: 'attendanceRiskNotices', targetId: snapshot.id });
          }
          return { records: [{ ...projectNotice(snapshot), read: true }], hasMore: false, cursor: null };
        }
        let query = notices.where('recipientId', '==', uid).orderBy(FieldPath.documentId()).limit(21);
        if (after) query = query.startAfter(after);
        const page = await tx.get(query), allowed = [];
        for (const snapshot of page.docs.slice(0,20)) {
          try { await noticeAccess(snapshot, uid, tx); allowed.push(snapshot); }
          catch (error) { if (error.status !== 403) throw error; }
        }
        return { records: allowed.map(projectNotice), hasMore: page.size > 20,
          cursor: page.size > 20 ? encodeCursor(uid, page.docs[19].id) : null };
      });
      // Fresh boundary after transactional I/O, including read acknowledgment/audit.
      await db.runTransaction(async tx => {
        await actorAccess(uid, tx);
        for (const record of result.records) await noticeAccess(await tx.get(notices.doc(record.id)), uid, tx);
      });
      return res.json(result);
    } catch (error) { return res.status([400,403].includes(error.status) ? error.status : 503).json({ error: error.status === 400 ? error.message : 'Notice unavailable.' }); }
  }
  app.get(path, requireStaff, (req, res) => route(req, res, false));
  app.post(`${path}/:id/read`, requireStaff, (req, res) => route(req, res, true));

  async function planStudent(tx, snapshot, asOf, evaluatedAt) {
    const student = snapshot.data(), studentId = snapshot.id;
    if (!idValid(student.sectionId)) return null;
    const sectionSnapshot = await tx.get(db.collection('sections').doc(student.sectionId));
    const section = sectionSnapshot.data();
    if (!section || student.department !== section.department) return null;
    const stateRef = states.doc(studentId), oldSnapshot = await tx.get(stateRef), previous = oldSnapshot.data() || {};
    if (previous.asOf > asOf) return null;
    let recipientId = null;
    if (idValid(section.coordinatorId)) {
      const actorSnapshot = await tx.get(db.collection('users').doc(section.coordinatorId));
      if (active(actorSnapshot.data()) && actorSnapshot.data().department === section.department) recipientId = section.coordinatorId;
    }
    let loaded, metrics;
    try {
      loaded = await loadAttendanceInputs(snapshot.ref, student, section, asOf, tx);
      metrics = attendanceAnalytics(loaded.inputs);
    } catch {
      loaded = null;
      metrics = { riskTier: null, progressStatus: 'In progress', dataStatus: 'Unavailable', reasonCodes: [{ code: 'SOURCE_UNAVAILABLE' }], ruleVersion: RULE };
    }
    const evidence = loaded ? { ...loaded.evidence } : null;
    if (evidence) delete evidence.queryReadTime; // Read time changes without any source change.
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ student, section, recipientId, evidence, metrics })).digest('hex');
    if (previous.asOf === asOf && previous.ruleVersion === RULE && previous.fingerprint === fingerprint) return null;
    const state = { studentId, sectionId: student.sectionId, asOf, ruleVersion: RULE, fingerprint, evaluatedAt,
      open: previous.open === true, episode: previous.episode || 0, sequence: previous.sequence || 0,
      lastTier: previous.lastTier || null, lastRecipientId: previous.lastRecipientId || null,
      riskTier: metrics.riskTier, progressStatus: metrics.progressStatus, dataStatus: metrics.dataStatus,
      reasonCodes: metrics.reasonCodes.map(r => r.code).filter(c => REASONS.has(c)),
      errorCode: loaded ? null : 'SOURCE_UNAVAILABLE' };
    const reliableRecovery = metrics.dataStatus === 'Ready' && (metrics.riskTier === 'Low' || metrics.progressStatus === 'Completed');
    let kind = null;
    if (state.open && reliableRecovery) { state.open = false; kind = 'recovered'; }
    else if (!state.open && metrics.progressStatus !== 'Completed' && ['Medium','High'].includes(metrics.riskTier)) {
      state.open = true; state.episode++; kind = 'opened';
    } else if (state.open && metrics.riskTier === 'High' && previous.lastTier === 'Medium') kind = 'escalated';
    if (state.open && recipientId && (previous.lastRecipientId !== recipientId || previous.sectionId !== student.sectionId) && !kind) kind = 'assigned';
    if (metrics.riskTier) state.lastTier = metrics.riskTier;
    // No recipient now: retain open episode; next valid assignment receives its current risk.
    if (!recipientId) state.lastRecipientId = null;
    let notice = null;
    if (kind && recipientId) {
      state.sequence++; state.lastRecipientId = recipientId;
      notice = { recipientId, studentId, sectionId: student.sectionId, episode: state.episode, sequence: state.sequence,
        kind, title: 'Attendance risk update', riskTier: state.riskTier, progressStatus: state.progressStatus,
        dataStatus: state.dataStatus, reasonCodes: state.reasonCodes, ruleVersion: RULE, asOf, createdAt: evaluatedAt, read: false };
    }
    return { stateRef, state, notice };
  }
  async function evaluateDueAttendanceRisk({ now = clock(), batchSize = 10 } = {}) {
    if (!localFirestore(db)) throw new Error('Attendance risk evaluation requires a pinned local demo Firestore emulator.');
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw new Error('batchSize must be 1 through 25.');
    if (running) return { processed: 0, busy: true };
    running = true;
    try {
      const asOf = latestDueContext(now), evaluatedAt = new Date(now).toISOString();
      return await db.runTransaction(async tx => {
        const checkpointSnapshot = await tx.get(checkpoint), saved = checkpointSnapshot.data() || {};
        let query = db.collection('users').where('role', '==', 'student').orderBy(FieldPath.documentId()).limit(batchSize + 1);
        if (saved.afterId) query = query.startAfter(saved.afterId);
        const page = await tx.get(query), selected = page.docs.slice(0,batchSize), plans = [];
        for (const snapshot of selected) {
          const plan = await planStudent(tx, snapshot, asOf, evaluatedAt); if (plan) plans.push(plan);
        }
        // All source and query reads precede every write; transaction retries recalculate.
        for (const plan of plans) {
          tx.set(plan.stateRef, plan.state);
          audit(tx, { actorId: 'attendance-risk-worker', actorRole: 'system', action: 'attendance.risk_evaluated', targetType: 'attendanceRiskStates', targetId: plan.stateRef.id,
            details: { asOf, ruleVersion: RULE, episode: plan.state.episode, sequence: plan.state.sequence, errorCode: plan.state.errorCode } });
          if (plan.notice) {
            const noticeId = crypto.createHash('sha256').update(`${plan.stateRef.id}:${plan.state.episode}:${plan.state.sequence}`).digest('hex');
            tx.create(notices.doc(noticeId), plan.notice);
          }
        }
        const hasMore = page.size > batchSize;
        tx.set(checkpoint, { afterId: hasMore ? selected[selected.length - 1].id : null,
          asOf: saved.asOf > asOf ? saved.asOf : asOf, updatedAt: evaluatedAt, errorCode: null });
        return { processed: selected.length, hasMore, asOf };
      });
    } catch (error) {
      // Keep the cursor unchanged: the failed bounded batch is the durable retry queue.
      await db.runTransaction(async tx => {
        await tx.get(checkpoint); tx.set(checkpoint, { errorCode: 'EVALUATION_FAILED' }, { merge: true });
      });
      return { processed: 0, retry: true, errorCode: 'EVALUATION_FAILED' };
    } finally { running = false; }
  }
  return { evaluateDueAttendanceRisk };
}
module.exports = { installAttendanceRiskAlerts, latestDueContext, riskAlertsEnabled };
