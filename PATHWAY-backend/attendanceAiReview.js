const { attendanceAnalytics } = require('./attendanceAnalytics');
async function loadAttendanceMetrics(ref, student, section, today) {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 28 * 86400000).toISOString().slice(0, 10);
  const records = await ref.collection('attendance').where('date', '>=', from).where('date', '<', today).limit(1001).get();
  if (records.size > 1000) throw new Error('Record limit');
  return attendanceAnalytics({ today, creditedHours: Number(student.hoursRendered ?? 0), requiredHours: Number(student.hoursRequired || section.hoursRequired), schedule: section.attendanceSchedule,
    records: records.docs.map(item => { const record = item.data(); return { ...record, creditedHours: record.timeOut && Number.isFinite(record.hoursToday) ? record.hoursToday : undefined }; }) });
}
function installAttendanceAiReview({ app, db, requireStaff, coordinatorSection, allowRate, ai }) {
  app.post('/coordinator/sections/:sectionId/students/:studentId/attendance-ai', requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (![req.params.sectionId, req.params.studentId].every(value => /^[A-Za-z0-9_-]{1,128}$/.test(value || ''))) return res.status(400).json({ error: 'Invalid selection.' });
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Confirm sharing aggregate attendance metrics.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `attendance-ai:${r.staff.uid}` })) return;
    try {
      const section = (await coordinatorSection(req, req.params.sectionId)).data();
      const ref = db.collection('users').doc(req.params.studentId), snapshot = await ref.get();
      const student = snapshot.data();
      if (!snapshot.exists || student.role !== 'student' || student.sectionId !== req.params.sectionId || student.department !== section.department) return res.status(403).json({ error: 'Assigned students only.' });
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const metrics = await loadAttendanceMetrics(ref, student, section, today);
      const result = await ai.explainAttendance(metrics);
      return res.json({ ...result, metrics, today, limitation: 'AI wording may be inaccurate. Calculated metrics are authoritative; estimates are not guarantees. No attendance, approvals or hours were changed.' });
    } catch (error) {
      return res.status([403, 404, 429].includes(error.status) ? error.status : 503).json({ error: 'AI explanation unavailable. Calculated analytics remain available.' });
    }
  });
}
module.exports = { installAttendanceAiReview, loadAttendanceMetrics };
