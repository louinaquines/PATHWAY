const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { concernFixture } = require('./concern-fixture');
const { createWorkplaceJournalWorker } = require('../workplaceJournalWorker');
const { installWorkplaceConcernReview, purgeExpiredConcernEvidence } = require('../workplaceConcernReview');
let f, id, version, seq;
const root = '/coordinator/workplace-concerns';
before(async () => { f = await concernFixture(installWorkplaceConcernReview); }); after(async () => { if (f) await f.close(); });
beforeEach(async () => {
  await f.reset(); await f.job(); await createWorkplaceJournalWorker({ db: f.db, clock: f.clock, enabled: true, analyzer: f.analyzer }).runBatch();
  id = (await f.case()).id; version = 1; seq = 0;
});
async function action(type, extra = {}, patch = {}) {
  const result = await f.post(`${root}/${id}/action`, { action: type, expectedVersion: version, requestId: `a-${++seq}`, ...extra, ...patch });
  if (result.status === 200) version = result.data.version; return result;
}
test('local-only installer is default off and refuses non-demo databases', () => {
  const app = { post() { assert.fail('Disabled route registered'); } };
  installWorkplaceConcernReview({ app }); installWorkplaceConcernReview({ app, db: { projectId: 'real-project' }, enabled: true });
});
test('list and notices contain no evidence; detail is authorized and reading does not resolve', async () => {
  const list = await f.post(`${root}/list`); assert.equal(list.status, 200); assert.equal(list.cache, 'private, no-store');
  assert.equal(list.data.records.length, 1); assert.equal(JSON.stringify(list.data).includes('threatened'), false);
  const detail = await f.post(`${root}/${id}/detail`); assert.equal(detail.data.findings[0].quote, 'threatened to hit me now');
  const notices = await f.post(`${root}/notices/list`); assert.equal(notices.data.records.length, 1);
  assert.equal(JSON.stringify(notices.data).includes('threatened'), false);
  assert.equal((await f.post(`${root}/notices/${notices.data.records[0].id}/read`)).status, 200);
  assert.equal((await f.case()).data().state, 'open');
});
test('reassignment and actor revocation deny old detail/list/action and old notice reads', async () => {
  const notices = await f.post(`${root}/notices/list`), noticeId = notices.data.records[0].id;
  await f.db.doc('sections/c-section').update({ coordinatorId: 'c-other' });
  assert.equal((await f.post(`${root}/${id}/detail`)).status, 403);
  assert.equal((await f.post(`${root}/list`)).data.records.length, 0);
  assert.equal((await f.post(`${root}/notices/${noticeId}/read`)).status, 403);
  assert.equal((await action('review')).status, 403);
  assert.equal((await f.post(`${root}/${id}/detail`, {}, 'c-other')).status, 200);
  for (const patch of [{ role: 'admin' }, { disabled: true }, { passwordEpoch: 'new' }, { passwordChangeRequired: true }]) {
    await f.db.doc('users/c-other').set({ role: 'coordinator', accountApproved: true, department: 'CTE' });
    f.setAfterAuth(() => f.db.doc('users/c-other').update(patch));
    assert.equal((await f.post(`${root}/${id}/detail`, {}, 'c-other')).status, 403);
  }
});
test('request validation, anonymous access and non-coordinators fail without case-existence leakage', async () => {
  assert.equal((await f.post(`${root}/list`, {}, '')).status, 401);
  assert.equal((await f.post(`${root}/list`, {}, 'c-student')).status, 403);
  assert.equal((await f.post(`${root}/list`, { extra: 'x' })).status, 400);
  assert.equal((await f.post(`${root}/list`, { cursor: 'forged' })).status, 400);
  assert.equal((await f.post(`${root}/${id}/detail`, { extra: true })).status, 400);
  assert.deepEqual((await f.post(`${root}/missing/detail`)).data, (await f.post(`${root}/${id}/detail`, {}, 'c-other')).data);
  assert.equal((await action('dismiss_false_positive', { note: '' })).status, 400);
  assert.equal((await action('review', { extra: true })).status, 400);
  assert.equal((await action('__proto__')).status, 400);
});
test('failed contact remains open; genuine resolution requires review, successful contact, action and reason', async () => {
  assert.equal((await action('resolve', { note: 'Complete' })).status, 409);
  assert.equal((await action('review')).status, 200);
  assert.equal((await action('contact', { outcome: 'failed', note: 'No reply yet' })).status, 200);
  assert.equal((await action('resolve', { note: 'Complete' })).status, 409);
  assert.equal((await f.case()).data().state, 'open');
  await action('contact', { outcome: 'success', note: 'Spoke privately' });
  assert.equal((await action('resolve', { note: 'Complete' })).status, 409);
  await action('act', { note: 'Agreed safety follow-up' }); await action('resolve', { note: 'Student confirmed concern addressed' });
  const saved = (await f.case()).data(); assert.equal(saved.state, 'resolved');
  assert.equal(saved.evidenceDeleteAt, '2027-01-20T12:00:00.000Z');
  assert.equal((await action('review')).status, 409);
});
test('justified false-positive dismissal requires no contact; receipts and audit retain no notes', async () => {
  const body = { action: 'dismiss_false_positive', note: 'PRIVATE training example, not an incident', expectedVersion: 1, requestId: 'dismiss-one' };
  const first = await f.post(`${root}/${id}/action`, body); assert.equal(first.status, 200);
  assert.equal((await f.case()).data().contacted, false);
  assert.equal((await f.case()).data().state, 'dismissed_false_positive');
  assert.equal((await f.post(`${root}/${id}/action`, body)).status, 200);
  assert.equal((await f.post(`${root}/${id}/action`, { ...body, note: 'Different' })).status, 409);
  for (const col of ['auditLogs','workplaceConcernReceipts','workplaceConcernNotices']) {
    const docs = await f.db.collection(col).get(); assert.equal(JSON.stringify(docs.docs.map(d => d.data())).includes('PRIVATE'), false);
  }
});
test('concurrent actions use optimistic version and audit failure rolls all writes back', async () => {
  f.setFailAudit(true); assert.equal((await action('review')).status, 503); assert.equal((await f.case()).data().version, 1);
  assert.equal((await f.db.collection('workplaceConcernReceipts').get()).size, 0); f.setFailAudit(false);
  const a = await Promise.all(['one','two'].map(requestId => f.post(`${root}/${id}/action`, { action: 'review', requestId, expectedVersion: 1 })));
  assert.deepEqual(a.map(r => r.status).sort(), [200,409]);
});
test('priority overrides require reason; private history is bounded without silent truncation', async () => {
  assert.equal((await action('change_priority', { priority: 'normal', note: 'Coordinator reviewed context' })).status, 200);
  assert.equal((await f.case()).data().priority, 'normal');
  await (await f.case()).ref.update({ history: Array.from({ length: 100 }, () => ({ action: 'review' })) });
  assert.equal((await action('review')).status, 409); assert.equal((await f.case()).data().history.length, 100);
});
test('exact expiry suppresses evidence before cleanup and cleanup preserves open cases/original journal', async () => {
  await action('dismiss_false_positive', { note: 'PRIVATE explanatory notes' });
  f.setTime('2027-01-20T11:59:59.999Z'); assert.equal((await f.post(`${root}/${id}/detail`)).data.findings.length, 1);
  f.setTime('2027-01-20T12:00:00.000Z'); const expired = await f.post(`${root}/${id}/detail`);
  assert.equal(expired.data.evidenceExpired, true); assert.equal(expired.data.findings, undefined); assert.equal(expired.data.history[0].note, undefined);
  await purgeExpiredConcernEvidence({ db: f.db, clock: f.clock, limit: 20 });
  const purged = (await f.case()).data(); assert.equal(purged.evidencePurged, true); assert.equal(purged.findings, undefined); assert.equal(purged.history[0].note, undefined);
  assert.equal(JSON.stringify(purged).includes('PRIVATE'), false);
  assert.ok((await f.db.doc('users/c-student/logbook/entry').get()).data().rawNotes);
  await purgeExpiredConcernEvidence({ db: f.db, clock: f.clock, limit: 20 });
  await (await f.case()).ref.set({ ...purged, state: 'open', findings: [{ quote: 'Open evidence' }], evidencePurged: false });
  await purgeExpiredConcernEvidence({ db: f.db, clock: f.clock, limit: 20 }); assert.ok((await f.case()).data().findings);
});
test('actor-scoped cursor advances over denied head rows without disclosing their identities', async () => {
  const original = (await f.case()).data();
  for (let i = 0; i < 21; i++) await f.db.doc(`workplaceConcernCases/0-${String(i).padStart(2,'0')}`).set({ ...original, studentId: 'missing-student' });
  const first = await f.post(`${root}/list`); assert.equal(first.data.records.length, 0); assert.equal(first.data.hasMore, true);
  assert.equal(JSON.stringify(first.data).includes('missing-student'), false);
  assert.equal((await f.post(`${root}/list`, { cursor: first.data.cursor }, 'c-other')).status, 400);
  const next = await f.post(`${root}/list`, { cursor: first.data.cursor }); assert.equal(next.data.records.length, 1);
});
test('cleanup racing a closed-case action never restores sensitive evidence or reopens the case', async () => {
  await action('dismiss_false_positive', { note: 'PRIVATE closure evidence' });
  f.setTime('2027-01-20T12:00:00.000Z');
  const [cleanup, attempted] = await Promise.all([purgeExpiredConcernEvidence({ db: f.db, clock: f.clock }), action('review')]);
  assert.equal(cleanup.status, 'complete'); assert.equal(attempted.status, 409);
  const saved = (await f.case()).data(); assert.equal(saved.state, 'dismissed_false_positive');
  assert.equal(saved.findings, undefined); assert.equal(saved.history[0].note, undefined);
});

