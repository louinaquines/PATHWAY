// Operator-run OAuth bootstrap. Does not send mail or enable production access.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { readClient, authorizationUrl } = require('./authorize-gmail');
const { READ_SCOPE, boundedJson } = require('../companyMailInbox');
const MAILBOX = 'pathwaysystem4@gmail.com';
function verifyAuthorization(tokens, profile) {
  if (tokens.scope !== READ_SCOPE || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token
    || String(profile.emailAddress || '').toLowerCase() !== MAILBOX) throw new Error('Mailbox or read-only scope did not match.');
}
async function main(file) {
  const client = readClient(file);
  const destination = path.resolve(__dirname, '..', '.env.company-inbox-oauth.json');
  if (fs.existsSync(destination)) throw new Error('Refusing to overwrite an existing inbox authorization.');
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(64).toString('base64url');
  let redirect, authUrl, timer, used = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    const url = new URL(req.url, redirect);
    if (req.method !== 'GET' || req.headers.host !== new URL(redirect).host) return res.writeHead(400).end('Invalid request.');
    if (url.pathname === '/start') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(`<h1>PATHWAY company inbox</h1><p>Authorize ${MAILBOX} with Gmail read-only access. Google grants mailbox-wide read access; PATHWAY will only expose server-linked company conversations. This does not send, delete or modify messages.</p><p>Existing send-only access is unchanged. No production connection is enabled by this setup.</p><a href="${authUrl.replaceAll('&', '&amp;')}">Continue to Google</a>`);
    }
    if (url.pathname !== '/') return res.writeHead(404).end();
    if (url.searchParams.get('state') !== state || used) return res.writeHead(400).end('Invalid or used request.');
    if (url.searchParams.has('error')) {
      used = true; clearTimeout(timer); server.close(); return res.end('Authorization declined. Nothing saved.');
    }
    const code = url.searchParams.get('code');
    if (!code) return res.writeHead(400).end('Missing authorization code.');
    used = true;
    try {
      const tokens = await boundedJson(await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code,
          code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }),
      }), 16000);
      if (tokens.scope !== READ_SCOPE || !tokens.access_token) throw new Error('Invalid scope.');
      const profile = await boundedJson(await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${tokens.access_token}` },
      }), 16000);
      verifyAuthorization(tokens, profile);
      fs.writeFileSync(destination, JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret,
        refresh_token: tokens.refresh_token, scope: READ_SCOPE, mailbox: MAILBOX, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      res.end('Read-only inbox authorization saved locally. No email was read, sent or changed; only mailbox identity was checked. Production access is not enabled.');
      console.log('Read-only inbox authorization saved to ignored .env.company-inbox-oauth.json. No credentials logged.');
    } catch {
      res.writeHead(500).end('Authorization failed. Confirm the correct mailbox, Gmail API access and only read-only permission. No credentials saved.');
      console.error('Inbox authorization failed. No credential details logged.'); process.exitCode = 1;
    } finally { clearTimeout(timer); server.close(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  redirect = `http://127.0.0.1:${server.address().port}/`;
  authUrl = authorizationUrl(client.client_id, redirect, state, verifier, { scope: READ_SCOPE, mailbox: MAILBOX });
  console.log(`Open ${redirect}start to authorize ${MAILBOX}. Expires in 15 minutes.`);
  timer = setTimeout(() => { console.log('Inbox authorization window expired.'); server.close(); }, 900000);
}
if (require.main === module) main(process.argv[2]).catch(() => { console.error('Could not start inbox authorization. Check Desktop client JSON and existing authorization file. No secrets logged.'); process.exitCode = 1; });
module.exports = { verifyAuthorization, MAILBOX };
