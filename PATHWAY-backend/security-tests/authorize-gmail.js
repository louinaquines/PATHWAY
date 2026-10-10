// Local, one-time send-only OAuth bootstrap. No mail is sent.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
function readClient(file) {
  const client = JSON.parse(fs.readFileSync(file, 'utf8')).installed;
  if (!client || typeof client.client_id !== 'string' || !client.client_id.endsWith('.apps.googleusercontent.com')
    || typeof client.client_secret !== 'string' || !client.client_secret) throw new Error('Expected Google Desktop app credentials.');
  return client;
}
function authorizationUrl(clientId, redirect, state, verifier, { scope = SCOPE, mailbox = 'louinaquines@gmail.com' } = {}) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code',
    scope, state, code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', login_hint: mailbox,
    include_granted_scopes: 'false' }).toString();
  return url.href;
}
async function main(file) {
  const client = readClient(file);
  const destination = path.resolve(__dirname, '..', '.env.gmail-oauth.json');
  if (fs.existsSync(destination)) throw new Error('Authorization file already exists; refusing to overwrite it.');
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(64).toString('base64url');
  let authUrl, redirect, timer, used = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const url = new URL(req.url, redirect);
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    if (url.pathname === '/start') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<h1>PATHWAY Gmail authorization</h1><p>Sign in as louinaquines@gmail.com. This requests send-only access. No email will be sent.</p><a href="${authUrl.replaceAll('&', '&amp;')}">Continue to Google</a>`);
      return;
    }
    if (url.pathname !== '/') { res.writeHead(404).end(); return; }
    if (url.searchParams.get('state') !== state || used) { res.writeHead(400).end('Invalid authorization request.'); return; }
    if (url.searchParams.has('error')) {
      used = true; res.end('Authorization declined. No credentials saved.'); clearTimeout(timer); server.close(); return;
    }
    const code = url.searchParams.get('code');
    if (!code) { res.writeHead(400).end('Missing authorization code.'); return; }
    used = true;
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(20000),
        body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret,
          code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }) });
      const tokens = await response.json();
      if (!response.ok || !tokens.refresh_token || tokens.scope !== SCOPE) throw new Error('Token exchange or send-only scope verification failed.');
      fs.writeFileSync(destination, JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret,
        refresh_token: tokens.refresh_token, scope: SCOPE, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
      res.end('PATHWAY authorization saved locally. You may close this tab. No email was sent.');
      console.log('Send-only authorization saved to ignored .env.gmail-oauth.json; no credentials printed and no email sent.');
    } catch (_) {
      res.writeHead(500).end('Authorization could not be saved. Ask PATHWAY support to restart the local setup.');
      console.error('Authorization failed; no credential details logged.'); process.exitCode = 1;
    } finally { clearTimeout(timer); server.close(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  redirect = `http://127.0.0.1:${server.address().port}/`;
  authUrl = authorizationUrl(client.client_id, redirect, state, verifier);
  console.log(`Open ${redirect}start on this laptop to approve send-only access yourself.`);
  console.log('Expires after 15 minutes. Testing-mode Google refresh tokens generally expire after 7 days.');
  timer = setTimeout(() => { console.log('Authorization window expired; restart setup if needed.'); server.close(); }, 15 * 60 * 1000);
}
if (require.main === module) main(process.argv[2]).catch(() => { console.error('Could not start authorization. Check the Desktop JSON path and whether local credentials already exist. No secrets logged.'); process.exitCode = 1; });
module.exports = { authorizationUrl, readClient, SCOPE };
