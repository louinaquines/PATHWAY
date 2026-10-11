const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionValid, hash, active, installEvaluationOtp } = require('../evaluationOtp');
const session = 'a'.repeat(64);
const valid = () => ({ expiresAt: new Date(Date.now() + 60000).toISOString(), verifiedSessionHash: hash(session), verifiedSessionExpiresAt: new Date(Date.now() + 60000).toISOString() });
test('verified session grants access without persisting plaintext session', () => assert.doesNotThrow(() => sessionValid(valid(), session)));
test('missing, incorrect and expired sessions fail closed', () => {
  for (const value of [null, '', 'b'.repeat(64)]) assert.throws(() => sessionValid(valid(), value), { status: 403 });
  assert.throws(() => sessionValid({ ...valid(), verifiedSessionExpiresAt: new Date(0).toISOString() }, session), { status: 403 });
});

function fixture() {
  let data = { ...valid(), supervisorEmail: 'supervisor@example.com' }, sent = [], fail = false;
  const handlers = {}, ref = {};
  let queue = Promise.resolve();
  const db = {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ ref, data: () => data }] }) }) }) }),
    runTransaction(action) {
      const work = queue.then(() => action({ get: async () => ({ data: () => ({ ...data }) }), update: (_, fields) => { data = { ...data, ...fields }; } }));
      queue = work.catch(() => {}); return work;
    },
  };
  installEvaluationOtp({ app: { post: (route, handler) => { handlers[route.split('/').at(-1)] = handler; } }, db, allowRate: () => true,
    mailerFactory: () => ({ from: 'test@example.com', transport: { close() {}, async sendMail(mail) {
      sent.push(mail); if (fail) throw new Error('fixture'); return { accepted: [mail.to] };
    } } }) });
  async function call(action, body = {}) {
    const result = { status: 200 };
    await handlers[action]({ params: { token: 'b'.repeat(64) }, body, ip: 'fixture' }, {
      set() {}, status(status) { result.status = status; return this; }, json(body) { result.body = body; },
    }); return result;
  }
  return { call, sent, data: () => data, change: fields => { data = { ...data, ...fields }; }, fail: () => { fail = true; } };
}
test('code is hashed, sent only to stored recipient, and consumed once under competing verification', async () => {
  const f = fixture(); assert.equal((await f.call('request-code')).status, 200);
  const code = f.sent[0].text.match(/\b\d{6}\b/)[0];
  assert.equal(f.sent[0].to, 'supervisor@example.com'); assert.notEqual(f.data().otpHash, code);
  const outcomes = await Promise.all([f.call('verify-code', { code }), f.call('verify-code', { code })]);
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 403]);
  const accepted = outcomes.find(x => x.status === 200);
  assert.doesNotThrow(() => sessionValid(f.data(), accepted.body.session));
});
test('wrong-code limit, resend cooldown, send cap and recipient injection fail closed', async () => {
  const f = fixture(); await f.call('request-code');
  assert.equal((await f.call('request-code')).status, 429); assert.equal(f.sent.length, 1);
  const actual = f.sent[0].text.match(/\b\d{6}\b/)[0];
  const wrong = actual === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) assert.equal((await f.call('verify-code', { code: wrong })).status, 403);
  assert.equal((await f.call('verify-code', { code: actual })).status, 403);
  f.change({ otpRequestedAt: new Date(0).toISOString(), otpSendCount: 5 });
  assert.equal((await f.call('request-code')).status, 429);
  assert.equal((await f.call('request-code', { email: 'outsider@example.com' })).status, 400);
});
test('expired codes and mail failure cannot create verified sessions', async () => {
  const f = fixture(); await f.call('request-code');
  f.change({ otpExpiresAt: new Date(0).toISOString() });
  assert.equal((await f.call('verify-code', { code: f.sent[0].text.match(/\b\d{6}\b/)[0] })).status, 403);
  const broken = fixture(); broken.fail();
  assert.equal((await broken.call('request-code')).status, 503); assert.equal(broken.data().otpHash, null);
});
test('used revoked expired and malformed expiry links deny verified sessions', () => {
  for (const change of [{ used: true }, { revoked: true }, { expiresAt: 'invalid' }, { expiresAt: new Date(0).toISOString() }])
    assert.throws(() => sessionValid({ ...valid(), ...change }, session), { status: 410 });
  assert.throws(() => active(null), { status: 410 });
});
