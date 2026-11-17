// Coordinator list of posted announcements with "seen by" tracking.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
function installAnnouncementList({ app, db, requireStaff, coordinatorSection, allowRate }) {
  const summary = (doc) => {
    const d = doc.data();
    return { id: doc.id, title: d.title, message: d.message, createdAt: d.createdAt, sectionId: d.sectionId,
      recipients: Object.keys(d.emailRecipients || {}).length, emailed: Object.values(d.emailRecipients || {}).some(r => r && r.status === 'sent') };
  };
  async function notices(uid, record, announcementId) {
    // New notices carry announcementId; older ones are matched by sender + createdAt + title.
    const snap = await db.collection('notifications').where('senderId', '==', uid).where('createdAt', '==', record.createdAt).limit(500).get();
    return snap.docs.filter(n => n.data().type === 'announcement' && (n.data().announcementId === announcementId || n.data().title === record.title));
  }
  app.get('/coordinator/sections/:sectionId/announcements', requireStaff, async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      if (!ID.test(req.params.sectionId || '')) return res.status(400).json({ error: 'Invalid section.' });
      await coordinatorSection(req, req.params.sectionId);
      const snap = await db.collection('announcements').where('sectionId', '==', req.params.sectionId).where('coordinatorId', '==', req.staff.uid).limit(200).get();
      const rows = snap.docs.map(summary).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return res.json({ announcements: rows });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load announcements.' }); }
  });
  async function owned(req) {
    if (!ID.test(req.params.announcementId || '')) throw Object.assign(new Error('Invalid announcement.'), { status: 400 });
    const ref = db.collection('announcements').doc(req.params.announcementId);
    const record = (await ref.get()).data();
    if (!record || record.coordinatorId !== req.staff.uid) throw Object.assign(new Error('Announcement not found.'), { status: 404 });
    await coordinatorSection(req, record.sectionId);
    return { ref, record };
  }
  app.get('/coordinator/announcements/:announcementId/seen', requireStaff, async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      const { record } = await owned(req);
      const list = await notices(req.staff.uid, record, req.params.announcementId);
      const names = record.emailRecipients || {};
      const seen = [], unseen = [];
      for (const n of list) { const d = n.data(); (d.read ? seen : unseen).push({ id: d.recipientId, name: names[d.recipientId]?.name || 'Student' }); }
      return res.json({ total: list.length, seen: seen.length, unseen });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load who has seen it.' }); }
  });
  app.post('/coordinator/announcements/:announcementId/remind', requireStaff, async (req, res) => {
    try {
      if (!allowRate(req, res, { limit: 10, windowMs: 60 * 60_000, key: r => `announcement-remind:${r.staff.uid}` })) return;
      const { record } = await owned(req);
      const list = (await notices(req.staff.uid, record, req.params.announcementId)).filter(n => !n.data().read);
      const now = new Date().toISOString();
      const batch = db.batch();
      for (const n of list) {
        const d = n.data();
        batch.create(db.collection('notifications').doc(), { ...d, title: `Reminder: ${record.title}`, read: false, createdAt: now, reminderOf: req.params.announcementId });
      }
      if (list.length) await batch.commit();
      return res.json({ reminded: list.length });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not send reminders.' }); }
  });
}
module.exports = { installAnnouncementList };
