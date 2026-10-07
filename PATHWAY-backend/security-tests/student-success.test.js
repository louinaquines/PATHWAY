const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

function attendance(postBackend) {
  const events = [];
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/services/attendanceLocation.js'), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const punch = vm.runInNewContext(`${source}\n punchAttendance`, {
    postBackend, requestBackend: async () => ({ enabled: false }),
    showStudentSuccess: (...args) => events.push(args),
  });
  return { punch, events };
}
test('successful time-in and time-out return saved data and show matching feedback', async () => {
  const result = { id: 'saved', hoursToday: 0.03 };
  const api = attendance(async () => result);
  assert.equal(await api.punch('/attendance/time-in'), result);
  assert.equal(api.events[0][0], 'Time-in recorded');
  assert.equal(await api.punch('/attendance/time-out'), result);
  assert.equal(api.events[1][0], 'Time-out recorded');
  assert.match(api.events[1][1], /0\.03 hours/);
});
test('failed attendance saves never show a success animation', async () => {
  const api = attendance(async () => { throw new Error('Outside attendance area'); });
  await assert.rejects(api.punch('/attendance/time-in'), /Outside attendance area/);
  assert.equal(api.events.length, 0);
});
test('feedback registration can be cleaned up without retaining an unmounted host', () => {
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/services/studentSuccess.js'), 'utf8').replace(/export /g, '');
  const api = vm.runInNewContext(`${source}\n ({registerStudentSuccess, showStudentSuccess})`);
  let calls = 0;
  const unregister = api.registerStudentSuccess(() => calls++);
  api.showStudentSuccess('Saved', 'Done');
  unregister();
  api.showStudentSuccess('Saved', 'Done');
  assert.equal(calls, 1);
});
