const crypto = require('node:crypto');
const { demoScheduleEnabled, latestDueContext } = require('./attendanceRiskAlerts');

function installAttendanceRiskSchedule({ app, db, worker, env = process.env, clock = () => new Date(), requireStaff, allowRate }) {
  app.post('/internal/attendance-risk/run', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!demoScheduleEnabled(db, env)) return res.status(503).json({ error: 'Automatic demo checks are disabled.' });
    const token = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || '')?.[1];
    if (!token || !crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(env.ATTENDANCE_SCHEDULE_SECRET, 'hex'))) {
      return res.status(401).json({ error: 'Scheduler authentication required.' });
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).length || Object.keys(req.query).length) {
      return res.status(400).json({ error: 'Expected empty object without query parameters.' });
    }
    try {
      const result = await worker.evaluateScheduledAttendanceRisk();
      return res.json({ status: result.status, hasMore: result.hasMore, pendingRetries: result.pendingRetries, dueDate: result.dueDate });
    } catch (error) {
      return res.status(error.status === 429 ? 429 : 503).json({ error: 'Automatic check could not finish; saved progress will be retried.' });
    }
  });
  if (requireStaff) app.get('/coordinator/attendance-risk-status', requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (allowRate && !allowRate(req, res, { limit: 30, windowMs: 60000, key: r => `risk-status:${r.staff.uid}` })) return;
    try {
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.staff.uid || '')) return res.status(403).json({ error: 'Coordinator access required.' });
      const actorRef = db.collection('users').doc(req.staff.uid);
      const authorize = snapshot => {
        const actor = snapshot.data();
        if (!actor || actor.role !== 'coordinator' || actor.accountApproved !== true || actor.disabled === true
          || ['disabled', 'inactive', 'suspended'].includes(actor.status) || !actor.department) {
          throw Object.assign(new Error(), { status: 403 });
        }
      };
      const value = await db.runTransaction(async tx => {
        authorize(await tx.get(actorRef));
        const dueDate = latestDueContext(clock());
        if (!demoScheduleEnabled(db, env)) return { status: 'disabled', dueDate, lastAttemptAt: null, lastSuccessfulCheckAt: null };
        const saved = (await tx.get(db.collection('attendanceRiskWorker').doc('daily'))).data() || {};
        const pending = !(await tx.get(db.collection('attendanceRiskRetries').limit(1))).empty;
        const timestamp = input => typeof input === 'string' && Number.isFinite(Date.parse(input)) ? new Date(input).toISOString() : null;
        return { status: saved.errorCode === 'EVALUATION_FAILED' ? 'unavailable' : saved.successfulDay === dueDate && !pending ? 'complete' : 'pending', dueDate,
          lastAttemptAt: timestamp(saved.lastAttemptAt), lastSuccessfulCheckAt: timestamp(saved.lastSuccessfulCheckAt) };
      });
      authorize(await actorRef.get());
      return res.json(value);
    } catch (error) { return res.status(error.status === 403 ? 403 : 503).json({ error: 'Automatic check status unavailable.' }); }
  });
}
module.exports = { installAttendanceRiskSchedule };
