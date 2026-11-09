import { act, fireEvent, render, screen } from '@testing-library/react';
import { getCountFromServer, getDocs, where } from 'firebase/firestore';
import { adminRequest } from '../adminApi';
import CoordinatorOverview from './CoordinatorOverview';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  getCountFromServer: jest.fn(), getDocs: jest.fn(),
}));

const section = { id: 'section-a', department: 'Technology' };
const students = ['requested', 'waiting'].map(id => ({ id, accountApproved: true }));

test('Overview shows separate assignment and request counts and opens the pending journal queue', async () => {
  getDocs.mockResolvedValue({ size: 1, docs: [{ data: () => ({ studentId: 'requested' }) }] });
  getCountFromServer.mockResolvedValueOnce({ data: () => ({ count: 2 }) })
    .mockResolvedValueOnce({ data: () => ({ count: 0 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  const onOpen = jest.fn();
  render(<CoordinatorOverview section={section} students={students} requirementsCount={1} onOpen={onOpen} />);
  expect(await screen.findByRole('button', { name: 'Assign companies 1 student' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review placement requests 1 request' })).toBeVisible();
  expect(where).toHaveBeenCalledWith('sectionId', '==', 'section-a');
  fireEvent.click(screen.getByRole('button', { name: 'Review logbooks 2 entries' }));
  expect(onOpen).toHaveBeenCalledWith('logbook', 'journals', ['requested']);
});

test('a failed count is unavailable and never makes the section look caught up', async () => {
  getDocs.mockRejectedValue(new Error('Connection lost'));
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  render(<CoordinatorOverview section={section} students={students} requirementsCount={0} onOpen={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Some counts could not load');
  expect(screen.getByRole('button', { name: 'Review placement requests Unavailable' })).toBeVisible();
  expect(screen.queryByText(/caught up/)).not.toBeInTheDocument();
});

test('charts reflect refreshed section data without reopening Overview', async () => {
  const currentSection = { ...section, hoursRequired: 200 };
  getDocs.mockResolvedValue({ size: 0, docs: [] });
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  const props = { section: currentSection, requirementsCount: 0, onOpen: jest.fn() };
  const { rerender } = render(<CoordinatorOverview {...props} students={[{ id: 'student', hoursRendered: 20 }]} />);
  const chart = await screen.findByRole('region', { name: 'How close students are to their required hours' });
  expect(chart).toHaveTextContent('1 student at Above 0%, below 50%');
  rerender(<CoordinatorOverview {...props} students={[{ id: 'student', hoursRendered: 200 }]} />);
  expect(chart).toHaveTextContent('1 student at 100%+');
});

test('pending tasks come first and every task opens its existing filtered view', async () => {
  getDocs.mockRejectedValue(new Error('Connection lost'));
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 1 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  const onOpen = jest.fn();
  render(<CoordinatorOverview section={section} students={students} requirementsCount={1} onOpen={onOpen} />);
  const panel = await screen.findByRole('region', { name: 'Needs attention' });
  const tasks = [...panel.querySelectorAll('.coordinator-attention-grid button')];
  expect(tasks.map(task => task.querySelector('.coordinator-queue-label').textContent)).toEqual([
    'Review requirements', 'Review logbooks', 'Assign companies', 'Review placement requests', 'Clear students',
  ]);
  tasks.forEach(task => fireEvent.click(task));
  expect(onOpen.mock.calls.map(([page, view]) => [page, view])).toEqual([
    ['requirements', 'requirements'], ['logbook', 'journals'], ['placements', 'assign'],
    ['placements', 'requests'], ['clearance', 'ready'],
  ]);
  const callsBeforeRefresh = getDocs.mock.calls.length;
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })));
  expect(getDocs).toHaveBeenCalledTimes(callsBeforeRefresh + 1);
});

test('a section switch hides old task counts until the new section loads', async () => {
  getDocs.mockResolvedValue({ size: 0, docs: [] });
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  const onOpen = jest.fn();
  const { rerender } = render(<CoordinatorOverview section={section} students={students} requirementsCount={0} onOpen={onOpen} />);
  expect(await screen.findByRole('region', { name: 'Student progress by step' })).toHaveTextContent('0 of 2');
  rerender(<CoordinatorOverview section={{ ...section, id: 'section-b' }} students={[]} requirementsCount={0} onOpen={onOpen} />);
  expect(screen.queryByRole('region', { name: 'Needs attention' })).not.toBeInTheDocument();
  expect(await screen.findByText(/caught up/)).toBeVisible();
  expect(screen.getByRole('region', { name: 'Student progress by step' })).toHaveTextContent('No students in this section yet.');
});
