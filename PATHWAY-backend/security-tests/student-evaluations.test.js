const test = require('node:test');
const assert = require('node:assert/strict');
const { installStudentEvaluations, toView } = require('../studentEvaluations');

function harness(docs, user) {
  let handler;
  const app = { post: (path, auth, fn) => { assert.equal(path, '/student/evaluations'); handler = fn; } };
  const db = { collection: () => ({ where: (f, op, v) => ({ get: async () => ({ docs: docs.filter(d => d.data.studentId === v).map(d => ({ id: d.id, data: () => d.data })) }) }) }) };
  installStudentEvaluations({ app, db, requireUser: () => {}, allowRate: () => true });
  return async () => { const res = { code: 200, body: null, set() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; await handler({ user }, res); return res; };
}
const secret = { tokenHash: 'h', otpHash: 'o', verifiedSessionHash: 's', supervisorEmail: 'sup@x.ph', createdBy: 'coord' };
const docs = [
  { id: 'a', data: { ...secret, studentId: 's1', used: true, submittedAt: '2026-11-21T00:00:00Z', supervisorName: 'Ms. Liza', companyName: 'Island Cloud',
    ratings: { technicalSkills: 5, workQuality: 4, professionalism: 5, communication: 4, attendance: 5 }, comments: 'Great work.' } },
  { id: 'b', data: { ...secret, studentId: 's1', used: false, supervisorName: 'Pending' } },
  { id: 'c', data: { ...secret, studentId: 's2', used: true, submittedAt: '2026-11-20T00:00:00Z', ratings: {} } },
];

test('student sees only their own submitted evaluations without private fields', async () => {
  const res = await harness(docs, { uid: 's1', role: 'student' })();
  assert.equal(res.code, 200);
  assert.equal(res.body.evaluations.length, 1);
  const e = res.body.evaluations[0];
  assert.equal(e.average, 4.6);
  assert.equal(e.items.length, 6);
  const json = JSON.stringify(res.body);
  for (const leak of ['sup@x.ph', 'tokenHash', 'otpHash', 'verifiedSessionHash', 'coord', 'Pending']) assert.ok(!json.includes(leak), leak);
});

test('coordinators and admins are refused', async () => {
  assert.equal((await harness(docs, { uid: 'c1', role: 'coordinator' })()).code, 403);
  assert.equal((await harness(docs, { uid: 'a1', role: 'admin' })()).code, 403);
});

test('custom forms keep every question, including long and unanswered ones', () => {
  const long = 'x'.repeat(4000);
  const v = toView('d', { formDefinition: { title: 'Custom', questions: [
    { id: 'q_1', type: 'rating', label: 'Rate punctuality' }, { id: 'q_2', type: 'text', label: 'Long answer' }, { id: 'q_3', type: 'text', label: 'Optional' }] },
    answers: { q_1: 3, q_2: long } });
  assert.equal(v.title, 'Custom');
  assert.deepEqual(v.items.map(i => i.value), [3, long, null]);
  assert.equal(v.average, 3);
});
