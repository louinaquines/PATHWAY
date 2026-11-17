// Fresh synthetic-only export/import acceptance; never uses the running phone demo.
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const uid = 'restore-synthetic-student';
const email = 'restore.synthetic@pathway.test';
const password = 'SyntheticRestore!2026';
const documents = {
  [`users/${uid}`]: { role: 'student', email, accountApproved: true, preDeploymentStatus: 'approved', companyId: 'restore-company', syntheticOnly: true },
  'companies/restore-company': { name: 'Synthetic Restore Company', active: true },
  [`users/${uid}/logbook/restore-entry`]: { rawNotes: 'Synthetic restore journal only.', refined: 'Synthetic restore journal only.', hours: 8, status: 'pending', sourceRevision: 1, analysisStatus: 'queued' },
  'studentJournalReceipts/restore-receipt': { hash: 'synthetic-request-hash', result: { entryId: 'restore-entry', revision: 1, analysisStatus: 'queued' } },
  [`workplaceJournalConsents/${uid}`]: { granted: false, revision: 2, disclosureVersion: 'workplace-journal-consent-v2' },
  'workplaceJournalAnalysisJobs/restore-job': { studentId: uid, entryId: 'restore-entry', state: 'queued', attempts: 0, consentRevision: 1, sourceRevision: 1 },
  'workplaceHostedControl/control': { enabled: false, stopped: true, epoch: 'synthetic-restore-epoch' },
  'workplaceHostedDays/2026-10-24': { attempts: 1, reservedMicroUsd: 9560 },
  'workplaceHostedAttempts/restore-attempt': { stage: 'generation', reservedMicroUsd: 9560, syntheticOnly: true },
  'workplaceConcernNotices/restore-private': { recipientId: 'synthetic-coordinator', caseId: 'synthetic-case', read: false },
};
async function main() {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, 'demo-pathway-security');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9299');
  const mode = process.argv[2]; assert.ok(['seed', 'verify'].includes(mode));
  const app = initializeApp({ projectId: 'demo-pathway-security' });
  let stage = mode;
  try {
    const db = getFirestore(app), auth = getAuth(app);
    if (mode === 'seed') {
      assert.equal((await db.listCollections()).length, 0, 'Fresh rehearsal database required');
      assert.equal((await auth.listUsers(2)).users.length, 0, 'Fresh rehearsal Auth required');
      await auth.createUser({ uid, email, password, emailVerified: true });
      const batch = db.batch();
      for (const [name, value] of Object.entries(documents)) batch.create(db.doc(name), value);
      await batch.commit();
    }
    for (const [name, value] of Object.entries(documents)) { stage = `verify ${name}`; assert.deepEqual((await db.doc(name).get()).data(), value, name); }
    stage = 'verify synthetic authentication';
    const accounts = await auth.listUsers(2); assert.equal(accounts.users.length, 1); assert.equal(accounts.pageToken, undefined);
    const account = accounts.users[0]; assert.equal(account.uid, uid); assert.equal(account.email, email); assert.equal(account.emailVerified, true);
    const signIn = async pass => fetch('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: pass, returnSecureToken: true }),
    });
    const accepted = await signIn(password); assert.equal(accepted.ok, true); assert.equal((await accepted.json()).localId, uid);
    const rejected = await signIn('INTENTIONALLY-WRONG'); assert.equal(rejected.ok, false); await rejected.body.cancel();
    console.log(JSON.stringify({ phase: mode, syntheticOnly: true, verifiedDocuments: Object.keys(documents).length,
      authAccounts: 1, syntheticPasswordWorks: true, wrongPasswordDenied: true, stopped: true, consentGranted: false,
      productionWrites: 0, paidCalls: 0 }));
  } catch { throw Error(`Synthetic backup rehearsal failed at ${stage}; retain evidence; do not use production.`); }
  finally { await deleteApp(app); }
}
if (require.main === module) main().catch(e => { console.error(e.message.startsWith('Synthetic backup rehearsal failed at ') ? e.message : 'Pinned synthetic rehearsal setup refused.'); process.exitCode = 1; });
