// Test-only localhost fault injection; imports never start a listener or load credentials.
const http = require('node:http');
const { createHash } = require('node:crypto');
const FIXTURE = 'Synthetic native test E: recover one saved entry after a lost success response.';
const hash = value => createHash('sha256').update(value).digest('hex');
function createLostResponseProxy({ enabled = false, upstreamPort = 3100, onEvent = () => {} } = {}) {
  if (enabled !== true) return null;
  if (!Number.isInteger(upstreamPort) || upstreamPort < 1024 || upstreamPort > 65535) throw Error('Invalid local port');
  let state = 'ready';
  const server = http.createServer(async (req, res) => {
    const reply = status => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end('{"error":"Local synthetic rehearsal only; no automatic retry."}'); };
    if (req.method !== 'POST' || req.url !== '/student/journals') return reply(403);
    if (state === 'stopped' || state === 'done') return reply(503);
    if (state === 'sending') return reply(409);
    try {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 5000) return reply(413); }
      const body = JSON.parse(raw);
      if (!body || body.rawNotes !== FIXTURE || body.refined !== FIXTURE || body.aiRefined !== false || body.hours !== 8
        || typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(body.requestId)
        || Object.keys(body).some(k => !['rawNotes','refined','aiRefined','hours','requestId'].includes(k))
        || typeof req.headers.authorization !== 'string' || !req.headers.authorization.startsWith('Bearer ')) return reply(403);
      const fingerprint = hash(raw);
      if (state === 'sending') return reply(409);
      if (state === 'done' || state === 'stopped') return reply(503);
      state = 'sending';
      const response = await fetch(`http://127.0.0.1:${upstreamPort}/student/journals`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', authorization: req.headers.authorization }, body: raw,
      });
      let contents = '';
      for await (const chunk of response.body) { contents += Buffer.from(chunk).toString('utf8'); if (Buffer.byteLength(contents) > 32768) throw Error('Oversized response'); }
      const result = JSON.parse(contents);
      if (!response.ok || typeof result.entryId !== 'string' || result.revision !== 1 || result.analysisStatus !== 'not-enabled') throw Error('Unexpected result');
      state = 'done';
      onEvent({ event: 'response-dropped', entryId: result.entryId, requestHash: fingerprint });
      res.destroy();
    } catch {
      state = 'stopped'; if (!res.destroyed) reply(503);
      onEvent({ event: 'stopped', automaticRetry: false });
    }
  });
  server.requestTimeout = 15000;
  return server;
}
if (require.main === module) {
  if (!process.argv.includes('--approved-native-e') || process.env.PATHWAY_LOCAL_WORKFLOW !== '1'
    || process.env.GOOGLE_CLOUD_PROJECT !== 'demo-pathway-security' || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099' || process.env.NODE_ENV === 'production') throw Error('Pinned local demo required');
  const server = createLostResponseProxy({ enabled: true, onEvent: event => {
    console.log(JSON.stringify(event));
    if (event.event === 'response-dropped' || event.event === 'stopped') setImmediate(() => { server.closeAllConnections(); server.close(); });
  } });
  server.on('error', () => { console.error('Local proxy unavailable.'); process.exitCode = 1; });
  server.listen(3101, '127.0.0.1', () => console.log('Synthetic E rehearsal listening on localhost:3101.'));
  process.on('SIGINT', () => { server.closeAllConnections(); server.close(); });
}
module.exports = { createLostResponseProxy };
