const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSchedule, installCoordinatorAnalytics } = require('../coordinatorAnalytics');
const schedule = { startDate: '2026-10-01', deadline: '2026-12-31', startTime: '08:00', workingDays: [1,2,3,4,5], exceptions: [] };
test('validates schedule without normalizing invalid calendar dates', () => {
  assert.deepEqual(validateSchedule(schedule), schedule);
  for (const change of [{ startDate: '2026-02-30' }, { deadline: '2026-01-01' }, { workingDays: [] }, { startTime: '25:00' }, { exceptions: ['bad'] }]) assert.throws(() => validateSchedule({ ...schedule, ...change }));
});
test('outsider denied before analytics student reads or schedule writes', async () => {
  const routes = {}; let accessed = false;
  installCoordinatorAnalytics({ app: { get(path, middleware, fn) { routes.get = fn; }, put(path, middleware, fn) { routes.put = fn; } }, db: { collection() { accessed = true; } }, requireStaff() {}, allowRate: () => true,
    coordinatorSection: async () => { throw Object.assign(new Error('Denied'), { status: 403 }); } });
  const req = { staff: { uid: 'outsider' }, params: { sectionId: 'section' }, body: { schedule } };
  const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  await routes.get(req, res); assert.equal(res.code, 403);
  await routes.put(req, res); assert.equal(res.code, 403); assert.equal(accessed, false);
});
test('assigned analytics uses credited daily hours and profile total, not journal totals', async () => {
  let handler;
  const attendance = { where() { return this; }, limit() { return this; }, get: async () => ({ size: 0, docs: [] }) };
  const students = { where() { return this; }, limit() { return this; }, get: async () => ({ size: 1, docs: [{ id: 'student', data: () => ({ department: 'IT', accountApproved: true, hoursRendered: 120, hoursRequired: 540, journalHours: 165 }), ref: { collection: () => attendance } }] }) };
  installCoordinatorAnalytics({ app: { get(path, middleware, fn) { handler = fn; }, put() {} }, db: { collection: () => students }, requireStaff() {}, allowRate: () => true, coordinatorSection: async () => ({ data: () => ({ name: 'BSIT 4G', department: 'IT' }) }) });
  const res = { set() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section' } }, res);
  assert.equal(res.body.totalHoursLogged, 120); assert.equal(res.body.students[0].attendanceRate, null); assert.equal(res.body.students[0].status, 'Unavailable');
});
