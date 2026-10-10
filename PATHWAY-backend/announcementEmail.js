const crypto = require('node:crypto');
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
function initialRecipient(student) {
  const email = String(student.email || '').trim().toLowerCase();
  return { email, name: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student',
    status: email === 'dex@gmail.com' ? 'blocked_known_bounce' : EMAIL.test(email) ? 'pending' : 'blocked_invalid_address' };
}
function installAnnouncementEmail({ app, db, requireStaff, coordinatorSection, allowRate, sender }) {
  async function owned(req) {
    if (!ID.test(req.params.announcementId || '')) throw Object.assign(new Error('Invalid announcement.'), { status: 400 });
    const ref = db.collection('announcements').doc(req.params.announcementId);
    const record = (await ref.get()).data();
    if (!record || record.coordinatorId !== req.staff.uid) throw Object.assign(new Error('Announcement not found.'), { status: 404 });
    await coordinatorSection(req, record.sectionId);
    return { ref, record };
  }
  app.get('/coordinator/announcements/:announcementId/email', requireStaff, async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      const { record } = await owned(req);
      return res.json({ connected: !!sender && sender.ownerId === req.staff.uid, recipients: record.emailRecipients || {},
        title: record.title, sectionId: record.sectionId });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load email status.' }); }
  });
  app.post('/coordinator/announcements/:announcementId/email', requireStaff, async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      const { ref, record } = await owned(req);
      if (!sender || sender.ownerId !== req.staff.uid) return res.status(503).json({ error: 'Announcement email sender is not connected.' });
      const ids = req.body?.recipientIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 20 || new Set(ids).size !== ids.length || !ids.every(id => ID.test(id))
        || Object.keys(req.body).some(key => key !== 'recipientIds')) return res.status(400).json({ error: 'Choose up to 20 student recipients only.' });
      if (!allowRate(req, res, { limit: 3, windowMs: 60000, key: r => `announcement-mail:${r.staff.uid}` })) return;
      const results = {};
      for (const id of ids) {
        // Reserve before transport; unknown delivery is never eligible for retry.
        const reservation = await db.runTransaction(async tx => {
          const [snapshot, section, student] = await Promise.all([tx.get(ref), tx.get(db.collection('sections').doc(record.sectionId)), tx.get(db.collection('users').doc(id))]);
          const current = snapshot.data(), recipient = current?.emailRecipients?.[id];
          if (!current || current.coordinatorId !== req.staff.uid || current.sectionId !== record.sectionId
            || section.data()?.coordinatorId !== req.staff.uid || section.data()?.department !== req.staff.data.department)
            throw Object.assign(new Error('Section assignment changed.'), { status: 403 });
          if (!recipient) throw Object.assign(new Error('Recipient not found.'), { status: 400 });
          if (!['pending', 'failed_before_send'].includes(recipient.status)) return null;
          if (student.data()?.role !== 'student' || student.data()?.sectionId !== record.sectionId
            || student.data()?.department !== req.staff.data.department || String(student.data()?.email || '').trim().toLowerCase() !== recipient.email)
            throw Object.assign(new Error('Student assignment or email changed. Create a new announcement.'), { status: 409 });
          const attempt = (recipient.attempt || 0) + 1;
          const messageId = `<${crypto.createHash('sha256').update(`${ref.id}:${id}:${attempt}`).digest('hex')}@pathway.invalid>`;
          tx.update(ref, { [`emailRecipients.${id}.status`]: 'sending', [`emailRecipients.${id}.attempt`]: attempt,
            [`emailRecipients.${id}.messageId`]: messageId });
          return { recipient, messageId, title: current.title, message: current.message };
        });
        if (!reservation) { results[id] = 'unchanged'; continue; }
        let status;
        try {
          const outcome = await sender.sendAnnouncement({ to: reservation.recipient.email, subject: reservation.title,
            text: reservation.message, messageId: reservation.messageId });
          status = outcome.status === 'provider_accepted' ? 'provider_accepted' : 'delivery_unknown';
        } catch (error) { status = ['AUTHORIZATION', 'INVALID_REPLY'].includes(error.code) ? 'failed_before_send' : 'delivery_unknown'; }
        // A crash after provider acceptance leaves 'sending', also ineligible for retry.
        await ref.update({ [`emailRecipients.${id}.status`]: status, [`emailRecipients.${id}.updatedAt`]: new Date().toISOString() });
        results[id] = status;
      }
      return res.json({ results, inAppPreserved: true });
    } catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Email status requires review. In-app announcements are unchanged.' }); }
  });
}
module.exports = { installAnnouncementEmail, initialRecipient };
