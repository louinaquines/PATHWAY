const crypto = require('node:crypto');
const { validId, digest, problem } = require('./workplaceJournalConsent');
const { localConcernEnabled, activeCoordinator, concernAssignment, noticePlan } = require('./workplaceConcernCases');
const CLOSED = new Set(['resolved','dismissed_false_positive']), DAYS_90 = 90 * 86400000;
const denied = () => problem(403, 'Concern unavailable.');
const object = v => v && typeof v === 'object' && !Array.isArray(v);
const noteValid = value => typeof value === 'string' && !!value.trim() && value.length <= 1000;
function expired(item, now) {
  if (item.evidencePurged) return true;
  if (!CLOSED.has(item.state)) return false;
  const closed = Date.parse(item.closedAt), due = Date.parse(item.evidenceDeleteAt);
  return !Number.isFinite(closed) || !Number.isFinite(due) || now.getTime() >= Math.min(due, closed + DAYS_90);
}
function summary(id, item) {
  return { id, studentId: item.studentId, state: item.state, version: item.version, priority: item.priority,
    deliveryState: item.deliveryState, title: 'Potential workplace concern—needs review', createdAt: item.createdAt };
}
function detail(id, item, now) {
  const base = { ...summary(id, item), reviewed: item.reviewed === true, contacted: item.contacted === true, acted: item.acted === true,
    closedAt: item.closedAt, evidenceDeleteAt: item.evidenceDeleteAt, evidenceExpired: expired(item, now) };
  return base.evidenceExpired ? base : { ...base, findings: item.findings, history: item.history };
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
  async function access(tx, id, uid) {
    if (!validId(id)) throw denied();
    const snap = await tx.get(cases.doc(id));
    if (!snap.exists || (await concernAssignment(db, tx, snap.data().studentId)).recipientId !== uid) throw denied();
    return snap;
  }
  async function noticeAccess(tx, id, uid) {
    if (!validId(id)) throw denied();
    const snap = await tx.get(notices.doc(id));
    if (!snap.exists || snap.data().recipientId !== uid) throw denied();
    await access(tx, snap.data().caseId, uid); return snap;
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
        const result = await db.runTransaction(async tx => {
          await actor(tx,req.staff);
          if (listing) {
            let query = (kind === 'list' ? cases : notices).orderBy('__name__').limit(21);
            if (after) query = query.startAfter(after);
            const page = await tx.get(query), ids = [];
            for (const doc of page.docs.slice(0,20)) {
              try { kind === 'list' ? await access(tx,doc.id,uid) : await noticeAccess(tx,doc.id,uid); ids.push(doc.id); }
              catch (error) { if (error.status !== 403) throw error; }
            }
            return { ids, hasMore: page.size > 20, cursor: page.size > 20 ? encode(uid,kind,page.docs[19].id) : null };
          }
          if (kind === 'read') {
            const snap = await noticeAccess(tx,req.params.id,uid);
            if (!snap.data().read) { tx.update(snap.ref,{ read: true }); event(tx,uid,'notice_read',snap.data().caseId); }
            return { id: snap.id };
          }
          const snap = await access(tx,req.params.id,uid), item = snap.data();
          if (kind === 'detail') return { id: snap.id };
          const b = actionBody, receipt = db.collection('workplaceConcernReceipts').doc(digest([uid,snap.id,b.requestId]));
          const saved = await tx.get(receipt), hash = digest(b);
          if (saved.exists) {
            if (saved.data().hash !== hash) throw problem(409,'Request identity already used.');
            return saved.data().result;
          }
          if (item.version !== b.expectedVersion || item.state !== 'open' || expired(item,now()) || !Array.isArray(item.history) || item.history.length >= 100) throw problem(409,'Case changed or closed. Refresh before acting.');
          if ((['contact','act','resolve'].includes(b.action) && !item.reviewed)
            || (['act','resolve'].includes(b.action) && !item.contacted) || (b.action === 'resolve' && !item.acted)) throw problem(409,'Complete review, successful contact and action before resolution.');
          const at = now().toISOString(), next = { ...item, version: item.version + 1 };
          if (b.action === 'review') next.reviewed = true;
          if (b.action === 'contact' && b.outcome === 'success') next.contacted = true;
          if (b.action === 'act') next.acted = true;
          if (b.action === 'change_priority') next.priority = b.priority;
          if (['resolve','dismiss_false_positive'].includes(b.action)) {
            next.state = b.action === 'resolve' ? 'resolved' : 'dismissed_false_positive'; next.closedAt = at;
            next.evidenceDeleteAt = new Date(Date.parse(at) + DAYS_90).toISOString();
          }
          next.history = [...item.history,{ action: b.action, actorId: uid, at, ...(b.note ? { note: b.note } : {}), ...(b.outcome ? { outcome: b.outcome } : {}), ...(b.priority ? { priority: b.priority } : {}) }];
          const notice = b.action === 'change_priority' ? await noticePlan(db,tx,snap.id,next.priority,{ recipientId: uid },now()) : null;
          tx.set(snap.ref,next);
          if (notice) tx.create(notice.ref,notice.data);
          const response = { id: snap.id, version: next.version, state: next.state };
          tx.create(receipt,{ hash, result: response }); event(tx,uid,b.action,snap.id); return response;
        });
        // Project only after a second fresh authorization, with the current expiry clock.
        const response = await db.runTransaction(async tx => {
          await actor(tx,req.staff);
          if (listing) {
            const records = [];
            for (const id of result.ids) {
              try {
                const snap = kind === 'list' ? await access(tx,id,uid) : await noticeAccess(tx,id,uid);
                const v = snap.data(); records.push(kind === 'list' ? summary(id,v) : { id, caseId: v.caseId, title: v.title, priority: v.priority, read: v.read === true, createdAt: v.createdAt });
              } catch (error) { if (error.status !== 403) throw error; }
            }
            return { records, hasMore: result.hasMore, cursor: result.cursor };
          }
          if (kind === 'read') { await noticeAccess(tx,result.id,uid); return { id: result.id, read: true }; }
          const snap = await access(tx,result.id,uid);
          return kind === 'detail' ? detail(snap.id,snap.data(),now()) : result;
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
  if (!localConcernEnabled(db,true)) return { status: 'disabled', purged: 0 };
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid cleanup limit.');
  const checkpoint = db.collection('workplaceConcernWorker').doc('retention'), saved = await checkpoint.get(), cursor = saved.data()?.cursor;
  if (cursor && !validId(cursor)) throw Error('Cleanup unavailable.');
  const base = db.collection('workplaceConcernCases').orderBy('__name__');
  let page = await (cursor ? base.startAfter(cursor) : base).limit(limit).get(); if (page.empty && cursor) page = await base.limit(limit).get();
  let purged = 0;
  for (const doc of page.docs) {
    const changed = await db.runTransaction(async tx => {
      const snap = await tx.get(doc.ref), item = snap.data(), time = clock();
      if (!(time instanceof Date) || !Number.isFinite(time.getTime())) throw Error('Clock unavailable.');
      const remove = item && CLOSED.has(item.state) && !item.evidencePurged && expired(item,time);
      if (remove) {
        const safe = Object.fromEntries(['studentId','entryId','sourceRevision','origin','ruleVersion','state','version','priority','sectionId','recipientId','deliveryState','createdAt','closedAt','evidenceDeleteAt'].filter(k => item[k] !== undefined).map(k => [k,item[k]]));
        tx.set(doc.ref,{ ...safe, evidencePurged: true, purgedAt: time.toISOString() });
      }
      tx.set(checkpoint,{ cursor: doc.id }); return remove;
    });
    if (changed) purged++;
  }
  return { status: 'complete', purged };
}
module.exports = { installWorkplaceConcernReview, purgeExpiredConcernEvidence };
