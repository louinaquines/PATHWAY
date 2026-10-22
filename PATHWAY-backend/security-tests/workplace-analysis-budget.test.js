const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { reserveWorkplaceAttempt } = require('../workplaceAnalysisBudget');
const now = new Date('2026-10-22T12:00:00Z');
const options = { enabled: true, now, reservedMicroUsd: 1000, attemptId: 'synthetic-attempt' };

test('default-off and nonboolean enablement never access the database', async () => {
  for (const enabled of [undefined, false, 'true', 1]) {
    assert.deepEqual(await reserveWorkplaceAttempt({ enabled }), { status: 'disabled' });
  }
});

test('invalid server input fails before database access', async () => {
  const db = { collection() { assert.fail('Invalid input reached DB'); } };
  for (const patch of [{ now: '2026-10-22' }, { now: new Date(NaN) }, { reservedMicroUsd: 0 },
    { reservedMicroUsd: 100001 }, { reservedMicroUsd: 0.5 }, { reservedMicroUsd: Infinity },
    { reservedMicroUsd: '1000' }, { attemptId: '../private' }, { attemptId: '' }]) {
    await assert.rejects(reserveWorkplaceAttempt({ ...options, db, ...patch }));
  }
});

test('transaction callback retry returns only one committed reservation', async () => {
  let committed;
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }),
    async runTransaction(fn) {
      const execute = async () => {
        const writes = [];
        const result = await fn({ get: async () => ({ exists: false }), set: (ref, data) => writes.push([ref.path, data]) });
        return { result, writes };
      };
      await execute(); // Discarded retry, not a simulated concurrency guarantee.
      committed = await execute();
      return committed.result;
    } };
  assert.deepEqual(await reserveWorkplaceAttempt({ ...options, db }), { status: 'reserved' });
  assert.equal(committed.writes.length, 2);
  assert.equal(committed.writes.find(([p]) => p.startsWith('workplaceAnalysisBudgetDays/'))[1].attempts, 1);
});

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let app, db, rules;
before(async () => {
  if (!emulator) return;
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  const { initializeApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
  app = initializeApp({ projectId: 'demo-pathway-security' }, 'workplace-budget-tests');
  db = getFirestore(app);
  rules = await initializeTestEnvironment({ projectId: 'demo-pathway-security', firestore: {
    host: '127.0.0.1', port: Number(process.env.PATHWAY_FIRESTORE_PORT || 8180),
    rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8'),
  } });
});
after(async () => {
  if (rules) await rules.cleanup();
  if (app) await require('firebase-admin/app').deleteApp(app);
});
async function reset() {
  await db.recursiveDelete(db.collection('workplaceAnalysisBudgetDays'));
  await db.recursiveDelete(db.collection('workplaceAnalysisBudgetAttempts'));
}
const run = patch => reserveWorkplaceAttempt({ ...options, db, ...patch });
test('real transactions enforce concurrent last slot, restart and cross-day replay', { skip: !emulator }, async () => {
  await reset();
  const day = db.doc('workplaceAnalysisBudgetDays/2026-10-22');
  await day.set({ attempts: 9, reservedMicroUsd: 9000 });
  const results = await Promise.all([run({ attemptId: 'one' }), run({ attemptId: 'two' })]);
  assert.deepEqual(results.map(r => r.status).sort(), ['daily-limit', 'reserved']);
  const winner = results[0].status === 'reserved' ? 'one' : 'two';
  assert.equal((await day.get()).data().attempts, 10);
  assert.deepEqual(await run({ attemptId: winner }), { status: 'already-reserved' });
  assert.deepEqual(await run({ attemptId: winner, now: new Date('2026-10-23T00:00:00Z') }), { status: 'already-reserved' });
  assert.equal((await db.doc('workplaceAnalysisBudgetDays/2026-10-23').get()).exists, false);
  assert.deepEqual(await run({ attemptId: 'fresh-next-day', now: new Date('2026-10-23T00:00:00Z') }), { status: 'reserved' });
});
test('real transactions enforce exact dollar ceiling and persistent crash reservation', { skip: !emulator }, async () => {
  await reset();
  assert.deepEqual(await run({ reservedMicroUsd: 100000 }), { status: 'reserved' });
  assert.deepEqual(await run({ attemptId: 'over-cap', reservedMicroUsd: 1 }), { status: 'daily-limit' });
  // Requiring a fresh module after a simulated caller crash cannot reissue the receipt.
  delete require.cache[require.resolve('../workplaceAnalysisBudget')];
  const fresh = require('../workplaceAnalysisBudget').reserveWorkplaceAttempt;
  assert.deepEqual(await fresh({ ...options, db }), { status: 'already-reserved' });
  assert.equal((await db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data().reservedMicroUsd, 100000);
  assert.equal((await db.doc('workplaceAnalysisBudgetAttempts/over-cap').get()).exists, false);
});
test('real concurrent cost reservations cannot overspend the last allowance', { skip: !emulator }, async () => {
  await reset();
  const day = db.doc('workplaceAnalysisBudgetDays/2026-10-22');
  await day.set({ attempts: 1, reservedMicroUsd: 99000 });
  const results = await Promise.all([run({ attemptId: 'cost-one' }), run({ attemptId: 'cost-two' })]);
  assert.deepEqual(results.map(r => r.status).sort(), ['daily-limit', 'reserved']);
  assert.deepEqual((await day.get()).data(), { attempts: 2, reservedMicroUsd: 100000 });
  assert.equal((await db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
});
test('real concurrent duplicate attempts commit exactly one receipt and charge', { skip: !emulator }, async () => {
  await reset();
  const results = await Promise.all([run(), run(), run()]);
  assert.deepEqual(results.map(r => r.status).sort(), ['already-reserved', 'already-reserved', 'reserved']);
  assert.deepEqual((await db.doc('workplaceAnalysisBudgetDays/2026-10-22').get()).data(), { attempts: 1, reservedMicroUsd: 1000 });
  assert.equal((await db.collection('workplaceAnalysisBudgetAttempts').get()).size, 1);
});
test('malformed persisted counters and transaction abort cannot create receipts', { skip: !emulator }, async () => {
  await reset();
  const day = db.doc('workplaceAnalysisBudgetDays/2026-10-22');
  for (const data of [{ attempts: -1, reservedMicroUsd: 0 }, { attempts: 0, reservedMicroUsd: NaN }, { attempts: '0', reservedMicroUsd: 0 }, {}]) {
    await day.set(data);
    await assert.rejects(run());
    assert.equal((await db.doc('workplaceAnalysisBudgetAttempts/synthetic-attempt').get()).exists, false);
  }
  await day.delete();
  const abortDb = { collection: name => db.collection(name), runTransaction: fn => db.runTransaction(async tx => {
    await fn(tx); throw new Error('Synthetic abort');
  }) };
  await assert.rejects(run({ db: abortDb }), /Synthetic abort/);
  assert.equal((await day.get()).exists, false);
  assert.equal((await db.doc('workplaceAnalysisBudgetAttempts/synthetic-attempt').get()).exists, false);
});
test('all client roles including admin cannot read or write budget collections', { skip: !emulator }, async () => {
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const { assertFails } = require('@firebase/rules-unit-testing');
  for (const role of ['student', 'coordinator', 'admin']) {
    await db.doc(`users/budget-${role}`).set({ role, accountApproved: true });
    const client = rules.authenticatedContext(`budget-${role}`).firestore();
    for (const name of ['workplaceAnalysisBudgetDays', 'workplaceAnalysisBudgetAttempts']) {
      const ref = doc(client, name, 'private-budget');
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, { attempts: 0 }));
    }
  }
});
