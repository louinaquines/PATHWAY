const test = require('node:test');
const assert = require('node:assert/strict');
const { installCompanyInbox } = require('../companyMailInbox');
function fixture() {
  const records = new Map([
    ['sections/s', { coordinatorId: 'staff' }],
    ['users/student', { role: 'student', firstName: 'Sample', lastName: 'Student', sectionId: 's', department: 'd', placementStatus: 'approved', placementProposalId: 'p' }],
    ['companyProposals/p', { studentId: 'student', sectionId: 's', department: 'd', status: 'approved', companyEmail: 'contact@example.com', companyName: 'Sample Company' }],
  ]);
  const ref = path => ({ path, collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: records.has(path), data: () => records.get(path) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async callback => callback({
    get: r => r.get(), create: (r, data) => records.set(r.path, data),
  }) };
  let handler, reads = 0, change = false;
  installCompanyInbox({ app: { get() {}, post: (_p, _a, h) => { handler = h; } }, db,
    requireStaff() {}, coordinatorSection: async () => {}, allowRate: () => true, discoveryEnabled: true,
    inbox: { ownerId: 'staff', mailbox: 'mailbox@example.com', findPlacementConversations: async contact => {
      assert.equal(contact, 'contact@example.com'); reads++; return [{ messageId: 'm', threadId: 't' }];
    }, readThread: async () => {
      if (change) records.get('users/student').placementProposalId = 'other';
      return { messages: [{ id: 'm', from: 'Company <contact@example.com>', to: 'mailbox@example.com', subject: 'Placement update', rfcMessageId: '<anchor@example.com>' }] };
    } } });
  async function call(body = { studentId: 'student' }) {
    const out = { code: 200 };
    const res = { set() {}, status(code) { out.code = code; return this; }, json(data) { out.body = data; } };
    await handler({ params: { sectionId: 's' }, staff: { uid: 'staff', data: { department: 'd' } }, body }, res);
    return out;
  }
  return { records, call, reads: () => reads, change: () => { change = true; } };
}
test('general discovery binds approved placement and verifies recipient without sending', async () => {
  const f = fixture(); const result = await f.call();
  assert.equal(result.code, 200); assert.equal(result.body.emailsSent, false);
  assert.equal(result.body.conversations.length, 1);
  const record = f.records.get(`sections/s/companyConversations/${result.body.conversations[0].id}`);
  assert.equal(record.replyTo, 'contact@example.com'); assert.equal(record.proposalId, 'p');
  assert.equal(record.studentName, 'Sample Student'); assert.equal(record.placementBound, true);
});
test('arbitrary recipient and unassigned student are rejected before mailbox search', async () => {
  const f = fixture(); assert.equal((await f.call({ studentId: 'student', email: 'other@example.com' })).code, 400);
  f.records.get('users/student').sectionId = 'other';
  assert.equal((await f.call()).code, 403); assert.equal(f.reads(), 0);
});
test('placement changes while fetching do not create conversation mappings', async () => {
  const f = fixture(); f.change(); assert.equal((await f.call()).code, 409);
  assert.equal([...f.records.keys()].filter(key => key.includes('companyConversations')).length, 0);
});
