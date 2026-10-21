import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { StrictMode } from 'react';
import { getDocs, onSnapshot, doc } from 'firebase/firestore';
import { adminRequest } from '../adminApi';
import NotificationsTab from './NotificationsTab';
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'coord-a' } } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => () => {}) }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({ onSnapshot: jest.fn(() => () => {}), collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn(), updateDoc: jest.fn(), doc: jest.fn() }));

const notice = { id: 'notice-a', studentId: 'student', sectionId: 'section-a', title: 'Attendance risk update', kind: 'opened', riskTier: 'High', progressStatus: 'In progress', dataStatus: 'Ready', reasonCodes: ['PROJECTED_SHORTFALL'], ruleVersion: 'attendance-risk-v1', asOf: '2026-10-21', createdAt: '2026-10-21', read: false };
beforeEach(() => { jest.clearAllMocks(); auth.currentUser = { uid: 'coord-a' }; getDocs.mockResolvedValue({ docs: [] }); adminRequest.mockReset(); });

test('StrictMode effect replay loads notices and discards the earlier request', async () => {
  let stale;
  adminRequest.mockImplementationOnce(() => new Promise(resolve => { stale = resolve; }))
    .mockResolvedValue({ records: [notice], hasMore: false, cursor: null });
  render(<StrictMode><NotificationsTab userId="coord-a" /></StrictMode>);
  await screen.findByText('Attendance risk update');
  await act(async () => stale({ records: [{ ...notice, title: 'Stale notice' }], hasMore: false, cursor: null }));
  expect(screen.queryByText('Stale notice')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading attendance notices…')).not.toBeInTheDocument();
});

test('student transfer clears loaded notices even while the old section remains owned, rejecting late read', async () => {
  let finishRead;
  doc.mockImplementation((db, collection, id) => `${collection}/${id}`);
  adminRequest.mockResolvedValueOnce({ records: [notice], hasMore: false, cursor: null })
    .mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }))
    .mockResolvedValueOnce({ records: [], hasMore: false, cursor: null });
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Attendance risk update');
  fireEvent.click(screen.getByRole('button', { name: 'Mark attendance notice read' }));
  const source = onSnapshot.mock.calls.find(([path]) => path === 'users/student');
  act(() => source[1]({ data: () => ({ role: 'student', sectionId: 'other-section' }) }));
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  await screen.findByText('No attendance notices loaded.');
  await act(async () => finishRead({ records: [{ ...notice, read: true }], hasMore: false, cursor: null }));
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
});

test('permission loss on a loaded student ref clears the list and refetches authorized notices', async () => {
  doc.mockImplementation((db, collection, id) => `${collection}/${id}`);
  adminRequest.mockResolvedValueOnce({ records: [notice], hasMore: false, cursor: null }).mockResolvedValueOnce({ records: [], hasMore: false, cursor: null });
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Attendance risk update');
  const source = onSnapshot.mock.calls.find(([path]) => path === 'users/student');
  act(() => source[2]({ code: 'permission-denied' }));
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  await screen.findByText('No attendance notices loaded.');
  expect(adminRequest).toHaveBeenCalledTimes(2);
});

test('invalid first-page reload stops after the single cursor recovery attempt', async () => {
  adminRequest.mockResolvedValueOnce({ records: [notice], hasMore: true, cursor: 'expired' })
    .mockRejectedValueOnce(Object.assign(new Error('Expired'), { status: 400 }))
    .mockRejectedValueOnce(Object.assign(new Error('Invalid first page'), { status: 400 }));
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Attendance risk update');
  fireEvent.click(screen.getByRole('button', { name: 'Load more attendance notices' }));
  await screen.findByText('Invalid first page');
  expect(adminRequest).toHaveBeenCalledTimes(3);
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
});

test('ambiguous read failure is not replayed and manual retry uses the same exact notice', async () => {
  adminRequest.mockResolvedValueOnce({ records: [notice], hasMore: false, cursor: null }).mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce({ records: [{ ...notice, read: true }], hasMore: false, cursor: null });
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Attendance risk update');
  fireEvent.click(screen.getByRole('button', { name: 'Mark attendance notice read' }));
  await screen.findByText('Connection lost');
  expect(adminRequest).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Unread')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark attendance notice read' }));
  await screen.findByText('Read');
  expect(adminRequest.mock.calls[1]).toEqual(adminRequest.mock.calls[2]);
});

