const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluationEmailHtml } = require('../evaluationEmailTemplate');
test('branded invitation escapes all authored content and includes secure action', () => {
  const html = evaluationEmailHtml({ studentName: '<script>student</script>', supervisorName: 'A & B', companyName: '"Company"', expiresAt: '2026-10-16T19:31:00Z', formDefinition: { title: '<img onerror=alert(1)>' } }, '<b>hello</b>\nsecond line', 'https://example.com/evaluate?token=test');
  assert.ok(html.includes('PATHWAY'));
  assert.ok(html.includes('Open Evaluation'));
  assert.ok(html.includes('Philippine time'));
  assert.ok(html.includes('&lt;script&gt;student&lt;/script&gt;'));
  assert.ok(html.includes('&lt;b&gt;hello&lt;/b&gt;<br>second line'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
});
