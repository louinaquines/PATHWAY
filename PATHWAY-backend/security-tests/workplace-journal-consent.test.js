const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { installWorkplaceJournalConsent } = require('../workplaceJournalConsent');
const { migrationFixture } = require('./journal-migration-fixture');
let f; before(async () => { f = await migrationFixture(installWorkplaceJournalConsent); });
after(async () => { if (f) await f.close(); }); beforeEach(async () => f.reset());
const route = '/student/journal-analysis-consent';
const grant = { granted: true, disclosureVersion: 'workplace-journal-consent-v2', expectedRevision: 0, requestId: 'grant-one' };

test('legacy consent read requires renewal but preserves revision and journal access', async () => {
  await f.db.doc(`workplaceJournalConsents/${f.uid}`).set({ granted: true, disclosureVersion: 'workplace-journal-consent-v1', revision: 4 });
  const read = await f.post(`${route}/read`);
  assert.equal(read.status, 200); assert.equal(read.data.granted, false); assert.equal(read.data.revision, 4);
  assert.equal(read.data.disclosureVersion, 'workplace-journal-consent-v2');
});
test('consent defaults declined; grant/replay/conflict and withdrawal work without placement', async () => {
  assert.deepEqual((await f.post(`${route}/read`)).data, { granted: false, disclosureVersion: grant.disclosureVersion, revision: 0 });
  const saved = await f.post(route, grant); assert.equal(saved.status, 200); assert.equal(saved.data.revision, 1);
  assert.deepEqual(await f.post(route, grant), saved);
  assert.equal((await f.post(route, { ...grant, granted: false })).status, 409);
  assert.equal((await f.post(route, { ...grant, requestId: 'stale' })).status, 409);
  await f.db.doc(`users/${f.uid}`).update({ placementStatus: 'rejected', clearanceStatus: 'cleared' });
  const withdrawn = await f.post(route, { ...grant, granted: false, expectedRevision: 1, requestId: 'withdraw' });
  assert.equal(withdrawn.status, 200); assert.equal(withdrawn.data.granted, false);
  const record = (await f.db.doc(`workplaceJournalConsents/${f.uid}`).get()).data();
  assert.equal(record.revision, 2); assert.equal(record.granted, false);
});
test('consent guards reject malformed body, unauthenticated, role and password changes', async () => {
  assert.equal((await f.post(route, grant, '')).status, 401);
  for (const patch of [{ granted: 'true' }, { expectedRevision: -1 }, { disclosureVersion: 'old' }, { requestId: 'bad/id' }, { studentId: 'other' }]) assert.equal((await f.post(route, { ...grant, ...patch })).status, 400);
  for (const patch of [{ role: 'admin' }, { passwordChangeRequired: true }, { passwordEpoch: 'new' }]) {
    await f.reset(); f.setAfterAuth(async () => f.db.doc(`users/${f.uid}`).update(patch));
    assert.equal((await f.post(route, grant)).status, 403);
  }
});
test('consent update and receipt roll back if audit fails; concurrent stale choices cannot overwrite', async () => {
  f.setFailAudit(true); assert.equal((await f.post(route, grant)).status, 500);
  assert.equal((await f.db.doc(`workplaceJournalConsents/${f.uid}`).get()).exists, false);
  assert.equal((await f.db.collection('workplaceJournalConsentReceipts').get()).size, 0);
  f.setFailAudit(false);
  const results = await Promise.all([f.post(route, grant), f.post(route, { ...grant, granted: false, requestId: 'decline' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});
