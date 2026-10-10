const { test } = require('node:test');
const assert = require('node:assert/strict');
const { journalAnalysis, documentTriage, installReviewAnalysis } = require('../reviewAnalysis');
test('journal flags missing fields without rewriting or grading', () => {
  const entry = { rawNotes: '', hours: -1 }; const original = JSON.stringify(entry);
  assert.equal(journalAnalysis(entry).findings.length, 3); assert.equal(JSON.stringify(entry), original);
});
test('repetition and keyword cues are evidence, not grades', () => {
  const entry = { id: 'a', rawNotes: 'Assisted team with testing. It was challenging.', hours: 8, weekNum: 1 };
  const result = journalAnalysis(entry, [{ ...entry, id: 'b' }]);
  assert.deepEqual(result.repetitions, ['b']); assert.ok(result.competencies.length); assert.deepEqual(result.sentimentCues, ['challenging']);
});
test('documents never receive automatic validation from metadata', () => {
  assert.equal(documentTriage({ fileName: 'test.pdf', uploadedBytes: 500 }).status, 'manual_review');
  assert.ok(documentTriage({ fileName: 'test.exe' }).findings.length);
});
test('mixed language produces no unsupported sentiment claim', () => {
  const result = journalAnalysis({ rawNotes: 'Nagtrabaho ako sa opisina.', hours: 8, weekNum: 1 });
  assert.deepEqual(result.sentimentCues, []); assert.match(result.limitation, /mixed-language/);
});
test('outsider cannot inspect journals or requirement metadata', async () => {
  let handler, journalRead = false;
  installReviewAnalysis({ app: { put() {}, get(path, middleware, fn) { handler = fn; } },
    db: { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({}) }), collection() { journalRead = true; } }) }) }, requireStaff() {}, coordinatorOwnsStudent: async () => false, allowRate: () => true });
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; } };
  await handler({ staff: { role: 'coordinator', uid: 'outsider' }, params: { studentId: 'student' } }, res);
  assert.equal(res.code, 403); assert.equal(journalRead, false);
});
test('document settings recheck ownership before transaction writes', async () => {
  const routes = {}; let writes = 0;
  installReviewAnalysis({ app: { get() {}, put(path, middleware, handler) { routes[path] = handler; } },
    db: { collection: () => ({ doc: () => ({}) }), runTransaction: fn => fn({ get: async () => ({ exists: true, data: () => ({ coordinatorId: 'other', department: 'IT' }) }), set() { writes++; } }) },
    requireStaff() {}, coordinatorSection: async () => ({}), allowRate: () => true });
  const res = { status(code) { this.code = code; return this; }, json(data) { this.body = data; } };
  const req = { staff: { uid: 'staff', role: 'coordinator', data: { department: 'IT' } }, params: { sectionId: 'section', requirementId: 'resume' }, body: { requiredTerms: ['Name'] } };
  await routes['/coordinator/sections/:sectionId/document-checks/:requirementId'](req, res);
  assert.equal(res.code, 403); assert.equal(writes, 0);
  req.body.requiredTerms = ['x'.repeat(101)];
  await routes['/coordinator/sections/:sectionId/document-checks/:requirementId'](req, res); assert.equal(res.code, 400);
});
