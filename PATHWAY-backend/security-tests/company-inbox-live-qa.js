// Read-only acceptance check for the single user-authorized synthetic email.
const fs = require('node:fs');
const path = require('node:path');
const { READ_SCOPE, boundedJson, normalizeThread } = require('../companyMailInbox');
async function findTestMessage() {
  const saved = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.env.company-inbox-oauth.json'), 'utf8'));
  if (saved.scope !== READ_SCOPE || saved.mailbox !== 'pathwaysystem4@gmail.com') throw new Error('Unexpected authorization.');
  const token = await boundedJson(await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: saved.client_id, client_secret: saved.client_secret,
      refresh_token: saved.refresh_token, grant_type: 'refresh_token' }),
  }), 16000);
  if (token.scope !== READ_SCOPE || !token.access_token) throw new Error('Read-only permission verification failed.');
  async function get(endpoint, limit = 16000) {
    return boundedJson(await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
      redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}` },
    }), limit);
  }
  const profile = await get('profile');
  if (profile.emailAddress?.toLowerCase() !== saved.mailbox) throw new Error('Wrong mailbox.');
  const subject = 'PATHWAY TEST - company reply';
  const params = new URLSearchParams({ q: `from:louinaquines@gmail.com to:pathwaysystem4@gmail.com subject:"${subject}" newer_than:2d`, maxResults: '5' });
  const matches = await get(`messages?${params}`);
  let found = null;
  for (const item of matches.messages || []) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(item.id)) throw new Error('Invalid provider ID.');
    const message = await get(`messages/${item.id}?format=full`, 1024 * 1024);
    const headers = message.payload?.headers || [];
    const header = name => headers.find(value => value.name?.toLowerCase() === name)?.value || '';
    if (header('subject') !== subject) continue;
    if (!/(?:^|<)louinaquines@gmail\.com(?:>|$)/i.test(header('from')) || !/(?:^|<)pathwaysystem4@gmail\.com(?:>|$)/i.test(header('to'))) continue;
    found = normalizeThread({ id: message.threadId, messages: [message] });
    break;
  }
  if (!found) throw new Error('Exact test message not found.');
  return { found, saved };
}
async function main() {
  const { found } = await findTestMessage();
  const message = found.messages[0];
  console.log(JSON.stringify({ mailboxVerified: true, exactTestMessageFound: true,
    expectedTextPresent: message.text.trim().replace(/\.$/, '') === 'This is a test company reply', timestampPresent: !!message.time,
    attachments: message.attachments.length, htmlRendered: false, mailboxChanged: false }));
}
if (require.main === module) main().catch(() => { console.error('Read-only test failed. No token, email contents or provider details logged.'); process.exitCode = 1; });
module.exports = { findTestMessage };
