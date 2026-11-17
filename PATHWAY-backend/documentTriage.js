const { createHash, randomUUID } = require('node:crypto');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = r => [r.cloudinaryAssetId || '', r.cloudinaryPublicId || '', r.cloudinaryVersion || '', r.submittedAt || '', r.fileName || ''];
const documentVersion = r => hash(identity(r));
const validId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const problem = (status, message) => Object.assign(Error(message), { status });
function validateDocumentTriage(text, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 3
    || !['green','yellow','red'].includes(value.color) || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 400
    || typeof value.evidence !== 'string' || value.evidence.length > 300
    || (value.evidence && !text.includes(value.evidence)) || (value.color !== 'yellow' && !value.evidence.trim())) throw problem(503, 'Document triage unavailable. Manual review remains available.');
  return { color: value.color, reason: value.reason, evidence: value.evidence, advisoryOnly: true, requiresHumanReview: true };
}
function installDocumentTriage({ app, db, requireStaff, allowRate, ai, audit, clock = () => new Date() }) {
  const root = '/coordinator/students/:studentId/requirements/:requirementId/triage';
  const guard = (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') { res.status(403).json({ error: 'Coordinator access required.' }); return false; }
    if (![req.params.studentId, req.params.requirementId].every(validId)) { res.status(400).json({ error: 'Invalid document selection.' }); return false; }
    return allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `document-triage:${r.staff.uid}` });
  };
  const respond = (res, error) => res.status(error.status || 503).json({ error: error.status ? error.message : 'Document triage unavailable. Manual review remains available.' });
  async function authorized(tx, req) {
    const userRef = db.collection('users').doc(req.params.studentId);
    const student = (await tx.get(userRef)).data();
    const actor = (await tx.get(db.collection('users').doc(req.staff.uid))).data();
    if (!student || student.role !== 'student' || !validId(student.sectionId) || student.disabled === true
      || !actor || actor.role !== 'coordinator' || actor.accountApproved !== true || actor.disabled === true || ['disabled', 'inactive', 'suspended'].includes(actor.status) || actor.passwordChangeRequired === true
      || actor.department !== student.department || (actor.passwordEpoch || '') !== (req.staff.data?.passwordEpoch || '')) throw problem(403, 'Assigned document unavailable.');
    const sectionRef = db.collection('sections').doc(student.sectionId), section = (await tx.get(sectionRef)).data();
    if (!section || section.coordinatorId !== req.staff.uid || section.department !== student.department) throw problem(403, 'Assigned document unavailable.');
    const requirement = student.requirements?.[req.params.requirementId];
    if (!requirement?.fileName) throw problem(404, 'No submitted document.');
    if (student.clearanceStatus === 'cleared') throw problem(409, 'Cleared records are locked.');
    const definition = (await tx.get(sectionRef.collection('requirements').doc(req.params.requirementId))).data();
    const label = String(definition?.label || req.params.requirementId.replaceAll('_', ' ')).slice(0, 160);
    return { student, label, version: documentVersion(requirement), assetIdentity: identity(requirement), sectionId: student.sectionId };
  }
  const latestRef = req => db.collection('documentTriageResults').doc(hash([req.params.studentId, req.params.requirementId]));
  app.get(root, requireStaff, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const result = await db.runTransaction(async tx => {
        const context = await authorized(tx, req), saved = (await tx.get(latestRef(req))).data();
        return { ...context, student: undefined, result: saved?.sourceVersion === context.version ? saved.result : null };
      });
      return res.json(result);
    } catch (error) { return respond(res, error); }
  });
  app.post(root, requireStaff, async (req, res) => {
    if (!guard(req, res)) return;
    const { sourceVersion, text, consent, reviewed, requestId } = req.body || {};
    if (!/^[a-f0-9]{64}$/.test(sourceVersion || '') || !validId(requestId) || consent !== true || reviewed !== true
      || typeof text !== 'string' || !text.trim() || text.length > 6000) return res.status(400).json({ error: 'Review the source, confirm sharing and provide a current document version.' });
    const requestHash = hash([sourceVersion, text]), owner = randomUUID();
    const receipt = db.collection('documentTriageReceipts').doc(hash([req.staff.uid, req.params.studentId, req.params.requirementId, requestId]));
    let claimed = false;
    try {
      const admission = await db.runTransaction(async tx => {
        const context = await authorized(tx, req), prior = (await tx.get(receipt)).data();
        if (context.version !== sourceVersion) throw problem(409, 'The document changed. Reload its preview.');
        if (prior) {
          if (prior.requestHash !== requestHash) throw problem(409, 'Request ID already used for different text.');
          if (prior.state === 'complete') return { result: prior.result };
          throw problem(409, 'This analysis attempt is unavailable or still pending. No automatic retry was made.');
        }
        tx.create(receipt, { requestHash, owner, state: 'sending', sourceVersion, createdAt: clock().toISOString() });
        return { label: context.label };
      });
      if (admission.result) return res.json({ ...admission.result, sourceVersion, replay: true });
      claimed = true;
      const result = validateDocumentTriage(text, await ai.triageDocument(text, admission.label));
      await db.runTransaction(async tx => {
        const context = await authorized(tx, req), prior = (await tx.get(receipt)).data();
        const notice = db.collection('notifications').doc(`document-guidance-${hash([req.params.studentId, req.params.requirementId, sourceVersion])}`);
        const previousNotice = await tx.get(notice);
        if (context.version !== sourceVersion) throw problem(409, 'The document changed. The analysis was discarded.');
        if (context.label !== admission.label) throw problem(409, 'The requirement changed. Reload its preview.');
        if (prior?.owner !== owner || prior.state !== 'sending') throw problem(409, 'Analysis ownership changed.');
        const now = clock().toISOString();
        tx.update(receipt, { state: 'complete', result, completedAt: now });
        tx.set(latestRef(req), { sourceVersion, result, analyzedAt: now, coordinatorId: req.staff.uid });
        if (result.color === 'red' && !previousNotice.exists) tx.create(notice, {
          recipientId: req.params.studentId, senderId: req.staff.uid, senderRole: 'coordinator', type: 'requirement',
          title: 'Document check needs your attention', message: 'An advisory AI check suggests that a replacement may be needed. Your coordinator must review it; your document has not been officially rejected.',
          read: false, createdAt: now,
        });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'document.triage_completed', targetType: 'documentTriageResults',
          targetId: latestRef(req).id, details: { studentId: req.params.studentId, requirementId: req.params.requirementId, color: result.color } });
      });
      return res.json({ ...result, sourceVersion });
    } catch (error) {
      if (claimed) await db.runTransaction(async tx => {
        const current = (await tx.get(receipt)).data();
        if (current?.owner === owner && current.state === 'sending') tx.update(receipt, { state: 'unavailable' });
      }).catch(() => {});
      return respond(res, error);
    }
  });
}
module.exports = { documentVersion, validateDocumentTriage, installDocumentTriage };
