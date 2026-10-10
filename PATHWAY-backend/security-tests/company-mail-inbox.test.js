const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeThread, createCompanyInbox, READ_SCOPE, boundedJson, installCompanyInbox } = require('../companyMailInbox');
const message = { id: 'msg1', threadId: 'thread1', internalDate: '1000', payload: { headers: [{ name: 'From', value: 'Test Company <contact@example.com>' }], mimeType: 'multipart/mixed', parts: [
  { mimeType: 'text/plain', body: { data: Buffer.from('Test reply').toString('base64url') } },
  { mimeType: 'text/html', body: { data: Buffer.from('<script>bad()</script>').toString('base64url') } },
  { filename: '../test.pdf', body: { size: 100, attachmentId: 'private-id' } },
] } };
const env = { COMPANY_INBOX_ENABLED: '1', COMPANY_INBOX_OWNER_UID: 'staff', COMPANY_INBOX_MAILBOX: 'test@example.com', COMPANY_INBOX_CLIENT_ID: 'client', COMPANY_INBOX_CLIENT_SECRET: 'secret', COMPANY_INBOX_REFRESH_TOKEN: 'refresh' };
const json = data => new Response(JSON.stringify(data), { status: 200 });
test('inbox requires explicit independent configuration', () => {
  assert.equal(createCompanyInbox({ GMAIL_REFRESH_TOKEN: 'send-only-token' }), null);
  assert.equal(createCompanyInbox({ ...env, COMPANY_INBOX_ENABLED: '0' }), null);
});
test('deduplicates thread messages and blocks HTML and attachments', () => {
  const result = normalizeThread({ id: 'thread1', messages: [message, message] });
  assert.equal(result.messages.length, 1);
  assert.equal(result.messages[0].text, 'Test reply');
  assert.equal(result.messages[0].attachments[0].status, 'blocked');
  assert.ok(!JSON.stringify(result).includes('script'));
  assert.ok(!JSON.stringify(result).includes('private-id'));
});
test('rejects cross-thread messages and oversized bodies', () => {
  assert.throws(() => normalizeThread({ id: 'thread2', messages: [message] }));
  assert.throws(() => normalizeThread({ id: 'thread1', messages: [{ ...message, payload: { mimeType: 'text/plain', body: { data: 'x'.repeat(90001) } } }] }));
});
test('separate read scope, mailbox identity and thread ID are verified', async () => {
  const calls = [];
  const responses = [{ access_token: 'token', scope: READ_SCOPE }, { emailAddress: 'test@example.com' }, { id: 'thread1', messages: [message] }];
  const inbox = createCompanyInbox(env, async (url, options) => { calls.push({ url, options }); return json(responses.shift()); });
  assert.equal((await inbox.readThread('thread1')).messages[0].text, 'Test reply');
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.endsWith('/threads/thread1?format=full'));
  assert.ok(calls.every(call => call.options.redirect === 'error'));
});
test('send-only or excessive scopes and wrong mailbox fail closed', async () => {
  for (const scope of ['https://www.googleapis.com/auth/gmail.send', `${READ_SCOPE} https://mail.google.com/`]) {
    await assert.rejects(createCompanyInbox(env, async () => json({ access_token: 'secret-value', scope })).readThread('thread1'), error => !error.message.includes('secret-value'));
  }
  let count = 0;
  await assert.rejects(createCompanyInbox(env, async () => json(++count === 1 ? { access_token: 'token', scope: READ_SCOPE } : { emailAddress: 'other@example.com' })).readThread('thread1'));
  assert.equal(count, 2);
});
test('provider JSON is bounded and provider errors are not exposed', async () => {
  await assert.rejects(boundedJson(new Response('x'.repeat(100)), 10));
  await assert.rejects(createCompanyInbox(env, async () => { throw new Error('token=secret'); }).readThread('thread1'), error => !error.message.includes('secret'));
});
test('authorization is checked before mailbox access', async () => {
  let handler, reads = 0;
  installCompanyInbox({ app: { get: (_path, _middleware, callback) => { handler = callback; } },
    requireStaff: () => {}, coordinatorSection: async () => { throw Object.assign(new Error('Not assigned'), { status: 403 }); },
    allowRate: () => true, inbox: { ownerId: 'staff', readThread: () => { reads++; } } });
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await handler({ staff: { uid: 'staff' }, params: { sectionId: 'section', conversationId: 'conversation' } }, response);
  assert.equal(response.code, 403); assert.equal(reads, 0);
});
