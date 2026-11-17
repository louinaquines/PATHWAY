const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compareDtr } = require('../dtrComparison');
const classify = comparison => require('../dtrEscalation').classifyEscalation(comparison);
const form = rows => ({ year: 2026, month: 10, copies: [rows] });
const row = (day, end = '12:00') => ({ day, amArrival: '08:00', amDeparture: end });
const log = (day, end = '04:00') => ({ date: `2026-10-${String(day).padStart(2, '0')}`, timeIn: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z`, timeOut: `2026-10-${String(day).padStart(2, '0')}T${end}:00Z` });

function harness(db, audit) {
  const routes = {};
  require('../dtrReview').installDtrReview({ app: {
    get(path, middleware, fn) { routes[`GET ${path}`] = fn; },
    post(path, middleware, fn) { routes[`POST ${path}`] = fn; },
  }, db, requireStaff() {}, allowRate: () => true, coordinatorOwnsStudent: async () => true,
  assertRecordsOpen(student) { if (student.clearanceStatus === 'cleared') throw Object.assign(new Error('Locked'), { status: 409 }); },
  writeAuditInTransaction: audit || ((tx, event) => tx.set(db.collection('auditLogs').doc(), event)) });
  const req = { staff: { uid: 'staff', role: 'coordinator' }, params: { studentId: 'student' }, query: {}, body: {} };
  const call = async (method, suffix) => {
    const res = { code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await routes[`${method} /coordinator/students/:studentId/dtr/${suffix}`](req, res);
    return res;
  };
  return { req, call, async prepare() {
    const source = await call('GET', 'source');
    req.body = { form: form([row(1, '12:16')]), sourceVersion: source.body.version, reviewId: 'review-1234567890', notes: 'private notes' };
  } };
}
function memoryDb() {
  let serial = 0;
  const values = new Map([
    ['users/staff', { role: 'coordinator', department: 'IT', accountApproved: true }],
    ['sections/s', { coordinatorId: 'staff', department: 'IT' }],
    ['users/student', { role: 'student', department: 'IT', sectionId: 's', requirements: { dtr: { fileName: 'test.pdf', cloudinaryAssetId: 'asset' } } }],
    ['users/student/attendance/a', log(1)],
  ]);
  function ref(path, filters = [], ordering = null, cap = Infinity) {
    return { path, id: path.split('/').at(-1), doc: id => ref(`${path}/${id || `auto${++serial}`}`), collection: name => ref(`${path}/${name}`),
      where: (field, op, value) => ref(path, [...filters, [field, op, value]], ordering, cap),
      orderBy: (field, direction) => ref(path, filters, [field, direction], cap), limit: n => ref(path, filters, ordering, n),
      async get() {
        if (path.split('/').length % 2 === 0) return { exists: values.has(path), data: () => structuredClone(values.get(path)), id: path.split('/').at(-1) };
        let entries = [...values].filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && filters.every(([f, op, v]) => op === '>=' ? data[f] >= v : op === '<=' ? data[f] <= v : data[f] === v));
        if (ordering) entries.sort((a, b) => String(a[1][ordering[0]]).localeCompare(String(b[1][ordering[0]])) * (ordering[1] === 'desc' ? -1 : 1));
        const docs = entries.slice(0, cap).map(([key, data]) => ({ id: key.split('/').at(-1), data: () => structuredClone(data) }));
        return { docs, size: docs.length };
      } };
  }
  return { values, collection: name => ref(name), async runTransaction(fn) {
    const pending = []; let writing = false;
    const result = await fn({ get(ref) { assert.equal(writing, false, 'Firestore reads must precede writes'); return ref.get(); }, set(ref, value) { writing = true; pending.push([ref.path, structuredClone(value)]); } });
    pending.forEach(([key, value]) => values.set(key, value)); return result;
  } };
}

test('save atomically creates one queue entry and generic notice across retries and different reviews', async () => {
  const db = memoryDb(), h = harness(db); await h.prepare();
  let response = await h.call('POST', 'reviews'); assert.equal(response.code, 200);
  assert.equal(response.body.review.escalation.status, 'needs_verification');
  await h.call('POST', 'reviews');
  h.req.body.reviewId = 'another-review-1234'; await h.call('POST', 'reviews');
  const entries = [...db.values].filter(([key]) => key.startsWith('dtrEscalations/'));
  const notices = [...db.values].filter(([key]) => key.startsWith('notifications/'));
  assert.equal(entries.length, 1); assert.equal(notices.length, 1);
  assert.equal(notices[0][1].recipientId, 'staff');
  assert.doesNotMatch(JSON.stringify(notices[0][1]), /private notes|12:16|08:00|misconduct/i);
  assert.deepEqual(db.values.get('users/student/attendance/a'), log(1));
  assert.equal([...db.values].filter(([key]) => key.startsWith('auditLogs/')).length, 2);
});
test('unflagged review remains savable without a queue or notice', async () => {
  const db = memoryDb(), h = harness(db); await h.prepare(); h.req.body.form = form([row(1)]);
  const response = await h.call('POST', 'reviews'); assert.equal(response.code, 200);
  assert.equal(response.body.review.escalation, null);
  assert.equal([...db.values.keys()].some(k => /^(dtrEscalations|notifications)\//.test(k)), false);
});
test('fresh actor, assignment, file and clearance gates reject even exact retries', async () => {
  for (const mutate of [
    db => { db.values.get('users/staff').disabled = true; },
    db => { db.values.get('users/staff').role = 'admin'; },
    db => { db.values.get('users/staff').accountApproved = false; },
    db => { db.values.get('sections/s').coordinatorId = 'replacement'; },
    db => { db.values.get('users/student').department = 'other'; },
    db => { db.values.get('users/student').requirements.dtr.cloudinaryAssetId = 'new'; },
    db => { db.values.get('users/student').clearanceStatus = 'cleared'; },
  ]) {
    const db = memoryDb(), h = harness(db); await h.prepare();
    assert.equal((await h.call('POST', 'reviews')).code, 200);
    mutate(db); const before = structuredClone([...db.values]);
    assert.ok([403, 409].includes((await h.call('POST', 'reviews')).code));
    assert.deepEqual([...db.values], before);
  }
});
test('audit failure rolls review, queue and notice back together', async () => {
  const db = memoryDb(), h = harness(db, () => { throw new Error('audit unavailable'); }); await h.prepare();
  const before = structuredClone([...db.values]);
  assert.equal((await h.call('POST', 'reviews')).code, 500);
  assert.deepEqual([...db.values], before);
});
test('notice write failure aborts review, queue and audit instead of saving partially', async () => {
  const db = memoryDb(), run = db.runTransaction.bind(db);
  db.runTransaction = fn => run(tx => fn({ ...tx, set(ref, value) {
    if (ref.path.startsWith('notifications/')) throw new Error('notice storage failed');
    tx.set(ref, value);
  } }));
  const h = harness(db); await h.prepare(); const before = structuredClone([...db.values]);
  assert.equal((await h.call('POST', 'reviews')).code, 500);
  assert.deepEqual([...db.values], before);
});
test('deduplication key separates source versions and periods for the same student', async () => {
  const db = memoryDb(), h = harness(db); await h.prepare();
  assert.equal((await h.call('POST', 'reviews')).code, 200);
  db.values.get('users/student').requirements.dtr.cloudinaryAssetId = 'second-file';
  await h.prepare(); h.req.body.reviewId = 'new-source-1234567';
  assert.equal((await h.call('POST', 'reviews')).code, 200);
  h.req.body.reviewId = 'new-period-1234567'; h.req.body.form.month = 9;
  assert.equal((await h.call('POST', 'reviews')).code, 200);
  assert.equal([...db.values.keys()].filter(k => k.startsWith('dtrEscalations/')).length, 3);
  assert.equal([...db.values.keys()].filter(k => k.startsWith('notifications/')).length, 3);
});
test('history hides replaced source and denies stale assignment/profile with no-store', async () => {
  const db = memoryDb(), h = harness(db); await h.prepare(); await h.call('POST', 'reviews');
  let response = await h.call('GET', 'reviews'); assert.equal(response.body.reviews.length, 1);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  db.values.get('users/student').requirements.dtr.cloudinaryAssetId = 'new';
  response = await h.call('GET', 'reviews'); assert.deepEqual(response.body.reviews, []);
  db.values.get('users/staff').disabled = true;
  assert.equal((await h.call('GET', 'reviews')).code, 403);
  db.values.get('users/staff').disabled = false;
  db.values.get('sections/s').coordinatorId = 'other';
  assert.equal((await h.call('GET', 'reviews')).code, 403);
  db.values.get('sections/s').coordinatorId = 'staff';
  db.values.get('users/student').clearanceStatus = 'cleared';
  assert.equal((await h.call('GET', 'reviews')).code, 409);
});

// Parent runs against its already-started emulator; never initialize a production client.
test('emulator: concurrent deduplication, atomic rollback and fresh access gates', { skip: !process.env.FIRESTORE_EMULATOR_HOST, timeout: 60000 }, async t => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1|\[::1\]):\d+$/);
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const { randomUUID } = require('node:crypto');
  const app = initializeApp({ projectId: 'demo-pathway-dtr-escalation' }, `dtr-${randomUUID()}`);
  const firestore = getFirestore(app);
  const prefix = `dtrTest_${randomUUID().replaceAll('-', '')}_`;
  const collections = ['users', 'sections', 'auditLogs', 'dtrEscalations', 'notifications'];
  const db = { collection: name => firestore.collection(`${prefix}${name}`), runTransaction: fn => firestore.runTransaction(fn) };
  const seed = memoryDb().values;
  try {
    for (const [path, value] of seed) {
      const [name, ...rest] = path.split('/'); await db.collection(name).doc(rest.join('/')).set(value);
    }
    await t.test('parallel saved reviews produce one queue and one notice', async () => {
      const a = harness(db), b = harness(db); await a.prepare(); await b.prepare();
      b.req.body.reviewId = 'parallel-review-1234';
      const responses = await Promise.all([a.call('POST', 'reviews'), b.call('POST', 'reviews')]);
      responses.forEach(r => assert.equal(r.code, 200));
      assert.equal((await db.collection('dtrEscalations').get()).size, 1);
      assert.equal((await db.collection('notifications').get()).size, 1);
      assert.equal((await db.collection('users').doc('student').collection('dtrReviews').get()).size, 2);
      assert.equal((await db.collection('auditLogs').get()).size, 2);
      assert.deepEqual((await db.collection('users').doc('student').collection('attendance').doc('a').get()).data(), log(1));
      assert.equal((await a.call('POST', 'reviews')).code, 200);
      assert.equal((await db.collection('auditLogs').get()).size, 2);
    });
    await t.test('audit exception aborts all four writes on a new source version', async () => {
      await db.collection('users').doc('student').update({ 'requirements.dtr.cloudinaryAssetId': 'new-asset' });
      const h = harness(db, () => { throw new Error('audit failed'); }); await h.prepare();
      h.req.body.reviewId = 'rollback-review-1234';
      assert.equal((await h.call('POST', 'reviews')).code, 500);
      assert.equal((await db.collection('dtrEscalations').get()).size, 1);
      assert.equal((await db.collection('notifications').get()).size, 1);
      assert.equal((await db.collection('users').doc('student').collection('dtrReviews').get()).size, 2);
    });
    await t.test('stale authenticated actor, transfer, replaced file and closed records fail closed', async () => {
      const h = harness(db); await h.prepare();
      await db.collection('users').doc('staff').update({ disabled: true });
      assert.equal((await h.call('POST', 'reviews')).code, 403);
      assert.equal((await h.call('GET', 'reviews')).code, 403);
      await db.collection('users').doc('staff').update({ disabled: false });
      await db.collection('sections').doc('s').update({ coordinatorId: 'other' });
      assert.equal((await h.call('POST', 'reviews')).code, 403);
      await db.collection('sections').doc('s').update({ coordinatorId: 'staff' });
      await db.collection('users').doc('student').update({ 'requirements.dtr.cloudinaryAssetId': 'replaced' });
      assert.equal((await h.call('POST', 'reviews')).code, 409);
      assert.deepEqual((await h.call('GET', 'reviews')).body.reviews, []);
      await db.collection('users').doc('student').update({ clearanceStatus: 'cleared' });
      assert.equal((await h.call('POST', 'reviews')).code, 409);
      assert.equal((await h.call('GET', 'reviews')).code, 409);
      assert.equal((await db.collection('dtrEscalations').get()).size, 1);
      assert.equal((await db.collection('notifications').get()).size, 1);
    });
  } finally {
    for (const name of collections) await firestore.recursiveDelete(db.collection(name));
    await deleteApp(app);
  }
});

test('daily threshold is strictly greater than 15 minutes; other dates are excluded', () => {
  assert.equal(classify(compareDtr(form([row(1, '12:15')]), [log(1), log(2)])), null);
  const result = classify(compareDtr(form([row(1, '12:16')]), [log(1)]));
  assert.equal(result.status, 'needs_verification');
  assert.deepEqual(result.reasons, ['daily_duration']);
});
test('monthly threshold compares represented totals and is strictly greater than 60', () => {
  const rows = Array.from({ length: 5 }, (_, i) => row(i + 1, '12:15'));
  const logs = rows.map(r => log(r.day));
  assert.equal(classify(compareDtr(form(rows.slice(0, 4)), logs)), null);
  assert.deepEqual(classify(compareDtr(form(rows), logs)).reasons, ['monthly_duration']);
});

test('opposite small daily differences do not invent a monthly total mismatch', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(i + 1, i % 2 ? '11:50' : '12:10'));
  assert.equal(classify(compareDtr(form(rows), rows.map(r => log(r.day)))), null);
});
test('break differences and uncertain OCR are verification only', () => {
  const r = { ...row(1), pmArrival: '13:00', pmDeparture: '17:00' };
  assert.equal(classify(compareDtr(form([r]), [log(1, '09:00')])).status, 'needs_verification');
  assert.deepEqual(classify(compareDtr(form([{ ...row(1), needsReview: true }]), [log(1)])).reasons, ['source_ambiguity']);
});
test('represented missing shifts, duplicates and overlaps escalate, including blank source shifts', () => {
  for (const [rows, logs, reason] of [
    [[row(1)], [], 'missing_shift'], [[{ day: 1 }], [log(1)], 'missing_shift'],
    [[row(1)], [log(1), log(1)], 'duplicate'],
    [[{ ...row(1), pmArrival: '11:00 AM', pmDeparture: '17:00' }], [log(1)], 'overlap'],
  ]) assert.ok(classify(compareDtr(form(rows), logs)).reasons.includes(reason));
  assert.equal(classify(compareDtr(form([{ day: 1 }]), [])), null);
});
