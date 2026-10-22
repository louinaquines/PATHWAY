const crypto = require('node:crypto');
const { validId, digest, problem } = require('./workplaceJournalConsent');
const { localConcernEnabled, activeCoordinator, concernAssignment, noticePlan } = require('./workplaceConcernCases');
const { retentionDates, retentionStage, minimalConcernAudit, retentionTransaction } = require('./workplaceConcernRetention');
const denied = () => problem(403, 'Concern unavailable.');
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const noteValid = value => typeof value === 'string' && !!value.trim() && value.length <= 1000;
function expired(item, now) {
  return !['open','evidence'].includes(retentionStage(item, now));
}
function visible(item, time) {
  const stage = retentionStage(item, time);
  if (['expired','invalid'].includes(stage)) throw Object.assign(denied(), { retentionDenied: true });
  return stage;
}
function summary(id, item, now) {
  if (visible(item, now) === 'audit') item = minimalConcernAudit(item);
  return { id, studentId: item.studentId, state: item.state, version: item.version, priority: item.priority,
    deliveryState: item.deliveryState, title: 'Potential workplace concern—needs review', createdAt: item.createdAt };
}
function detail(id, item, now) {
  const base = { ...summary(id, item, now), reviewed: item.reviewed === true, contacted: item.contacted === true, acted: item.acted === true,
    closedAt: item.closedAt, evidenceDeleteAt: item.evidenceDeleteAt, evidenceExpired: expired(item, now) };
  return base.evidenceExpired ? { ...base, history: minimalConcernAudit(item).history } : { ...base, findings: item.findings, history: item.history };
}
function installWorkplaceConcernReview({ app, db, requireStaff, allowRate, audit, clock = () => new Date(), enabled } = {}) {
  if (!localConcernEnabled(db, enabled)) return;
  const cases = db.collection('workplaceConcernCases'), notices = db.collection('workplaceConcernNotices');
  const cursorKey = crypto.randomBytes(32), root = '/coordinator/workplace-concerns';
  const now = () => { const v = clock(); if (!(v instanceof Date) || !Number.isFinite(v.getTime())) throw Error('Clock unavailable'); return v; };
  function encode(uid, scope, after) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', cursorKey, iv);
    const bytes = Buffer.concat([cipher.update(JSON.stringify({ uid, scope, after, expires: now().getTime() + 3600000 })), cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),bytes]).toString('base64url');
  }
  function decode(value, uid, scope) {
    if (value === undefined) return null;
    try {
      if (typeof value !== 'string' || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
      const data = Buffer.from(value, 'base64url'), cipher = crypto.createDecipheriv('aes-256-gcm', cursorKey, data.subarray(0,12));
      cipher.setAuthTag(data.subarray(12,28));
      const parsed = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString());
      if (parsed.uid !== uid || parsed.scope !== scope || !validId(parsed.after) || parsed.expires <= now().getTime()) throw Error();
      return parsed.after;
    } catch { throw problem(400, 'Invalid cursor. Refresh the list.'); }
  }
  async function actor(tx, staff) {
    if (!validId(staff?.uid) || staff.role !== 'coordinator') throw denied();
    const user = (await tx.get(db.collection('users').doc(staff.uid))).data();
    if (!activeCoordinator(user) || !user.department || (user.passwordEpoch || '') !== (staff.data?.passwordEpoch || '')) throw denied();
  }
  async function access(tx, id, uid, time) {
    if (!validId(id)) throw denied();
    const snap = await tx.get(cases.doc(id));
    if (!snap.exists) throw denied();
    visible(snap.data(), time());
    if ((await concernAssignment(db, tx, snap.data().studentId)).recipientId !== uid) throw denied();
    visible(snap.data(), time());
    return snap;
  }
  async function noticeAccess(tx, id, uid, time) {
    if (!validId(id)) throw denied();
    const snap = await tx.get(notices.doc(id));
    if (!snap.exists || snap.data().recipientId !== uid) throw denied();
    const concern = await access(tx, snap.data().caseId, uid, time); return { notice: snap, concern };
  }
  const event = (tx, uid, action, id) => audit(tx, { actorId: uid, actorRole: 'coordinator', action: `workplace.concern_${action}`,
    targetType: 'workplaceConcernCases', targetId: id });
  function route(suffix, kind) {
    app.post(`${root}${suffix}`, requireStaff, async (req, res) => {
      res.set('Cache-Control','private, no-store');
      try {
        if (!localConcernEnabled(db, enabled)) throw problem(503, 'Concern unavailable.');
        if (!allowRate(req,res,{ limit: 60, windowMs: 60000, key: r => `concern:${r.staff.uid}` })) return;
        const body = req.body, uid = req.staff?.uid;
        if (!object(body) || Object.keys(req.query).length) throw problem(400,'Invalid request.');
        const listing = ['list','notices'].includes(kind);
        if (listing ? Object.keys(body).some(k => k !== 'cursor') : kind !== 'action' && Object.keys(body).length) throw problem(400,'Invalid request.');
        const after = listing ? decode(body.cursor,uid,kind) : null;
        let actionBody;
        if (kind === 'action') {
          const fields = { review: [], contact: ['note','outcome'], act: ['note'], resolve: ['note'], dismiss_false_positive: ['note'], change_priority: ['note','priority'] };
          const keys = fields[body.action];
          if (!keys || Object.keys(body).length !== keys.length + 3 || Object.keys(body).some(k => !['action','expectedVersion','requestId',...keys].includes(k))
            || !validId(body.requestId) || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1 || body.expectedVersion >= Number.MAX_SAFE_INTEGER
            || (keys.includes('note') && !noteValid(body.note)) || (body.action === 'contact' && !['success','failed'].includes(body.outcome))
            || (body.action === 'change_priority' && !['normal','high'].includes(body.priority))) throw problem(400,'Invalid review action.');
          actionBody = body;
        }
        const result = await retentionTransaction(db, clock, async (tx, time) => {
          await actor(tx,req.staff);
          if (listing) {
            let query = (kind === 'list' ? cases : notices).orderBy('__name__').limit(21);
            if (after) query = query.startAfter(after);
            const page = await tx.get(query), ids = [];
            for (const doc of page.docs.slice(0,20)) {
              try { kind === 'list' ? await access(tx,doc.id,uid,time) : await noticeAccess(tx,doc.id,uid,time); ids.push(doc.id); }
              catch (error) { if (error.status !== 403) throw error; }
            }
            return { ids, hasMore: page.size > 20, cursor: page.size > 20 ? encode(uid,kind,page.docs[19].id) : null };
          }
          if (kind === 'read') {
            const { notice: snap } = await noticeAccess(tx,req.params.id,uid,time);
            if (!snap.data().read) { tx.update(snap.ref,{ read: true }); event(tx,uid,'notice_read',snap.data().caseId); }
            return { id: snap.id };
          }
          const snap = await access(tx,req.params.id,uid,time), item = snap.data();
          if (kind === 'detail') return { id: snap.id };
          const b = actionBody, receipt = db.collection('workplaceConcernReceipts').doc(digest([uid,snap.id,b.requestId]));
          const saved = await tx.get(receipt), hash = digest(b);
          if (saved.exists) {
            if (saved.data().hash !== hash) throw problem(409,'Request identity already used.');
            return saved.data().result;
          }
          if (item.version !== b.expectedVersion || item.state !== 'open' || expired(item,time()) || !Array.isArray(item.history) || item.history.length >= 100) throw problem(409,'Case changed or closed. Refresh before acting.');
          if ((['contact','act','resolve'].includes(b.action) && !item.reviewed)
            || (['act','resolve'].includes(b.action) && !item.contacted) || (b.action === 'resolve' && !item.acted)) throw problem(409,'Complete review, successful contact and action before resolution.');
          const at = time().toISOString(), next = { ...item, version: item.version + 1 };
          if (b.action === 'review') next.reviewed = true;
          if (b.action === 'contact' && b.outcome === 'success') next.contacted = true;
          if (b.action === 'act') next.acted = true;
          if (b.action === 'change_priority') next.priority = b.priority;
          if (['resolve','dismiss_false_positive'].includes(b.action)) {
            next.state = b.action === 'resolve' ? 'resolved' : 'dismissed_false_positive'; next.closedAt = at;
            Object.assign(next, retentionDates(at));
          }
          next.history = [...item.history,{ action: b.action, actorId: uid, at, ...(b.note ? { note: b.note } : {}), ...(b.outcome ? { outcome: b.outcome } : {}), ...(b.priority ? { priority: b.priority } : {}) }];
          const notice = b.action === 'change_priority' ? await noticePlan(db,tx,snap.id,next.priority,{ recipientId: uid },time()) : null;
          tx.set(snap.ref,next);
          if (notice) tx.create(notice.ref,notice.data);
          const response = { id: snap.id, version: next.version, state: next.state };
          tx.create(receipt,{ hash, result: response }); event(tx,uid,b.action,snap.id); return response;
        });
        // Project only after a second fresh authorization, with the current expiry clock.
        const response = await retentionTransaction(db, clock, async (tx, time) => {
          await actor(tx,req.staff);
          if (listing) {
            const candidates = [];
            for (const id of result.ids) {
              try {
                if (kind === 'list') {
                  const snap = await access(tx,id,uid,time); candidates.push({ id, item: snap.data() });
                } else {
                  const { notice, concern } = await noticeAccess(tx,id,uid,time); visible(concern.data(),time());
                  candidates.push({ id, item: notice.data(), concern: concern.data() });
                }
              } catch (error) { if (error.status !== 403) throw error; }
            }
            // Later row reads can cross expiry: project the entire page at one final observed time.
            const at = time(), records = candidates.flatMap(({ id, item, concern }) => {
              try {
                if (kind === 'list') return [summary(id,item,at)];
                visible(concern,at);
                return [{ id, caseId: item.caseId, title: item.title, priority: item.priority, read: item.read === true, createdAt: item.createdAt }];
              } catch (error) { if (error.status !== 403) throw error; return []; }
            });
            return { records, hasMore: result.hasMore, cursor: result.cursor };
          }
          if (kind === 'read') { const value = await noticeAccess(tx,result.id,uid,time); visible(value.concern.data(),time()); return { id: result.id, read: true }; }
          const snap = await access(tx,result.id,uid,time); visible(snap.data(),time());
          return kind === 'detail' ? detail(snap.id,snap.data(),time()) : result;
        });
        res.json(response);
      } catch (error) {
        const status = [400,403,409].includes(error.status) ? error.status : 503;
        res.status(status).json({ error: status === 400 || status === 409 ? error.message : 'Concern unavailable.' });
      }
    });
  }
  route('/list','list'); route('/notices/list','notices'); route('/notices/:id/read','read'); route('/:id/detail','detail'); route('/:id/action','action');
}
async function purgeExpiredConcernEvidence({ db, clock = () => new Date(), limit = 20 }) {
  const result = await require('./workplaceConcernCleanup').runConcernRetentionBatch({ db, enabled: true, clock, limit, evidenceOnly: true });
  return { status: result.status, purged: result.purged };
}
module.exports = { installWorkplaceConcernReview, purgeExpiredConcernEvidence };
