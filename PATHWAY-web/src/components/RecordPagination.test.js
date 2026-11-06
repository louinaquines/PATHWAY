import { fireEvent, render, screen } from '@testing-library/react';
import RecordPagination, { useRecordPage } from './RecordPagination';
import PaginationButtonGroup from './PaginationButtonGroup';
function List({ records, scope = '' }) {
  const pagination = useRecordPage(records, scope);
  return <><RecordPagination pagination={pagination} label="Test records" /><ul>{pagination.items.map(item => <li key={item}>{item}</li>)}</ul></>;
}
const records = Array.from({ length: 1003 }, (_, index) => 'Record ' + (index + 1));
test('large lists render only 25 records and retain a reachable final page', () => {
  render(<List records={records} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(25);
  for (let i = 0; i < 40; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(screen.getByText('Record 1003')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  expect(records).toHaveLength(1003);
});
test('search scope resets the page and a shrinking background result stays valid', () => {
  const { rerender } = render(<List records={records} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Record 26')).toBeInTheDocument();
  rerender(<List records={records} scope="new section" />);
  expect(screen.getByText('Record 1')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  rerender(<List records={['Only remaining record']} scope="new section" />);
  expect(screen.getByText('Only remaining record')).toBeInTheDocument();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
test('evaluation pagination stays compact with ten thousand pages', () => {
  render(<PaginationButtonGroup page={5000} pageCount={10000} onPageChange={() => {}} />);
  expect(screen.getAllByRole('button')).toHaveLength(7);
  expect(screen.getByText('Page 5000 of 10000')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '5000' })).toHaveAttribute('aria-current', 'page');
});
