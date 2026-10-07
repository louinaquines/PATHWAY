import { requirementProgress } from './requirementProgress';

test('counts only approved documents from the configured checklist', () => {
  expect(requirementProgress({ a: { status: 'approved' }, b: { status: 'submitted' }, c: { status: 'rejected' }, extra: { status: 'approved' } }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]))
    .toEqual({ approved: 1, total: 4, percentage: 25 });
});

test('handles an empty checklist without reporting completion', () => {
  expect(requirementProgress()).toEqual({ approved: 0, total: 0, percentage: 0 });
});

test('deduplicates requirements and rounds the percentage', () => {
  expect(requirementProgress({ a: { status: 'approved' } }, [{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'c' }]).percentage).toBe(33);
});

test('reports fully approved requirements as 100 percent', () => {
  expect(requirementProgress({ a: { status: 'approved' } }, [{ id: 'a' }]).percentage).toBe(100);
});
