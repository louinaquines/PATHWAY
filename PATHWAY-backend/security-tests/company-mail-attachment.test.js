const test = require('node:test');
const assert = require('node:assert/strict');
const { reviewedAttachment } = require('../companyMailAttachment');
const pdf = { name: 'test-only.pdf', base64: Buffer.from('%PDF-1.4\nTEST ONLY\n%%EOF\n').toString('base64'), reviewed: true };
test('reviewed PDF is bounded byte content, not a filesystem path', () => {
  const file = reviewedAttachment(pdf); assert.equal(file.filename, pdf.name); assert.equal(file.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(file.content)); assert.match(file.sha256, /^[a-f0-9]{64}$/);
  assert.equal(reviewedAttachment(null), null);
});
test('unreviewed, misleading, oversized and remote attachments are rejected', () => {
  for (const candidate of [{ ...pdf, reviewed: false }, { ...pdf, name: '../test.pdf' }, { ...pdf, path: '/secret' },
    { ...pdf, base64: Buffer.from('<html>Not PDF</html>').toString('base64') }, { ...pdf, base64: 'A'.repeat(800000) }]) {
    assert.throws(() => reviewedAttachment(candidate), error => error.status === 400);
  }
});
