// Explicit read-only analysis of one server-loaded entry, not client-supplied text.
function installJournalAiReview({ app, db, requireStaff, coordinatorOwnsStudent, allowRate, ai }) {
  app.post('/coordinator/students/:studentId/logbook/:entryId/ai-analysis', requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (![req.params.studentId, req.params.entryId].every(value => /^[A-Za-z0-9_-]{1,128}$/.test(value || ''))) return res.status(400).json({ error: 'Invalid journal selection.' });
    if (req.body?.consent !== true) return res.status(400).json({ error: 'Confirm permission to share this journal with Anthropic.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `journal-ai:${r.staff.uid}` })) return;
    try {
      const student = db.collection('users').doc(req.params.studentId);
      const profile = await student.get();
      if (!profile.exists || !(await coordinatorOwnsStudent(req.staff.uid, profile.data()))) return res.status(403).json({ error: 'Assigned students only.' });
      const entry = await student.collection('logbook').doc(req.params.entryId).get();
      if (!entry.exists) return res.status(404).json({ error: 'Journal not found.' });
      const data = entry.data();
      const notes = data.rawNotes || data.refined;
      if (typeof notes !== 'string' || !notes.trim() || notes.length > 8000) return res.status(400).json({ error: 'Journal text must be 1–8,000 characters.' });
      const result = await ai.analyzeJournal(notes);
      return res.json({ ...result, entryId: req.params.entryId, source: data.rawNotes ? 'original-notes' : 'saved-report', limitation: 'Text evidence is not proof of competency or sentiment. Review manually; no grades, approvals or journal records were changed.' });
    } catch (error) {
      return res.status([429, 503].includes(error.status) ? error.status : 503).json({ error: 'AI review unavailable. Free journal checks remain available.', code: ['AI_DISABLED', 'AI_LIMIT', 'AI_OUTPUT'].includes(error.code) ? error.code : 'AI_UNAVAILABLE' });
    }
  });
}
module.exports = { installJournalAiReview };
