const { attendanceAnalytics } = require('./attendanceAnalytics');
const { loadAttendanceInputs } = require('./attendanceAiReview');
const { assertAttendanceAccess, assertAttendanceFresh } = require('./attendanceExcusedDates');
function validateSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object' || !Array.isArray(schedule.workingDays) || schedule.workingDays.length > 7 || (schedule.exceptions && (!Array.isArray(schedule.exceptions) || schedule.exceptions.length > 366))) throw new Error('Invalid schedule.');
  attendanceAnalytics({ today: schedule?.startDate, creditedHours: 0, requiredHours: 1, schedule });
  const result = attendanceAnalytics({ today: schedule.startDate, creditedHours: 0, requiredHours: 1, schedule });
  if (result.reasons.includes('A valid work schedule and deadline are required.')) throw new Error('Enter valid dates, working days and start time.');
  return { startDate: schedule.startDate, deadline: schedule.deadline, startTime: schedule.startTime,
    workingDays: [...new Set(schedule.workingDays)], exceptions: schedule.exceptions || [] };
}
function installCoordinatorAnalytics({ app, db, requireStaff, coordinatorSection, allowRate, audit }) {
  const path = '/coordinator/sections/:sectionId/analytics';
  app.put(`${path}/schedule`, requireStaff, async (req, res) => {
    if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `schedule:${r.staff.uid}` })) return;
    try {
      let schedule;
      try { schedule = validateSchedule(req.body?.schedule); } catch { return res.status(400).json({ error: 'Enter valid dates, working days, start time and exceptions.' }); }
      await coordinatorSection(req, req.params.sectionId);
      await db.runTransaction(async tx => {
        const ref = db.collection('sections').doc(req.params.sectionId);
        await assertAttendanceAccess(db, req.staff.uid, req.params.sectionId, undefined, tx);
        tx.update(ref, { attendanceSchedule: schedule });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'section.updated', targetType: 'sections', targetId: req.params.sectionId, details: { attendanceSchedule: schedule } });
      });
      return res.json({ schedule });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save schedule.' }); }
  });
  app.get(path, requireStaff, async (req, res) => {
    if (!allowRate(req, res, { limit: 20, windowMs: 60000, key: r => `analytics:${r.staff.uid}` })) return;
    try {
      await coordinatorSection(req, req.params.sectionId);
      const { section } = await assertAttendanceAccess(db, req.staff.uid, req.params.sectionId);
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const snapshot = await db.collection('users').where('sectionId', '==', req.params.sectionId).where('role', '==', 'student').limit(501).get();
      if (snapshot.size > 500) return res.status(422).json({ error: 'Section exceeds the supported analytics limit.' });
      const students = [], sources = [];
      // Bounded batches avoid a request burst across every student at once.
      for (let index = 0; index < snapshot.docs.length; index += 10) {
        students.push(...await Promise.all(snapshot.docs.slice(index, index + 10).map(async doc => {
          const student = doc.data();
          if (student.department !== section.department) return null;
          const required = student.hoursRequired ?? section.hoursRequired;
          const { inputs, evidence } = await loadAttendanceInputs(doc.ref, student, section, today);
          const metrics = attendanceAnalytics(inputs);
          sources.push({ id: doc.id, student });
          return { id: doc.id, name: `${student.firstName || ''} ${student.lastName || ''}`.trim(), idNumber: student.idNumber || '',
            section: section.name, department: section.department, companyName: student.companyName || student.company || '',
            hoursRendered: metrics.creditedHours, hoursRequired: Number.isFinite(required) ? required : null,
            ...metrics, excusedDates: inputs.excusedDates, excusedDatesVersion: evidence.excusedDatesVersion,
            status: !student.accountApproved ? 'Registration pending' : metrics.risk,
            lateRate: metrics.onTimeRate == null ? null : 100 - metrics.onTimeRate };
        })));
      }
      for (let index = 0; index < sources.length; index += 10) await Promise.all(sources.slice(index, index + 10).map(({ id, student }) => assertAttendanceFresh(db, req.staff.uid, req.params.sectionId, id, student, section)));
      await assertAttendanceFresh(db, req.staff.uid, req.params.sectionId, null, null, section);
      const scoped = students.filter(Boolean), hoursAvailable = scoped.every(s => s.hoursRendered !== null), riskAvailable = scoped.every(s => s.riskTier !== null);
      const total = hoursAvailable ? scoped.reduce((sum, s) => sum + s.hoursRendered, 0) : null;
      res.set('Cache-Control', 'private, no-store');
      return res.json({ students: scoped, schedule: section.attendanceSchedule || null, today,
        totalStudents: scoped.length, activeInterns: scoped.filter(s => s.status !== 'Registration pending').length,
        completedInterns: scoped.filter(s => s.progressStatus === 'Completed').length,
        atRiskStudents: riskAvailable ? scoped.filter(s => s.riskTier === 'High').length : null,
        countsAvailable: { completed: scoped.every(s => Number.isFinite(s.hoursRendered) && Number.isFinite(s.hoursRequired) && s.hoursRequired > 0), highRisk: riskAvailable, totalHours: hoursAvailable },
        totalHoursLogged: total === null ? null : Math.round(total * 100) / 100, averageHours: total === null ? null : scoped.length ? (total / scoped.length).toFixed(1) : 0 });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not calculate section analytics.' }); }
  });
}
module.exports = { installCoordinatorAnalytics, validateSchedule };
