const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { installDocumentTriage } = require('../documentTriage');
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
let admin, db, server, calls, outcome, duringAnalysis, failAudit;
const root = '/coordinator/students/student/requirements/certificate/triage';
before(async () => {
  if (!emulator) return;
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(127\.0\.0\.1|localhost):\d+$/);
  admin = initializeApp({ projectId: 'demo-pathway-triage' }, 'triage-acceptance'); db = getFirestore(admin);
  const app = express(); app.use(express.json());
  const requireStaff = async (req, res, next) => {
    const uid = req.headers.actor; if (!uid) return res.status(401).json({ error: 'Sign in.' });
    const data = (await db.doc(`users/${uid}`).get()).data() || {}; req.staff = { uid, role: data.role, data }; next();
  };
  installDocumentTriage({ app, db, requireStaff, allowRate: () => true,
    ai: { triageDocument: async () => { calls++; if (duringAnalysis) await duringAnalysis(); if (outcome instanceof Error) throw outcome; return outcome; } },
    audit(tx, event) { if (failAudit) throw Error('Synthetic audit failure'); tx.create(db.collection('auditLogs').doc(), event); } });
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (admin) await deleteApp(admin); });
beforeEach(async () => {
  if (!emulator) return;
  for (const col of await db.listCollections()) await db.recursiveDelete(col);
  await db.doc('users/student').set({ role: 'student', department: 'IT', sectionId: 'section', requirements: { certificate: {
    fileName: 'synthetic.pdf', cloudinaryAssetId: 'synthetic_asset_1234', cloudinaryVersion: 1, status: 'submitted' } } });
  for (const id of ['coordinator','other']) await db.doc(`users/${id}`).set({ role: 'coordinator', department: 'IT', accountApproved: true });
  await db.doc('sections/section').set({ coordinatorId: 'coordinator', department: 'IT' });
  await db.doc('sections/section/requirements/certificate').set({ label: 'Medical certificate' });
  calls = 0; failAudit = false; duringAnalysis = null;
  outcome = { color: 'red', reason: 'Apparent document type mismatch.', evidence: 'Driving permit' };
});
async function request(method, body, actor = 'coordinator') {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${root}`, { method,
    headers: { 'content-type': 'application/json', ...(actor ? { actor } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
}
async function payload() {
  const context = await request('GET'); assert.equal(context.status, 200);
  return { sourceVersion: context.data.version, text: 'Driving permit TEST ONLY', consent: true, reviewed: true, requestId: 'synthetic-request-1' };
}
test('Red automatically sends one guidance notice without rejecting; response retries do not repeat analysis', { skip: !emulator }, async () => {
  const body = await payload(); const first = await request('POST', body); assert.equal(first.status, 200); assert.equal(first.data.color, 'red');
  assert.equal(first.cache, 'private, no-store');
  assert.equal((await request('POST', body)).data.replay, true); assert.equal(calls, 1);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal((await db.doc('users/student').get()).data().requirements.certificate.status, 'submitted');
  assert.equal((await request('POST', { ...body, text: 'Changed' })).status, 409);
  assert.equal((await request('GET')).data.result.color, 'red');
});
test('all colours remain advisory; only Red creates student guidance', { skip: !emulator }, async () => {
  for (const color of ['green','yellow']) {
    outcome = { color, reason: 'Needs manual review.', evidence: 'Driving permit' };
    assert.equal((await request('POST', { ...await payload(), requestId: `synthetic-${color}` })).status, 200);
  }
  assert.equal((await db.collection('notifications').get()).size, 0);
});
test('anonymous, student, outsider, disabled actor and missing consent cannot analyze', { skip: !emulator }, async () => {
  const body = await payload();
  for (const actor of ['', 'student','other']) assert.ok([401,403].includes((await request('POST', body, actor)).status));
  assert.equal((await request('POST', { ...body, consent: false })).status, 400);
  await db.doc('users/coordinator').update({ disabled: true }); assert.equal((await request('POST', body)).status, 403); assert.equal(calls, 0);
});
test('reassignment during analysis discards stale result and notice', { skip: !emulator }, async () => {
  const body = await payload(); duringAnalysis = () => db.doc('sections/section').update({ coordinatorId: 'other' });
  assert.equal((await request('POST', body)).status, 403); assert.equal((await db.collection('notifications').get()).size, 0);
  assert.equal((await db.collection('documentTriageResults').get()).size, 0);
});
test('audit failure retains an unavailable receipt and cannot automatically retry', { skip: !emulator }, async () => {
  const body = await payload(); failAudit = true;
  assert.equal((await request('POST', body)).status, 503);
  assert.equal((await request('POST', body)).status, 409); assert.equal(calls, 1);
  assert.equal((await db.collection('notifications').get()).size, 0);
  assert.equal((await db.collection('documentTriageResults').get()).size, 0);
});
test('source replacement during analysis discards findings without rejecting the new file', { skip: !emulator }, async () => {
  const body = await payload(); duringAnalysis = () => db.doc('users/student').update({ 'requirements.certificate.cloudinaryAssetId': 'replacement_asset_1234' });
  assert.equal((await request('POST', body)).status, 409);
  assert.equal((await db.collection('notifications').get()).size, 0);
  assert.equal((await db.doc('users/student').get()).data().requirements.certificate.status, 'submitted');
});
test('actor disabled during analysis loses result access and no student notice is committed', { skip: !emulator }, async () => {
  const body = await payload(); duringAnalysis = () => db.doc('users/coordinator').update({ disabled: true });
  assert.equal((await request('POST', body)).status, 403); assert.equal((await db.collection('notifications').get()).size, 0);
});

test('approval withdrawal during analysis discards the result', { skip: !emulator }, async () => {
  const body = await payload(); duringAnalysis = () => db.doc('users/coordinator').update({ accountApproved: false });
  assert.equal((await request('POST', body)).status, 403);
  assert.equal((await db.collection('documentTriageResults').get()).size, 0);
});

test('requirement label change during analysis discards the stale classification', { skip: !emulator }, async () => {
  const body = await payload(); duringAnalysis = () => db.doc('sections/section/requirements/certificate').update({ label: 'Driving permit' });
  assert.equal((await request('POST', body)).status, 409);
  assert.equal((await db.collection('notifications').get()).size, 0);
});
test('provider failure is sanitized and a repeated identity never resends it', { skip: !emulator }, async () => {
  const body = await payload(); outcome = Error('PRIVATE PROVIDER DIAGNOSTIC');
  const failed = await request('POST', body); assert.equal(failed.status, 503); assert.equal(JSON.stringify(failed).includes('PRIVATE'), false);
  assert.equal((await request('POST', body)).status, 409); assert.equal(calls, 1);
});
test('private triage results and receipts deny direct client reads and writes', { skip: !emulator }, async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const fs = require('node:fs'), path = require('node:path');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  await request('POST', await payload()); await db.doc('users/admin').set({ role: 'admin' });
  const resultPath = (await db.collection('documentTriageResults').get()).docs[0].ref.path;
  const receiptPath = (await db.collection('documentTriageReceipts').get()).docs[0].ref.path;
  const env = await initializeTestEnvironment({ projectId: 'demo-pathway-triage', firestore: { host, port: Number(port), rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
  try {
    for (const uid of ['student','coordinator','other','admin']) {
      const client = env.authenticatedContext(uid).firestore();
      await assertSucceeds(getDoc(doc(client, `users/${uid}`)));
      for (const key of [resultPath, receiptPath]) { await assertFails(getDoc(doc(client, key))); await assertFails(setDoc(doc(client, key), { forged: true })); }
    }
  } finally { await env.cleanup(); }
});
