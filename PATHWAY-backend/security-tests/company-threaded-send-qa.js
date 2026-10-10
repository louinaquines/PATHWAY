// Exactly one human-authorized test reply. Never auto-retry uncertain delivery.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCompanyInbox, boundedJson, READ_SCOPE } = require('../companyMailInbox');
const { createCompanySender } = require('../companyMailSender');
async function main() {
  if (process.env.PATHWAY_AUTHORIZED_THREADED_TEST !== '1') throw new Error('Explicit authorization required.');
  const root = path.resolve(__dirname, '..');
  const receiptPath = path.join(root, '.env.company-threaded-test-receipt.json');
  const retryAuthorized = process.env.PATHWAY_AUTHORIZED_RECONCILED_RETRY === '1';
  if (fs.existsSync(receiptPath) && !retryAuthorized) throw new Error('Prior attempt exists. Do not resend without reconciliation.');
  if (fs.existsSync(receiptPath)) {
    const prior = JSON.parse(fs.readFileSync(receiptPath));
    if (prior.status !== 'delivery_unknown' || prior.recipient !== 'louinaquines@gmail.com') throw new Error('Retry not eligible.');
    // Operator has reconciled the earlier local Message-ID validation failure.
    // Preserve that receipt; reserve this specifically authorized retry separately.
  }
  const inboxCredential = JSON.parse(fs.readFileSync(path.join(root, '.env.company-inbox-oauth.json')));
  const sendCredential = JSON.parse(fs.readFileSync(path.join(root, '.env.company-send-oauth.json')));
  if (inboxCredential.mailbox !== 'pathwaysystem4@gmail.com' || sendCredential.mailbox !== inboxCredential.mailbox) throw new Error('Mailbox mismatch.');
  const inbox = createCompanyInbox({ COMPANY_INBOX_ENABLED: '1', COMPANY_INBOX_OWNER_UID: 'authorized-test',
    COMPANY_INBOX_MAILBOX: inboxCredential.mailbox, COMPANY_INBOX_CLIENT_ID: inboxCredential.client_id,
    COMPANY_INBOX_CLIENT_SECRET: inboxCredential.client_secret, COMPANY_INBOX_REFRESH_TOKEN: inboxCredential.refresh_token });
  const matched = await inbox.findTestConversation();
  const token = await boundedJson(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(15000), redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: inboxCredential.client_id, client_secret: inboxCredential.client_secret,
      refresh_token: inboxCredential.refresh_token, grant_type: 'refresh_token' }),
  }), 16000);
  if (token.scope !== READ_SCOPE) throw new Error('Read scope mismatch.');
  const original = await boundedJson(await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${matched.messageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To`, {
    redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token.access_token}` },
  }), 16000);
  const header = name => original.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
  if (original.threadId !== matched.threadId || header('Subject') !== 'PATHWAY TEST - company reply'
    || !/(?:^|<)louinaquines@gmail\.com(?:>|$)/i.test(header('From') || '')
    || !/(?:^|<)pathwaysystem4@gmail\.com(?:>|$)/i.test(header('To') || '')) throw new Error('Exact test metadata mismatch.');
  const sender = createCompanySender({ COMPANY_SEND_ENABLED: '1', COMPANY_SEND_OWNER_UID: 'authorized-test',
    COMPANY_SEND_MAILBOX: sendCredential.mailbox, COMPANY_SEND_CLIENT_ID: sendCredential.client_id,
    COMPANY_SEND_CLIENT_SECRET: sendCredential.client_secret, COMPANY_SEND_REFRESH_TOKEN: sendCredential.refresh_token });
  const receipt = { status: 'sending', createdAt: new Date().toISOString(), threadId: matched.threadId,
    messageId: `<${crypto.randomUUID()}@pathway.invalid>`, recipient: 'louinaquines@gmail.com' };
  const activeReceiptPath = retryAuthorized ? path.join(root, '.env.company-threaded-test-retry-receipt.json') : receiptPath;
  fs.writeFileSync(activeReceiptPath, JSON.stringify(receipt), { flag: 'wx', mode: 0o600 });
  try {
    const result = await sender.sendReply({ to: receipt.recipient, subject: 'Re: PATHWAY TEST - company reply',
      text: 'PATHWAY TEST ONLY — threaded reply check', threadId: matched.threadId, inReplyTo: header('Message-ID'), messageId: receipt.messageId });
    fs.writeFileSync(activeReceiptPath, JSON.stringify({ ...receipt, ...result }), { mode: 0o600 });
    console.log(JSON.stringify({ status: result.status, recipient: receipt.recipient, existingThreadMatched: true, emailsSent: 1,
      productionEndpointTested: false, inboxDeliveryConfirmed: false }));
    try {
      const thread = await inbox.readThread(matched.threadId);
      console.log(JSON.stringify({ sentMessageVisibleInThread: thread.messages.some(m => m.id === result.providerMessageId
        && m.text.trim() === 'PATHWAY TEST ONLY — threaded reply check') }));
    } catch { console.log('Provider accepted; read-back unavailable. No resend attempted.'); }
  } catch (error) {
    fs.writeFileSync(activeReceiptPath, JSON.stringify({ ...receipt, status: ['INVALID_REPLY', 'AUTHORIZATION'].includes(error.code) ? 'not_sent' : 'delivery_unknown' }), { mode: 0o600 });
    throw new Error('Delivery uncertain; no resend permitted before reconciliation.');
  }
}
main().catch(() => { console.error('Test did not complete. Check the local receipt before retrying; no credentials logged.'); process.exitCode = 1; });
