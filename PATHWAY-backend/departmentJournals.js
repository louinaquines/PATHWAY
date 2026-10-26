const { problem } = require('./workplaceJournalConsent');
function settingsValue(data) {
  if (!data) return { frequency: 'weekly', revision: 0 };
  if (!['daily', 'weekly'].includes(data.frequency) || !Number.isSafeInteger(data.revision) || data.revision < 1) throw problem(503, 'Journal settings unavailable.');
  return { frequency: data.frequency, revision: data.revision };
}
function settingsRef(db, department) {
  if (typeof department !== 'string' || !department.trim() || department.includes('/') || department.length > 200) throw problem(403, 'A valid department is required.');
  return db.collection('departmentJournalSettings').doc(department);
}
function journalPeriod(frequency, now = new Date()) {
  if (!['daily', 'weekly'].includes(frequency) || !Number.isFinite(now.getTime())) throw problem(400, 'Invalid journal period.');
  const start = new Date(now.getTime() + 8 * 3600000);
  if (frequency === 'weekly') start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start); if (frequency === 'weekly') end.setUTCDate(end.getUTCDate() + 6);
  return { frequency, periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}
function journalDays(period) {
  const days = [], start = new Date(`${period.periodStart}T00:00:00Z`), end = new Date(`${period.periodEnd}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end || end - start > 6 * 86400000) throw problem(400, 'Invalid journal dates.');
  for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) days.push(date.toISOString().slice(0, 10));
  return days;
}
function freshActor(actor, snapshot, role) {
  const data = snapshot.exists && snapshot.data();
  if (!data || data.role !== role || data.accountApproved !== true || data.disabled === true || data.passwordChangeRequired === true
    || ['disabled', 'inactive', 'suspended', 'rejected'].includes(data.status)
    || (data.passwordEpoch || '') !== (actor.data?.passwordEpoch || '')
    || data.department !== actor.data?.department) throw problem(403, 'Your account or department changed. Sign in again.');
  return data;
}
function installDepartmentJournals({ app, db, requireStaff, requireUser, allowRate, audit, clock = () => new Date() }) {
  function handle(role, write) {
    return async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      try {
        const actor = role === 'student' ? req.user : req.staff;
        if (actor.role !== role) throw problem(403, `${role} access required.`);
        if (!allowRate(req, res, { limit: 60, windowMs: 60000, key: r => `journal-settings:${actor.uid}` })) return;
        const body = req.body;
        if (!body || Array.isArray(body) || typeof body !== 'object' || (write
          ? Object.keys(body).some(key => !['frequency', 'expectedRevision'].includes(key)) || !['daily', 'weekly'].includes(body.frequency) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0
          : Object.keys(body).length !== 0)) throw problem(400, 'Invalid journal settings.');
        const result = await db.runTransaction(async tx => {
          const profile = freshActor(actor, await tx.get(db.collection('users').doc(actor.uid)), role);
          const ref = settingsRef(db, profile.department), snap = await tx.get(ref);
          const current = settingsValue(snap.exists ? snap.data() : null);
          if (!write) return { ...current, department: profile.department, ...journalPeriod(current.frequency, clock()) };
          if (body.expectedRevision !== current.revision) throw problem(409, 'Journal settings changed. Refresh and review before saving.');
          if (current.revision >= Number.MAX_SAFE_INTEGER) throw problem(503, 'Journal settings unavailable.');
          const next = { frequency: body.frequency, revision: current.revision + 1 };
          tx.set(ref, { ...next, updatedAt: clock().toISOString(), updatedBy: actor.uid });
          audit(tx, { actorId: actor.uid, actorRole: role, action: 'journal.frequency_updated', targetType: 'department', targetId: profile.department, details: next });
          return next;
        });
        res.json(result);
      } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not read or save journal settings. Please retry.' }); }
    };
  }
  app.post('/coordinator/journal-settings/read', requireStaff, handle('coordinator', false));
  app.post('/coordinator/journal-settings', requireStaff, handle('coordinator', true));
  app.post('/student/journal-settings/read', requireUser, handle('student', false));
}
module.exports = { settingsValue, settingsRef, journalPeriod, journalDays, freshActor, installDepartmentJournals };
