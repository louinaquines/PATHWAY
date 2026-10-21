const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateSchedule, installCoordinatorAnalytics } = require('../coordinatorAnalytics');
const { attendanceFixture } = require('./attendance-fixture');
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
  const { db, profiles } = attendanceFixture({ student: { journalHours: 165 } });
  installCoordinatorAnalytics({ app: { get(path, middleware, fn) { handler = fn; }, put() {} }, db, requireStaff() {}, allowRate: () => true, coordinatorSection: async () => ({ data: () => profiles['sections/section'] }) });
  const res = { set() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; } };
  await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section' } }, res);
  assert.equal(res.body.totalHoursLogged, 120); assert.equal(res.body.students[0].attendanceRate, null); assert.equal(res.body.students[0].status, 'Unavailable');
});
test('summary counts completed progress and high risk independently and reports unknown counts', async () => {
  for (const hoursRendered of [540, undefined]) {
    const { db, profiles } = attendanceFixture({ student: { hoursRendered, accountApproved: false }, section: { attendanceSchedule: { ...schedule, deadline: '2026-10-01' } } });
    let handler;
    installCoordinatorAnalytics({ app: { get(p,m,fn) { handler = fn; }, put() {} }, db, requireStaff() {}, allowRate: () => true, coordinatorSection: async () => ({ data: () => profiles['sections/section'] }) });
    const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section' } }, res);
    assert.equal(res.body.completedInterns, hoursRendered === 540 ? 1 : 0);
    assert.equal(res.body.atRiskStudents, 1);
    assert.equal(res.body.countsAvailable.totalHours, hoursRendered !== undefined);
    assert.deepEqual(res.body.students[0].excusedDates, []);
    assert.equal(res.body.students[0].excusedDatesVersion, 0);
  }
});
test('transfer during analytics load revokes response', async () => {
  const { db, profiles } = attendanceFixture({ onAttendance: profiles => { profiles['users/student'].sectionId = 'other'; } });
  let handler;
  installCoordinatorAnalytics({ app: { get(p,m,fn) { handler = fn; }, put() {} }, db, requireStaff() {}, allowRate: () => true, coordinatorSection: async () => ({ data: () => profiles['sections/section'] }) });
  const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section' } }, res);
  assert.equal(res.code, 403); assert.equal(res.body.students, undefined);
});
test('missing totals remain explicitly unknown even when schedule is unavailable', async () => {
  const { db, profiles } = attendanceFixture({ student: { hoursRendered: undefined } });
  let handler;
  installCoordinatorAnalytics({ app: { get(p,m,fn) { handler = fn; }, put() {} }, db, requireStaff() {}, allowRate: () => true, coordinatorSection: async () => ({ data: () => profiles['sections/section'] }) });
  const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section' } }, res);
  assert.equal(res.body.countsAvailable.completed, false);
  assert.equal(res.body.countsAvailable.highRisk, false);
  assert.equal(res.body.totalHoursLogged, null);
});
