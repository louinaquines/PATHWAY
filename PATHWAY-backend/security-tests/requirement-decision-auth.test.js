const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../server.js');
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf("app.post('/coordinator/students/:studentId/requirements/:requirementId/decision'");
assert.ok(start > 0);
const body = source.slice(start);
const admission = body.slice(body.indexOf('const studentSnap = await transaction.get(studentRef);'), body.indexOf('sectionId = student.sectionId;'));
async function run(change = {}) {
  const actor = { role: 'coordinator', accountApproved: true, department: 'D', passwordEpoch: 'original', ...change.actor };
  const records = { 'users/student': { role: 'student', sectionId: 'section', department: 'D' }, 'users/coordinator': actor,
    'sections/section': { coordinatorId: 'coordinator', department: 'D', ...change.section } };
  const reads = [];
  const transaction = { get: async ref => { reads.push(ref); return { exists: !!records[ref], data: () => records[ref] }; } };
  const context = { transaction, studentRef: 'users/student', req: { staff: { uid: 'coordinator', data: { passwordEpoch: 'original' } }, params: { studentId: 'student' } },
    adminDb: { collection: col => ({ doc: id => `${col}/${id}` }) }, require: createRequire(file), sourceVersion: null, decisionReceipt: null,
    coordinatorOwnsStudent: async () => true, assertRecordsOpen: () => {} };
  await vm.runInNewContext(`(async () => { ${admission} })()`, context);
  return reads;
}
test('actual requirement-decision admission reads assignment and actor inside the transaction', async () => {
  const reads = await run(); assert.ok(reads.includes('users/coordinator')); assert.ok(reads.includes('sections/section'));
});
test('actual decision admission denies stale assignment, approval and password state before receipt replay', async () => {
  for (const change of [{ section: { coordinatorId: 'replacement' } }, { actor: { disabled: true } },
    { actor: { accountApproved: false } }, { actor: { passwordChangeRequired: true } }, { actor: { passwordEpoch: 'replaced' } }]) {
    await assert.rejects(run(change), error => error.status === 403);
  }
});
