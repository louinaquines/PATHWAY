const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { publicIPv4, publicUrl, extractProfile, fetchPublicProfile } = require('../companyProfileImport');
test('private, reserved and IPv6 addresses are denied', () => {
  for (const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','::1','8.8.8.8.evil','224.0.0.1']) assert.equal(publicIPv4(ip), false);
  assert.equal(publicIPv4('8.8.8.8'), true);
});
test('credentials, HTTP, literal addresses and custom ports denied', () => {
  for (const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://example.com:8080','https://localhost','https://[::1]']) assert.throws(() => publicUrl(url));
});
test('mixed DNS answers fail closed before fetching', async () => {
  await assert.rejects(fetchPublicProfile('https://example.com', { lookup: async () => [{ address: '8.8.8.8' }, { address: '127.0.0.1' }] }), /restricted/);
});
test('extracts only conservative suggestions and attributes source', () => {
  const result = extractProfile('<title>Test &amp; Company</title><meta name="description" content="Public description"><a href="mailto:test@example.com">Email</a><a href="tel:+1234">Phone</a>', 'https://example.com/');
  assert.equal(result.name, 'Test & Company'); assert.equal(result.email, 'test@example.com'); assert.equal(result.sourceUrl, 'https://example.com/');
});

function transport(pages, inspect = () => {}) {
  return (url, options, callback) => {
    inspect(url, options);
    const request = new EventEmitter();
    options.signal.addEventListener('abort', () => request.emit('error', new Error('Request aborted')), { once: true });
    queueMicrotask(() => {
      const page = pages.shift();
      if (!page) return;
      const response = new EventEmitter();
      response.statusCode = page.status || 200;
      response.headers = page.headers || { 'content-type': 'text/html' };
      let destroyed = false;
      response.destroy = error => { destroyed = true; if (error) queueMicrotask(() => response.emit('error', error)); };
      callback(response);
      if (!destroyed) {
        response.emit('data', Buffer.from(page.body || '<title>Public company</title>'));
        if (!destroyed) response.emit('end');
      }
    });
    return request;
  };
}
const publicLookup = async () => [{ address: '8.8.8.8', family: 4 }];

test('redirects revalidate DNS and pin the address without changing TLS hostname', async () => {
  const hosts = [];
  const preview = await fetchPublicProfile('https://example.com/', {
    lookup: async host => { hosts.push(host); return publicLookup(); },
    get: transport([{ status: 302, headers: { location: 'https://company.example/about' } }, {}], (url, options) => {
      assert.ok(['example.com', 'company.example'].includes(url.hostname));
      options.lookup(url.hostname, { all: true }, (error, records) => {
        assert.equal(error, null); assert.deepEqual(records, [{ address: '8.8.8.8', family: 4 }]);
      });
    }),
  });
  assert.deepEqual(hosts, ['example.com', 'company.example']);
  assert.equal(preview.sourceUrl, 'https://company.example/about');
});

test('private redirect targets never reach the transport', async () => {
  let calls = 0;
  await assert.rejects(fetchPublicProfile('https://example.com', {
    lookup: async host => [{ address: host === 'example.com' ? '8.8.8.8' : '10.0.0.1' }],
    get: transport([{ status: 302, headers: { location: 'https://internal.example/' } }], () => calls++),
  }), /restricted/);
  assert.equal(calls, 1);
});

test('redirect loops are bounded', async () => {
  await assert.rejects(fetchPublicProfile('https://example.com', {
    lookup: publicLookup, get: transport(Array.from({ length: 4 }, () => ({ status: 302, headers: { location: '/again' } }))),
  }), /Too many redirects/);
});

test('oversized, compressed and non-HTML pages are rejected', async () => {
  for (const page of [{ body: 'a'.repeat(1024 * 1024 + 1) }, { headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' } }, { headers: { 'content-type': 'application/pdf' } }]) {
    await assert.rejects(fetchPublicProfile('https://example.com', { lookup: publicLookup, get: transport([page]) }), /limit|supported/);
  }
});

test('DNS and stalled requests both respect the deadline', async () => {
  await assert.rejects(fetchPublicProfile('https://example.com', { lookup: () => new Promise(() => {}), timeoutMs: 20 }), /timed out/);
  await assert.rejects(fetchPublicProfile('https://example.com', { lookup: publicLookup, get: transport([]), timeoutMs: 20 }), /aborted/);
});
