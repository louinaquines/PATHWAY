const express = require('express');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { digest } = require('../workplaceJournalConsent');
const { FEATURES } = require('../workplaceAnalysisPricing');
const NOTES = 'My supervisor threatened to hit me now.';
const decision = () => ({ version: 'workplace-concern-v1', findings: [{ category: 'threat', priority: 'high',
  quote: 'threatened to hit me now', immediateDangerQuote: 'hit me now', reason: 'Potential immediate danger; needs human review.' }] });
async function concernFixture(install) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required');
  const admin = initializeApp({ projectId: 'demo-pathway-security' }, `concern-${Date.now()}-${Math.random()}`), db = getFirestore(admin);
  let instant = Date.parse('2026-10-22T12:00:00Z'), failAudit = false, afterAuth;
  const clock = () => new Date(instant), app = express(); app.use(express.json());
  const requireStaff = async (req, res, next) => {
    const uid = req.headers.actor;
    if (!uid) return res.status(401).json({ error: 'Authentication required.' });
    const snap = await db.doc(`users/${uid}`).get(); req.staff = { uid, role: snap.data()?.role, data: snap.data() || {} };
    if (afterAuth) await afterAuth(req); next();
  };
  const audit = (tx, event) => { if (failAudit) throw Error('Synthetic audit failure'); tx.set(db.collection('auditLogs').doc(), event); };
  if (install) install({ app, db, requireStaff, allowRate: () => true, audit, clock, enabled: true });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  async function reset() {
    instant = Date.parse('2026-10-22T12:00:00Z'); failAudit = false; afterAuth = null;
    analyzer.analyze = async () => ({ usage: { inputTokens: 100, outputTokens: 100 }, decision: decision() });
    for (const col of ['workplaceConcernCases','workplaceConcernNotices','workplaceConcernReceipts','workplaceConcernWorker',
      'workplaceJournalAnalysisJobs','workplaceJournalWorker','workplaceAnalysisBudgetDays','workplaceAnalysisBudgetAttempts','auditLogs']) await db.recursiveDelete(db.collection(col));
    await db.doc('users/c-student').set({ role: 'student', accountApproved: true, department: 'CTE', sectionId: 'c-section',
      preDeploymentStatus: 'approved', placementStatus: 'approved', companyId: 'c-company' });
    for (const id of ['c-coord','c-other']) await db.doc(`users/${id}`).set({ role: 'coordinator', accountApproved: true, department: 'CTE' });
    await db.doc('sections/c-section').set({ department: 'CTE', coordinatorId: 'c-coord' });
    await db.doc('companies/c-company').set({ active: true });
    await db.doc('workplaceJournalConsents/c-student').set({ granted: true, revision: 1, disclosureVersion: 'workplace-journal-consent-v1' });
    await db.doc('users/c-student/logbook/entry').set({ rawNotes: NOTES, sourceRevision: 1 });
  }
  async function job(id = 'c-job', patch = {}) {
    await db.doc(`workplaceJournalAnalysisJobs/${id}`).set({ studentId: 'c-student', entryId: 'entry', sourceRevision: 1, sourceHash: digest(NOTES),
      consentRevision: 1, disclosureVersion: 'workplace-journal-consent-v1', state: 'queued', attempts: 0, createdAt: clock().toISOString(), ...patch });
  }
  const analyzer = { prepare: () => ({ model: 'claude-haiku-5-5', inputTokenUpperBound: 10000, maxOutputTokens: 2048, features: FEATURES, request: 'synthetic-only' }),
    analyze: async () => ({ usage: { inputTokens: 100, outputTokens: 100 }, decision: decision() }) };
  return { db, app, clock, job, reset, analyzer, setTime: value => { instant = Date.parse(value); },
    setAfterAuth: value => { afterAuth = value; }, setFailAudit: value => { failAudit = value; },
    async post(path, body = {}, actor = 'c-coord') {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(actor ? { actor } : {}) }, body: JSON.stringify(body) });
      return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') };
    },
    async case() { return (await db.collection('workplaceConcernCases').get()).docs[0]; },
    async close() { await new Promise(resolve => server.close(resolve)); await deleteApp(admin); },
  };
}
module.exports = { concernFixture, NOTES, decision };
