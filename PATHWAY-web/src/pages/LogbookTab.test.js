import { fireEvent, render, screen, within } from '@testing-library/react';
import { getDocs, onSnapshot } from 'firebase/firestore';
import LogbookTab from './LogbookTab';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../components/DtrReviewDialog', () => ({ student, onClose }) => <div role="dialog">DTR for {student.firstName}<button onClick={onClose}>Close comparison</button></div>);
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn(), onSnapshot: jest.fn() }));
const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });

test('coordinator sees phone attendance in Philippine time even without journal submissions', async () => {
  getDocs.mockResolvedValue(snapshot([]));
  getDocs.mockResolvedValueOnce(snapshot([{ id: 'section', name: 'QA Section' }]))
    .mockResolvedValueOnce(snapshot([{ id: 'qa-student', firstName: 'Journey', lastName: 'QA' }]));
  const unsubscribe = jest.fn();
  onSnapshot.mockImplementation((reference, next) => {
    next(snapshot([{ id: '2026-10-08', date: '2026-10-08', timeIn: '2026-10-07T18:45:38.775Z', timeOut: '2026-10-07T18:47:13.086Z', hoursToday: 0.03 }]));
    return unsubscribe;
  });
  const header = document.createElement('div');
  header.id = 'logbook-header-actions';
  document.body.appendChild(header);
  const view = render(<LogbookTab coordinatorId="coordinator" />);
  fireEvent.click(await screen.findByRole('button', { name: /QA Section/ }));
  expect(within(header).getByRole('button', { name: 'Export Data' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Compare DTR' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: /Journey QA/ }));
  expect(within(header).getByRole('button', { name: 'Export Data' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Compare DTR' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('DTR for Journey');
  expect(await screen.findByText('2:45:38 AM')).toBeVisible();
  expect(screen.getByText('2:47:13 AM')).toBeVisible();
  expect(screen.getByText('0.03')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Weekly journals' }));
  expect(screen.queryByRole('button', { name: 'Compare DTR' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('No Entries Submitted')).toBeVisible();
  view.unmount();
  header.remove();
  expect(unsubscribe).toHaveBeenCalled();
});
