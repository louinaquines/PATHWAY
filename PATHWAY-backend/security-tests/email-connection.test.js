const { test } = require('node:test');
const assert = require('node:assert/strict');
const mail = require('../endorsementMail');
const original = mail.endorsementMailer;
let checks = 0, sends = 0, closes = 0, fail = false;
mail.endorsementMailer = () => ({ transport: {
  verify: async () => { checks++; if (fail) throw new Error('secret'); },
  sendMail: async () => { sends++; }, close: () => { closes++; },
} });
delete require.cache[require.resolve('../evaluationMail')];
const { installEvaluationMail } = require('../evaluationMail');
test('connection check is coordinator-only, verifies without sending, and hides errors', async () => {
  const previous = process.env.MAIL_PROVIDER;
  process.env.MAIL_PROVIDER = 'gmail';
  let handler;
  installEvaluationMail({ app: { post: (route, middleware, callback) => { if (route === '/coordinator/email-connection') handler = callback; } }, requireStaff() {}, allowRate: () => true });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  try {
    const denied = response(); await handler({ staff: { role: 'student' } }, denied);
    assert.equal(denied.code, 403); assert.equal(checks, 0);
    const ok = response(); await handler({ staff: { role: 'coordinator', uid: 'qa' } }, ok);
    assert.equal(ok.body.success, true); assert.equal(sends, 0); assert.equal(closes, 1);
    fail = true;
    const bad = response(); await handler({ staff: { role: 'coordinator', uid: 'qa' } }, bad);
    assert.equal(bad.code, 503); assert.ok(!JSON.stringify(bad.body).includes('secret')); assert.equal(sends, 0);
  } finally {
    if (previous === undefined) delete process.env.MAIL_PROVIDER; else process.env.MAIL_PROVIDER = previous;
    mail.endorsementMailer = original;
  }
});
