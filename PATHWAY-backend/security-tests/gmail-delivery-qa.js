// One explicitly approved synthetic message. Receipt prevents accidental replay.
const fs = require('node:fs');
const path = require('node:path');
const { endorsementMailer } = require('../endorsementMail');
async function main() {
  if (process.argv[2] !== '--send-approved-test') throw new Error('Explicit approved-test flag required.');
  const directory = path.resolve(__dirname, '..');
  const credentials = JSON.parse(fs.readFileSync(path.join(directory, '.env.gmail-oauth.json'), 'utf8'));
  if (credentials.scope !== 'https://www.googleapis.com/auth/gmail.send') throw new Error('Send-only authorization required.');
  const recipient = 'louinaquines@gmail.com';
  const mailer = endorsementMailer({ MAIL_PROVIDER: 'gmail', GMAIL_FROM: recipient,
    GMAIL_CLIENT_ID: credentials.client_id, GMAIL_CLIENT_SECRET: credentials.client_secret, GMAIL_REFRESH_TOKEN: credentials.refresh_token });
  if (!mailer) throw new Error('Gmail configuration invalid.');
  const receipt = path.join(directory, '.env.gmail-delivery-test.json');
  if (fs.existsSync(receipt)) throw new Error('An attempt is already recorded. Check the inbox before any new test.');
  await mailer.transport.verify();
  const attemptedAt = new Date().toISOString();
  fs.writeFileSync(receipt, JSON.stringify({ status: 'attempting', attemptedAt }), { flag: 'wx', mode: 0o600 });
  try {
    const result = await mailer.transport.sendMail({ from: recipient, to: recipient,
      subject: 'PATHWAY — Gmail API delivery test',
      text: 'This is the approved PATHWAY Gmail API delivery test. It contains no student information or evaluation link.\n\nSending uses HTTPS with send-only Google authorization. Please confirm this message appears in your Inbox or Spam folder. Public supervisor-evaluation hosting is still pending.',
      messageId: `<pathway-gmail-qa-${Date.now()}@pathway.invalid>` });
    fs.writeFileSync(receipt, JSON.stringify({ status: 'accepted', attemptedAt, providerMessageId: result.providerMessageId }), { mode: 0o600 });
    console.log('Google accepted one approved synthetic test message. Inbox arrival needs recipient confirmation; no credential values printed.');
  } catch (_) {
    fs.writeFileSync(receipt, JSON.stringify({ status: 'delivery_unknown', attemptedAt }), { mode: 0o600 });
    throw new Error('Delivery is uncertain. Check inbox/provider status; do not automatically resend.');
  } finally { mailer.transport.close(); }
}
main().catch(error => { console.error(['Explicit approved-test flag required.', 'An attempt is already recorded. Check the inbox before any new test.', 'Delivery is uncertain. Check inbox/provider status; do not automatically resend.'].includes(error.message) ? error.message : 'Delivery QA failed before confirmation; no secrets logged.'); process.exitCode = 1; });
