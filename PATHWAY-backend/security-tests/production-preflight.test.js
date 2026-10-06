const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateProduction, validatePackaging } = require('../productionPreflight');

const configured = {
  NODE_ENV: 'production', GOOGLE_CLOUD_PROJECT: 'pathway-staging', CORS_ALLOWED_ORIGINS: 'https://staff.example.test,https://students.example.test',
  CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: '123', CLOUDINARY_API_SECRET: 'test-only',
  SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_FROM: 'test@example.test', SMTP_USER: 'test', SMTP_PASSWORD: 'test-only',
};
test('explicit nonlocal production configuration passes structural validation', () => assert.deepEqual(validateProduction(configured).errors, []));
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
