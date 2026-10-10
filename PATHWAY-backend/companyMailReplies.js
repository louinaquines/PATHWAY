const crypto = require('node:crypto');
const ID = /^[A-Za-z0-9_-]{1,128}$/;
function installCompanyReplies({ app, db, requireStaff, coordinatorSection, allowRate, sender }) {
  if (app.get) app.get('/coordinator/sections/:sectionId/company-conversations/:conversationId/replies/:requestId', requireStaff, async (req, res) => {
    try {
      const { sectionId, conversationId, requestId } = req.params;
      res.set('Cache-Control', 'private, no-store');
      if (![sectionId, conversationId, requestId].every(id => ID.test(id || ''))) return res.status(400).json({ error: 'Invalid request.' });
      await coordinatorSection(req, sectionId);
      if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `company-reply-status:${r.staff.uid}` })) return;
      const ref = db.collection('sections').doc(sectionId).collection('companyConversations').doc(conversationId);
      const record = (await ref.get()).data();
      if (!record || record.coordinatorId !== req.staff.uid || record.sectionId !== sectionId) return res.status(404).json({ error: 'Conversation not found.' });
      const student = (await db.collection('users').doc(record.studentId).get()).data();
      if (!student || student.sectionId !== sectionId || student.department !== req.staff.data.department) return res.status(403).json({ error: 'Assigned students only.' });
      const id = crypto.createHash('sha256').update(`${req.staff.uid}:${requestId}`).digest('hex');
      const attempt = await ref.collection('replyAttempts').doc(id).get();
      return res.json({ status: attempt.exists ? attempt.data().status : 'not_found', emailsSent: false });
    } catch { return res.status(502).json({ error: 'Could not check delivery status. No email was sent.' }); }
  });
  app.post('/coordinator/sections/:sectionId/company-conversations/:conversationId/replies', requireStaff, async (req, res) => {
    let attemptRef, reserved = false;
    const { sectionId, conversationId } = req.params;
    try {
      res.set('Cache-Control', 'private, no-store');
      if (!ID.test(sectionId || '') || !ID.test(conversationId || '') || !ID.test(req.body?.requestId || '')
        || typeof req.body?.text !== 'string' || !req.body.text.trim() || req.body.text.length > 10000
        || Object.keys(req.body).some(key => !['requestId', 'text'].includes(key))) return res.status(400).json({ error: 'Provide reply text and a request ID only.' });
      await coordinatorSection(req, sectionId);
      if (!sender || sender.ownerId !== req.staff.uid) return res.status(503).json({ error: 'Company sending is not connected.' });
      if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `company-reply:${r.staff.uid}` })) return;
      const sectionRef = db.collection('sections').doc(sectionId);
      const conversationRef = sectionRef.collection('companyConversations').doc(conversationId);
      const initial = (await conversationRef.get()).data();
      if (!initial || initial.coordinatorId !== req.staff.uid || initial.sectionId !== sectionId || !ID.test(initial.studentId || '')) return res.status(404).json({ error: 'Conversation not found.' });
      const studentRef = db.collection('users').doc(initial.studentId);
      const attemptId = crypto.createHash('sha256').update(`${req.staff.uid}:${req.body.requestId}`).digest('hex');
      const hash = crypto.createHash('sha256').update(req.body.text).digest('hex');
      attemptRef = conversationRef.collection('replyAttempts').doc(attemptId);
      const result = await db.runTransaction(async tx => {
        const [section, student, conversation, attempt] = await Promise.all([tx.get(sectionRef), tx.get(studentRef), tx.get(conversationRef), tx.get(attemptRef)]);
        const record = conversation.data();
        const proposal = record?.placementBound === true && ID.test(record.proposalId || '')
          ? await tx.get(db.collection('companyProposals').doc(record.proposalId)) : null;
        if (!record || section.data()?.coordinatorId !== req.staff.uid || record.coordinatorId !== req.staff.uid || record.sectionId !== sectionId
          || record.studentId !== initial.studentId || student.data()?.sectionId !== sectionId
          || student.data()?.department !== req.staff.data.department) throw Object.assign(new Error('Assignment changed.'), { status: 403 });
        // A server-owned recipient and RFC Message-ID must be verified before replying.
        if (record.placementBound === true && (!proposal?.exists || student.data()?.placementStatus !== 'approved'
          || student.data()?.placementProposalId !== record.proposalId || proposal.data()?.status !== 'approved'
          || proposal.data()?.studentId !== record.studentId || proposal.data()?.sectionId !== sectionId
          || proposal.data()?.department !== req.staff.data.department
          || String(proposal.data()?.companyEmail || proposal.data()?.supervisorEmail || '').trim().toLowerCase() !== record.replyTo))
          throw Object.assign(new Error('Placement changed. Link a current conversation.'), { status: 409 });
        // Existing test mappings intentionally remain read-only until explicitly prepared.
        if (record.sendEnabled !== true || record.sourceMailbox !== (sender.mailbox || 'pathwaysystem4@gmail.com')
          || !record.replyTo || !record.replySubject || !record.replyMessageId || !ID.test(record.providerThreadId || ''))
          throw Object.assign(new Error('This conversation is not approved for replies.'), { status: 409 });
        if (attempt.exists) {
          if (attempt.data().textHash !== hash) throw Object.assign(new Error('Request ID already used with different text.'), { status: 409 });
          return { existing: attempt.data() };
        }
        const messageId = `<${attemptId}@pathway.invalid>`;
        tx.create(attemptRef, { status: 'sending', textHash: hash, coordinatorId: req.staff.uid, messageId, createdAt: new Date().toISOString() });
        return { record, messageId };
      });
      if (result.existing) return res.status(result.existing.status === 'provider_accepted' ? 200 : 409)
        .json({ status: result.existing.status, replayed: true, error: result.existing.status === 'provider_accepted' ? undefined : 'Delivery requires review; no second email was sent.' });
      reserved = true;
      const outcome = await sender.sendReply({ to: result.record.replyTo, subject: result.record.replySubject,
        text: req.body.text, threadId: result.record.providerThreadId, inReplyTo: result.record.replyMessageId, messageId: result.messageId });
      await attemptRef.update({ ...outcome, completedAt: new Date().toISOString() });
      return res.json(outcome);
    } catch (error) {
      if (reserved) {
        // Even failure to persist acceptance must never cause an automatic resend.
        try { await attemptRef.update({ status: 'delivery_unknown', updatedAt: new Date().toISOString() }); } catch { /* operator reconciliation required */ }
      }
      return res.status(error.status || 502).json({ error: error.status ? error.message : 'Delivery could not be confirmed. Check status before retrying.' });
    }
  });
}
module.exports = { installCompanyReplies };
