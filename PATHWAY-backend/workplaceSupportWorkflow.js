const { createHash } = require('node:crypto');
const { writeSupportNotice } = require('./workplaceSupportNotifications');
const ACTIONS = ['acknowledge', 'contact', 'record_action', 'resolve'];
function installSupportWorkflow({ app, db, requireStaff, guard, profile, authorized, reports, validId, audit, cursors }) {
  const fail = (status, message) => { throw Object.assign(Error(message), { status }); };
  async function load(tx, req) {
    if (!validId(req.params.id)) fail(400, 'Invalid report.');
    const data = await profile(tx, req.user.uid, req.user.data);
    if (data?.role !== 'coordinator') fail(403, 'Access denied.');
    const ref = reports.doc(req.params.id); const snapshot = await tx.get(ref);
    if (!snapshot.exists || !await authorized(tx, { uid: req.user.uid, data }, snapshot.data(), true)) fail(403, 'Report unavailable.');
    return { ref, report: snapshot.data() };
  }
  app.get('/coordinator/workplace-support/:id/events', requireStaff, guard(true, 'events-list', async (req, res) => {
    const scope = [req.user.uid, true, 'events', req.params.id];
    const position = cursors.decode(scope, req.query.cursor);
    const result = await db.runTransaction(async tx => {
      const { ref } = await load(tx, req);
      let query = ref.collection('events').orderBy('version', 'asc');
      if (position !== null) query = query.startAfter(position);
      const page = await tx.get(query.limit(26));
      return { records: page.docs.slice(0, 25).map(d => {
        const e = d.data(); return { action: e.action, version: e.version, actorId: e.actorId, createdAt: e.createdAt, note: e.note, contactOutcome: e.contactOutcome, reason: e.reason };
      }), hasMore: page.size > 25, cursor: page.size > 25 ? cursors.encode(scope, page.docs[24].data().version) : null };
    });
    res.json(result);
  }));
  app.post('/coordinator/workplace-support/:id/events', requireStaff, guard(true, 'event', async (req, res) => {
    const b = req.body || {};
    if (!validId(b.requestId) || !Number.isSafeInteger(b.expectedVersion) || b.expectedVersion < 1 || !ACTIONS.includes(b.action)
      || Object.keys(b).some(k => !['requestId', 'expectedVersion', 'action', 'note', 'contactOutcome', 'reason'].includes(k))) fail(400, 'Invalid workflow event.');
    for (const field of ['note', 'reason']) if (b[field] !== undefined && (typeof b[field] !== 'string' || !b[field].trim() || b[field].trim().length > 8000)) fail(400, 'Invalid private text.');
    if (b.action === 'contact' ? !['successful', 'unreachable'].includes(b.contactOutcome) : b.contactOutcome !== undefined) fail(400, 'Invalid contact outcome.');
    if (b.action === 'resolve' ? !b.reason?.trim() : b.reason !== undefined) fail(400, 'Resolution requires a reason.');
    const content = { action: b.action, expectedVersion: b.expectedVersion, note: b.note?.trim() || null, contactOutcome: b.contactOutcome || null, reason: b.reason?.trim() || null };
    const fingerprint = createHash('sha256').update(JSON.stringify(content)).digest('hex');
    const result = await db.runTransaction(async tx => {
      const { ref, report } = await load(tx, req);
      const eventId = createHash('sha256').update(JSON.stringify([req.user.uid, b.requestId])).digest('hex');
      const eventRef = ref.collection('events').doc(eventId); const existing = (await tx.get(eventRef)).data();
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail(409, 'requestId already used for a different event.');
        return existing.result;
      }
      if (report.version !== b.expectedVersion) fail(409, 'Report changed. Refresh before retrying.');
      if (report.status === 'Resolved') fail(409, 'Report is already resolved.');
      const stateRef = ref.collection('private').doc('workflow'); const state = (await tx.get(stateRef)).data() || {};
      if (b.action === 'acknowledge' && report.status !== 'Submitted') fail(409, 'Report is already acknowledged.');
      if (b.action !== 'acknowledge' && report.status === 'Submitted') fail(409, 'Acknowledge the report first.');
      if (b.action === 'record_action' && !state.contactAttempted) fail(409, 'Record contact first.');
      if (b.action === 'resolve' && (!state.successfulContact || !state.actionRecorded)) fail(409, 'Successful contact and recorded action are required.');
      const status = b.action === 'acknowledge' ? 'Under review' : b.action === 'resolve' ? 'Resolved' : 'Following up';
      const now = new Date().toISOString();
      const result = { id: ref.id, status, version: report.version + 1 };
      tx.update(ref, { status, version: result.version, updatedAt: now });
      tx.create(eventRef, { ...content, fingerprint, actorId: req.user.uid, version: result.version, createdAt: now, result });
      tx.set(stateRef, { ...state,
        ...(b.action === 'contact' ? { contactAttempted: true, successfulContact: b.contactOutcome === 'successful' } : {}),
        ...(b.action === 'record_action' ? { actionRecorded: true } : {}),
      });
      writeSupportNotice(tx, db, { id: `${ref.id}_event_${result.version}`, reportId: ref.id, recipientId: report.studentId, priority: report.priority, time: now });
      audit(tx, { actorId: req.user.uid, actorRole: 'coordinator', action: `workplace_support.${b.action}`, targetType: 'workplaceSupportReports', targetId: ref.id, details: { version: result.version, status } });
      return result;
    });
    res.json(result);
  }));
}
module.exports = { installSupportWorkflow };