test('closed audit survives without notes at ninety days, then all endpoints hide it at twelve months', async () => {
  const body = { action: 'dismiss_false_positive', expectedVersion: 1, requestId: 'retention-close', note: 'PRIVATE closure' };
  assert.equal((await f.post(`${root}/${id}/action`, body)).status, 200);
  const notices = await f.post(`${root}/notices/list`), noticeId = notices.data.records[0].id;
  assert.equal((await f.case()).data().auditDeleteAt, '2027-10-22T12:00:00.000Z');
  f.setTime('2027-01-20T12:00:00Z');
  const safe = (await f.post(`${root}/${id}/detail`)).data;
  assert.equal(safe.evidenceExpired, true); assert.equal(safe.history[0].action, 'dismiss_false_positive');
  assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
  f.setTime('2027-10-22T12:00:00Z');
  assert.deepEqual((await f.post(`${root}/list`)).data.records, []);
  assert.deepEqual((await f.post(`${root}/notices/list`)).data.records, []);
  for (const path of [`/${id}/detail`, `/notices/${noticeId}/read`]) assert.equal((await f.post(root + path)).status, 403);
  assert.equal((await f.post(`${root}/${id}/action`, body)).status, 403);
});

test('malformed closed timestamps hide the whole case; valid legacy closure derives anniversary', async () => {
  await (await f.case()).ref.update({ state: 'resolved', closedAt: '2026-10-22T12:00:00Z' });
  f.setTime('2027-10-22T12:00:00Z'); assert.equal((await f.post(`${root}/${id}/detail`)).status, 403);
  f.setTime('2026-10-23T00:00:00Z'); await (await f.case()).ref.update({ closedAt: 'bad' });
  assert.deepEqual((await f.post(`${root}/list`)).data.records, []);
  assert.equal((await f.post(`${root}/${id}/detail`)).status, 403);
});

