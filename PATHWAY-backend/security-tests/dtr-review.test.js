const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installDtrReview } = require('../dtrReview');
function fixture({ owns = true, role = 'coordinator', exists = true } = {}) {
  let handler, reads = 0;
  const query = { where() { return this; }, limit() { return this; }, async get() {
    reads++; return { size: 1, docs: [{ data: () => ({ date: '2026-10-01', timeIn: '2026-10-01T00:00:00Z', timeOut: '2026-10-01T09:00:00Z' }) }] };
  } };
  installDtrReview({ app: { get() {}, post(path, middleware, fn) { handler = fn; } },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists, data: () => ({ role: 'student' }) }), collection: () => query }) }) },
    requireStaff() {}, coordinatorOwnsStudent: async () => owns, allowRate: () => true });
  const req = { staff: { uid: 'staff', role }, params: { studentId: 'student' }, body: { form: { year: 2026, month: 10, copies: [[{ day: 1, amArrival: '08:00', amDeparture: '12:00', pmArrival: '13:00', pmDeparture: '17:00' }]] } } };
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  return { req, res, run: () => handler(req, res), reads: () => reads };
}
test('assigned coordinator compares server attendance, ignoring client records', async () => {
  const f = fixture(); f.req.body.attendance = [];
  await f.run(); assert.equal(f.res.code, 200);
  assert.equal(f.res.body.results[0].status, 'endpoints_match'); assert.equal(f.reads(), 1);
});
test('outsider and missing student cannot read attendance', async () => {
  for (const options of [{ owns: false }, { exists: false }, { role: 'admin' }, { role: 'student' }]) {
    const f = fixture(options); await f.run(); assert.equal(f.res.code, 403); assert.equal(f.reads(), 0);
  }
});
test('malformed period and student id rejected before attendance reads', async () => {
  const f = fixture(); f.req.body.form.month = 13; await f.run(); assert.equal(f.res.code, 400); assert.equal(f.reads(), 0);
  const g = fixture(); g.req.params.studentId = '../student'; await g.run(); assert.equal(g.res.code, 400);
});

test('submitted source is assignment-protected and rejects replaced file versions', async () => {
  let handler, streamed = 0, owns = true;
  const student = { role: 'student', requirements: { dtr: { fileName: 'test.pdf', cloudinaryAssetId: 'asset-1' } } };
  installDtrReview({ app: { get(path, middleware, fn) { handler = fn; }, post() {} },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => student }) }) }) },
    requireStaff() {}, coordinatorOwnsStudent: async () => owns, allowRate: () => true,
    streamAuthenticatedRequirement: async (res, context) => { streamed++; assert.equal(context.requirementId, 'dtr'); } });
  const req = { staff: { uid: 'staff', role: 'coordinator' }, params: { studentId: 'student' }, query: {} };
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler(req, res); const version = res.body.version;
  assert.match(version, /^[a-f0-9]{64}$/); assert.equal(res.body.fileName, 'test.pdf');
  req.query.version = version; await handler(req, res); assert.equal(streamed, 1);
  student.requirements.dtr.cloudinaryAssetId = 'replacement';
  await handler(req, res); assert.equal(res.code, 409); assert.equal(streamed, 1);
  owns = false; req.query = {}; await handler(req, res); assert.equal(res.code, 403);
});

test('save recomputes attendance, is idempotent, and blocks stale/cleared/outsider reviews', async () => {
  const routes = {}; let stored, writes = 0, owns = true;
  const student = { role: 'student', requirements: { dtr: { fileName: 'test.pdf', cloudinaryAssetId: 'asset' } } };
  const savedRef = { kind: 'saved' };
  const query = { kind: 'query', where() { return this; }, limit() { return this; } };
  const userRef = { kind: 'user', get: async () => ({ exists: true, data: () => student }), collection(name) { return name === 'attendance' ? query : { doc: () => savedRef }; } };
  const tx = { async get(ref) {
    if (ref.kind === 'user') return { exists: true, data: () => student };
    if (ref.kind === 'saved') return { exists: Boolean(stored), data: () => stored };
    return { size: 0, docs: [] };
  }, set(ref, entry) { assert.equal(ref, savedRef); stored = entry; writes++; } };
  installDtrReview({ app: { get(path, middleware, fn) { routes[`GET ${path}`] = fn; }, post(path, middleware, fn) { routes[`POST ${path}`] = fn; } },
    db: { collection: () => ({ doc: () => userRef }), runTransaction: fn => fn(tx) }, requireStaff() {},
    coordinatorOwnsStudent: async () => owns, allowRate: () => true,
    assertRecordsOpen(value) { if (value.clearanceStatus === 'cleared') throw Object.assign(new Error('Locked'), { status: 409 }); },
    writeAuditInTransaction() {} });
  const req = { staff: { uid: 'staff', role: 'coordinator' }, params: { studentId: 'student' }, query: {}, body: {} };
  const res = { code: 200, set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await routes['GET /coordinator/students/:studentId/dtr/source'](req, res);
  req.body = { sourceVersion: res.body.version, reviewId: 'test-review-123456', form: { year: 2026, month: 10, copies: [[{ day: 1, amArrival: '08:00', amDeparture: '12:00' }]] }, comparison: { forged: true } };
  const save = () => routes['POST /coordinator/students/:studentId/dtr/reviews'](req, res);
  await save(); assert.equal(writes, 1); assert.equal(stored.comparison.attendanceModified, false); assert.equal(stored.comparison.forged, undefined);
  await save(); assert.equal(writes, 1);
  req.body.notes = 'Different findings'; await save(); assert.equal(res.code, 409); assert.equal(writes, 1);
  req.body.notes = '';
  student.requirements.dtr.cloudinaryAssetId = 'changed'; await save(); assert.equal(res.code, 409); assert.equal(writes, 1);
  student.clearanceStatus = 'cleared'; await save(); assert.equal(res.code, 409);
  owns = false; await save(); assert.equal(res.code, 403);
});
