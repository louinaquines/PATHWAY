import { fireEvent, render, screen, within } from '@testing-library/react';
import CoordinatorRecordPicker from './CoordinatorRecordPicker';

test('a large picker finds a distant match and keeps the selected form value', () => {
  const options = Array.from({ length: 10000 }, (_, index) => ({
    id: String(index), label: 'Student ' + index,
  }));
  render(<form aria-label="Assignment"><CoordinatorRecordPicker label="Student" name="studentId" options={options} required /></form>);
  const picker = screen.getByRole('combobox', { name: 'Student' });
  expect(within(picker).getAllByRole('option')).toHaveLength(26);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search student' }), { target: { value: 'Student 9999' } });
  fireEvent.change(picker, { target: { value: '9999' } });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search student' }), { target: { value: '' } });
  expect(picker).toHaveValue('9999');
  expect(new FormData(screen.getByRole('form', { name: 'Assignment' })).get('studentId')).toBe('9999');
  expect(within(picker).getAllByRole('option')).toHaveLength(27);
});
