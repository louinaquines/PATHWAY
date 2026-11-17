const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
test('uninstalled candidate preserves owner reads and denies legacy and staff direct journal writes', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const current = fs.readFileSync(path.join(__dirname, '../../firestore.rules'));
  const rules = fs.readFileSync(path.join(__dirname, '../../release-candidates/workplace-backend-journals.rules'), 'utf8');
  const env = await initializeTestEnvironment({ projectId: 'demo-pathway-cutover-candidate', firestore: { host, port: Number(port), rules } });
  try {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(),'users/student'),{ role:'student',accountApproved:true });
      await setDoc(doc(ctx.firestore(),'users/admin'),{ role:'admin',accountApproved:true });
      await setDoc(doc(ctx.firestore(),'users/coordinator'),{ role:'coordinator',accountApproved:true });
      await setDoc(doc(ctx.firestore(),'users/student/logbook/entry'),{ rawNotes:'Synthetic',status:'pending' });
    });
    const owner = env.authenticatedContext('student').firestore(), admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(getDoc(doc(owner,'users/student/logbook/entry')));
    for (const db of [owner,admin]) {
      await assertFails(setDoc(doc(db,'users/student/logbook/new'),{ rawNotes:'Synthetic',status:'pending' }));
      await assertFails(updateDoc(doc(db,'users/student/logbook/entry'),{ rawNotes:'Changed' }));
      await assertFails(deleteDoc(doc(db,'users/student/logbook/entry')));
    }
    for (const uid of ['student','admin','coordinator']) {
      const client = env.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(client, `users/${uid}`)));
      await env.withSecurityRulesDisabled(async ctx => updateDoc(doc(ctx.firestore(), `users/${uid}`), { disabled: true }));
      await assertFails(getDoc(doc(client, `users/${uid}`)));
    }
    assert.ok(fs.readFileSync(path.join(__dirname, '../../firestore.rules')).equals(current));
  } finally { await env.cleanup(); }
});

test('rules rollback preserves backend journals, pending jobs and stopped accounting without queueing legacy writes', async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const current = fs.readFileSync(path.join(__dirname, '../../firestore.rules'));
  const candidate = fs.readFileSync(path.join(__dirname, '../../release-candidates/workplace-backend-journals.rules'));
  const { migrationFixture } = require('./journal-migration-fixture');
  const { installStudentJournalSubmission } = require('../studentJournalSubmission');
  const f = await migrationFixture(installStudentJournalSubmission);
  let env;
  async function rules(bytes) {
    if (env) await env.cleanup();
    env = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: { host, port: Number(port), rules: bytes.toString('utf8') } });
    return env.authenticatedContext(f.uid).firestore();
  }
  const payload = { requestId: 'rollback-before', rawNotes: 'Synthetic rollback journal', refined: 'Synthetic rollback journal', aiRefined: false, hours: 8 };
  const legacy = { rawNotes: 'Synthetic legacy', refined: 'Synthetic legacy', aiRefined: false, hours: 8, status: 'pending', weekNum: 9, weekRange: 'Week 9', createdAt: '2026-10-22T12:00:00Z' };
  const protectedPaths = ['workplaceHostedControl/control', 'workplaceHostedDays/2026-10-22', 'workplaceHostedAttempts/rollback-receipt'];
  const protectedData = [{ enabled: false, stopped: true }, { attempts: 1, reservedMicroUsd: 9560 }, { stage: 'generation', reservedMicroUsd: 9560, syntheticOnly: true }];
  async function snapshot() {
    const result = {};
    for (const name of [`users/${f.uid}/logbook`, 'workplaceJournalAnalysisJobs', 'studentJournalReceipts', 'studentJournalSequences']) {
      result[name] = (await f.db.collection(name).orderBy('__name__').get()).docs.map(d => ({ id: d.id, data: d.data() }));
    }
    for (const name of protectedPaths) result[name] = (await f.db.doc(name).get()).data();
    return result;
  }
  try {
    await f.reset();
    await f.db.doc(`workplaceJournalConsents/${f.uid}`).set({ granted: true, disclosureVersion: 'workplace-journal-consent-v2', revision: 1 });
    for (let i = 0; i < protectedPaths.length; i++) await f.db.doc(protectedPaths[i]).set(protectedData[i]);
    let owner = await rules(current);
    await assertSucceeds(setDoc(doc(owner, `users/${f.uid}/logbook/legacy-before`), legacy));
    const first = await f.post('/student/journals', payload);
    assert.equal(first.status, 200); assert.equal(first.data.analysisStatus, 'queued');
    const before = await snapshot();
    for (let i = 0; i < protectedPaths.length; i++) assert.deepEqual(before[protectedPaths[i]], protectedData[i]);
    assert.equal(before.workplaceJournalAnalysisJobs.length, 1);

    owner = await rules(candidate);
    await assertFails(setDoc(doc(owner, `users/${f.uid}/logbook/legacy-blocked`), legacy));
    await assertSucceeds(getDoc(doc(owner, `users/${f.uid}/logbook/${first.data.entryId}`)));
    assert.deepEqual(await snapshot(), before);
    assert.deepEqual(await f.post('/student/journals', payload), first);
    const second = await f.post('/student/journals', { ...payload, requestId: 'rollback-during' });
    assert.equal(second.status, 200); assert.equal(second.data.analysisStatus, 'queued');
    const during = await snapshot();
    for (let i = 0; i < protectedPaths.length; i++) assert.deepEqual(during[protectedPaths[i]], protectedData[i]);
    assert.equal(during.workplaceJournalAnalysisJobs.length, 2);

    owner = await rules(current);
    assert.deepEqual(await snapshot(), during);
    await assertSucceeds(setDoc(doc(owner, `users/${f.uid}/logbook/legacy-after`), legacy));
    assert.deepEqual(await f.post('/student/journals', payload), first);
    const after = await snapshot();
    assert.equal(after[`users/${f.uid}/logbook`].length, during[`users/${f.uid}/logbook`].length + 1);
    assert.deepEqual(after[`users/${f.uid}/logbook`].filter(entry => entry.id !== 'legacy-after'), during[`users/${f.uid}/logbook`]);
    for (const name of ['workplaceJournalAnalysisJobs', 'studentJournalReceipts', 'studentJournalSequences', ...protectedPaths]) assert.deepEqual(after[name], during[name]);
    assert.ok(fs.readFileSync(path.join(__dirname, '../../firestore.rules')).equals(current));
    assert.ok(fs.readFileSync(path.join(__dirname, '../../release-candidates/workplace-backend-journals.rules')).equals(candidate));
  } finally {
    try { if (env) await env.cleanup(); } finally { await f.close(); }
  }
});
