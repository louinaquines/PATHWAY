import { fireEvent, render, screen, within } from '@testing-library/react';
import { getDocs, onSnapshot } from 'firebase/firestore';
import LogbookTab from './LogbookTab';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn().mockResolvedValue({}) }));

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../components/DtrReviewDialog', () => ({ student, onClose }) => <div role="dialog">DTR for {student.firstName}<button onClick={onClose}>Close comparison</button></div>);
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn(), onSnapshot: jest.fn() }));
const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });

test('coordinator sees phone attendance in Philippine time even without journal submissions', async () => {
  getDocs.mockResolvedValue(snapshot([]));
  getDocs.mockResolvedValueOnce(snapshot([{ id: 'qa-student', firstName: 'Journey', lastName: 'QA' }]));
  const unsubscribe = jest.fn();
  onSnapshot.mockImplementation((reference, next) => {
    next(snapshot([{ id: '2026-10-08', date: '2026-10-08', timeIn: '2026-10-07T18:45:38.775Z', timeOut: '2026-10-07T18:47:13.086Z', hoursToday: 0.03 }]));
    return unsubscribe;
  });
  const view = render(<LogbookTab coordinatorId="coordinator" selectedSection={{ id: 'section', name: 'QA Section' }} />);
  const table = await screen.findByRole('table', { name: 'Students in QA Section' });
  expect(within(table).getByRole('columnheader', { name: 'Journal' })).toBeVisible();
  fireEvent.click(within(table).getByRole('button', { name: 'View attendance for Journey QA' }));
  const drawer = await screen.findByRole('dialog', { name: 'Records for Journey QA' });
  expect(within(drawer).getByRole('button', { name: 'Export student records (Excel)' })).toBeEnabled();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Compare DTR' }));
  expect(screen.getByText('DTR for Journey')).toBeVisible();
  expect(await screen.findByText('2:45:38 AM')).toBeVisible();
  expect(screen.getByText('2:47:13 AM')).toBeVisible();
  expect(screen.getByText('0.03')).toBeVisible();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Close comparison' }));
  fireEvent.click(within(drawer).getByRole('button', { name: 'Close records' }));
  fireEvent.click(within(table).getByRole('button', { name: 'View journal for Journey QA' }));
  expect(await screen.findByText('No Entries Submitted')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Compare DTR' })).not.toBeInTheDocument();
  view.unmount();
  expect(unsubscribe).toHaveBeenCalled();
});

test('a pending journal can be rejected inside the records drawer', async () => {
  getDocs.mockResolvedValueOnce(snapshot([{ id: 'student', firstName: 'Sample', lastName: 'Student' }]))
    .mockResolvedValueOnce(snapshot([{ id: 'journal', frequency: 'daily', status: 'pending', hours: 2, rawNotes: 'Sample report' }]));
  onSnapshot.mockImplementation((reference, next) => { next(snapshot([])); return () => {}; });
  render(<LogbookTab coordinatorId="coordinator" selectedSection={{ id: 'section', name: 'QA Section' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View journal for Sample Student' }));
  const drawer = await screen.findByRole('dialog', { name: 'Records for Sample Student' });
  fireEvent.click(await within(drawer).findByRole('button', { name: 'Reject Entry' }));
  const confirm = within(drawer).getByRole('alertdialog');
  fireEvent.click(within(confirm).getByRole('button', { name: 'Reject entry' }));
  expect(await within(drawer).findByText('Revision needed')).toBeVisible();
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student/logbook/journal/decision',
    expect.objectContaining({ method: 'POST', body: '{"status":"rejected"}' }));
});
