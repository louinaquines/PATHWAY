const { compareDtr } = require('./dtrComparison');
const { createHash } = require('node:crypto');

function sourceVersion(requirement) {
  return createHash('sha256').update(JSON.stringify([
    requirement.cloudinaryAssetId || '', requirement.cloudinaryPublicId || '',
    requirement.cloudinaryVersion || '', requirement.submittedAt || '', requirement.fileName || '',
  ])).digest('hex');
}

function installDtrReview({ app, db, requireStaff, coordinatorOwnsStudent, allowRate, streamAuthenticatedRequirement, assertRecordsOpen, writeAuditInTransaction }) {
  const reviewPath = '/coordinator/students/:studentId/dtr/reviews';
  const guard = (req, res) => {
    if (req.staff.role !== 'coordinator') { res.status(403).json({ error: 'Coordinator access required.' }); return false; }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.studentId || '')) { res.status(400).json({ error: 'Invalid student.' }); return false; }
    return allowRate(req, res, { limit: 20, windowMs: 60_000, key: request => `dtr-review:${request.staff.uid}` });
  };
  app.get(reviewPath, requireStaff, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const ref = db.collection('users').doc(req.params.studentId);
      const snapshot = await ref.get();
      if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) return res.status(403).json({ error: 'Assigned students only.' });
      const records = await ref.collection('dtrReviews').orderBy('createdAt', 'desc').limit(20).get();
      res.set('Cache-Control', 'private, no-store');
      return res.json({ reviews: records.docs.map(doc => ({ ...doc.data(), id: doc.id })) });
    } catch { return res.status(500).json({ error: 'Could not load review history.' }); }
  });
  app.post(reviewPath, requireStaff, async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const { form, sourceVersion: version, notes = '', reviewId } = req.body || {};
      compareDtr(form || {}, []);
      if (!/^[a-f0-9]{64}$/.test(version || '') || !/^[A-Za-z0-9_-]{16,80}$/.test(reviewId || '') || typeof notes !== 'string' || notes.length > 2000) {
        return res.status(400).json({ error: 'Invalid review details. Import the submitted DTR first.' });
      }
      const ref = db.collection('users').doc(req.params.studentId);
      const savedRef = ref.collection('dtrReviews').doc(reviewId);
      const requestHash = createHash('sha256').update(JSON.stringify({ form, version, notes: notes.trim() })).digest('hex');
      const saved = await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) throw Object.assign(new Error('Assigned students only.'), { status: 403 });
        const student = snapshot.data();
        assertRecordsOpen(student);
        if (!student.requirements?.dtr?.fileName || sourceVersion(student.requirements.dtr) !== version) throw Object.assign(new Error('The DTR changed. Import it again.'), { status: 409 });
        const previous = await transaction.get(savedRef);
        if (previous.exists) {
          if (previous.data().coordinatorId !== req.staff.uid || previous.data().requestHash !== requestHash) throw Object.assign(new Error('Review ID already used for different findings.'), { status: 409 });
          return { ...previous.data(), id: reviewId };
        }
        const prefix = `${form.year}-${String(form.month).padStart(2, '0')}`;
        const records = await transaction.get(ref.collection('attendance').where('date', '>=', `${prefix}-01`).where('date', '<=', `${prefix}-31`).limit(367));
        if (records.size > 366) throw Object.assign(new Error('Too many attendance records.'), { status: 422 });
        const entry = { createdAt: new Date().toISOString(), coordinatorId: req.staff.uid,
          sourceVersion: version, requestHash, fileName: student.requirements.dtr.fileName, period: prefix,
          notes: notes.trim(), comparison: compareDtr(form, records.docs.map(doc => doc.data())) };
        transaction.set(savedRef, entry);
        writeAuditInTransaction(transaction, { actorId: req.staff.uid, actorRole: 'coordinator', action: 'dtr.review_saved', targetType: 'dtrReviews', targetId: reviewId, details: { studentId: req.params.studentId, period: prefix } });
        return { ...entry, id: reviewId };
      });
      return res.json({ review: saved });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save review.' }); }
  });
  app.get('/coordinator/students/:studentId/dtr/source', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.studentId || '')) return res.status(400).json({ error: 'Invalid student.' });
    if (!allowRate(req, res, { limit: 30, windowMs: 60_000, key: request => `dtr-source:${request.staff.uid}` })) return;
    try {
      const snapshot = await db.collection('users').doc(req.params.studentId).get();
      if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) {
        return res.status(403).json({ error: 'You can only review DTRs for your assigned students.' });
      }
      const student = snapshot.data();
      const requirement = student.requirements?.dtr;
      if (!requirement?.fileName) return res.status(404).json({ error: 'No submitted DTR file is available.' });
      const version = sourceVersion(requirement);
      res.set('Cache-Control', 'private, no-store');
      if (!req.query.version) return res.json({ fileName: requirement.fileName, version });
      if (req.query.version !== version) return res.status(409).json({ error: 'The DTR file changed. Import the latest submission again.' });
      return await streamAuthenticatedRequirement(res, { studentId: req.params.studentId,
        requirementId: 'dtr', student, actorId: req.staff.uid, actorRole: 'coordinator' });
    } catch (error) {
      return res.status([404, 503].includes(error.status) ? error.status : 502).json({ error: 'Could not load the submitted DTR.' });
    }
  });
  app.post('/coordinator/students/:studentId/dtr/compare', requireStaff, async (req, res) => {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(req.params.studentId || '')) return res.status(400).json({ error: 'Invalid student.' });
    if (!allowRate(req, res, { limit: 20, windowMs: 60_000, key: request => `dtr-compare:${request.staff.uid}` })) return;
    try {
      // Validate transcription before making database queries. Client attendance is never trusted.
      compareDtr(req.body?.form || {}, [], { toleranceMinutes: req.body?.toleranceMinutes ?? 0 });
      const ref = db.collection('users').doc(req.params.studentId);
      const snapshot = await ref.get();
      if (!snapshot.exists || !(await coordinatorOwnsStudent(req.staff.uid, snapshot.data()))) {
        return res.status(403).json({ error: 'You can only compare DTRs for your assigned students.' });
      }
      const { year, month } = req.body.form;
      const prefix = `${year}-${String(month).padStart(2, '0')}`;
      const records = await ref.collection('attendance').where('date', '>=', `${prefix}-01`)
        .where('date', '<=', `${prefix}-31`).limit(367).get();
      if (records.size > 366) return res.status(422).json({ error: 'Too many attendance records. Review duplicate records first.' });
      return res.json(compareDtr(req.body.form, records.docs.map(doc => doc.data()), {
        toleranceMinutes: req.body.toleranceMinutes ?? 0,
      }));
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message });
      console.error('DTR comparison failed');
      return res.status(500).json({ error: 'Could not compare the DTR. Try again.' });
    }
  });
}
module.exports = { installDtrReview };
