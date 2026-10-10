const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installCompanyTestLink } = require('../companyTestLink');

function fixture(options = {}) {
  let handler, writes = 0, reads = 0;
  const owner = { role: 'coordinator', email: 'loui@test.com', department: 'CCS' };
  const section = { name: 'BSIT - 4G', coordinatorId: 'owner', department: 'CCS' };
  const student = { role: 'student', firstName: 'Dexter', lastName: 'Tampus', sectionId: 'section', department: 'CCS' };
  const values = { 'users/owner': owner, 'sections/section': section, 'users/CEIKzqvDGQfkp1FyidGZ1ftUTRi2': student };
  const ref = path => ({ id: path.split('/').pop(), get: async () => snap(path), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const snap = path => ({ exists: !!values[path], data: () => values[path] });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async callback => {
    if (options.reassigned) student.sectionId = 'other';
    await callback({ get: async item => snap(item.path || Object.keys(values).find(k => k.endsWith('/' + item.id)) || `sections/section/companyConversations/${item.id}`), create: (item, value) => { writes++; values[`sections/section/companyConversations/${item.id}`] = value; } });
  } };
  if (options.wrongOwner) owner.email = 'other@test.com';
  installCompanyTestLink({ app: { post: (path, middleware, fn) => { handler = fn; } }, db,
    requireStaff() {}, coordinatorSection: async () => {}, allowRate: () => true,
    enabled: options.enabled !== false, inbox: { ownerId: 'owner', mailbox: 'pathwaysystem4@gmail.com', findTestConversation: async () => { reads++; return { threadId: 'thread', messageId: 'message' }; } } });
  const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, set() {}, json(body) { this.body = body; return this; } };
  return { run: async (body = {}) => { await handler({ params: { sectionId: 'section' }, staff: { uid: 'owner' }, body }, res); return res; }, counts: () => ({ writes, reads }) };
}
test('fixed test mapping is created once and repeated requests are idempotent', async () => {
  const f = fixture();
  assert.equal((await f.run()).body.linked, true);
  assert.equal((await f.run()).body.emailsSent, false);
  assert.equal(f.counts().writes, 1);
});
test('disabled linking performs no mailbox reads or writes', async () => {
  const f = fixture({ enabled: false }); assert.equal((await f.run()).statusCode, 503);
  assert.deepEqual(f.counts(), { writes: 0, reads: 0 });
});
test('arbitrary provider IDs are rejected before mailbox access', async () => {
  const f = fixture(); assert.equal((await f.run({ threadId: 'arbitrary' })).statusCode, 400);
  assert.deepEqual(f.counts(), { writes: 0, reads: 0 });
});
test('wrong coordinator identity is rejected before mailbox access', async () => {
  const f = fixture({ wrongOwner: true }); assert.equal((await f.run()).statusCode, 403);
  assert.deepEqual(f.counts(), { writes: 0, reads: 0 });
});
test('assignment changes during mailbox lookup prevent mapping creation', async () => {
  const f = fixture({ reassigned: true }); assert.equal((await f.run()).statusCode, 403);
  assert.equal(f.counts().writes, 0);
});
