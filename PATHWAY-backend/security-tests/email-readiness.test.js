const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkEmailReadiness } = require('../emailReadiness');
const ready = { SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_FROM: 'pathway@example.invalid', SMTP_USER: 'qa-user', SMTP_PASSWORD: 'not-a-real-secret', EVALUATION_WEB_URL: 'https://portal.example.invalid' };
test('configuration shape can pass without contacting providers', () => assert.deepEqual(checkEmailReadiness(ready), []));
test('missing settings report names, never values', () => {
  const errors = checkEmailReadiness({});
  assert.equal(errors.length, 6);
  assert.ok(errors.some(message => message.includes('SMTP_PASSWORD')));
});
test('unsafe evaluation origins fail', () => {
  for (const origin of ['http://portal.example.invalid', 'https://localhost', 'https://127.0.0.1', 'https://portal.example.invalid/evaluate', 'https://portal.example.invalid?token=secret', 'https://user:secret@portal.example.invalid']) {
    assert.ok(checkEmailReadiness({ ...ready, EVALUATION_WEB_URL: origin }).length > 0);
  }
});
test('invalid SMTP fields fail without exposing credential values', () => {
  for (const override of [{ SMTP_PORT: 'no' }, { SMTP_FROM: 'a@example.invalid,b@example.invalid' }, { SMTP_HOST: '127.0.0.1' }, { SMTP_PASSWORD: '' }]) {
    const errors = checkEmailReadiness({ ...ready, ...override });
    assert.ok(errors.length > 0);
    assert.ok(errors.every(message => !message.includes(ready.SMTP_PASSWORD)));
  }
});
