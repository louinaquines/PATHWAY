export const REQUIREMENT_CATEGORIES = ['Pre-OJT', 'Ongoing', 'Post-OJT', 'Other'];

export function requirementCategory(value) {
  const category = String(value || '').trim();
  // Older checklists omit category; they are pre-deployment requirements.
  if (!category) return 'Pre-OJT';
  if (category === 'Pre-Deployment') return 'Pre-OJT';
  return REQUIREMENT_CATEGORIES.includes(category) ? category : 'Other';
}
