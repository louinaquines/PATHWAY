// Student-scoped read of their own submitted supervisor evaluations.
// Only display fields are returned: never the link token, OTP/session data or the supervisor's email.
const DEFAULT_LABELS = [
  ['technicalSkills', 'Technical skills'], ['workQuality', 'Work quality'], ['professionalism', 'Professionalism'],
  ['communication', 'Communication'], ['attendance', 'Attendance'],
];
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';

function toView(id, data) {
  let title = 'Supervisor evaluation';
  let items = [];
  if (data.formDefinition && Array.isArray(data.formDefinition.questions)) {
    title = text(data.formDefinition.title, 160) || title;
    const answers = data.answers && typeof data.answers === 'object' ? data.answers : {};
    items = data.formDefinition.questions.map(q => {
      const value = answers[q.id];
      return q.type === 'rating'
        ? { type: 'rating', label: text(q.label, 300), value: Number.isInteger(value) && value >= 1 && value <= 5 ? value : null }
        : { type: 'text', label: text(q.label, 300), value: text(value, 4000) || null };
    });
  } else {
    const ratings = data.ratings && typeof data.ratings === 'object' ? data.ratings : {};
    items = DEFAULT_LABELS.map(([key, label]) => ({ type: 'rating', label, value: Number.isInteger(ratings[key]) && ratings[key] >= 1 && ratings[key] <= 5 ? ratings[key] : null }));
    items.push({ type: 'text', label: 'Comments', value: text(data.comments, 4000) || null });
  }
  const scores = items.filter(i => i.type === 'rating' && i.value !== null).map(i => i.value);
  return {
    id, title, items,
    supervisorName: text(data.supervisorName, 120), companyName: text(data.companyName, 160),
    submittedAt: typeof data.submittedAt === 'string' ? data.submittedAt : null,
    average: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null,
  };
}

function installStudentEvaluations({ app, db, requireUser, allowRate }) {
  app.post('/student/evaluations', requireUser, async (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
    res.set('Cache-Control', 'no-store');
    if (allowRate && !allowRate(req, res, { limit: 60, windowMs: 60000, key: r => `student-evaluations:${r.user.uid}` })) return;
    try {
      const snap = await db.collection('evaluations').where('studentId', '==', req.user.uid).get();
      const evaluations = snap.docs
        .filter(d => d.data().used === true && d.data().submittedAt)
        .map(d => toView(d.id, d.data()))
        .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
      return res.json({ evaluations });
    } catch (error) {
      console.error('Student evaluations read failed:', error.code || error.message);
      return res.status(500).json({ error: 'Could not load your evaluation. Try again.' });
    }
  });
}

module.exports = { installStudentEvaluations, toView };
