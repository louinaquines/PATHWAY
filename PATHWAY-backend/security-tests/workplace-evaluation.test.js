const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'), path = require('node:path');
test('unreviewed labels cannot create a model quality claim', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '../workplaceEvaluation.js')), 'Evaluation scorer missing');
  const { scoreWorkplaceEvaluation } = require('../workplaceEvaluation');
  assert.throws(() => scoreWorkplaceEvaluation([{ id: 'a', language: 'en', expected: 'none', reviewedBy: '' }], [{ id: 'a', predicted: 'none' }]));
});
test('metrics separate false positives, misses, priority errors and unavailable per language', () => {
  const { scoreWorkplaceEvaluation } = require('../workplaceEvaluation');
  const examples = [['a','en','none'],['b','en','high'],['c','fil','normal'],['d','ceb','high']].map(([id,language,expected]) => ({ id,language,expected,reviewedBy:'Synthetic reviewer fixture',reviewedAt:'2026-10-23T00:00:00Z' }));
  const s = scoreWorkplaceEvaluation(examples, [{id:'a',predicted:'normal'},{id:'b',predicted:'none'},{id:'c',predicted:'high'},{id:'d',predicted:'unavailable'}]);
  assert.equal(s.total,4); assert.equal(s.falsePositives,1); assert.equal(s.falseNegatives,1); assert.equal(s.priorityErrors,1); assert.equal(s.unavailable,1); assert.equal(s.byLanguage.ceb.unavailable,1);
  assert.throws(() => scoreWorkplaceEvaluation(examples, [{id:'a',predicted:'none'}]));
  assert.throws(() => scoreWorkplaceEvaluation(examples, [...examples.map(v=>({id:v.id,predicted:'none'})),{id:'unknown',predicted:'none'}]));
});
