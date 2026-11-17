const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const express = require('express');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { installWorkplaceSupport } = require('../workplaceSupport');
const { signParams } = require('../cloudinaryUploads');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function mobileSupport(globals) {
  const read = name => readFileSync(resolve(__dirname, '../../PATHWAY-master/services', `${name}.js`), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${read('calendarDate')}\n${read('workplaceSupport')}\ncreateSupportDraft`, { Date, ...globals });
}

let db, admin, server, provider, base, adapter, clock = Date.now();
let middlewareRace;
const assets = new Map();
const config = { cloudName: 'synthetic', apiKey: '12345', apiSecret: 'synthetic-only' };
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082', 'hex');
const jpeg = Buffer.from('ffd8ffe000104a46494600010100000100010000ffda0008010100003f0000ffd9', 'hex');
const student = { role: 'student', department: 'D', sectionId: 'attachment-section', clearanceStatus: 'cleared' };
async function seed(id, data) { await db.collection('users').doc(id).set(data); }
async function call(route, body, who = 'attachment-student') {
  const r = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: who, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const bytes = Buffer.from(await r.arrayBuffer());
  return { status: r.status, headers: r.headers, bytes, data: r.headers.get('content-type')?.includes('json') ? JSON.parse(bytes) : null };
}
const root = '/student/workplace-support/attachments';
async function intent(type = 'application/pdf', who) { return call(`${root}/intents`, { contentType: type }, who); }
function upload(i, { bytes = pdf, ...changes } = {}) {
  const asset = { public_id: i.publicId, asset_id: 'synthetic_asset_1234567890', version: 1, resource_type: 'raw', type: 'authenticated', bytes: bytes.length, created_at: new Date(clock).toISOString(), secure_url: `https://res.cloudinary.com/synthetic/raw/authenticated/v1/${i.publicId}`, ...changes };
  assets.set(i.publicId, { asset, bytes });
  return { version: 1, signature: signParams({ public_id: i.publicId, version: 1 }, config.apiSecret) };
}
async function finalized(type = 'application/pdf', bytes = pdf) {
  const i = await intent(type); assert.equal(i.status, 201);
  const receipt = upload(i.data, { bytes });
  const f = await call(`${root}/${i.data.intentId}/finalize`, receipt); assert.equal(f.status, 200);
  return i.data;
}
const submit = (id, attachmentIntentId, who) => call('/student/workplace-support', { requestId: id, description: 'Tulong 日本語', immediateSafety: false, attachmentIntentId }, who);

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Firestore emulator required');
  admin = initializeApp({ projectId: 'demo-pathway-security' }, 'attachments'); db = getFirestore(admin);
  await seed('attachment-student', student); await seed('attachment-other', student);
  for (const id of ['attachment-coordinator', 'attachment-former']) await seed(id, { role: 'coordinator', accountApproved: true, department: 'D' });
  await seed('attachment-admin', { role: 'admin' });
  await db.collection('sections').doc('attachment-section').set({ department: 'D', coordinatorId: 'attachment-coordinator' });
  const p = express(); p.use(express.urlencoded({ extended: false }));
  p.get('/v1_1/synthetic/resources/raw/authenticated/*path', (req, res) => {
    assert.equal(req.headers.authorization, `Basic ${Buffer.from('12345:synthetic-only').toString('base64')}`);
    const entry = assets.get(req.params.path.join('/')); res.status(entry ? 200 : 404).json(entry?.asset || {});
  });
  p.get('/v1_1/synthetic/asset/download', (req, res) => {
    const { api_key, signature, ...params } = req.query;
    assert.equal(api_key, config.apiKey); assert.equal(signature, signParams(params, config.apiSecret));
    const entry = [...assets.values()].find(a => a.asset.asset_id === params.asset_id);
    res.status(entry ? 200 : 404).send(entry?.bytes);
  });
  p.post('/v1_1/synthetic/raw/destroy', (req, res) => {
    const { api_key, signature, ...params } = req.body;
    assert.equal(api_key, config.apiKey); assert.equal(signature, signParams(params, config.apiSecret));
    assert.equal(params.type, 'authenticated'); assert.ok(params.public_id.startsWith('pathway/support/'));
    assets.delete(params.public_id); res.json({ result: 'ok' });
  });
  provider = p.listen(0, '127.0.0.1'); await new Promise(r => provider.on('listening', r));
  // Synthetic HTTP boundary only; never load environment credentials or real provider QA.
  adapter = require('../workplaceSupportAttachments').createSupportUploads({ config: () => config, env: { CLOUDINARY_API_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1_1` } });
  const app = express(); app.use(express.json());
  const auth = async (req, res, next) => {
    const uid = req.headers.authorization;
    const data = uid && (await db.collection('users').doc(uid).get()).data();
    if (!data) return res.sendStatus(401);
    req.user = { uid, role: data.role, data };
    if (middlewareRace) await db.collection('users').doc(uid).update(middlewareRace);
    next();
  };
  installWorkplaceSupport({ app, db, requireUser: auth, requireStaff: auth, allowRate: () => true, audit: () => {}, uploads: adapter });
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await Promise.all([server, provider].filter(Boolean).map(s => new Promise(r => s.close(r)))); if (admin) await deleteApp(admin); });

test('intent rejects unsupported client type and locks; allows cleared students without placement', async () => {
  assert.equal((await intent('text/html')).status, 400);
  assert.equal((await intent('application/pdf', 'attachment-admin')).status, 403);
  await seed('attachment-locked', { ...student, passwordChangeRequired: true });
  assert.equal((await intent('application/pdf', 'attachment-locked')).status, 403);
  const i = await intent(); assert.equal(i.status, 201); assert.equal(i.data.deliveryType, 'authenticated'); assert.equal(i.data.resourceType, 'raw');
  assert.ok(!JSON.stringify(i.data).includes('res.cloudinary.com'));
});
test('mobile draft retries finalize after ready commit response loss without reupload or duplicate report', async () => {
  assets.clear(); let signed; let uploads = 0; let finalizes = 0;
  const createDraft = mobileSupport({ auth: { currentUser: { uid: 'attachment-student' } } });
  const draft = createDraft({ uid: 'attachment-student', requestId: () => 'lost-finalize-response',
    upload: async (_, authorization) => { signed = authorization; uploads++; return upload(signed); },
    request: async (route, options) => {
      const result = await call(route, options.payload);
      if (route.endsWith('/finalize') && ++finalizes === 1) {
        assert.equal(result.status, 200);
        assert.equal((await db.collection('workplaceSupportAttachmentIntents').doc(signed.intentId).get()).data().status, 'ready');
        throw new Error('Finalize response lost after server commit');
      }
      if (result.status >= 400) throw Object.assign(new Error(result.data.error), { status: result.status });
      return result.data;
    },
  });
  const file = { uri: 'file:///synthetic.pdf', mimeType: 'application/pdf', size: pdf.length };
  draft.update({ description: 'Tulong 日本語', file }); await draft.submit();
  assert.match(draft.state.error, /Finalize response lost/); assert.equal(draft.state.file, file); assert.equal(draft.state.sending, false);
  await draft.submit();
  assert.ok(draft.state.result?.id, draft.state.error); assert.equal(uploads, 1); assert.equal(finalizes, 2);
  const report = await call(`/student/workplace-support/${draft.state.result.id}`);
  assert.equal(report.data.attachment.assetRef, signed.intentId);
  assert.equal((await db.collection('workplaceSupportReports').where('attachment.assetRef', '==', signed.intentId).get()).size, 1);
});

test('mobile attachment journey retries one submission, transfers live access, and resolves with student public status only', async () => {
  assets.clear();
  let lostResponse = true; let claimedIntent;
  const createDraft = mobileSupport({ auth: { currentUser: { uid: 'attachment-student' } } });
  const draft = createDraft({ uid: 'attachment-student', requestId: () => 'connected-journey',
    upload: async (_, authorization) => { claimedIntent = authorization.intentId; return upload(authorization); },
    request: async (route, options) => {
      const result = await call(route, options.payload);
      if (result.status >= 400) throw Object.assign(Error(result.data.error), { status: result.status });
      if (route === '/student/workplace-support' && lostResponse) {
        lostResponse = false; throw Error('Synthetic response lost after commit');
      }
      return result.data;
    },
  });
  draft.update({ description: 'Synthetic journey report', file: { uri: 'file:///synthetic.pdf', mimeType: 'application/pdf', size: pdf.length } });
  try {
    await db.collection('sections').doc('attachment-section').update({ department: 'Other tenant' });
    await draft.submit(); assert.match(draft.state.error, /coordinator is unavailable/);
    assert.equal((await db.collection('workplaceSupportReports').where('description', '==', 'Synthetic journey report').get()).size, 0);
    assert.ok(draft.state.file, 'unavailable coordinator preserves the selected attachment');
  } finally {
    await db.collection('sections').doc('attachment-section').update({ department: 'D' });
  }
  await draft.submit(); assert.match(draft.state.error, /response lost/);
  await draft.submit(); assert.ok(draft.state.result?.id, draft.state.error);
  const id = draft.state.result.id;
  const matching = await db.collection('workplaceSupportReports').where('description', '==', 'Synthetic journey report').get();
  assert.equal(matching.size, 1);
  assert.equal(matching.docs[0].id, id);
  assert.equal(matching.docs[0].data().attachment.assetRef, claimedIntent);
  const claimed = (await db.collection('workplaceSupportAttachmentIntents').doc(claimedIntent).get()).data();
  assert.equal(claimed.status, 'claimed'); assert.equal(claimed.reportId, id);
  const staffRoot = `/coordinator/workplace-support/${id}`;
  const notices = async who => (await call('/coordinator/workplace-support-notices', undefined, who)).data.records.filter(n => n.reportId === id);
  const send = (requestId, expectedVersion, action, extra = {}, who = 'attachment-coordinator') =>
    call(`${staffRoot}/events`, { requestId, expectedVersion, action, ...extra }, who);
  const originalNotices = await notices('attachment-coordinator'); assert.equal(originalNotices.length, 1);
  const ack = await send('journey-ack', 1, 'acknowledge', { note: 'PRIVATE_JOURNEY_ACK' });
  assert.deepEqual(ack.data, { id, status: 'Under review', version: 2 });
  assert.deepEqual((await send('journey-ack', 1, 'acknowledge', { note: 'PRIVATE_JOURNEY_ACK' })).data, ack.data);
  assert.equal((await send('journey-stale', 1, 'contact', { contactOutcome: 'successful' })).status, 409);
  assert.equal((await send('journey-unreachable', 2, 'contact', { contactOutcome: 'unreachable', note: 'PRIVATE_JOURNEY_CALL' })).data.status, 'Following up');
  assert.equal((await send('journey-early-resolve', 3, 'resolve', { reason: 'PRIVATE_JOURNEY_REASON' })).status, 409);
  assert.equal((await call(staffRoot, undefined, 'attachment-coordinator')).data.status, 'Following up');
  assert.equal((await call(`${staffRoot}/attachment`, undefined, 'attachment-coordinator')).status, 200);
  for (const who of ['attachment-other', 'attachment-admin', 'attachment-former']) {
    assert.equal((await call(staffRoot, undefined, who)).status, 403);
    assert.equal((await call(`${staffRoot}/attachment`, undefined, who)).status, 403);
  }
  try {
    await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-former' });
    for (const route of [staffRoot, `${staffRoot}/attachment`, `${staffRoot}/events`]) {
      assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 403);
      assert.equal((await call(route, undefined, 'attachment-former')).status, 200);
    }
    assert.equal((await call(`/coordinator/workplace-support-notices/${originalNotices[0].id}/read`, {}, 'attachment-coordinator')).status, 403);
    assert.equal((await notices('attachment-coordinator')).length, 0);
    // This fixture installs routes, not server.js timers. Drive the actual queued
    // worker explicitly; access revocation above must precede eventual delivery.
    const { markSupportAssignment, reconcileSupport } = require('../workplaceSupportNotifications');
    await db.runTransaction(async tx => { markSupportAssignment(tx, db, 'attachment-student'); });
    await reconcileSupport({ db, audit: () => {}, queued: true });
    await reconcileSupport({ db, audit: () => {}, queued: true });
    const incoming = await notices('attachment-former'); assert.equal(incoming.length, 1);
    assert.equal((await call(`/coordinator/workplace-support-notices/${incoming[0].id}/read`, {}, 'attachment-former')).status, 200);
    assert.equal((await send('journey-contact', 3, 'contact', { contactOutcome: 'successful', note: 'PRIVATE_JOURNEY_SUCCESS' }, 'attachment-former')).data.version, 4);
    assert.equal((await send('journey-action', 4, 'record_action', { note: 'PRIVATE_JOURNEY_ACTION' }, 'attachment-former')).data.version, 5);
    assert.deepEqual((await send('journey-resolve', 5, 'resolve', { reason: 'PRIVATE_JOURNEY_REASON' }, 'attachment-former')).data, { id, status: 'Resolved', version: 6 });
    const publicDetail = await call(`/student/workplace-support/${id}`);
    assert.equal(publicDetail.status, 200); assert.equal(publicDetail.data.status, 'Resolved');
    assert.ok(!JSON.stringify(publicDetail.data).includes('PRIVATE_JOURNEY'));
    assert.deepEqual(Object.keys(publicDetail.data).sort(), ['attachment', 'createdAt', 'description', 'id', 'immediateSafety', 'incidentDate', 'priority', 'status', 'updatedAt', 'version']);
    assert.equal((await send('journey-student-write', 6, 'acknowledge', {}, 'attachment-student')).status, 403);
    assert.equal((await call(`${staffRoot}/events`, undefined, 'attachment-student')).status, 403);
    assert.equal((await call(`/student/workplace-support/${id}/attachment`)).status, 200);
  } finally {
    await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-coordinator' });
  }
});

test('real mobile controller recovers uncommitted expired attachment by explicit replacement or removal', async () => {
  for (const replace of [false, true]) {
    assets.clear(); let signed; let serial = 0; const payloads = [];
    const createDraft = mobileSupport({ auth: { currentUser: { uid: 'attachment-student' } } });
    const draft = createDraft({ uid: 'attachment-student', requestId: () => `expired-recovery-${replace}-${++serial}`,
      upload: async (_, authorization) => { signed = authorization; return upload(authorization); },
      request: async (route, options) => {
        if (route === '/student/workplace-support') {
          payloads.push(options.payload);
        }
        const result = await call(route, options.payload);
        if (result.status >= 400) throw Object.assign(Error(result.data.error), { status: result.status, reason: result.data.reason });
        return result.data;
      } });
    const file = { uri: 'file:///synthetic.pdf', mimeType: 'application/pdf', size: pdf.length };
    draft.update({ description: `Expired recovery ${replace}`, file });
    try {
      await db.collection('sections').doc('attachment-section').update({ department: 'Unavailable recipient' });
      await draft.submit();
      assert.match(draft.state.error, /coordinator is unavailable/);
      assert.equal((await db.collection('workplaceSupportReports').where('description', '==', `Expired recovery ${replace}`).get()).size, 0);
    } finally { await db.collection('sections').doc('attachment-section').update({ department: 'D' }); }
    assert.equal(draft.state.pending, true);
    await db.collection('workplaceSupportAttachmentIntents').doc(signed.intentId).update({ expiresAt: 1 });
    await draft.submit();
    assert.deepEqual(payloads[0], payloads[1]);
    assert.equal(draft.state.pending, false, draft.state.error);
    assert.equal(draft.state.file, file); assert.equal(draft.state.description, `Expired recovery ${replace}`);
    draft.update({ description: `Corrected expired recovery ${replace}`, file: replace ? { ...file, uri: 'file:///replacement.pdf' } : null });
    await draft.submit(); assert.ok(draft.state.result?.id, draft.state.error);
    assert.notEqual(payloads[2].requestId, payloads[0].requestId);
    const matches = await db.collection('workplaceSupportReports').where('description', '==', `Corrected expired recovery ${replace}`).get();
    assert.equal(matches.size, 1);
    assert.equal(matches.docs[0].data().attachment?.assetRef || null, replace ? signed.intentId : null);
  }
});

test('expired committed replay returns original; conflicting keys and fresh auth never expose uncommitted reason', async () => {
  assets.clear(); const i = await finalized();
  const original = await submit('expired-committed', i.intentId); assert.equal(original.status, 201);
  await db.collection('workplaceSupportAttachmentIntents').doc(i.intentId).update({ expiresAt: 1 });
  const replay = await submit('expired-committed', i.intentId);
  assert.equal(replay.status, 200); assert.deepEqual(replay.data, original.data);
  const conflict = await call('/student/workplace-support', { requestId: 'expired-committed', description: 'Changed', immediateSafety: false, attachmentIntentId: i.intentId });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.reason, undefined);
  try {
    middlewareRace = { passwordEpoch: 'changed' };
    const denied = await submit('expired-committed', i.intentId);
    assert.equal(denied.status, 403); assert.equal(denied.data.reason, undefined);
  } finally { middlewareRace = null; await seed('attachment-student', student); }
});

test('real mobile lost POST response remains locked until expired committed replay returns original', async () => {
  assets.clear(); let signed; let original; let posts = 0; const payloads = [];
  const createDraft = mobileSupport({ auth: { currentUser: { uid: 'attachment-student' } } });
  const draft = createDraft({ uid: 'attachment-student', requestId: () => 'expired-lost-response',
    upload: async (_, authorization) => { signed = authorization; return upload(authorization); },
    request: async (route, options) => {
      const result = await call(route, options.payload);
      if (result.status >= 400) throw Object.assign(Error(result.data.error), { status: result.status, reason: result.data.reason });
      if (route === '/student/workplace-support') {
        payloads.push(options.payload);
        if (++posts === 1) { original = result.data; throw Error('Committed response lost'); }
      }
      return result.data;
    } });
  const file = { mimeType: 'application/pdf', size: pdf.length };
  draft.update({ description: 'Expired lost response', file }); await draft.submit();
  assert.equal(draft.state.pending, true);
  await db.collection('workplaceSupportAttachmentIntents').doc(signed.intentId).update({ expiresAt: 1 });
  draft.update({ file: null, description: 'Must not replace pending payload' });
  assert.equal(draft.state.file, file); await draft.submit();
  assert.equal(draft.state.result.id, original.id); assert.equal(draft.state.attachmentRejected, false);
  assert.deepEqual(payloads[0], payloads[1]);
  const reports = await db.collection('workplaceSupportReports').where('description', '==', 'Expired lost response').get();
  assert.equal(reports.size, 1); assert.equal(reports.docs[0].data().attachment.assetRef, signed.intentId);
});

test('ready finalize replay revalidates owner signature metadata bytes expiry password and single use', async () => {
  assets.clear(); const i = await finalized(); const receipt = upload(i);
  const ref = db.collection('workplaceSupportAttachmentIntents').doc(i.intentId); const saved = (await ref.get()).data();
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 200);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt, 'attachment-other')).status, 403);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, { ...receipt, signature: '0'.repeat(40) })).status, 400);
  upload(i, { bytes: Buffer.from('%PDF-1.4\nchanged-but-valid\n%%EOF\n') });
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 400);
  assert.deepEqual((await ref.get()).data(), saved);
  upload(i); assets.get(i.publicId).asset.type = 'upload';
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 400);
  upload(i); await ref.update({ expiresAt: 1 });
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 409); await ref.update({ expiresAt: saved.expiresAt });
  try { middlewareRace = { passwordChangeRequired: true }; assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 403); }
  finally { middlewareRace = null; await seed('attachment-student', student); }
  assert.equal((await submit('replay-claim', i.intentId)).status, 201);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 409);
});

test('finalization rejects missing, oversize, metadata/type/byte/signature mismatch and foreign intents', async () => {
  assets.clear();
  const i = (await intent()).data;
  assert.equal((await call(`${root}/${i.intentId}/finalize`, { version: 1, signature: '0'.repeat(40) })).status, 400);
  const receipt = upload(i);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt, 'attachment-other')).status, 403);
  assets.delete(i.publicId);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 400);
  for (const changes of [{ bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }, { bytes: png }, { type: 'upload' }, { resource_type: 'image' }, { public_id: 'pathway/requirements/victim.pdf' }, { version: 2 }, { created_at: '2000-01-01T00:00:00Z' }, { asset_id: '' }, { format: 'doc' }]) {
    upload(i, changes);
    assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 400, JSON.stringify(changes).slice(0, 100));
  }
  upload(i); assets.get(i.publicId).asset.bytes++;
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 400);
  upload(i, { bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }); assets.get(i.publicId).asset.bytes = 100;
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 502);
});
test('provider metadata reads have a byte bound rather than buffering arbitrary JSON', async () => {
  assets.clear(); const i = (await intent()).data; const receipt = upload(i, { unexpected: 'x'.repeat(70000) });
  assert.equal((await call(`${root}/${i.intentId}/finalize`, receipt)).status, 502);
});
test('malformed non-ASCII upload signatures are rejected as input errors', async () => {
  const i = (await intent()).data;
  assert.equal((await call(`${root}/${i.intentId}/finalize`, { version: 1, signature: 'é'.repeat(40) })).status, 400);
});
test('PDF 2.0 bytes are accepted as PDF rather than rejected by a version-specific signature', async () => {
  assets.clear(); await finalized('application/pdf', Buffer.from('%PDF-2.0\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n'));
});
test('PDF JPEG PNG finalize actual bytes; report exposes opaque references and safe private download headers', async () => {
  for (const [type, bytes] of [['application/pdf', pdf], ['image/png', png], ['image/jpeg', jpeg]]) {
    assets.clear();
    const i = await finalized(type, bytes);
    const r = await submit(`types-${type.replace('/', '-')}`, i.intentId); assert.equal(r.status, 201);
    const detail = await call(`/student/workplace-support/${r.data.id}`);
    assert.deepEqual(Object.keys(detail.data.attachment).sort(), ['assetRef', 'bytes', 'contentType', 'fileName']);
    assert.ok(!JSON.stringify(detail.data).includes(i.publicId)); assert.ok(!JSON.stringify(detail.data).includes('cloudinary'));
    const d = await call(`/student/workplace-support/${r.data.id}/attachment`);
    assert.equal(d.status, 200); assert.deepEqual(d.bytes, bytes); assert.equal(d.headers.get('cache-control'), 'no-store');
    assert.equal(d.headers.get('x-content-type-options'), 'nosniff'); assert.ok(d.headers.get('content-disposition').startsWith('attachment;'));
    assert.equal(d.headers.get('content-type'), type);
  }
});
test('pending/foreign/expired attachment cannot silently become an attachment-free report', async () => {
  const i = (await intent()).data;
  assert.equal((await submit('pending', i.intentId)).status, 409);
  assert.equal((await submit('foreign', i.intentId, 'attachment-other')).status, 403);
  await db.collection('workplaceSupportAttachmentIntents').doc(i.intentId).update({ expiresAt: 1 });
  assert.equal((await submit('expired', i.intentId)).status, 409);
});
test('a finalized attachment missing before submit rejects the whole report without consuming the intent', async () => {
  assets.clear(); const i = await finalized(); assets.clear();
  assert.equal((await submit('missing-before-submit', i.intentId)).status, 400);
  assert.equal((await db.collection('workplaceSupportAttachmentIntents').doc(i.intentId).get()).data().status, 'ready');
});
test('transactional concurrent claim is single use; identical retries work; conflicting retry rejects', async () => {
  assets.clear(); const i = await finalized();
  const same = await Promise.all([submit('claim', i.intentId), submit('claim', i.intentId)]);
  assert.deepEqual(same.map(r => r.status).sort(), [200, 201]);
  assert.equal((await submit('claim-different', i.intentId)).status, 409);
  assert.equal((await submit('claim', (await intent()).data.intentId)).status, 409);
  assert.equal((await call(`${root}/${i.intentId}/finalize`, upload(i))).status, 409);
  const other = await finalized();
  const races = await Promise.all([submit('race-a', other.intentId), submit('race-b', other.intentId)]);
  assert.deepEqual(races.map(r => r.status).sort(), [201, 409]);
});
test('download rechecks assignment after provider fetch; denies admins, other students and missing or changed assets', async () => {
  assets.clear(); const i = await finalized(); const r = await submit('download', i.intentId);
  const route = `/coordinator/workplace-support/${r.data.id}/attachment`;
  assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 200);
  for (const who of ['attachment-admin', 'attachment-former', 'attachment-other']) assert.equal((await call(route, undefined, who)).status, 403);
  assert.equal((await call(`/student/workplace-support/${r.data.id}/attachment`, undefined, 'attachment-other')).status, 403);
  await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-former' });
  assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 403);
  assert.equal((await call(route, undefined, 'attachment-former')).status, 200);
  await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-coordinator' });
  const original = adapter.download;
  adapter.download = async (...args) => { const result = await original(...args); await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-former' }); return result; };
  try { assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 403); }
  finally { adapter.download = original; await db.collection('sections').doc('attachment-section').update({ coordinatorId: 'attachment-coordinator' }); }
  assets.get(i.publicId).bytes = Buffer.from('changed');
  assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 400);
  assets.clear(); assert.equal((await call(route, undefined, 'attachment-coordinator')).status, 400);
});
test('cleanup bounds expired support intents, preserves claimed assets and retries failed deletion', async () => {
  const { cleanupSupportAttachments } = require('../workplaceSupportAttachments');
  assets.clear(); const claimed = await finalized(); await submit('cleanup-claimed', claimed.intentId);
  const orphan = (await intent()).data; upload(orphan);
  await db.collection('workplaceSupportAttachmentIntents').doc(orphan.intentId).update({ expiresAt: 1, cleanupAfter: 1 });
  const destroy = adapter.destroy; adapter.destroy = async () => { throw new Error('provider failure'); };
  await cleanupSupportAttachments({ db, uploads: adapter, now: Date.now(), limit: 1 });
  assert.ok(assets.has(orphan.publicId));
  adapter.destroy = destroy;
  await cleanupSupportAttachments({ db, uploads: adapter, now: Date.now() + 120000, limit: 1 });
  assert.ok(!assets.has(orphan.publicId)); assert.ok(assets.has(claimed.publicId));
  assert.equal((await db.collection('workplaceSupportAttachmentIntents').doc(orphan.intentId).get()).data().status, 'deleted');
});
test('fresh password lock and epoch changes deny intent, finalize, submit and download after middleware', async () => {
  assets.clear(); const i = await finalized(); const submitted = await submit('password-download', i.intentId);
  const pending = (await intent()).data; const receipt = upload(pending);
  const ready = await finalized();
  try {
    for (const change of [{ passwordChangeRequired: true }, { passwordEpoch: 'changed-after-auth' }, { disabled: true }, { status: 'inactive' }]) {
      middlewareRace = change;
      for (const [route, body] of [[`${root}/intents`, { contentType: 'application/pdf' }], [`${root}/${pending.intentId}/finalize`, receipt], ['/student/workplace-support', { requestId: 'locked-submit', description: 'help', immediateSafety: false, attachmentIntentId: ready.intentId }], [`/student/workplace-support/${submitted.data.id}/attachment`, undefined]]) {
        await seed('attachment-student', student);
        assert.equal((await call(route, body)).status, 403);
      }
    }
  } finally { middlewareRace = null; await seed('attachment-student', student); }
});
test('fresh coordinator approval and password changes revoke reads, events and attachment delivery', async () => {
  const original = { role: 'coordinator', accountApproved: true, department: 'D' };
  assets.clear(); const i = await finalized(); const report = await submit('coordinator-revocation', i.intentId);
  const root = `/coordinator/workplace-support/${report.data.id}`;
  try {
    for (const change of [{ accountApproved: false }, { passwordChangeRequired: true }, { passwordEpoch: 'new-epoch' }]) {
      for (const [route, body] of [[root, undefined], [root + '/events', undefined], [root + '/attachment', undefined], ['/coordinator/workplace-support-notices', undefined], [root + '/events', { requestId: 'denied-event', expectedVersion: 1, action: 'acknowledge' }]]) {
        await seed('attachment-coordinator', original); middlewareRace = change;
        assert.equal((await call(route, body, 'attachment-coordinator')).status, 403);
      }
    }
    assert.equal((await db.collection('workplaceSupportReports').doc(report.data.id).get()).data().version, 1);
  } finally { middlewareRace = null; await seed('attachment-coordinator', original); }
});

test('cleanup transaction revokes racing claims before deletion; claimed and non-support assets survive', async () => {
  const { cleanupSupportAttachments } = require('../workplaceSupportAttachments');
  assets.clear(); const committed = await finalized(); await submit('cleanup-survivor', committed.intentId);
  await db.collection('workplaceSupportAttachmentIntents').doc(committed.intentId).update({ expiresAt: 1, cleanupAfter: 1 });
  const orphan = await finalized();
  await db.collection('workplaceSupportAttachmentIntents').doc(orphan.intentId).update({ expiresAt: 1, cleanupAfter: 1 });
  await db.collection('workplaceSupportAttachmentIntents').doc('not-support').set({ uid: 'attachment-student', status: 'ready', expiresAt: 1, cleanupAfter: 1, publicId: 'pathway/requirements/keep.pdf' });
  let release, started;
  const deleting = new Promise(r => { started = r; }); const barrier = new Promise(r => { release = r; });
  const destroy = adapter.destroy;
  adapter.destroy = async record => { started(); await barrier; await destroy(record); };
  const cleanup = cleanupSupportAttachments({ db, uploads: adapter, now: Date.now(), limit: 25 });
  try {
    await deleting;
    assert.equal((await db.collection('workplaceSupportAttachmentIntents').doc(orphan.intentId).get()).data().status, 'deleting');
    assert.equal((await submit('cleanup-race', orphan.intentId)).status, 409);
  } finally { release(); await cleanup; adapter.destroy = destroy; }
  assert.ok(assets.has(committed.publicId));
  assert.equal((await db.collection('workplaceSupportAttachmentIntents').doc('not-support').get()).data().status, 'ready');
});
