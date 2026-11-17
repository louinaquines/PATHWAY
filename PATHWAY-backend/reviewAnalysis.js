const DEFAULT_SKILLS = { technical: ['testing', 'debugging', 'programming', 'database'], communication: ['presentation', 'meeting', 'documented'], teamwork: ['collaborated', 'team', 'assisted'] };
function journalAnalysis(entry, others = [], skills = DEFAULT_SKILLS) {
  const text = String(entry.rawNotes || entry.refined || '').slice(0, 8000);
  const normalize = value => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const findings = [];
  if (!text.trim()) findings.push('Journal text is missing.');
  const daily = entry.frequency === 'daily';
  if (daily) {
    const date = new Date(`${entry.periodStart}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== entry.periodStart || entry.periodEnd !== entry.periodStart) findings.push('Daily reporting date needs review.');
  } else if (!Number.isInteger(entry.weekNum) || entry.weekNum < 1) findings.push('Week number needs review.');
  if (!Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > (daily ? 24 : 168)) findings.push(`Reported ${daily ? 'daily' : 'weekly'} hours need review.`);
  if (text.trim() && text.trim().split(/\s+/).length < 20) findings.push('Short entry: check that activities and learning are described.');
  const repetitions = others.filter(item => item.id !== entry.id && normalize(String(item.rawNotes || item.refined || '')) === normalize(text) && text.trim()).map(item => item.id);
  if (repetitions.length) findings.push('Identical text appears in another entry; check the reporting details.');
  const competencies = Object.entries(skills).slice(0, 20).map(([name, keywords]) => ({ name,
    evidence: Array.isArray(keywords) ? keywords.slice(0, 30).filter(word => typeof word === 'string' && word.length >= 3 && word.length <= 60 && new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) : [] })).filter(item => item.evidence.length);
  const cues = ['challenging', 'difficult', 'enjoyed', 'frustrating', 'confident'].filter(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
  return { method: 'rules-and-keywords', findings, repetitions, competencies, sentimentCues: cues,
    limitation: 'Keywords are text cues, not proof of competency or sentiment. English checks may miss mixed-language text. Human review is required; originals and grades are unchanged.' };
}
function documentTriage(requirement) {
  const findings = [];
  if (!requirement?.fileName) findings.push('No submitted file.');
  else if (!/\.(pdf|docx?|png|jpe?g)$/i.test(requirement.fileName)) findings.push('File format needs manual review.');
  if (!Number.isSafeInteger(requirement?.uploadedBytes) || requirement.uploadedBytes < 1 || requirement.uploadedBytes > 5 * 1024 * 1024) findings.push('File size metadata needs verification.');
  return { method: 'metadata-only', status: 'manual_review', findings,
    limitation: 'Metadata checks do not verify contents, required fields, signatures or authenticity. View the document before deciding.' };
}
function installReviewAnalysis({ app, db, requireStaff, coordinatorOwnsStudent, allowRate, coordinatorSection, audit }) {
  const checkPath = '/coordinator/sections/:sectionId/document-checks/:requirementId';
  const checkGuard = async (req, res) => {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.requirementId || '')) { res.status(400).json({ error: 'Invalid requirement.' }); return false; }
    if (!allowRate(req, res, { limit: 20, windowMs: 60000, key: r => `document-checks:${r.staff.uid}` })) return false;
    await coordinatorSection(req, req.params.sectionId); return true;
  };
  app.get(checkPath, requireStaff, async (req, res) => {
    try {
      if (!(await checkGuard(req, res))) return;
      const snapshot = await db.collection('sections').doc(req.params.sectionId).collection('reviewChecks').doc(req.params.requirementId).get();
      res.set('Cache-Control', 'private, no-store');
      return res.json({ requiredTerms: snapshot.exists ? snapshot.data().requiredTerms || [] : [] });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load document check settings.' }); }
  });
  app.put(checkPath, requireStaff, async (req, res) => {
    try {
      if (!(await checkGuard(req, res))) return;
      const terms = req.body?.requiredTerms;
      if (!Array.isArray(terms) || terms.length > 30 || terms.some(term => typeof term !== 'string' || !term.trim() || term.length > 100)) return res.status(400).json({ error: 'Use up to 30 required terms, each 1–100 characters.' });
      const requiredTerms = [...new Set(terms.map(term => term.trim()))];
      await db.runTransaction(async tx => {
        const ref = db.collection('sections').doc(req.params.sectionId), snapshot = await tx.get(ref);
        if (!snapshot.exists || req.staff.role !== 'coordinator' || snapshot.data().coordinatorId !== req.staff.uid || snapshot.data().department !== req.staff.data.department) throw Object.assign(new Error('Assigned sections only.'), { status: 403 });
        tx.set(ref.collection('reviewChecks').doc(req.params.requirementId), { requiredTerms });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'section.updated', targetType: 'sections', targetId: req.params.sectionId, details: { requirementId: req.params.requirementId, requiredTerms } });
      });
      return res.json({ requiredTerms });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save document check settings.' }); }
  });
  app.put('/coordinator/sections/:sectionId/journal-keywords', requireStaff, async (req, res) => {
    if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `keywords:${r.staff.uid}` })) return;
    try {
      const keywords = req.body?.keywords;
      if (!keywords || typeof keywords !== 'object' || Array.isArray(keywords) || Object.keys(keywords).length > 20 || Object.entries(keywords).some(([name, words]) => !/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(name) || !Array.isArray(words) || words.length > 30 || words.some(word => typeof word !== 'string' || word.trim().length < 3 || word.length > 60))) return res.status(400).json({ error: 'Use up to 20 categories, each with up to 30 keywords (3–60 characters).' });
      await coordinatorSection(req, req.params.sectionId);
      await db.runTransaction(async tx => {
        const ref = db.collection('sections').doc(req.params.sectionId), snapshot = await tx.get(ref);
        if (!snapshot.exists || req.staff.role !== 'coordinator' || snapshot.data().coordinatorId !== req.staff.uid || snapshot.data().department !== req.staff.data.department) throw Object.assign(new Error('Assigned sections only.'), { status: 403 });
        tx.update(ref, { journalKeywords: keywords });
        audit(tx, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'section.updated', targetType: 'sections', targetId: req.params.sectionId, details: { journalKeywords: keywords } });
      });
      return res.json({ keywords });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save keywords.' }); }
  });
  app.get('/coordinator/students/:studentId/review-analysis', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.studentId || '')) return res.status(400).json({ error: 'Invalid student.' });
    if (!allowRate(req, res, { limit: 20, windowMs: 60000, key: r => `analysis:${r.staff.uid}` })) return;
    try {
      const ref = db.collection('users').doc(req.params.studentId), snapshot = await ref.get();
      if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) return res.status(403).json({ error: 'Assigned students only.' });
      const student = snapshot.data();
      const records = await ref.collection('logbook').orderBy('createdAt', 'desc').limit(101).get();
      const entries = records.docs.slice(0, 100).map(doc => ({ ...doc.data(), id: doc.id }));
      const section = await db.collection('sections').doc(student.sectionId).get();
      const skills = section.data()?.journalKeywords || DEFAULT_SKILLS;
      const weeks = [...new Set(entries.filter(entry => !entry.frequency).map(entry => entry.weekNum).filter(week => Number.isInteger(week) && week > 0 && week <= 1000))].sort((a, b) => a - b);
      const gaps = [];
      if (weeks.length) for (let week = weeks[0]; week <= weeks[weeks.length - 1]; week++) if (!weeks.includes(week)) gaps.push(week);
      res.set('Cache-Control', 'private, no-store');
      return res.json({ keywords: skills, missingWeeksBetweenSubmissions: gaps, journals: entries.map(entry => ({ id: entry.id, ...journalAnalysis(entry, entries, skills) })),
        truncated: records.size > 100, documents: Object.fromEntries(Object.entries(student.requirements || {}).map(([id, requirement]) => [id, documentTriage(requirement)])) });
    } catch { return res.status(500).json({ error: 'Could not load review checks.' }); }
  });
}
module.exports = { journalAnalysis, documentTriage, installReviewAnalysis };
