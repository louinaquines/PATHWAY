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
      await setDoc(doc(ctx.firestore(),'users/student/logbook/entry'),{ rawNotes:'Synthetic',status:'pending' });
    });
    const owner = env.authenticatedContext('student').firestore(), admin = env.authenticatedContext('admin').firestore();
    await assertSucceeds(getDoc(doc(owner,'users/student/logbook/entry')));
    for (const db of [owner,admin]) {
      await assertFails(setDoc(doc(db,'users/student/logbook/new'),{ rawNotes:'Synthetic',status:'pending' }));
      await assertFails(updateDoc(doc(db,'users/student/logbook/entry'),{ rawNotes:'Changed' }));
      await assertFails(deleteDoc(doc(db,'users/student/logbook/entry')));
    }
    assert.ok(fs.readFileSync(path.join(__dirname, '../../firestore.rules')).equals(current));
  } finally { await env.cleanup(); }
});
