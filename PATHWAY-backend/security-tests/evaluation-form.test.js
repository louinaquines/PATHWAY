const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateForm, validateAnswers } = require('../evaluationForm');
const definition = { title: 'Review', instructions: 'Be honest', questions: [
  { id: 'q_rating', label: 'Quality', type: 'rating', required: true },
  { id: 'q_text', label: 'Feedback', type: 'text', required: true },
  { id: 'q_optional', label: 'Other', type: 'text', required: false },
] };
test('normalizes and snapshots custom questions', () => {
  const form = validateForm(definition);
  definition.questions[0].label = 'Changed later';
  assert.equal(form.questions[0].label, 'Quality');
  definition.questions[0].label = 'Quality';
  assert.equal(form.version, 1);
  assert.deepEqual(validateAnswers(form, { q_rating: 5, q_text: ' Good work ' }), { q_rating: 5, q_text: 'Good work' });
});
test('rejects malformed, duplicate and oversized forms', () => {
  for (const form of [null, { ...definition, title: '' }, { ...definition, questions: [] }, { ...definition, questions: Array(21).fill(definition.questions[0]) }, { ...definition, questions: [definition.questions[0], definition.questions[0]] }, { ...definition, questions: [{ ...definition.questions[0], type: 'script' }] }]) assert.throws(() => validateForm(form), e => e.status === 400);
});
test('rejects missing required, invalid ratings, unknown and oversized answers', () => {
  const form = validateForm(definition);
  for (const answers of [{}, { q_rating: 6, q_text: 'ok' }, { q_rating: 1.5, q_text: 'ok' }, { q_rating: '5', q_text: 'ok' }, { q_rating: 5, q_text: '   ' }, { q_rating: 5, q_text: 'x'.repeat(4001) }, { q_rating: 5, q_text: 'ok', unexpected: 'answer' }]) assert.throws(() => validateAnswers(form, answers), e => e.status === 400);
});
