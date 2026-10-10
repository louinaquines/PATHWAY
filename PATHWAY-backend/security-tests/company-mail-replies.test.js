const test = require('node:test');
const assert = require('node:assert/strict');
const { installCompanyReplies } = require('../companyMailReplies');
function fixture() {
  const records = new Map([
    ['sections/s', { coordinatorId: 'owner' }],
    ['users/student', { sectionId: 's', department: 'd' }],
    ['sections/s/companyConversations/c', { coordinatorId: 'owner', sectionId: 's', studentId: 'student', sendEnabled: true,
      sourceMailbox: 'pathwaysystem4@gmail.com', replyTo: 'test@example.com', replySubject: 'Re: Test', replyMessageId: '<a@example.com>', providerThreadId: 't' }],
  ]);
  const ref = path => ({ path, collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }),
    get: async () => ({ exists: records.has(path), data: () => records.get(path) }),
    update: async data => records.set(path, { ...records.get(path), ...data }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async callback => callback({
    get: r => r.get(), create: (r, data) => records.set(r.path, data),
  }) };
  let handler, sends = 0, fail = false;
  installCompanyReplies({ app: { post: (_path, _auth, h) => { handler = h; } }, db, requireStaff() {},
    coordinatorSection: async () => {}, allowRate: () => true,
    sender: { ownerId: 'owner', sendReply: async () => { sends++; if (fail) throw new Error('timeout'); return { status: 'provider_accepted', providerMessageId: 'sent' }; } } });
  async function call(body = { requestId: 'request1', text: 'Test' }) {
    const output = { status: 200 };
    const res = { set() {}, status(code) { output.status = code; return this; }, json(data) { output.body = data; return output; } };
    await handler({ params: { sectionId: 's', conversationId: 'c' }, staff: { uid: 'owner', data: { department: 'd' } }, body }, res);
    return output;
  }
  return { call, records, sends: () => sends, fail: () => { fail = true; } };
}
test('same request returns acceptance without a second send', async () => {
  const f = fixture(); assert.equal((await f.call()).status, 200);
  assert.equal((await f.call()).body.replayed, true); assert.equal(f.sends(), 1);
});
test('recipient injection and unapproved mappings cannot send', async () => {
  const f = fixture(); assert.equal((await f.call({ requestId: 'a', text: 'Test', to: 'other@example.com' })).status, 400);
  f.records.get('sections/s/companyConversations/c').sendEnabled = false;
  assert.equal((await f.call()).status, 409); assert.equal(f.sends(), 0);
});
test('uncertain outcome blocks repeat sending', async () => {
  const f = fixture(); f.fail(); assert.equal((await f.call()).status, 502);
  assert.equal((await f.call()).body.status, 'delivery_unknown'); assert.equal(f.sends(), 1);
});
test('changed assignment and changed request contents fail closed', async () => {
  const f = fixture(); await f.call();
  assert.equal((await f.call({ requestId: 'request1', text: 'Different' })).status, 409);
  f.records.get('users/student').sectionId = 'other';
  assert.equal((await f.call({ requestId: 'request2', text: 'Test' })).status, 403);
  assert.equal(f.sends(), 1);
});
