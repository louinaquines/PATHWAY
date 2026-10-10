// Approved synthetic attachment test only; does not mutate placement records.
const fs = require('node:fs');
const path = require('node:path');
const { endorsementMailer } = require('../endorsementMail');

async function main() {
  if (process.argv[2] !== '--send-approved-test') throw new Error('Explicit approved-test flag required.');
  const directory = path.resolve(__dirname, '..');
  const credentials = JSON.parse(fs.readFileSync(path.join(directory, '.env.gmail-oauth.json'), 'utf8'));
  if (credentials.scope !== 'https://www.googleapis.com/auth/gmail.send') throw new Error('Send-only authorization required.');
  const mailer = endorsementMailer({ MAIL_PROVIDER: 'gmail', GMAIL_FROM: 'louinaquines@gmail.com',
    GMAIL_CLIENT_ID: credentials.client_id, GMAIL_CLIENT_SECRET: credentials.client_secret,
    GMAIL_REFRESH_TOKEN: credentials.refresh_token });
  if (!mailer) throw new Error('Mail configuration unavailable.');
  const bytes = fs.readFileSync(path.resolve(directory, '../output/pdf/test-only-endorsement.pdf'));
  await mailer.transport.verify();
  try {
    for (const [index, to] of ['dex@gmail.com', 'louinaquines@gmail.com'].entries()) {
      const receipt = path.join(directory, `.env.endorsement-attachment-qa-${index}.json`);
      if (fs.existsSync(receipt)) {
        console.log(`Recipient ${index + 1}: prior attempt exists; not resent.`);
        continue;
      }
      const attemptedAt = new Date().toISOString();
      fs.writeFileSync(receipt, JSON.stringify({ status: 'attempting', attemptedAt }), { flag: 'wx', mode: 0o600 });
      try {
        const result = await mailer.transport.sendMail({ from: mailer.from, to,
          subject: 'PATHWAY TEST ONLY - endorsement attachment delivery check',
          text: 'This is an authorized synthetic attachment test. The PDF is intentionally unsigned and is NOT an issued or verified endorsement. No institutional document approval or final student approval is granted. Please confirm receipt and that the attached one-page PDF opens.',
          messageId: `<pathway-attachment-qa-${index}-${Date.now()}@pathway.invalid>`,
          attachments: [{ filename: 'test-only-endorsement.pdf', content: bytes, contentType: 'application/pdf' }],
        });
        if (!result.accepted?.some(address => address.toLowerCase() === to)) throw new Error('Not accepted');
        fs.writeFileSync(receipt, JSON.stringify({ status: 'accepted', attemptedAt, providerMessageId: result.providerMessageId }), { mode: 0o600 });
        console.log(`Recipient ${index + 1}: provider accepted test attachment; inbox receipt unverified.`);
      } catch (_) {
        fs.writeFileSync(receipt, JSON.stringify({ status: 'delivery_unknown', attemptedAt }), { mode: 0o600 });
        console.log(`Recipient ${index + 1}: delivery uncertain; do not resend automatically.`);
        process.exitCode = 1;
      }
    }
  } finally { mailer.transport.close(); }
}
main().catch(() => { console.error('Attachment test could not complete; no credentials logged.'); process.exitCode = 1; });
