const { compareDtr } = require('./dtrComparison');
function installDocumentAiReview({ app, db, requireStaff, coordinatorOwnsStudent, allowRate, ai }) {
  app.post('/coordinator/students/:studentId/requirements/:requirementId/ai-assistance', requireStaff, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (![req.params.studentId, req.params.requirementId].every(value => /^[A-Za-z0-9_-]{1,128}$/.test(value || ''))) return res.status(400).json({ error: 'Invalid selection.' });
    const { consent, reviewed, text = '', form } = req.body || {};
    if (consent !== true || reviewed !== true || typeof text !== 'string' || text.length > 6000 || (!form && !text.trim()) || (form && req.params.requirementId !== 'dtr')) return res.status(400).json({ error: 'Review the source and confirm sharing up to 6,000 characters.' });
    if (!allowRate(req, res, { limit: 5, windowMs: 60000, key: r => `document-ai:${r.staff.uid}` })) return;
    try {
      const ref = db.collection('users').doc(req.params.studentId), snapshot = await ref.get();
      if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) return res.status(403).json({ error: 'Assigned students only.' });
      if (!snapshot.data().requirements?.[req.params.requirementId]?.fileName) return res.status(404).json({ error: 'No submitted document.' });
      let comparison, source = text.trim();
      if (form) {
        compareDtr(form, []); // validate before attendance read
        const prefix = `${form.year}-${String(form.month).padStart(2, '0')}`;
        const records = await ref.collection('attendance').where('date', '>=', `${prefix}-01`).where('date', '<=', `${prefix}-31`).limit(367).get();
        if (records.size > 366) return res.status(422).json({ error: 'Attendance record limit exceeded.' });
        comparison = compareDtr(form, records.docs.map(doc => doc.data()));
        // Share review statuses only, not raw attendance punches or student identity.
        const summary = comparison.results.filter(row => row.status !== 'blank').map(row => `${row.date}: ${row.status}. ${row.issues.join(' ')}`).join('\n');
        source = `Reviewed transcription (client supplied; not verified):\n${source}\nServer comparison review points:\n${summary}\nDigital dates without transcription: ${comparison.digitalOnlyDates.join(', ')}`;
      }
      if (!source || source.length > 8000) return res.status(400).json({ error: 'Source exceeds the AI limit. Shorten the reviewed excerpt.' });
      const result = await ai.assistDocument(source);
      return res.json({ ...result, comparison, source: form ? 'reviewed-transcription-and-server-comparison' : 'reviewed-client-excerpt', limitation: 'AI quotes refer only to the reviewed excerpt and comparison snapshot, not verified file contents. Check the original document. Signatures, authenticity, approvals and attendance remain unchanged.' });
    } catch (error) {
      return res.status([400, 429].includes(error.status) ? error.status : 503).json({ error: 'AI assistance unavailable. Manual checks and comparison remain available.' });
    }
  });
}
module.exports = { installDocumentAiReview };
