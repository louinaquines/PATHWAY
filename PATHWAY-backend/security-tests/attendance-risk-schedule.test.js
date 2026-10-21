const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { demoScheduleEnabled } = require('../attendanceRiskAlerts');
const secret = 'ab'.repeat(32);
const config = { NODE_ENV: 'production', ATTENDANCE_DEMO_SCHEDULE_ENABLED: '1', ATTENDANCE_DEMO_PROJECT_ID: 'pathway-capstone-demo', ATTENDANCE_SCHEDULE_SECRET: secret };

test('hosted scheduling requires exact opt-in, project and valid secret without enabling remote manual evaluation', () => {
  const db = { projectId: 'pathway-capstone-demo' };
  assert.equal(demoScheduleEnabled(db, config), true);
  for (const change of [{ ATTENDANCE_DEMO_SCHEDULE_ENABLED: '0' }, { ATTENDANCE_DEMO_PROJECT_ID: 'other' },
    { ATTENDANCE_SCHEDULE_SECRET: 'weak' }, { FIRESTORE_EMULATOR_HOST: 'remote:8080' }, { PATHWAY_LOCAL_WORKFLOW: '1' }, { NODE_ENV: 'development' }]) {
    assert.equal(demoScheduleEnabled(db, { ...config, ...change }), false);
  }
});

test('scheduler endpoint rejects invalid auth/config/input before any Firestore operation and returns only safe fields', async () => {
  const { installAttendanceRiskSchedule } = require('../attendanceRiskSchedule');
  const app = express(); app.use(express.json({ strict: false }));
  const db = { projectId: 'pathway-capstone-demo', collection() { throw new Error('Unauthorized database access'); } };
  let evaluations = 0;
  const env = { ...config };
  installAttendanceRiskSchedule({ app, db, env, worker: { async evaluateScheduledAttendanceRisk() {
    evaluations++; return { status: 'complete', hasMore: false, pendingRetries: false, dueDate: '2026-10-21', privateName: 'NEVER EXPOSE' };
  } } });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(token = secret, body = {}, query = '') {
    const response = await fetch(`${origin}/internal/attendance-risk/run${query}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }
  try {
    for (const token of ['', 'invalid', 'cd'.repeat(32), `${secret}x`]) assert.equal((await request(token)).status, 401);
    for (const body of [null, [], { now: '2026-10-22' }, { batchSize: 500 }]) assert.equal((await request(secret, body)).status, 400);
    assert.equal((await request(secret, {}, '?now=2026-10-22')).status, 400);
    env.ATTENDANCE_DEMO_PROJECT_ID = 'other'; assert.equal((await request()).status, 503); assert.equal(evaluations, 0);
    env.ATTENDANCE_DEMO_PROJECT_ID = db.projectId;
    const response = await request(); assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'complete', hasMore: false, pendingRetries: false, dueDate: '2026-10-21' });
    assert.equal(evaluations, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
