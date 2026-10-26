const { createHash } = require('node:crypto');
const { DISCLOSURE_VERSION } = require('./workplaceRealUsePolicy');
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const problem = (status, message) => Object.assign(new Error(message), { status });
function assertFreshStudent(actor, snapshot) {
  const user = snapshot.exists && snapshot.data();
  if (actor.role !== 'student' || !user || user.role !== 'student' || user.passwordChangeRequired === true
    || (user.passwordEpoch || '') !== (actor.data?.passwordEpoch || '')) throw problem(403, 'Student access must be refreshed.');
  return user;
}
function consentValue(snapshot) {
  if (!snapshot.exists) return { granted: false, disclosureVersion: DISCLOSURE_VERSION, revision: 0 };
  const data = snapshot.data();
  if (data.disclosureVersion === 'workplace-journal-consent-v1' && typeof data.granted === 'boolean' && Number.isSafeInteger(data.revision) && data.revision >= 1)
    return { granted: false, disclosureVersion: DISCLOSURE_VERSION, revision: data.revision };
  if (typeof data.granted !== 'boolean' || data.disclosureVersion !== DISCLOSURE_VERSION
    || !Number.isSafeInteger(data.revision) || data.revision < 1) throw problem(503, 'Consent status unavailable.');
  return { granted: data.granted, disclosureVersion: data.disclosureVersion, revision: data.revision };
}
function installWorkplaceJournalConsent({ app, db, requireUser, allowRate, audit, clock = () => new Date() }) {
  function handle(write) {
    return async (req, res) => {
      res.set('Cache-Control', 'private, no-store');
      try {
        if (req.user.role !== 'student') throw problem(403, 'Student access required.');
        if (!allowRate(req, res, { limit: 60, windowMs: 60000, key: r => `journal-consent:${r.user.uid}` })) return;
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) || (write
          ? Object.keys(body).length !== 4 || typeof body.granted !== 'boolean' || body.disclosureVersion !== DISCLOSURE_VERSION
            || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !validId(body.requestId)
          : Object.keys(body).length !== 0)) throw problem(400, 'Invalid consent request.');
        const uid = req.user.uid, ref = db.collection('workplaceJournalConsents').doc(uid);
        const hash = write && digest([body.granted, body.disclosureVersion, body.expectedRevision]);
        const receipt = write && db.collection('workplaceJournalConsentReceipts').doc(digest([uid, body.requestId]));
        const updatedAt = clock().toISOString();
        const result = await db.runTransaction(async tx => {
          assertFreshStudent(req.user, await tx.get(db.collection('users').doc(uid)));
          if (write) {
            const saved = await tx.get(receipt);
            if (saved.exists) {
              if (saved.data().hash !== hash) throw problem(409, 'Request identity already used for another choice.');
              return saved.data().result;
            }
          }
          const current = consentValue(await tx.get(ref));
          if (!write) return current;
          if (current.revision !== body.expectedRevision) throw problem(409, 'Consent changed. Refresh before choosing again.');
          if (current.revision >= Number.MAX_SAFE_INTEGER) throw problem(503, 'Consent status unavailable.');
          const next = { granted: body.granted, disclosureVersion: DISCLOSURE_VERSION, revision: current.revision + 1 };
          tx.set(ref, { ...next, actorId: uid, updatedAt });
          tx.create(receipt, { hash, result: next });
          audit(tx, { actorId: uid, actorRole: 'student', action: 'journal.consent_updated', targetType: 'journalConsent', targetId: uid,
            details: next });
          return next;
        });
        res.json(result);
      } catch (error) { res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not save or read your consent. Please retry.' }); }
    };
  }
  app.post('/student/journal-analysis-consent/read', requireUser, handle(false));
  app.post('/student/journal-analysis-consent', requireUser, handle(true));
}
module.exports = { installWorkplaceJournalConsent, DISCLOSURE_VERSION, validId, digest, problem, assertFreshStudent, consentValue };
