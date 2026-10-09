const MailComposer = require('nodemailer/lib/mail-composer');
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const MAILBOX = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
function gmailConfigErrors(env) {
  const errors = [];
  for (const key of ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN', 'GMAIL_FROM']) {
    if (!String(env[key] || '').trim()) errors.push(`Configure ${key}.`);
  }
  if (env.GMAIL_FROM && !MAILBOX.test(String(env.GMAIL_FROM).trim())) errors.push('GMAIL_FROM must be one valid mailbox.');
  if (env.GMAIL_CLIENT_ID && !String(env.GMAIL_CLIENT_ID).endsWith('.apps.googleusercontent.com')) errors.push('GMAIL_CLIENT_ID must be a Google OAuth client ID.');
  return errors;
}
function createGmailMailer(env, fetcher = fetch) {
  if (gmailConfigErrors(env).length) return null;
  const from = env.GMAIL_FROM.trim();
  let accessToken, validUntil = 0;
  const safeError = code => Object.assign(new Error('Gmail delivery could not be confirmed. Check authorization and delivery status before retrying.'), { code });
  async function token() {
    if (accessToken && validUntil > Date.now()) return accessToken;
    try {
      const response = await fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
          refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: 'refresh_token' }),
      });
      const result = await response.json();
      if (!response.ok || !result.access_token || result.scope !== SCOPE) throw safeError('GMAIL_AUTH');
      accessToken = result.access_token;
      validUntil = Date.now() + Math.max(0, Math.min(Number(result.expires_in) || 0, 3600) - 60) * 1000;
      return accessToken;
    } catch (_) { throw safeError('GMAIL_AUTH'); }
  }
  const transport = {
    async verify() { await token(); return true; },
    close() { accessToken = undefined; validUntil = 0; },
    async sendMail(options) {
      // Only backend-owned, single-recipient messages and byte attachments are supported.
      if (options.from !== from || typeof options.to !== 'string' || options.to.length > 254 || !MAILBOX.test(options.to)
        || options.cc || options.bcc || options.raw || options.envelope || options.headers
        || (options.attachments || []).some(item => !Buffer.isBuffer(item.content) || item.path || item.href)) throw safeError('GMAIL_MESSAGE');
      const mime = await new MailComposer({ from, to: options.to, subject: options.subject, text: options.text,
        messageId: options.messageId, attachments: options.attachments,
        disableFileAccess: true, disableUrlAccess: true }).compile().build();
      const bearer = await token();
      try {
        const response = await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw: mime.toString('base64url') }),
        });
        const result = await response.json();
        if (!response.ok || typeof result.id !== 'string' || !result.id) {
          if (response.status === 401) transport.close();
          throw safeError('GMAIL_DELIVERY');
        }
        // Provider acceptance, not proof of inbox delivery. Never auto-retry sends.
        return { accepted: [options.to], messageId: options.messageId || result.id, providerMessageId: result.id };
      } catch (_) { throw safeError('GMAIL_DELIVERY'); }
    },
  };
  return { from, transport };
}
module.exports = { gmailConfigErrors, createGmailMailer };
