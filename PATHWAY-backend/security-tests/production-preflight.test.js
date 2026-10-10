const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProduction, validatePackaging, assertProductionStartup } = require('../productionPreflight');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const configured = {
  NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'pathway-staging', CORS_ALLOWED_ORIGINS: 'https://staff.example.test,https://students.example.test',
  CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: '123', CLOUDINARY_API_SECRET: 'test-only',
  SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_FROM: 'test@example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'test-only',
  EVALUATION_WEB_URL: 'https://staff.example.test',
};
test('explicit nonlocal production configuration passes structural validation', () => assert.deepEqual(validateProduction(configured).errors, []));

test('local Expo browser exception accepts only the explicit test origin', () => {
  assert.deepEqual(validateProduction({ ...configured, CORS_LOCAL_TEST_ORIGIN: 'http://localhost:8082' }).errors, []);
  for (const origin of ['*', 'http://localhost:8081', 'http://localhost:8082/path', 'https://untrusted.example']) {
    assert.ok(validateProduction({ ...configured, CORS_LOCAL_TEST_ORIGIN: origin }).errors.some(message => message.includes('CORS_LOCAL_TEST_ORIGIN')));
  }
});
test('rejects emulator flags, demo projects and unsafe origins without exposing values', () => {
  const result = validateProduction({ ...configured, GOOGLE_CLOUD_PROJECT: 'demo-pathway-security', FIRESTORE_EMULATOR_HOST: 'private-secret-marker', CORS_ALLOWED_ORIGINS: 'http://localhost:3001' });
  assert.equal(result.errors.length, 3);
  assert.ok(!JSON.stringify(result).includes('private-secret-marker'));
});
test('rejects URLs with paths or credentials and invalid SMTP ports', () => {
  assert.ok(validateProduction({ ...configured, CORS_ALLOWED_ORIGINS: 'https://staff.example.test/path', SMTP_PORT: 'NaN' }).errors.length === 2);
  assert.ok(validateProduction({ ...configured, CORS_ALLOWED_ORIGINS: 'https://user:pass@staff.example.test' }).errors.length === 1);
});
test('backend Dockerfile includes the server runtime dependencies', () => assert.deepEqual(validatePackaging(), []));
test('evaluation URLs require a public HTTPS origin', () => {
  for (const url of [undefined, 'http://staff.example.test', 'https://localhost', 'https://127.0.0.1', 'https://[::1]', 'https://192.168.1.1', 'https://staff.example.test/evaluate', 'https://staff.example.test?token=secret', 'https://staff.example.test/#fragment', 'https://user:secret@staff.example.test']) {
    assert.ok(validateProduction({ ...configured, EVALUATION_WEB_URL: url }).errors.some(message => message.includes('EVALUATION_WEB_URL')));
  }
});
test('production startup rejects local QA flags and does not leak their values', () => {
  assert.doesNotThrow(() => assertProductionStartup({ NODE_ENV: 'development', PATHWAY_LOCAL_WORKFLOW: '1' }));
  for (const flag of ['PATHWAY_CLOUDINARY_QA', 'PATHWAY_CLOUDINARY_QA_CONFIRMED', 'PATHWAY_EMULATOR_RESTORED', 'FIREBASE_EMULATOR_HUB']) {
    assert.throws(() => assertProductionStartup({ ...configured, [flag]: 'private-secret-marker' }), error => error.message.includes(flag) && !error.message.includes('private-secret-marker'));
  }
});
test('actual server stops on invalid production configuration before initializing Firebase', () => {
  const result = spawnSync(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 10000,
    env: { ...process.env, NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'demo-startup-test', PATHWAY_LOCAL_WORKFLOW: '1' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Production startup blocked/);
  assert.doesNotMatch(result.stderr, /Could not load the default credentials/);
});