test('pagination keeps a disclosed 100-notice window while still reaching later pages', async () => {
  adminRequest.mockImplementation(async path => {
    const page = Number(new URL(`http://local${path}`).searchParams.get('cursor') || '0');
    return { records: Array.from({ length: 20 }, (_, index) => ({ ...notice, id: `notice-${page * 20 + index}`, title: `Update ${page * 20 + index}` })), hasMore: page < 5, cursor: String(page + 1) };
  });
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Update 0');
  for (let page = 1; page <= 5; page++) {
    fireEvent.click(screen.getByRole('button', { name: 'Load more attendance notices' }));
    await screen.findByText(`Update ${page * 20}`);
  }
  expect(screen.queryByText('Update 0')).not.toBeInTheDocument();
  expect(screen.getByText('Update 119')).toBeInTheDocument();
  expect(screen.getByText(/100 loaded.*up to 100/)).toBeInTheDocument();
});

test('actor switch clears private legacy inbox and broadcast text as well as risk notices', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: 'legacy', data: () => ({ title: 'Private inbox', message: 'Private message' }) }] });
  adminRequest.mockResolvedValue({ records: [notice], hasMore: false, cursor: null });
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Private inbox');
  fireEvent.click(screen.getByRole('tab', { name: 'Broadcast announcement' }));
  fireEvent.change(screen.getByPlaceholderText('Type your message to the enrolled students...'), { target: { value: 'Private draft' } });
  act(() => { auth.currentUser = null; onAuthStateChanged.mock.calls[0][1](null); });
  expect(screen.queryByDisplayValue('Private draft')).not.toBeInTheDocument();
  expect(screen.queryByText('Private inbox')).not.toBeInTheDocument();
});

test('risk pagination continues an empty page and marking read neither acknowledges nor resolves risk', async () => {
  adminRequest.mockResolvedValueOnce({ records: [], hasMore: true, cursor: 'next' }).mockResolvedValueOnce({ records: [notice], hasMore: false, cursor: null }).mockResolvedValueOnce({ records: [{ ...notice, read: true }], hasMore: false, cursor: null });
  const open = jest.fn();
  render(<NotificationsTab userId="coord-a" onOpenAttendanceRisk={open} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more attendance notices' }));
  await screen.findByText('Attendance risk update');
  expect(screen.getByText(/document ID order/i)).toBeInTheDocument();
  expect(screen.getByText(/does not acknowledge or resolve the risk/)).toBeInTheDocument();
  expect(screen.getByLabelText('Search loaded attendance notices')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Search loaded notices by kind, tier, progress, data status or reason...')).toBeInTheDocument();
  expect(screen.getByText('Risk episode opened')).toBeInTheDocument();
  expect(screen.getByText('Projected shortfall against deadline')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mark attendance notice read' }));
  await screen.findByText('Read');
  expect(adminRequest).toHaveBeenLastCalledWith('/coordinator/attendance-risk-notices/notice-a/read', expect.objectContaining({ method: 'POST', body: '{}' }));
  expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View attendance analytics' }));
  expect(open).toHaveBeenCalledWith({ studentId: 'student', sectionId: 'section-a' });
});

test('expired cursor reloads first page once and fresh denial clears notices', async () => {
  adminRequest.mockResolvedValueOnce({ records: [notice], hasMore: true, cursor: 'expired' })
    .mockRejectedValueOnce(Object.assign(new Error('Bad cursor'), { status: 400 }))
    .mockResolvedValueOnce({ records: [], hasMore: true, cursor: 'new' })
    .mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { status: 403 }));
  render(<NotificationsTab userId="coord-a" />);
  await screen.findByText('Attendance risk update');
  fireEvent.click(screen.getByRole('button', { name: 'Load more attendance notices' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledTimes(3));
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Load more attendance notices' }));
  await screen.findByText(/Attendance access changed/);
  expect(adminRequest).toHaveBeenCalledTimes(4);
});
test('sliding workspace starts in inbox and preserves broadcast submission', async () => {
  getDocs.mockResolvedValue({ docs: [{ id: 'section-a', data: () => ({ name: 'Section A', department: 'IT' }) }] });
  adminRequest.mockResolvedValue({ count: 2 });
  render(<NotificationsTab userId="coord-a" />);
  const inbox = await screen.findByRole('tab', { name: /Notification inbox/ });
  expect(inbox).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('button', { name: 'Send Announcement' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Broadcast announcement' }));
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'section-a' } });
  fireEvent.change(screen.getByPlaceholderText('e.g. MOA Submission Deadline Extension'), { target: { value: 'Deadline' } });
  fireEvent.change(screen.getByPlaceholderText('Type your message to the enrolled students...'), { target: { value: 'Test announcement' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send Announcement' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/announcements', { method: 'POST', body: JSON.stringify({ sectionId: 'section-a', title: 'Deadline', message: 'Test announcement' }) }));
});
