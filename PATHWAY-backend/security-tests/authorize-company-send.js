// Operator-run OAuth bootstrap. Does not send mail or enable production access.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { readClient, authorizationUrl } = require('./authorize-gmail');
const { boundedJson } = require('../companyMailInbox');
const { OAuth2Client } = require('google-auth-library');
const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const READ_SCOPE = `${SEND_SCOPE} openid email`;
function validScopes(scope) {
  const actual = new Set(String(scope || '').split(/\s+/).filter(Boolean));
  const emailScope = actual.has('email') ? 'email' : 'https://www.googleapis.com/auth/userinfo.email';
  return actual.size === 3 && actual.has(SEND_SCOPE) && actual.has('openid') && actual.has(emailScope);
}
const MAILBOX = 'pathwaysystem4@gmail.com';
function verifyAuthorization(tokens, profile) {
  if (!validScopes(tokens.scope) || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token
    || profile.email_verified !== true || String(profile.email || '').toLowerCase() !== MAILBOX) throw new Error('Mailbox or send-only scope did not match.');
}
async function main(file) {
  const stored = file ? null : JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '.env.company-inbox-oauth.json'), 'utf8'));
  const client = file ? readClient(file) : { client_id: stored.client_id, client_secret: stored.client_secret };
  const destination = path.resolve(__dirname, '..', '.env.company-send-oauth.json');
  if (fs.existsSync(destination)) throw new Error('Refusing to overwrite an existing sender authorization.');
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
      return res.end(`<h1>PATHWAY company sender</h1><p>Authorize ${MAILBOX} with Gmail send-only access. This requests Gmail send permission and basic account identity to verify the selected mailbox. It does not grant permission to read or delete mail. No email is sent during setup.</p><p>Existing inbox and personal-account connections are unchanged. No production connection is enabled by this setup.</p><a href="${authUrl.replaceAll('&', '&amp;')}">Continue to Google</a>`);
    }
    if (url.pathname !== '/') return res.writeHead(404).end();
    if (url.searchParams.get('state') !== state || used) return res.writeHead(400).end('Invalid or used request.');
    if (url.searchParams.has('error')) {
      used = true; clearTimeout(timer); server.close(); return res.end('Authorization declined. Nothing saved.');
    }
    const code = url.searchParams.get('code');
    if (!code) return res.writeHead(400).end('Missing authorization code.');
    used = true;
    let stage = 'token exchange';
    try {
      const tokens = await boundedJson(await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code,
          code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }),
      }), 16000);
      stage = 'permission validation';
      if (!validScopes(tokens.scope) || !tokens.access_token) throw new Error('Invalid scope.');
      stage = 'Google identity signature verification';
      const ticket = await new OAuth2Client(client.client_id).verifyIdToken({ idToken: tokens.id_token, audience: client.client_id });
      const profile = ticket.getPayload();
      stage = 'mailbox and refresh-token validation';
      verifyAuthorization(tokens, profile);
      stage = 'local credential save';
      fs.writeFileSync(destination, JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret,
        refresh_token: tokens.refresh_token, scope: tokens.scope, mailbox: MAILBOX, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      res.end('Send-only sender authorization saved locally. No email was read, sent or changed; only mailbox identity was checked. Production access is not enabled.');
      console.log('Send-only sender authorization saved to ignored .env.company-send-oauth.json. No credentials logged.');
    } catch {
      res.writeHead(500).end(`Authorization failed during ${stage}. No credentials saved. Ask PATHWAY support to restart setup.`);
      console.error(`Sender authorization failed during ${stage}. No credential details logged.`); process.exitCode = 1;
    } finally { clearTimeout(timer); server.close(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  redirect = `http://127.0.0.1:${server.address().port}/`;
  authUrl = authorizationUrl(client.client_id, redirect, state, verifier, { scope: READ_SCOPE, mailbox: MAILBOX });
  console.log(`Open ${redirect}start to authorize ${MAILBOX}. Expires in 15 minutes.`);
  timer = setTimeout(() => { console.log('Sender authorization window expired.'); server.close(); }, 900000);
}
if (require.main === module) main(process.argv[2]).catch(() => { console.error('Could not start sender authorization. Check Desktop client JSON and existing authorization file. No secrets logged.'); process.exitCode = 1; });
module.exports = { verifyAuthorization, validScopes, MAILBOX };
