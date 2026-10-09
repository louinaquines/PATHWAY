const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGmailMailer } = require('../gmailMail');
const { endorsementMailer } = require('../endorsementMail');
const { validateProduction } = require('../productionPreflight');
const env = { MAIL_PROVIDER: 'gmail', GMAIL_CLIENT_ID: 'qa.apps.googleusercontent.com', GMAIL_CLIENT_SECRET: 'private-test-secret', GMAIL_REFRESH_TOKEN: 'private-test-token', GMAIL_FROM: 'qa@example.invalid' };
const mail = { from: env.GMAIL_FROM, to: 'recipient@example.invalid', subject: 'QA', text: 'Synthetic QA', messageId: '<qa@example.invalid>' };
function stub({ authScope = 'https://www.googleapis.com/auth/gmail.send', sendOk = true, failSend = false } = {}) {
  const calls = [];
  return { calls, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'private-access', scope: authScope, expires_in: 3600 }) };
    if (failSend) throw new Error('private-provider-response');
    return { ok: sendOk, status: sendOk ? 200 : 401, json: async () => sendOk ? ({ id: 'accepted-qa' }) : ({ error: 'private-provider-response' }) };
  } };
}
test('Gmail composes MIME bytes and sends via HTTPS, with cached send-only token', async () => {
  const s = stub(); const m = createGmailMailer(env, s.fetcher);
  const result = await m.transport.sendMail({ ...mail, attachments: [{ filename: 'qa.pdf', content: Buffer.from('synthetic-document'), contentType: 'application/pdf' }] });
  assert.deepEqual(result.accepted, [mail.to]);
  assert.equal(s.calls.length, 2);
  const raw = Buffer.from(JSON.parse(s.calls[1].options.body).raw, 'base64url').toString();
  assert.match(raw, /To: recipient@example.invalid/);
  assert.match(raw, /filename=qa.pdf/);
  assert.match(raw, /c3ludGhldGljLWRvY3VtZW50/);
  assert.equal(s.calls[1].options.redirect, 'error');
  await m.transport.sendMail(mail);
  assert.equal(s.calls.filter(c => c.url.includes('oauth2')).length, 1);
});
test('failures do not resend and do not disclose provider responses or credentials', async () => {
  for (const options of [{ sendOk: false }, { failSend: true }]) {
    const s = stub(options); const m = createGmailMailer(env, s.fetcher);
    await assert.rejects(m.transport.sendMail(mail), error => error.code === 'GMAIL_DELIVERY' && !error.message.includes('private'));
    assert.equal(s.calls.filter(c => c.url.includes('messages/send')).length, 1);
  }
});
test('broader scopes cannot send', async () => {
  const s = stub({ authScope: 'https://mail.google.com/' });
  await assert.rejects(createGmailMailer(env, s.fetcher).transport.sendMail(mail), { code: 'GMAIL_AUTH' });
  assert.equal(s.calls.length, 1);
});
test('rejects extra recipients, filesystem attachments and raw messages before network access', async () => {
  const s = stub(); const m = createGmailMailer(env, s.fetcher);
  for (const override of [{ to: 'a@example.invalid,b@example.invalid' }, { bcc: 'b@example.invalid' }, { from: 'foreign@example.invalid' }, { raw: 'raw' }, { attachments: [{ path: 'private-file' }] }]) {
    await assert.rejects(m.transport.sendMail({ ...mail, ...override }), { code: 'GMAIL_MESSAGE' });
  }
  assert.equal(s.calls.length, 0);
});
test('provider selection is explicit and never silently falls back to SMTP', () => {
  assert.equal(endorsementMailer({ MAIL_PROVIDER: 'gmail' }), null);
  assert.equal(endorsementMailer({ MAIL_PROVIDER: 'unknown' }), null);
  assert.ok(endorsementMailer(env));
});
test('production configuration supports Gmail without SMTP, but requires all OAuth fields', () => {
  const ready = { ...env, NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'pathway-test', CORS_ALLOWED_ORIGINS: 'https://portal.example.invalid', CLOUDINARY_CLOUD_NAME: 'qa', CLOUDINARY_API_KEY: 'qa', CLOUDINARY_API_SECRET: 'qa', EVALUATION_WEB_URL: 'https://portal.example.invalid' };
  assert.deepEqual(validateProduction(ready).errors, []);
  assert.ok(validateProduction({ ...ready, GMAIL_REFRESH_TOKEN: '' }).errors.some(e => e.includes('GMAIL_REFRESH_TOKEN')));
});
