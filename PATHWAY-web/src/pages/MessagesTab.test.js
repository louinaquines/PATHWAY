import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MessagesTab from './MessagesTab';
import { getDocs, where } from 'firebase/firestore';
import { adminRequest } from '../adminApi';

jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'coordinator-1' } }, db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  getDocs: jest.fn(), updateDoc: jest.fn(), doc: jest.fn(),
}));

beforeEach(() => jest.clearAllMocks());

test('sections and students are separate and section selection uses the shared selector', async () => {
  getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ id: 'avery', data: () => ({ firstName: 'Avery', lastName: 'Student', idNumber: '1234' }) }] });
  const onSectionChange = jest.fn();
  const sections = [{ id: 'a', name: 'Section A' }, { id: 'b', name: 'Section B' }];
  render(<MessagesTab sections={sections} selectedSection={sections[0]} onSectionChange={onSectionChange} />);
  expect(await screen.findByRole('button', { name: 'Avery Student' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Sections' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Students' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Section B' }));
  expect(onSectionChange).toHaveBeenCalledWith(sections[1]);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search students and conversations' }), { target: { value: '1234' } });
  expect(screen.getByRole('button', { name: 'Avery Student' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search students and conversations' }), { target: { value: 'missing' } });
  expect(screen.queryByRole('button', { name: 'Avery Student' })).not.toBeInTheDocument();
  expect(screen.getByText('No matching students or messages.')).toBeInTheDocument();
});

test('starts a conversation with the selected student and sends a reply', async () => {
  getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ id: 'avery', data: () => ({ firstName: 'Avery', lastName: 'Student' }) }] });
  adminRequest.mockResolvedValueOnce({ messageId: 'msg-1', conversationId: 'avery__coordinator-1', createdAt: '2026-10-07T01:00:00Z' });
  render(<MessagesTab selectedSection={{ id: 'a', name: 'Section A' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Avery Student' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Message reply' }), { target: { value: 'Please submit your weekly report.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveValue(''));
  expect(adminRequest).toHaveBeenCalledWith('/messages', { method: 'POST', body: JSON.stringify({ recipientId: 'avery', body: 'Please submit your weekly report.' }) });
  expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Please submit your weekly report.');
});

test('changing sections closes the old conversation and clears its reply draft', async () => {
  const studentSnapshot = name => ({ docs: [{ id: name.toLowerCase(), data: () => ({ firstName: name, lastName: 'Student' }) }] });
  getDocs
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce(studentSnapshot('Avery'))
    .mockResolvedValueOnce({ docs: [] })
    .mockResolvedValueOnce(studentSnapshot('Taylor'));
  const { rerender } = render(<MessagesTab selectedSection={{ id: 'section-a', name: 'Section A' }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Avery Student' }));
  expect(where).toHaveBeenCalledWith('role', '==', 'student');
  fireEvent.change(screen.getByPlaceholderText('Write a reply...'), { target: { value: 'Reply intended for Avery' } });

  rerender(<MessagesTab selectedSection={{ id: 'section-b', name: 'Section B' }} />);
  const taylor = await screen.findByRole('button', { name: 'Taylor Student' });
  await waitFor(() => expect(screen.queryByPlaceholderText('Write a reply...')).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: 'Avery Student' })).not.toBeInTheDocument();
  fireEvent.click(taylor);
  expect(screen.getByPlaceholderText('Write a reply...')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});
