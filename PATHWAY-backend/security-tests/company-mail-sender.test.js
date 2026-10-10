const test = require('node:test');
const assert = require('node:assert/strict');
const { createCompanySender } = require('../companyMailSender');
const env = { COMPANY_SEND_ENABLED: '1', COMPANY_SEND_OWNER_UID: 'fixture', COMPANY_SEND_MAILBOX: 'pathwaysystem4@gmail.com',
  COMPANY_SEND_CLIENT_ID: 'fixture', COMPANY_SEND_CLIENT_SECRET: 'fixture', COMPANY_SEND_REFRESH_TOKEN: 'fixture' };
const reply = { to: 'test@example.com', subject: 'Re: Test', text: 'Test reply', threadId: 'thread1', inReplyTo: '<original@example.com>', messageId: '<new@example.com>' };
const response = data => new Response(JSON.stringify(data), { status: 200 });
test('disabled sender makes no requests', () => assert.equal(createCompanySender({}), null));
test('threaded MIME and provider acceptance, not delivered status', async () => {
  const calls = [];
  const sender = createCompanySender(env, async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1 ? response({ access_token: 'fixture', scope: 'openid email https://www.googleapis.com/auth/gmail.send' })
      : response({ id: 'sent1', threadId: 'thread1' });
  });
  assert.equal((await sender.sendReply(reply)).status, 'provider_accepted');
  const data = JSON.parse(calls[1].options.body);
  assert.equal(data.threadId, 'thread1');
  const mime = Buffer.from(data.raw, 'base64url').toString();
  assert.match(mime, /In-Reply-To: <original@example.com>/);
  assert.match(mime, /References: <original@example.com>/);
});
test('rejects header injection before network', async () => {
  let calls = 0;
  const sender = createCompanySender(env, async () => { calls++; });
  await assert.rejects(sender.sendReply({ ...reply, subject: 'Test\r\nBcc: other@example.com' }), { code: 'INVALID_REPLY' });
  assert.equal(calls, 0);
});
test('accepts Gmail Message-IDs containing equals signs', async () => {
  let calls = 0;
  const sender = createCompanySender(env, async () => {
    calls++; return calls === 1 ? response({ access_token: 'fixture', scope: 'openid email https://www.googleapis.com/auth/gmail.send' })
      : response({ id: 'sent1', threadId: 'thread1' });
  });
  assert.equal((await sender.sendReply({ ...reply, inReplyTo: '<CA=test@mail.gmail.com>' })).status, 'provider_accepted');
});
test('rejects excess permissions before sending', async () => {
  let calls = 0;
  const sender = createCompanySender(env, async () => {
    calls++; return response({ access_token: 'fixture', scope: 'openid email https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly' });
  });
  await assert.rejects(sender.sendReply(reply), { code: 'AUTHORIZATION' });
  assert.equal(calls, 1);
});
test('uncertain delivery is never automatically retried', async () => {
  let calls = 0;
  const sender = createCompanySender(env, async () => {
    calls++; if (calls === 1) return response({ access_token: 'fixture', scope: 'openid email https://www.googleapis.com/auth/gmail.send' });
    throw new Error('fixture timeout');
  });
  await assert.rejects(sender.sendReply(reply), { code: 'DELIVERY_UNKNOWN' });
  assert.equal(calls, 2);
});
