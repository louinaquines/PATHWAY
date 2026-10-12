// Exactly one approved synthetic alert; uncertain sends are never retried.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createCompanySender, validSenderScopes } = require('../companyMailSender');
async function main() {
  if (process.argv[2] !== '--send-approved-test') throw new Error('Approval flag required');
  const root = path.resolve(__dirname, '..');
  const receipt = path.join(root, '.env.monitoring-alert-test-receipt.json');
  if (fs.existsSync(receipt)) throw new Error('Prior alert attempt exists; no resend');
  const credentials = JSON.parse(fs.readFileSync(path.join(root, '.env.company-send-oauth.json')));
  if (credentials.mailbox !== 'pathwaysystem4@gmail.com' || !validSenderScopes(credentials.scope)) throw new Error('Authorization mismatch');
  const sender = createCompanySender({ COMPANY_SEND_ENABLED: '1', COMPANY_SEND_OWNER_UID: 'approved-monitoring-test', COMPANY_SEND_MAILBOX: credentials.mailbox,
    COMPANY_SEND_CLIENT_ID: credentials.client_id, COMPANY_SEND_CLIENT_SECRET: credentials.client_secret, COMPANY_SEND_REFRESH_TOKEN: credentials.refresh_token });
  if (!sender) throw new Error('Sender configuration unavailable');
    const record = { attemptedAt: new Date().toISOString(), status: 'attempting', recipient: credentials.mailbox,
      messageId: `<pathway-monitor-test-${crypto.randomUUID()}@pathway.invalid>` };
    fs.writeFileSync(receipt, JSON.stringify(record), { flag: 'wx', mode: 0o600 });
    try {
      const result = await sender.sendAnnouncement({ to: record.recipient,
        subject: 'PATHWAY TEST ONLY — monitoring alert delivery check',
        text: 'TEST ONLY — simulated monitoring failure. This is not a real outage.\n\nThis one-time message checks alert delivery to the approved operator mailbox. Production was not stopped or changed. No student data, credentials or document links are included. Automatic recurring monitoring is NOT enabled.\n\nPlease confirm this message is received in Inbox or Spam.',
        messageId: record.messageId });
      fs.writeFileSync(receipt, JSON.stringify({ ...record, status: 'accepted', providerMessageId: result.providerMessageId }), { mode: 0o600 });
      console.log(JSON.stringify({ providerAccepted: true, recipient: record.recipient, emailsSent: 1, inboxReceiptConfirmed: false, recurringMonitoringEnabled: false }));
    } catch (_) {
      fs.writeFileSync(receipt, JSON.stringify({ ...record, status: 'delivery_unknown' }), { mode: 0o600 });
      throw new Error('Delivery unknown; do not resend before reconciliation');
    }
}
main().catch(() => { console.error('Monitoring alert test did not complete. Check local receipt before any retry; no credentials logged.'); process.exitCode = 1; });
