const { attendanceAnalytics, attendanceWindow } = require('./attendanceAnalytics');
const { readExcusedPolicy, assertAttendanceAccess, assertAttendanceFresh } = require('./attendanceExcusedDates');
const timestampVersion = value => value ? { seconds: value.seconds, nanoseconds: value.nanoseconds } : null;
async function loadAttendanceInputs(ref, student, section, today) {
  const policySnapshot = await ref.firestore.collection('attendanceExcusedDates').doc(ref.id).get();
  const policy = readExcusedPolicy(policySnapshot);
  const window = attendanceWindow(section.attendanceSchedule, today, policy.dates);
  const from = window?.from || today;
  const records = await ref.collection('attendance').where('date', '>=', from).where('date', '<', today).limit(1001).get();
  if (records.size > 1000) throw new Error('Attendance record limit exceeded; coverage unavailable.');
  return { inputs: { today, creditedHours: student.hoursRendered, requiredHours: student.hoursRequired ?? section.hoursRequired,
    schedule: section.attendanceSchedule, excusedDates: policy.dates,
    records: records.docs.map(item => { const record = item.data(); return { date: record.date, timeIn: record.timeIn, timeOut: record.timeOut,
      creditedHours: record.timeOut && Number.isFinite(record.hoursToday) && record.hoursToday >= 0 ? record.hoursToday : undefined }; }) },
    evidence: { ruleVersion: 'attendance-risk-v1', queryFrom: from, queryBefore: today, recordLimit: 1000,
      excusedDatesVersion: policy.version, policyUpdateTime: timestampVersion(policySnapshot.updateTime), queryReadTime: timestampVersion(records.readTime),
      student: { role: student.role ?? null, hoursRendered: student.hoursRendered ?? null, hoursRequired: student.hoursRequired ?? null, sectionId: student.sectionId ?? null, department: student.department ?? null },
      section: { coordinatorId: section.coordinatorId ?? null, department: section.department ?? null, hoursRequired: section.hoursRequired ?? null, attendanceSchedule: section.attendanceSchedule ?? null },
      records: records.docs.map(item => ({ id: item.id, updateTime: timestampVersion(item.updateTime) })) } };
}
async function loadAttendanceMetrics(ref, student, section, today) {
  const { inputs } = await loadAttendanceInputs(ref, student, section, today);
  return attendanceAnalytics(inputs);
}
function installAttendanceAiReview({ app, db, requireStaff, coordinatorSection, allowRate, ai }) {
  app.post('/coordinator/sections/:sectionId/students/:studentId/attendance-ai', requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (![req.params.sectionId, req.params.studentId].every(value => /^[A-Za-z0-9_-]{1,128}$/.test(value || ''))) return res.status(400).json({ error: 'Invalid selection.' });
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Confirm sharing aggregate attendance metrics.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `attendance-ai:${r.staff.uid}` })) return;
    try {
      await coordinatorSection(req, req.params.sectionId);
      const { section, student } = await assertAttendanceAccess(db, req.staff.uid, req.params.sectionId, req.params.studentId);
      const ref = db.collection('users').doc(req.params.studentId);
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const metrics = await loadAttendanceMetrics(ref, student, section, today);
      await assertAttendanceFresh(db, req.staff.uid, req.params.sectionId, req.params.studentId, student, section);
      const result = await ai.explainAttendance(metrics);
      await assertAttendanceFresh(db, req.staff.uid, req.params.sectionId, req.params.studentId, student, section);
      return res.json({ ...result, metrics, today, limitation: 'AI wording may be inaccurate. Calculated metrics are authoritative; estimates are not guarantees. No attendance, approvals or hours were changed.' });
    } catch (error) {
      return res.status([403, 404, 409, 429].includes(error.status) ? error.status : 503).json({ error: 'AI explanation unavailable. Calculated analytics remain available.' });
    }
  });
}
module.exports = { installAttendanceAiReview, loadAttendanceMetrics, loadAttendanceInputs };
