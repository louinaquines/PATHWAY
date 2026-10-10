const test = require('node:test');
const assert = require('node:assert/strict');
const { initialRecipient, installAnnouncementEmail } = require('../announcementEmail');
function fixture() {
  const records = new Map([
    ['announcements/a', { coordinatorId: 'staff', sectionId: 's', title: 'TEST ONLY', message: 'Test announcement',
      emailRecipients: { student: initialRecipient({ email: 'test@example.com', firstName: 'Test' }) } }],
    ['sections/s', { coordinatorId: 'staff', department: 'd' }],
    ['users/student', { role: 'student', sectionId: 's', department: 'd', email: 'test@example.com' }],
  ]);
  function update(path, fields) {
    const record = records.get(path);
    for (const [key, value] of Object.entries(fields)) {
      const parts = key.split('.'); let parent = record;
      for (const part of parts.slice(0, -1)) parent = parent[part];
      parent[parts.at(-1)] = value;
    }
  }
  const ref = path => ({ id: path.split('/').at(-1), path, get: async () => ({ exists: records.has(path), data: () => records.get(path) }), update: async fields => update(path, fields) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), runTransaction: async action => action({ get: r => r.get(), update: (r, fields) => update(r.path, fields) }) };
  let handler, sends = 0, failure;
  installAnnouncementEmail({ app: { get() {}, post: (_p, _a, h) => { handler = h; } }, db,
    coordinatorSection: async () => {}, allowRate: () => true, sender: { ownerId: 'staff', sendAnnouncement: async options => {
      assert.equal(options.to, 'test@example.com'); sends++; if (failure) throw failure; return { status: 'provider_accepted' };
    } } });
  async function call(body = { recipientIds: ['student'] }, uid = 'staff') {
    const output = { code: 200 }; const res = { set() {}, status(code) { output.code = code; return this; }, json(data) { output.body = data; } };
    await handler({ params: { announcementId: 'a' }, staff: { uid, data: { department: 'd' } }, body }, res); return output;
  }
  return { records, call, sends: () => sends, fail: code => { failure = Object.assign(new Error('fixture'), { code }); } };
}
test('known bounced and invalid recipients are blocked before sending', () => {
  assert.equal(initialRecipient({ email: 'dex@gmail.com' }).status, 'blocked_known_bounce');
  assert.equal(initialRecipient({ email: 'not-email' }).status, 'blocked_invalid_address');
});
test('acceptance is per recipient and retries cannot duplicate accepted sends', async () => {
  const f = fixture(); assert.equal((await f.call()).body.results.student, 'provider_accepted');
  assert.equal((await f.call()).body.results.student, 'unchanged'); assert.equal(f.sends(), 1);
  assert.equal(f.records.get('announcements/a').message, 'Test announcement');
});
test('uncertain delivery is blocked; in-app announcement is preserved', async () => {
  const f = fixture(); f.fail('DELIVERY_UNKNOWN'); await f.call(); await f.call();
  assert.equal(f.sends(), 1); assert.equal(f.records.get('announcements/a').emailRecipients.student.status, 'delivery_unknown');
  assert.equal(f.records.get('announcements/a').message, 'Test announcement');
});
test('only known pre-send failures are eligible for explicit retry', async () => {
  const f = fixture(); f.fail('AUTHORIZATION'); await f.call();
  assert.equal(f.records.get('announcements/a').emailRecipients.student.status, 'failed_before_send');
  await f.call(); assert.equal(f.sends(), 2);
});
test('outsider, injected email and changed student assignment cannot send', async () => {
  const f = fixture(); assert.equal((await f.call(undefined, 'outsider')).code, 404);
  assert.equal((await f.call({ recipientIds: ['student'], to: 'other@example.com' })).code, 400);
  f.records.get('users/student').sectionId = 'other'; assert.equal((await f.call()).code, 409); assert.equal(f.sends(), 0);
});
