// Dedicated company sender. Call only with server-owned recipients/thread metadata.
const MailComposer = require('nodemailer/lib/mail-composer');
const { boundedJson } = require('./companyMailInbox');
const SEND = 'https://www.googleapis.com/auth/gmail.send';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/;
function validSenderScopes(scope) {
  const scopes = new Set(String(scope || '').split(/\s+/).filter(Boolean));
  return scopes.size === 3 && scopes.has(SEND) && scopes.has('openid')
    && (scopes.has('email') || scopes.has('https://www.googleapis.com/auth/userinfo.email'));
}
function createCompanySender(env, fetcher = fetch) {
  if (env.COMPANY_SEND_ENABLED !== '1' || !env.COMPANY_SEND_OWNER_UID
    || env.COMPANY_SEND_MAILBOX !== 'pathwaysystem4@gmail.com'
    || !env.COMPANY_SEND_CLIENT_ID || !env.COMPANY_SEND_CLIENT_SECRET || !env.COMPANY_SEND_REFRESH_TOKEN) return null;
  const fail = code => Object.assign(new Error('Company email delivery is not confirmed. Do not retry until the delivery status is checked.'), { code });
  async function send({ to, subject, text, threadId, inReplyTo, messageId, attachment = null }, threaded) {
      const messageIdPattern = /^<[A-Za-z0-9._+=-]+@[A-Za-z0-9.-]+>$/;
      if (!ADDRESS.test(to || '') || (to || '').length > 254 || (threaded && (!ID.test(threadId || '')
        || !messageIdPattern.test(inReplyTo || ''))) || !messageIdPattern.test(messageId || '')
        || typeof subject !== 'string' || subject.length > 250 || /[\r\n]/.test(subject)
        || typeof text !== 'string' || !text.trim() || text.length > 10000) throw fail('INVALID_REPLY');
      if (attachment && (!Buffer.isBuffer(attachment.content) || attachment.content.length > 512 * 1024
        || attachment.contentType !== 'application/pdf' || !/^[A-Za-z0-9 _().-]{1,100}\.pdf$/i.test(attachment.filename))) throw fail('INVALID_REPLY');
      // Only bounded, human-reviewed byte attachments; never paths/URLs or HTML.
      const mime = await new MailComposer({ from: env.COMPANY_SEND_MAILBOX, to, subject, text,
        messageId, ...(threaded ? { inReplyTo, references: inReplyTo } : {}),
        attachments: attachment ? [{ filename: attachment.filename, content: attachment.content, contentType: 'application/pdf' }] : [],
        disableFileAccess: true, disableUrlAccess: true }).compile().build();
      let token;
      try {
        token = await boundedJson(await fetcher('https://oauth2.googleapis.com/token', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.COMPANY_SEND_CLIENT_ID, client_secret: env.COMPANY_SEND_CLIENT_SECRET,
            refresh_token: env.COMPANY_SEND_REFRESH_TOKEN, grant_type: 'refresh_token' }),
        }), 16000);
        if (!token.access_token || !validSenderScopes(token.scope)) throw fail('AUTHORIZATION');
      } catch { throw fail('AUTHORIZATION'); }
      try {
        const result = await boundedJson(await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(threaded ? { threadId } : {}), raw: mime.toString('base64url') }),
        }), 16000);
        if (!ID.test(result.id || '') || (threaded && result.threadId !== threadId)) throw fail('DELIVERY_UNKNOWN');
        return { status: 'provider_accepted', providerMessageId: result.id, ...(threaded ? { threadId } : {}) };
      } catch { throw fail('DELIVERY_UNKNOWN'); }
    }
  return { ownerId: env.COMPANY_SEND_OWNER_UID, mailbox: env.COMPANY_SEND_MAILBOX,
    sendReply: options => send(options, true), sendAnnouncement: options => send(options, false),
  };
}
module.exports = { createCompanySender, validSenderScopes };
