import test from 'node:test';
import assert from 'node:assert/strict';
import configure from '../vite.config.mjs';

test('production uses the live HTTPS backend and rejects malformed local overrides', () => {
  const previous = process.env.REACT_APP_BACKEND_URL;
  try {
    delete process.env.REACT_APP_BACKEND_URL;
    const config = configure({ mode: 'production' });
    assert.equal(JSON.parse(config.define['process.env.REACT_APP_BACKEND_URL']), 'https://pathway-backend-49a9.onrender.com');
    for (const value of ['http://localhost:3000;', 'http://localhost:3000', 'https://localhost', 'not-a-url']) {
      process.env.REACT_APP_BACKEND_URL = value;
      assert.throws(() => configure({ mode: 'production' }), /Production/);
    }
  } finally {
    if (previous === undefined) delete process.env.REACT_APP_BACKEND_URL;
    else process.env.REACT_APP_BACKEND_URL = previous;
  }
});

test('Vite environment adapter exposes only explicitly approved public keys', () => {
  const old = process.env.SMTP_PASSWORD;
  process.env.SMTP_PASSWORD = 'secret-do-not-bundle';
  try {
    const config = configure({ mode: 'test' });
    assert.equal(Object.keys(config.define).length, 8);
    assert.equal(config.define['process.env'], undefined);
    assert.equal(config.define['process.env.SMTP_PASSWORD'], undefined);
    assert.ok(!JSON.stringify(config.define).includes('secret-do-not-bundle'));
  } finally {
    if (old === undefined) delete process.env.SMTP_PASSWORD;
    else process.env.SMTP_PASSWORD = old;
  }
});

test('Vite staging server is local, strict-port and separate from the live demo', () => {
  const config = configure({ mode: 'test' });
  assert.deepEqual(config.server, { host: '127.0.0.1', port: 3002, strictPort: true });
  assert.equal(config.build.outDir, 'build-vite');
  assert.equal(config.build.sourcemap, false);
});

test('existing JavaScript JSX transform leaves other files untouched', async () => {
  const plugin = configure({ mode: 'test' }).plugins[0];
  assert.equal(await plugin.transform('body {}', '/src/index.css'), undefined);
  const transformed = await plugin.transform('export default () => <div>PATHWAY</div>;', 'C:\\portal\\src\\App.js');
  assert.ok(transformed.code.includes('react/jsx-runtime'));
});
