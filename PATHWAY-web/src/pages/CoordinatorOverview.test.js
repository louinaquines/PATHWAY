import { fireEvent, render, screen } from '@testing-library/react';
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
  expect(await screen.findByRole('button', { name: 'Students waiting for a company assignment 1 student' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Placement requests awaiting a decision 1 request' })).toBeVisible();
  expect(where).toHaveBeenCalledWith('sectionId', '==', 'section-a');
  fireEvent.click(screen.getByRole('button', { name: 'Logbooks awaiting review 2 entries' }));
  expect(onOpen).toHaveBeenCalledWith('logbook', 'journals', ['requested']);
});

test('a failed count is unavailable and never makes the section look caught up', async () => {
  getDocs.mockRejectedValue(new Error('Connection lost'));
  getCountFromServer.mockResolvedValue({ data: () => ({ count: 0 }) });
  adminRequest.mockResolvedValue({ evaluations: [] });
  render(<CoordinatorOverview section={section} students={students} requirementsCount={0} onOpen={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Some counts could not load');
  expect(screen.getByRole('button', { name: 'Placement requests awaiting a decision Unavailable' })).toBeVisible();
  expect(screen.queryByText(/caught up/)).not.toBeInTheDocument();
});
