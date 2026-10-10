import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config = JSON.parse(fs.readFileSync(new URL('../../firebase.staff-hosting.json', import.meta.url), 'utf8'));
test('hosting uses current Vite artifact and supports evaluation deep-link reloads', () => {
  assert.equal(config.hosting.public, 'PATHWAY-web/build-vite');
  assert.deepEqual(config.hosting.rewrites, [{ source: '**', destination: '/index.html' }]);
});
test('hosting avoids token referrer leakage and stale application shell caching', () => {
  assert.ok(config.hosting.headers.find(rule => rule.source === '**').headers.some(header => header.key === 'Referrer-Policy' && header.value === 'no-referrer'));
  assert.ok(config.hosting.headers.find(rule => rule.source === '/index.html').headers.some(header => header.key === 'Cache-Control' && header.value.includes('no-store')));
});
test('standalone hosting configuration cannot deploy database rules or a backend', () => {
  assert.deepEqual(Object.keys(config), ['hosting']);
  assert.equal(config.hosting.site, undefined);
});
