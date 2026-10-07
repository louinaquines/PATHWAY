const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function harness(signOut) {
  const states = [], resets = [], alerts = [];
  const source = readFileSync(resolve(__dirname, '../../PATHWAY-master/hooks/useStudentLogout.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('export default function', 'function');
  const hook = vm.runInNewContext(`${source}\nuseStudentLogout`, {
    useRef: value => ({ current: value }), useState: value => [value, next => states.push(next)],
    signOut, auth: {}, Alert: { alert: (...args) => alerts.push(args) },
    Date, setTimeout: callback => { callback(); },
  });
  return { ...hook({ reset: value => resets.push(value) }), states, resets, alerts };
}

test('successful student logout clears navigation to Login after signing out', async () => {
  let signedOut = false;
  const state = harness(async () => { signedOut = true; });
  await state.logout();
  assert.equal(signedOut, true);
  assert.deepEqual(state.states, [true]);
  assert.equal(state.resets.length, 1);
  assert.equal(state.resets[0].index, 0);
  assert.equal(state.resets[0].routes.length, 1);
  assert.equal(state.resets[0].routes[0].name, 'Login');
});

test('duplicate logout taps do not create duplicate sign-outs or navigation resets', async () => {
  let complete, calls = 0;
  const state = harness(() => { calls += 1; return new Promise(resolve => { complete = resolve; }); });
  const first = state.logout();
  await state.logout();
  assert.equal(calls, 1);
  assert.equal(state.resets.length, 0);
  complete();
  await first;
  assert.equal(state.resets.length, 1);
});

test('failed logout restores controls and permits retry without navigating away', async () => {
  let calls = 0;
  const state = harness(async () => { calls += 1; if (calls === 1) throw new Error('Offline fixture'); });
  await state.logout();
  assert.deepEqual(state.states, [true, false]);
  assert.equal(state.resets.length, 0);
  assert.equal(state.alerts[0][0], 'Unable to sign out');
  await state.logout();
  assert.equal(state.resets.length, 1);
});
