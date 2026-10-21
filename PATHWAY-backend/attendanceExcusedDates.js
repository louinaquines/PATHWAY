const { dateMs } = require('./attendanceAnalytics');
const { isDeepStrictEqual } = require('node:util');
const denied = () => Object.assign(new Error('Assigned coordinator access required.'), { status: 403 });
function validateExcusedDates(dates) {
  if (!Array.isArray(dates) || dates.length > 366 || new Set(dates).size !== dates.length || dates.some(date => dateMs(date) === null)) throw Object.assign(new Error('Enter at most 366 unique calendar dates.'), { status: 400 });
  return [...dates].sort();
}
function readExcusedPolicy(snapshot) {
  if (!snapshot.exists) return { dates: [], version: 0 };
  const value = snapshot.data();
  if (!Number.isSafeInteger(value.version) || value.version < 1) throw new Error('Invalid excused-date version.');
  return { dates: validateExcusedDates(value.dates), version: value.version };
}
async function assertAttendanceAccess(db, actorId, sectionId, studentId, tx) {
  const refs = [db.collection('users').doc(actorId), db.collection('sections').doc(sectionId)];
  if (studentId) refs.push(db.collection('users').doc(studentId));
  const snapshots = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  const [actor, section, student] = snapshots.map(s => s.exists ? s.data() : null);
  if (!actor || actor.role !== 'coordinator' || actor.accountApproved !== true || actor.disabled === true || ['disabled', 'inactive', 'suspended'].includes(actor.status)
    || !section || section.coordinatorId !== actorId || !actor.department || section.department !== actor.department
    || (studentId && (!student || student.role !== 'student' || student.sectionId !== sectionId || student.department !== section.department))) throw denied();
  return { actor, section, student };
}
async function assertAttendanceFresh(db, actorId, sectionId, studentId, student, section) {
  const fresh = await assertAttendanceAccess(db, actorId, sectionId, studentId);
  if (!isDeepStrictEqual(fresh.section, section) || (studentId && !isDeepStrictEqual(fresh.student, student))) throw Object.assign(new Error('Attendance inputs changed; reload analytics.'), { status: 409 });
}
function installAttendanceExcusedDates({ app, db, requireStaff, allowRate, audit }) {
  const path = '/coordinator/sections/:sectionId/students/:studentId/attendance-excused-dates';
  for (const method of ['get', 'put']) app[method](path, requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (![req.params.sectionId, req.params.studentId].every(v => /^[A-Za-z0-9_-]{1,128}$/.test(v || ''))) return res.status(400).json({ error: 'Invalid selection.' });
    if (!allowRate(req, res, { limit: 20, windowMs: 60000, key: r => `excused-dates:${r.staff.uid}` })) return;
    try {
      let dates;
      if (method === 'put') {
        dates = validateExcusedDates(req.body?.dates);
        if (!Number.isSafeInteger(req.body?.expectedVersion) || req.body.expectedVersion < 0 || req.body.expectedVersion >= Number.MAX_SAFE_INTEGER || Object.keys(req.body).some(key => !['dates', 'expectedVersion'].includes(key))) return res.status(400).json({ error: 'Invalid policy update.' });
      }
      const result = await db.runTransaction(async tx => {
        await assertAttendanceAccess(db, req.staff.uid, req.params.sectionId, req.params.studentId, tx);
        const ref = db.collection('attendanceExcusedDates').doc(req.params.studentId);
        const policy = readExcusedPolicy(await tx.get(ref));
        if (method === 'get') return policy;
        if (policy.version !== req.body.expectedVersion) throw Object.assign(new Error('Excused dates changed; reload before saving.'), { status: 409 });
        const version = policy.version + 1;
        tx.set(ref, { dates, version, updatedAt: new Date().toISOString(), updatedBy: req.staff.uid });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'attendance.excused_dates_updated', targetType: 'attendanceExcusedDates', targetId: req.params.studentId,
          details: { sectionId: req.params.sectionId, before: policy, after: { dates, version } } });
        return { dates, version };
      });
      return res.json(result);
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not access excused dates.' }); }
  });
}
module.exports = { validateExcusedDates, readExcusedPolicy, assertAttendanceAccess, assertAttendanceFresh, installAttendanceExcusedDates };
