const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { randomUUID, createHash } = require('node:crypto');
const { digest } = require('../workplaceJournalConsent');
const { createWorkplaceWakeAuthority } = require('../workplaceWakeAuthority');
const { createHostedWakeAdapter } = require('../workplaceHostedWake');
const key = value => createHash('sha256').update(value).digest('hex');
const secret = 'e'.repeat(64), identity = { jobId: 'synthetic-job', wakeId: 'first-wake' };
let app, db, instant;
const clock = () => new Date(instant);
const build = patch => createWorkplaceWakeAuthority({ enabled: true, recoverUnsent: true, db, workplaceSecret: secret, clock, ...patch });
const request = wakeId => ({ method: 'POST', authorization: 'Bearer '+secret, body: { jobId: identity.jobId, wakeId } });
before(() => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:(8180|8280)$/);
  app = initializeApp({ projectId: 'demo-pathway-unsent-recovery' }, randomUUID()); db = getFirestore(app);
});
after(async () => { if (app) await deleteApp(app); });
beforeEach(async () => {
  instant = Date.parse('2026-10-24T12:00:00Z');
  for (const name of ['workplaceWakeReceipts', 'workplaceWakeJobs', 'workplaceHostedControl', 'workplaceJournalAnalysisJobs',
    'workplaceAnalysisBudgetAttempts', 'workplaceHostedAttempts']) await db.recursiveDelete(db.collection(name));
  await db.doc('workplaceHostedControl/control').set({ enabled: true, stopped: false, epoch: 'test-epoch',
    notBefore: '2026-10-24T11:00:00Z', operatingMode: 'successful-next-job-v1', stopProtocol: 'operator-revision-v1', operatorRevision: 0 });
  await db.doc('workplaceJournalAnalysisJobs/synthetic-job').set({ state: 'queued', attempts: 0, studentId: 'fake-student',
    entryId: 'fake-entry', sourceRevision: 1, sourceHash: digest('Synthetic only.'), consentRevision: 1,
    disclosureVersion: 'workplace-journal-consent-v2', createdAt: '2026-10-24T11:30:00Z' });
});

test('verified unsent settlement preserves history and permits only one concurrent new delivery', async () => {
  const authority = build();
  const adapter = createHostedWakeAdapter({ enabled: true, ...authority, runtime: { wake: async () => ({ status: 'busy', processed: 0 }) } });
  assert.equal((await adapter.handle(request('first-wake'))).status, 200);
  const receipt = db.doc(`workplaceWakeReceipts/${key('first-wake')}`);
  assert.equal((await receipt.get()).data().state, 'safe-unsent');
  const next = { jobId: identity.jobId, wakeId: 'next-wake' };
  const outcomes = await Promise.all([authority.claimWake(next), authority.claimWake(next), build().claimWake(next)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal((await receipt.get()).data().state, 'safe-unsent');
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 2);
  assert.equal((await db.collection('workplaceHostedAttempts').get()).size, 0);
  assert.equal((await db.collection('workplaceAnalysisBudgetAttempts').get()).size, 0);
});

test('future daily-limit due time delays recovery without consuming another receipt', async () => {
  const authority = build(); assert.equal(await authority.claimWake(identity), true);
  await db.doc('workplaceJournalAnalysisJobs/synthetic-job').update({ dueAt: '2026-10-25T00:00:00Z', delayReason: 'daily-limit' });
  assert.equal(await authority.settleWake?.(identity), true);
  const next = { jobId: identity.jobId, wakeId: 'next-day-wake' };
  assert.equal(await authority.claimWake(next), false);
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 1);
  instant = Date.parse('2026-10-25T00:00:00Z');
  assert.equal(await authority.claimWake(next), true);
});

test('unknown claim acknowledgement cannot be converted to safe-unsent by settlement or restart', async () => {
  const real = db.runTransaction.bind(db);
  const wrapped = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return async callback => { await real(callback); throw Error('PRIVATE lost claim acknowledgement'); };
    const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const authority = build({ db: wrapped });
  await assert.rejects(authority.claimWake(identity));
  assert.equal(await authority.settleWake?.(identity), false);
  assert.equal(await build().claimWake({ jobId: identity.jobId, wakeId: 'new-wake' }), false);
});

test('lost settlement acknowledgement leaves the delivery blocked even if safe-unsent committed', async () => {
  const real = db.runTransaction.bind(db); let lost = false;
  const wrapped = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return async callback => {
      const result = await real(callback);
      if (!lost && (await db.doc(`workplaceWakeJobs/${key(identity.jobId)}`).get()).data()?.state === 'safe-unsent') {
        lost = true; throw Error('PRIVATE lost settlement acknowledgement');
      }
      return result;
    };
    const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const authority = build({ db: wrapped }); assert.equal(await authority.claimWake(identity), true);
  await assert.rejects(authority.settleWake?.(identity)); assert.equal(lost, true);
  const next = { jobId: identity.jobId, wakeId: 'later-wake' };
  assert.equal(await authority.claimWake(next), false);
  assert.equal(await build().claimWake(next), false);
  assert.equal(await authority.settleWake(identity), false);
});

