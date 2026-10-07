import { REQUIREMENT_CATEGORIES, requirementCategory } from './requirementCategory';

test('legacy and blank categories remain visible as pre-deployment requirements', () => {
  [undefined, null, '', '   '].forEach(value => expect(requirementCategory(value)).toBe('Pre-OJT'));
});
test('configured categories are retained and unknown categories cannot disappear', () => {
  REQUIREMENT_CATEGORIES.forEach(value => expect(requirementCategory(value)).toBe(value));
  expect(requirementCategory('Custom checklist')).toBe('Other');
  expect(requirementCategory(' Ongoing ')).toBe('Ongoing');
  expect(requirementCategory('Pre-Deployment')).toBe('Pre-OJT');
});
