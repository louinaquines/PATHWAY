const crypto = require('node:crypto');
const SECTION = value => String(value || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
function verifyTestAssignment(owner, section, student, ownerId, sectionId) {
  if (owner.role !== 'coordinator' || owner.email !== 'loui@test.com' || section.coordinatorId !== ownerId
    || section.department !== owner.department || SECTION(section.name) !== 'bsit4g'
    || student.role !== 'student' || student.sectionId !== sectionId || student.department !== owner.department
    || `${student.firstName || ''} ${student.lastName || ''}`.trim().toLowerCase() !== 'dexter tampus') {
    throw Object.assign(new Error('This test link requires the assigned coordinator, BSIT 4G and Dexter Tampus.'), { status: 403 });
  }
}
function installCompanyTestLink({ app, db, requireStaff, coordinatorSection, allowRate, inbox, sender = null, enabled = false }) {
  app.post('/coordinator/sections/:sectionId/company-conversations/link-test-reply', requireStaff, async (req, res) => {
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.sectionId || '')) return res.status(400).json({ error: 'Invalid section.' });
      if (!enabled) return res.status(503).json({ error: 'Test conversation linking is disabled.' });
      await coordinatorSection(req, req.params.sectionId);
      if (!allowRate(req, res, { limit: 3, windowMs: 60000, key: r => `company-test-link:${r.staff.uid}` })) return;
      if (!inbox || inbox.ownerId !== req.staff.uid || inbox.mailbox !== 'pathwaysystem4@gmail.com') return res.status(503).json({ error: 'The test mailbox is not connected to this coordinator.' });
      const prepareReply = req.body?.prepareReply === true;
      if (Object.keys(req.body || {}).some(key => key !== 'prepareReply') || ('prepareReply' in (req.body || {}) && !prepareReply)) return res.status(400).json({ error: 'This fixed test link does not accept provider IDs or recipients.' });
      if (prepareReply && (!sender || sender.ownerId !== req.staff.uid)) return res.status(503).json({ error: 'Company sender is not connected.' });
      const sectionId = req.params.sectionId;
      const ownerRef = db.collection('users').doc(req.staff.uid);
      const sectionRef = db.collection('sections').doc(sectionId);
      const studentRef = db.collection('users').doc('CEIKzqvDGQfkp1FyidGZ1ftUTRi2');
      const [owner, section, student] = await Promise.all([ownerRef.get(), sectionRef.get(), studentRef.get()]);
      verifyTestAssignment(owner.data() || {}, section.data() || {}, student.data() || {}, req.staff.uid, sectionId);
      const matched = await inbox.findTestConversation();
      if (prepareReply && (!matched.replyMetadata || matched.replyMetadata.replyTo !== 'louinaquines@gmail.com'
        || matched.replyMetadata.replySubject !== 'Re: PATHWAY TEST - company reply'
        || !/^<[A-Za-z0-9._+=-]+@[A-Za-z0-9.-]+>$/.test(matched.replyMetadata.replyMessageId || ''))) throw new Error('Verified reply metadata required.');
      if (![matched.threadId, matched.messageId].every(id => /^[A-Za-z0-9_-]{1,128}$/.test(id || ''))) throw new Error('Invalid match.');
      const id = crypto.createHash('sha256').update(`${req.staff.uid}:${sectionId}:${matched.threadId}`).digest('hex');
      const ref = sectionRef.collection('companyConversations').doc(id);
      await db.runTransaction(async tx => {
        const [freshOwner, freshSection, freshStudent, existing] = await Promise.all([tx.get(ownerRef), tx.get(sectionRef), tx.get(studentRef), tx.get(ref)]);
        verifyTestAssignment(freshOwner.data() || {}, freshSection.data() || {}, freshStudent.data() || {}, req.staff.uid, sectionId);
        if (existing.exists) {
          const record = existing.data();
          if (record.coordinatorId !== req.staff.uid || record.sectionId !== sectionId || record.studentId !== studentRef.id || record.providerThreadId !== matched.threadId || record.testOnly !== true) throw Object.assign(new Error('Conflicting conversation mapping.'), { status: 409 });
          if (prepareReply) tx.update(ref, { ...matched.replyMetadata, sendEnabled: true, replyVerifiedAt: new Date().toISOString() });
          return;
        }
        tx.create(ref, { coordinatorId: req.staff.uid, sectionId, studentId: studentRef.id, studentName: 'Dexter Tampus',
          companyName: 'TEST ONLY — Company reply', providerThreadId: matched.threadId, testMessageId: matched.messageId,
          testOnly: true, sourceMailbox: inbox.mailbox, createdAt: new Date().toISOString(),
          ...(prepareReply ? { ...matched.replyMetadata, sendEnabled: true, replyVerifiedAt: new Date().toISOString() } : {}) });
      });
      res.set('Cache-Control', 'private, no-store');
      return res.json({ conversationId: id, linked: true, repliesPrepared: prepareReply, emailsSent: false });
    } catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Could not link the exact test reply. Check the mailbox and assignment.' }); }
  });
}
module.exports = { installCompanyTestLink, verifyTestAssignment };