test('restart cannot recover an acknowledged unsent delivery without its private authority permit', async () => {
  const authority = build(); assert.equal(await authority.claimWake(identity), true);
  assert.equal(await authority.settleWake?.(identity), true);
  assert.equal(await build().claimWake({ jobId: identity.jobId, wakeId: 'restart-wake' }), false);
});

test('changed source binding or stopped control invalidates acknowledged recovery', async () => {
  const authority = build(); assert.equal(await authority.claimWake(identity), true);
  assert.equal(await authority.settleWake?.(identity), true);
  await db.doc('workplaceJournalAnalysisJobs/synthetic-job').update({ sourceRevision: 2 });
  assert.equal(await authority.claimWake({ jobId: identity.jobId, wakeId: 'changed-source' }), false);
  await db.doc('workplaceJournalAnalysisJobs/synthetic-job').update({ sourceRevision: 1 });
  await db.doc('workplaceHostedControl/control').update({ stopped: true, operatorRevision: 1 });
  assert.equal(await authority.claimWake({ jobId: identity.jobId, wakeId: 'stopped-control' }), false);
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 1);
});

test('any prior worker or hosted reservation at either allowed attempt blocks recovery', async () => {
  const authority = build(); assert.equal(await authority.claimWake(identity), true);
  assert.equal(await authority.settleWake?.(identity), true);
  for (const collection of ['workplaceAnalysisBudgetAttempts', 'workplaceHostedAttempts']) for (const attempt of [1, 2]) {
    const ref = db.doc(`${collection}/${digest([identity.jobId, attempt])}`);
    await ref.set({ stage: 'reserved', reservedMicroUsd: 9560 });
    assert.equal(await authority.claimWake({ jobId: identity.jobId, wakeId: `${collection}-${attempt}` }), false);
    await ref.delete(); // Only this test's synthetic reservation; never protocol cleanup.
  }
});

test('sending, leased, cancelled, malformed and attempted jobs cannot be settled as unsent', async () => {
  const original = (await db.doc('workplaceJournalAnalysisJobs/synthetic-job').get()).data();
  for (const [label, patch] of [['sending', { state: 'sending', attempts: 1 }], ['leased', { state: 'leased', leaseOwner: 'other' }],
    ['cancelled', { state: 'cancelled' }], ['malformed', { dueAt: 'not-a-date' }], ['attempted', { attempts: 1 }],
    ['queued-lease', { leaseOwner: 'other', leaseUntil: '2026-10-24T12:01:00Z' }]]) {
    const target = { jobId: `synthetic-${label}`, wakeId: `first-${label}` }, authority = build();
    const ref = db.doc(`workplaceJournalAnalysisJobs/${target.jobId}`); await ref.set(original);
    assert.equal(await authority.claimWake(target), true);
    await ref.update(patch);
    assert.equal(await authority.settleWake(target), false, label);
    assert.equal(await authority.claimWake({ jobId: target.jobId, wakeId: `replay-${label}` }), false, label);
  }
});

test('failed recovery claim consumes the private permit even when its transaction did not commit', async () => {
  const real = db.runTransaction.bind(db); let fail = false;
  const wrapped = new Proxy(db, { get(target, name) {
    if (name === 'runTransaction') return async callback => {
      if (fail) { fail = false; throw Error('Synthetic uncertain recovery claim'); }
      return real(callback);
    };
    const value = target[name]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  const authority = build({ db: wrapped });
  assert.equal(await authority.claimWake(identity), true); assert.equal(await authority.settleWake(identity), true);
  fail = true; await assert.rejects(authority.claimWake({ jobId: identity.jobId, wakeId: 'uncertain-recovery' }));
  assert.equal(await authority.claimWake({ jobId: identity.jobId, wakeId: 'automatic-retry' }), false);
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 1);
});

test('invalid claim preparation consumes the acknowledged permit before throwing', async () => {
  let invalid = false;
  const authority = build({ clock: () => invalid ? new Date(NaN) : clock() });
  assert.equal(await authority.claimWake(identity), true);
  assert.equal(await authority.settleWake(identity), true);
  invalid = true;
  await assert.rejects(authority.claimWake({ jobId: identity.jobId, wakeId: 'invalid-clock' }));
  invalid = false;
  assert.equal(await authority.claimWake({ jobId: identity.jobId, wakeId: 'restored-clock' }), false);
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 1);
});

test('authentication failure and runtime uncertainty never settle or unlock a delivery', async () => {
  const authority = build();
  const adapter = createHostedWakeAdapter({ enabled: true, ...authority, runtime: { wake: async () => { throw Error('PRIVATE runtime uncertainty'); } } });
  assert.equal((await adapter.handle({ ...request('unauth'), authorization: 'Bearer '+ 'f'.repeat(64) })).status, 401);
  assert.equal((await db.collection('workplaceWakeReceipts').get()).size, 0);
  const result = await adapter.handle(request('first-wake'));
  assert.equal(result.status, 503); assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal((await db.doc(`workplaceWakeReceipts/${key('first-wake')}`).get()).data().state, 'claimed');
  assert.equal((await adapter.handle(request('new-wake'))).status, 409);
});