test('expiry between initial access and fresh response suppresses detail, lists and receipt replay', async () => {
  const body = { action: 'dismiss_false_positive', expectedVersion: 1, requestId: 'cross-boundary', note: 'PRIVATE' };
  assert.equal((await f.post(`${root}/${id}/action`, body)).status, 200);
  for (const [path, payload] of [[`${root}/${id}/detail`, {}], [`${root}/list`, {}], [`${root}/notices/list`, {}], [`${root}/${id}/action`, body]]) {
    let calls = 0; f.setClock(() => new Date(++calls === 1 ? '2027-10-22T11:59:59.999Z' : '2027-10-22T12:00:00Z'));
    const response = await f.post(path, payload);
    if (path.endsWith('/list')) assert.deepEqual(response.data.records, []);
    else assert.equal(response.status, 403);
    assert.equal(JSON.stringify(response.data).includes('PRIVATE'), false);
  }
});

test('expiry inside the fresh assignment reads cannot leak any endpoint response', async () => {
  const body = { action: 'dismiss_false_positive', expectedVersion: 1, requestId: 'inside-boundary', note: 'PRIVATE' };
  assert.equal((await f.post(`${root}/${id}/action`, body)).status, 200);
  const noticeId = (await f.post(`${root}/notices/list`)).data.records[0].id;
  for (const [path, payload] of [[`${root}/${id}/detail`, {}], [`${root}/list`, {}], [`${root}/notices/list`, {}], [`${root}/${id}/action`, body], [`${root}/notices/${noticeId}/read`, {}]]) {
    let assignmentReads = 0;
    const profile = f.db.doc('users/c-student'), originalGet = f.db.runTransaction.bind(f.db);
    // Keep real transactions/queries: only inject elapsed time after the second assignment read.
    f.db.runTransaction = (work, ...args) => originalGet(async tx => {
      const get = tx.get.bind(tx);
      tx.get = async (...params) => { const result = await get(...params); if (params[0]?.path === profile.path && ++assignmentReads === 2) f.setTime('2027-10-22T12:00:00Z'); return result; };
      return work(tx);
    }, ...args);
    f.setTime('2027-10-22T11:59:59.999Z');
    try {
      const response = await f.post(path, payload);
      if (path.endsWith('/list')) assert.deepEqual(response.data.records, []);
      else assert.equal(response.status, 403);
    } finally { f.db.runTransaction = originalGet; }
  }
});

