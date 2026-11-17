const express = require('express');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
async function migrationFixture(install) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required');
  const admin = initializeApp({ projectId: 'demo-pathway-security' }, `journal-${Date.now()}-${Math.random()}`);
  const db = getFirestore(admin), app = express(); app.use(express.json());
  let failAudit = false, afterAuth = null;
  const requireUser = async (req, res, next) => {
    const uid = req.headers.actor;
    if (!uid) return res.status(401).json({ error: 'Authentication required' });
    const profile = await db.doc(`users/${uid}`).get();
    req.user = { uid, role: profile.data()?.role, data: profile.data() || {} };
    if (afterAuth) await afterAuth(req);
    next();
  };
  const audit = (tx, event) => { if (failAudit) throw Error('Synthetic audit failure'); tx.set(db.collection('auditLogs').doc(), event); };
  const assertRecordsOpen = user => { if (user.clearanceStatus === 'cleared') throw Object.assign(Error('Records locked'), { status: 409 }); };
  const assertActivePlacement = async (tx, user) => {
    if (user.accountApproved !== true || user.preDeploymentStatus !== 'approved' || user.placementStatus !== 'approved' || !user.companyId) throw Object.assign(Error('Placement required'), { status: 403 });
    const company = await tx.get(db.doc(`companies/${user.companyId}`));
    if (!company.exists || company.data().active === false || company.data().status === 'inactive') throw Object.assign(Error('Placement required'), { status: 403 });
  };
  install({ app, db, requireUser, allowRate: () => true, audit, assertRecordsOpen, assertActivePlacement, clock: () => new Date('2026-10-22T12:00:00Z') });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const uid = 'journal-migration-student';
  async function reset() {
    afterAuth = null; failAudit = false;
    for (const name of ['workplaceJournalConsents', 'workplaceJournalConsentReceipts', 'studentJournalReceipts', 'studentJournalSequences', 'workplaceJournalAnalysisJobs']) await db.recursiveDelete(db.collection(name));
    await db.recursiveDelete(db.collection(`users/${uid}/logbook`));
    await db.doc(`users/${uid}`).set({ role: 'student', department: 'Journal Test Department', accountApproved: true, preDeploymentStatus: 'approved', placementStatus: 'approved', companyId: 'journal-company' });
    await db.doc('companies/journal-company').set({ active: true });
  }
  return { db, uid, reset, setFailAudit: value => { failAudit = value; }, setAfterAuth: fn => { afterAuth = fn; },
    async post(route, body = {}, actor = uid) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(actor ? { actor } : {}) }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    },
    async close() { await new Promise(resolve => server.close(resolve)); await deleteApp(admin); } };
}
module.exports = { migrationFixture };
