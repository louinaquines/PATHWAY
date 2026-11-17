const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const cli = createRequire(require.resolve('firebase-tools/package.json'));

test('Firebase CLI gaxios multipart caller supports the scoped UUID override on loopback', async () => {
  const server = require('node:http').createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    assert.match(req.headers['content-type'], /multipart\/related; boundary=[0-9a-f-]{36}/);
    assert.ok(body.includes('SYNTHETIC-MULTIPART'));
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await cli('gaxios').request({
      url: `http://127.0.0.1:${server.address().port}/`, method: 'POST', retry: false, timeout: 3000,
      multipart: [{ headers: { 'Content-Type': 'text/plain' }, content: 'SYNTHETIC-MULTIPART' }],
    });
    assert.equal(response.data.ok, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('get-uri FTP caller supports the scoped FTP override with an in-memory transport', async () => {
  const getUri = cli('get-uri');
  const parent = createRequire(cli.resolve('get-uri'));
  const { Client } = parent('basic-ftp');
  const names = ['access', 'lastMod', 'list', 'downloadTo', 'close'];
  const saved = Object.fromEntries(names.map(name => [name, Client.prototype[name]]));
  let closed = false;
  let listed = false;
  Object.assign(Client.prototype, {
    access: async () => {}, lastMod: async () => null,
    list: async () => { listed = true; return [{ name: 'synthetic.txt', modifiedAt: new Date('2026-10-25T00:00:00Z') }]; },
    downloadTo: async stream => { stream.end('SYNTHETIC-FTP'); return { message: 'ok' }; },
    close: () => { closed = true; },
  });
  try {
    const stream = await getUri.getUri('ftp://synthetic.invalid/synthetic.txt');
    let bytes = '';
    for await (const chunk of stream) bytes += chunk;
    assert.equal(bytes, 'SYNTHETIC-FTP');
    assert.equal(listed, true);
    assert.equal(closed, true);
  } finally {
    Object.assign(Client.prototype, saved);
  }
});

test('Firebase CLI PubSub override constructs local handles and closes without credentials', async () => {
  const { PubSub } = cli('@google-cloud/pubsub');
  const client = new PubSub({ projectId: 'demo-pathway-security', apiEndpoint: '127.0.0.1:1' });
  assert.match(client.topic('synthetic').name, /topics\/synthetic$/);
  assert.match(client.subscription('synthetic').name, /subscriptions\/synthetic$/);
  await client.close();
});
