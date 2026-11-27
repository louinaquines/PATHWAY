import { categorize, groupNotifications } from './DashboardNotifications';
const n = (id, title, extra = {}) => ({ id, title, message: '', createdAt: `2026-11-27T12:0${id}:00Z`, read: false, ...extra });
test('each notification opens the right screen', () => {
  expect(categorize(n(1, 'Document ready for your review')).tab).toBe('requirements');
  expect(categorize(n(1, 'Company placement request')).tab).toBe('placements');
  expect(categorize(n(1, 'Journal submitted')).tab).toBe('logbook');
  expect(categorize(n(1, 'Workplace report', { type: 'workplace_support' })).tab).toBe('messages');
  expect(categorize(n(1, 'Supervisor evaluation submitted')).tab).toBe('evaluations');
});
test('same-type notifications group with names; workplace reports come first', () => {
  const names = { a: 'Abad, Joanna', b: 'Cruz, Jose' };
  const groups = groupNotifications([
    n(1, 'Document ready for your review', { studentId: 'a' }),
    n(2, 'Document ready for your review', { studentId: 'b' }),
    n(3, 'Company placement request', { studentId: 'a' }),
    n(0, 'Workplace report', { type: 'workplace_support', studentId: 'b' }),
  ], id => names[id]);
  expect(groups.map(g => g.title)).toEqual(['Workplace report', 'Placement request', '2 documents to review']);
  expect(groups[2].detail).toBe('Abad, Joanna · Cruz, Jose');
});
