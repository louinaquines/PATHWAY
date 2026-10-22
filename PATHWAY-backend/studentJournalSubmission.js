const { validId, digest, problem, assertFreshStudent, consentValue } = require('./workplaceJournalConsent');
const sourceFields = ['rawNotes', 'refined', 'aiRefined', 'hours', 'reviewedAt'];
function validExpectedSource(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === sourceFields.length
    && sourceFields.every(key => Object.hasOwn(value, key))
    && ['rawNotes', 'refined'].every(key => value[key] === null || (typeof value[key] === 'string' && value[key].length <= 8000))
    && (value.aiRefined === null || typeof value.aiRefined === 'boolean')
    && (value.hours === null || (typeof value.hours === 'number' && Number.isFinite(value.hours)))
    && (value.reviewedAt === null || (typeof value.reviewedAt === 'string' && value.reviewedAt.length <= 64));
}
function reportingWeek(now) {
  const monday = new Date(now.getTime() + 8 * 3600000), day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday); sunday.setUTCDate(sunday.getUTCDate() + 6);
  return `${monday.toISOString().slice(0, 10)} – ${sunday.toISOString().slice(0, 10)}`;
}
function installStudentJournalSubmission({ app, db, requireUser, allowRate, assertRecordsOpen, assertActivePlacement, audit, clock = () => new Date() }) {
  app.post('/student/journals', requireUser, async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (req.user.role !== 'student') throw problem(403, 'Student access required.');
      if (!allowRate(req, res, { limit: 60, windowMs: 3600000, key: r => `journal-submit:${r.user.uid}` })) return;
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b) || !validId(b.requestId)
        || Object.keys(b).some(key => !['requestId', 'rawNotes', 'refined', 'aiRefined', 'hours', 'entryId', 'expectedRevision', 'expectedSource'].includes(key))
        || typeof b.rawNotes !== 'string' || !b.rawNotes.trim() || b.rawNotes.length > 8000
        || typeof b.refined !== 'string' || !b.refined.trim() || b.refined.length > 8000 || typeof b.aiRefined !== 'boolean'
        || typeof b.hours !== 'number' || !Number.isFinite(b.hours) || b.hours <= 0 || b.hours > 168
        || (b.entryId !== undefined ? !validId(b.entryId) || !Number.isSafeInteger(b.expectedRevision) || b.expectedRevision < 0 || !validExpectedSource(b.expectedSource)
          : b.expectedRevision !== undefined || b.expectedSource !== undefined)) throw problem(400, 'Invalid journal submission.');
      const uid = req.user.uid, userRef = db.collection('users').doc(uid);
      const entryRef = b.entryId ? userRef.collection('logbook').doc(b.entryId) : userRef.collection('logbook').doc();
      const receipt = db.collection('studentJournalReceipts').doc(digest([uid, b.requestId]));
      const sequence = db.collection('studentJournalSequences').doc(uid);
      const hash = digest([b.rawNotes, b.refined, b.aiRefined, b.hours, b.entryId ?? null, b.expectedRevision ?? null,
        b.expectedSource ? sourceFields.map(key => b.expectedSource[key]) : null]);
      const now = clock(), timestamp = now.toISOString();
      const result = await db.runTransaction(async tx => {
        const profile = assertFreshStudent(req.user, await tx.get(userRef));
        const saved = await tx.get(receipt);
        if (saved.exists) {
          if (saved.data().hash !== hash) throw problem(409, 'Request identity already used for another submission.');
          return saved.data().result;
        }
        assertRecordsOpen(profile); await assertActivePlacement(tx, profile);
        const consent = consentValue(await tx.get(db.collection('workplaceJournalConsents').doc(uid)));
        let current, nextWeek;
        if (b.entryId) {
          const snap = await tx.get(entryRef); current = snap.exists && snap.data();
          if (!current || current.status !== 'rejected' || (current.sourceRevision ?? 0) !== b.expectedRevision
            || digest(sourceFields.map(key => current[key] ?? null)) !== digest(sourceFields.map(key => b.expectedSource[key]))) throw problem(409, 'This entry changed or is no longer available for revision. Reopen Logbook.');
        } else {
          const seq = await tx.get(sequence);
          if (seq.exists) {
            if (!Number.isSafeInteger(seq.data().lastWeekNum) || seq.data().lastWeekNum < 0) throw problem(503, 'Journal numbering unavailable.');
            nextWeek = seq.data().lastWeekNum + 1;
          } else {
            const legacy = await tx.get(userRef.collection('logbook').limit(1001));
            if (legacy.size > 1000) throw problem(409, 'Journal history needs a one-time numbering migration. Contact your coordinator.');
            nextWeek = Math.max(legacy.size, ...legacy.docs.map(d => d.data().weekNum).filter(n => Number.isSafeInteger(n) && n > 0)) + 1;
          }
          if (!Number.isSafeInteger(nextWeek)) throw problem(503, 'Journal numbering unavailable.');
        }
        const revision = b.entryId ? b.expectedRevision + 1 : 1;
        if (!Number.isSafeInteger(revision)) throw problem(409, 'Journal revision unavailable.');
        const analysisStatus = consent.granted ? 'queued' : 'not-enabled';
        const content = { rawNotes: b.rawNotes, refined: b.refined, aiRefined: b.aiRefined, hours: b.hours, status: 'pending', sourceRevision: revision, analysisStatus, updatedAt: timestamp };
        if (b.entryId) tx.update(entryRef, content);
        else {
          tx.create(entryRef, { ...content, createdAt: timestamp, weekNum: nextWeek, weekRange: reportingWeek(now) });
          tx.set(sequence, { lastWeekNum: nextWeek });
        }
        if (consent.granted) tx.create(db.collection('workplaceJournalAnalysisJobs').doc(digest([uid, entryRef.id, revision])), {
          studentId: uid, entryId: entryRef.id, sourceRevision: revision, sourceHash: digest(b.rawNotes),
          consentRevision: consent.revision, disclosureVersion: consent.disclosureVersion, state: 'queued', attempts: 0, createdAt: timestamp,
        });
        const response = { entryId: entryRef.id, revision, analysisStatus };
        tx.create(receipt, { hash, result: response });
        audit(tx, { actorId: uid, actorRole: 'student', action: b.entryId ? 'journal.resubmitted' : 'journal.submitted',
          targetType: 'logbook', targetId: entryRef.id, details: { revision, analysisStatus } });
        return response;
      });
      res.json(result);
    } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not submit your journal. Keep your notes and retry.' }); }
  });
}
module.exports = { installStudentJournalSubmission, reportingWeek };
