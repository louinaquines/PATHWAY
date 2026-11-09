import { fireEvent, render, screen, within } from '@testing-library/react';
import { getDocs, getDocsFromServer, onSnapshot } from 'firebase/firestore';
import LogbookTab from './LogbookTab';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn().mockResolvedValue({}) }));

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../components/DtrReviewDialog', () => ({ student, onClose }) => <div role="dialog">DTR for {student.firstName}<button onClick={onClose}>Close comparison</button></div>);
jest.mock('firebase/firestore', () => ({ collection: jest.fn((db, ...path) => path.join('/')),
  query: jest.fn((path, ...constraints) => ({ path, constraints })), where: jest.fn((field, operator, value) => ({ field, operator, value })),
  limit: jest.fn(value => ({ limit: value })), orderBy: jest.fn(field => ({ field })), startAfter: jest.fn(cursor => ({ cursor })),
  getDocs: jest.fn(), getDocsFromServer: jest.fn(), onSnapshot: jest.fn() }));
const snapshot = records => ({ size: records.length, docs: records.map(record => ({ id: record.id, data: () => record })) });

beforeEach(() => { getDocsFromServer.mockReset().mockResolvedValue(snapshot([])); });

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
  expect(within(table).getByRole('columnheader', { name: 'Journals' })).toBeVisible();
  fireEvent.click(within(table).getByRole('button', { name: 'View attendance for Journey QA' }));
  const drawer = await screen.findByRole('dialog', { name: 'Records for Journey QA' });
  expect(within(drawer).getByRole('button', { name: 'Export student records (Excel)' })).toBeEnabled();
  fireEvent.click(within(drawer).getByRole('button', { name: 'Compare Form 48' }));
  expect(screen.getByText('DTR for Journey')).toBeVisible();
  expect(await screen.findByText('2:45:38 AM')).toBeVisible();
  expect(screen.getByText('2:47:13 AM')).toBeVisible();
  expect(screen.getByText('0.03')).toBeVisible();
  expect(getDocs).not.toHaveBeenCalledWith('users/qa-student/logbook');
  expect(onSnapshot.mock.calls[0][0]).toEqual(expect.objectContaining({ constraints: expect.arrayContaining([{ limit: 26 }]) }));
  fireEvent.click(within(drawer).getByRole('button', { name: 'Close comparison' }));
  drawer.getBoundingClientRect = () => ({ left: 500, right: 1000, top: 0, bottom: 800 });
  fireEvent.click(drawer, { clientX: 600, clientY: 400 });
  expect(drawer).toBeInTheDocument();
  fireEvent.click(drawer, { clientX: 200, clientY: 400 });
  expect(drawer).not.toBeInTheDocument();
  fireEvent.click(within(table).getByRole('button', { name: 'View journal for Journey QA' }));
  expect(await screen.findByText('No journals submitted yet.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Compare Form 48' })).not.toBeInTheDocument();
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
  expect(await within(drawer).findByText('Changes requested')).toBeVisible();
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student/logbook/journal/decision',
    expect.objectContaining({ method: 'POST', body: '{"status":"rejected"}' }));
});

test('the roster shows the latest attendance date and latest submitted journal, excluding drafts', async () => {
  getDocs.mockResolvedValueOnce(snapshot([{ id: 'sample', firstName: 'Sample', lastName: 'Student' }]));
  getDocsFromServer.mockImplementation(({ path, constraints }) => {
    if (path.endsWith('/attendance')) return Promise.resolve(snapshot([{ id: '2026-11-05', date: '2026-11-05' }]));
    if (constraints.some(item => item?.field === 'submittedAt')) {
      return Promise.resolve(snapshot([{ id: 'submitted', status: 'approved', submittedAt: '2026-11-05T19:00:00Z' }]));
    }
    return Promise.resolve(snapshot([
      { id: 'draft', status: 'draft', createdAt: '2026-11-07T12:00:00Z' },
      { id: 'legacy', status: 'pending', createdAt: '2026-11-04T12:00:00Z' },
    ]));
  });
  render(<LogbookTab coordinatorId="coordinator" selectedSection={{ id: 'section', name: 'QA Section' }} />);
  expect(await screen.findByRole('button', { name: 'View attendance for Sample Student, Nov 5, 2026' })).toBeVisible();
  expect(await screen.findByRole('button', { name: 'View journal for Sample Student, Nov 6, 2026' })).toBeVisible();
});

test.each([1000, 10000])('attendance can find an older record among %i records with bounded reads', async count => {
  const all = Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, 5 - index)).toISOString().slice(0, 10);
    return { id: date, date };
  });
  getDocs.mockResolvedValueOnce(snapshot([{ id: 'student', firstName: 'Sample', lastName: 'Student' }]));
  onSnapshot.mockReset().mockImplementation((reference, next) => {
    const { constraints } = reference;
    const cursor = constraints.find(item => item.cursor)?.cursor.id;
    const date = constraints.find(item => item.operator === '==')?.value;
    const maximum = constraints.find(item => item.limit).limit;
    const candidates = date ? all.filter(record => record.date === date) : all;
    const start = cursor ? candidates.findIndex(record => record.id === cursor) + 1 : 0;
    next(snapshot(candidates.slice(start, start + maximum)));
    return () => {};
  });

  render(<LogbookTab coordinatorId="coordinator" selectedSection={{ id: 'section', name: 'QA Section' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'View attendance for Sample Student' }));
  const drawer = within(await screen.findByRole('dialog', { name: 'Records for Sample Student' }));
  expect(drawer.getAllByRole('row')).toHaveLength(26);
  fireEvent.click(drawer.getByRole('button', { name: 'Next' }));
  expect(await drawer.findByText(all[25].date)).toBeVisible();
  fireEvent.click(drawer.getByRole('button', { name: 'Previous' }));
  expect(await drawer.findByText(all[0].date)).toBeVisible();
  fireEvent.change(drawer.getByLabelText('Attendance date'), { target: { value: all.at(-1).date } });
  expect(await drawer.findByText(all.at(-1).date)).toBeVisible();
  expect(drawer.getAllByRole('row')).toHaveLength(2);
});
