const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { randomUUID } = require('node:crypto');
const { createHostedWakeAdapter } = require('../workplaceHostedWake');
let app, db;
const secret = 'a'.repeat(64);
function authority(options) { return require('../workplaceWakeAuthority').createWorkplaceWakeAuthority(options); }
before(() => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:(8180|8280)$/);
  app = initializeApp({ projectId: 'demo-pathway-wake-authority' }, randomUUID()); db = getFirestore(app);
});
after(async () => { if (app) await deleteApp(app); });
test('default off and invalid configuration fail closed', async () => {
  const off = authority(); assert.equal(await off.authorize('Bearer '+secret), false); assert.equal(await off.claimWake({}), false);
  assert.throws(() => authority({ enabled: true, db, workplaceSecret: 'short' }));
});
test('workplace-only secret comparison rejects malformed and other credentials without store access', async () => {
  const auth = authority({ enabled: true, db: { runTransaction: () => assert.fail('DB access during authentication') }, workplaceSecret: secret });
  for (const token of [undefined, '', secret, 'Bearer '+ 'b'.repeat(64), 'Bearer '+secret+' ', 'Bearer 🔒']) assert.equal(await auth.authorize(token), false);
  assert.equal(await auth.authorize('Bearer '+secret), true);
});
test('transactional receipts prevent cross-instance concurrent, restart and changed-identity replay', async () => {
  const first = authority({ enabled: true, db, workplaceSecret: secret });
  const next = authority({ enabled: true, db, workplaceSecret: secret });
  const jobId = randomUUID(), wakeId = randomUUID();
  const outcomes = await Promise.all([first.claimWake({jobId,wakeId}), next.claimWake({jobId,wakeId})]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await next.claimWake({jobId,wakeId:randomUUID()}), false);
  assert.equal(await next.claimWake({jobId:randomUUID(),wakeId}), false);
  assert.equal(await authority({ enabled:true, db, workplaceSecret:secret }).claimWake({jobId,wakeId}), false);
});
test('lost commit acknowledgement blocks runtime and restart cannot replay the reserved job', async () => {
  const jobId=randomUUID(), wakeId=randomUUID();
  const uncertainDb = { runTransaction: async fn => { await db.runTransaction(fn); throw Error('PRIVATE ACK LOST'); }, collection: name => db.collection(name) };
  const a = authority({ enabled:true, db:uncertainDb, workplaceSecret:secret });
  const adapter = createHostedWakeAdapter({ enabled:true, ...a, runtime:{wake:()=>assert.fail('uncertain claim must not dispatch')} });
  const request={method:'POST',authorization:'Bearer '+secret,body:{jobId,wakeId}};
  assert.equal((await adapter.handle(request)).status,503);
  assert.equal(await authority({enabled:true,db,workplaceSecret:secret}).claimWake(request.body),false);
});
