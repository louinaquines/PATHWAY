// Synthetic restored-data acceptance only; pinned to separate local emulators.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, collection, getDocs } = require('firebase/firestore');
const { createHostedWorkplaceRuntime } = require('../workplaceHostedRuntime');
const project = 'demo-pathway-security';
const student = 'restore-safety-student';
const documents = {
  [`users/${student}`]: { role: 'student', syntheticOnly: true },
  'users/restore-safety-coordinator': { role: 'coordinator', syntheticOnly: true },
  'users/restore-safety-other': { role: 'coordinator', syntheticOnly: true },
  [`users/${student}/logbook/restored-journal`]: { rawNotes: 'Invented recovery journal.', sourceRevision: 1, hours: 8 },
  [`workplaceJournalConsents/${student}`]: { granted: false, revision: 2, disclosureVersion: 'workplace-journal-consent-v2' },
  'workplaceJournalAnalysisJobs/restore-queued': { studentId: student, entryId: 'restored-journal', state: 'queued', attempts: 0 },
  'workplaceJournalAnalysisJobs/restore-processed': { studentId: student, entryId: 'restored-journal', state: 'processed', attempts: 1 },
  'workplaceHostedControl/control': { enabled: true, stopped: true, epoch: 'synthetic-restored-stop' },
  'workplaceHostedDays/2026-10-25': { attempts: 1, reservedMicroUsd: 9560 },
  'workplaceHostedAttempts/restore-attempt': { stage: 'generation', reservedMicroUsd: 9560, syntheticOnly: true },
  'workplaceConcernCases/restore-private-case': { studentId: student, coordinatorId: 'restore-safety-coordinator', status: 'open', syntheticOnly: true,
    attachment: { publicId: 'synthetic/recovery/private.txt', assetId: 'synthetic_private_asset_1234', version: '1', deliveryType: 'authenticated', resourceType: 'raw' } },
  'workplaceConcernNotices/restore-private-notice': { recipientId: 'restore-safety-coordinator', caseId: 'restore-private-case', read: false },
  'studentJournalReceipts/restore-receipt': { syntheticOnly: true, result: { entryId: 'restored-journal', revision: 1 } },
};
async function verifyInventory(db) {
  const actual = {};
  async function visitCollections(collections) {
    for (const col of collections) for (const snapshot of (await col.get()).docs) {
      if (snapshot.exists) actual[snapshot.ref.path] = snapshot.data();
      await visitCollections(await snapshot.ref.listCollections());
    }
  }
  await visitCollections(await db.listCollections());
  assert.deepEqual(actual, documents, 'Exact invented inventory must survive, without unexpected documents');
}
async function main() {
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, project);
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9299');
  const mode = process.argv[2]; assert.ok(['seed', 'verify'].includes(mode));
  const app = initializeApp({ projectId: project });
  let env;
  try {
    const db = getFirestore(app), auth = getAuth(app);
    if (mode === 'seed') {
      assert.equal((await db.listCollections()).length, 0);
      assert.equal((await auth.listUsers(2)).users.length, 0);
      await auth.createUser({ uid: student, email: 'restore.safety@pathway.test', password: 'SyntheticOnly!2026' });
      const batch = db.batch();
      for (const [key, value] of Object.entries(documents)) batch.create(db.doc(key), value);
      await batch.commit();
    }
    await verifyInventory(db);
    const accounts = await auth.listUsers(2);
    assert.equal(accounts.users.length, 1); assert.equal(accounts.users[0].uid, student); assert.equal(accounts.pageToken, undefined);
    if (mode === 'verify') {
      env = await initializeTestEnvironment({ projectId: project, firestore: { host: '127.0.0.1', port: 8280,
        rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
      let privacyAssertions = 0;
      for (const uid of [null, student, 'restore-safety-coordinator', 'restore-safety-other', 'restore-safety-company']) {
        const client = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
        for (const key of ['workplaceConcernCases/restore-private-case', 'workplaceConcernNotices/restore-private-notice']) {
          await assertFails(getDoc(doc(client, key)));
          await assertFails(setDoc(doc(client, key), { exposed: true }));
          privacyAssertions += 2;
        }
        await assertFails(getDocs(collection(client, 'workplaceConcernCases'))); privacyAssertions++;
      }
      let providerCalls = 0;
      const options = { db, enabled: true, apiKey: 'SYNTHETIC-NOT-A-KEY', clock: () => new Date('2026-10-25T00:00:00Z'),
        transport: async () => { providerCalls++; throw Error('Provider must not be called after restore'); } };
      assert.deepEqual(await createHostedWorkplaceRuntime({ ...options, enabled: false }).wake({ jobId: 'restore-queued' }), { status: 'disabled', processed: 0 });
      // Each fresh runtime models loss of all process-local continuation authority.
      for (const jobId of ['restore-queued', 'restore-processed', 'restore-queued']) {
        assert.deepEqual(await createHostedWorkplaceRuntime(options).wake({ jobId }), { status: 'stopped', processed: 0 });
      }
      assert.equal(providerCalls, 0);
      await verifyInventory(db);
      console.log(JSON.stringify({ phase: mode, exactDocuments: Object.keys(documents).length, privacyAssertions,
        stoppedAfterRestore: true, queuedAndProcessedReplayDenied: true, providerCalls, duplicateNotices: 0, reservationsPreserved: true }));
    } else console.log(JSON.stringify({ phase: mode, exactDocuments: Object.keys(documents).length, syntheticOnly: true }));
  } finally { if (env) await env.cleanup(); await deleteApp(app); }
}
main().catch(() => { console.error('Synthetic restore safety acceptance failed; retain local evidence.'); process.exitCode = 1; });