test('observed evidence and audit expiry cannot reverse after server clock rollback', async () => {
  await f.post(`${root}/${id}/action`, { action: 'dismiss_false_positive', expectedVersion: 1, requestId: 'rollback-close', note: 'PRIVATE' });
  f.setTime('2027-01-20T12:00:00Z'); assert.equal((await f.post(`${root}/${id}/detail`)).data.evidenceExpired, true);
  f.setTime('2027-01-20T11:59:59Z'); const hidden = await f.post(`${root}/${id}/detail`);
  assert.equal(hidden.data.evidenceExpired, true); assert.equal(hidden.data.findings, undefined);
  f.setTime('2027-10-22T12:00:00Z'); assert.equal((await f.post(`${root}/${id}/detail`)).status, 403);
  f.setTime('2027-10-22T11:59:59Z'); assert.equal((await f.post(`${root}/${id}/detail`)).status, 403);
});

test('expiry while authorizing a later list row also removes earlier projected rows', async () => {
  await f.post(`${root}/${id}/action`, { action: 'dismiss_false_positive', expectedVersion: 1, requestId: 'list-crossing', note: 'PRIVATE' });
  await f.db.doc('workplaceConcernCases/0-earlier').set((await f.case()).data());
  const original = f.db.runTransaction.bind(f.db); let reads = 0;
  f.db.runTransaction = (work, ...args) => original(async tx => {
    const get = tx.get.bind(tx);
    tx.get = async (...params) => { const result = await get(...params); if (params[0]?.path === 'users/c-student' && ++reads === 4) f.setTime('2027-10-22T12:00:00Z'); return result; };
    return work(tx);
  }, ...args);
  f.setTime('2027-10-22T11:59:59.999Z');
  try { assert.deepEqual((await f.post(`${root}/list`)).data.records, []); }
  finally { f.db.runTransaction = original; }
});
