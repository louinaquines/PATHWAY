import { documentTextChecks } from './documentTextChecks';
test('unreadable text requires manual review', () => {
  expect(documentTextChecks('').status).toBe('manual_review');
  expect(documentTextChecks('').message).toContain('scan');
});
test('required terms are warnings, not approval', () => {
  const result = documentTextChecks('Student name: Test. A document containing text.', ['student', 'signature']);
  expect(result.missingTerms).toEqual(['signature']); expect(result.status).toBe('manual_review');
});
