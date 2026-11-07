import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

test('message notification button opens and closes the overlay', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [] });
  render(<MessagesTab selectedSection={{ id: 'a', name: 'Section A' }} />);
  await screen.findByText('No students in this section.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Message notifications' }));
  expect(screen.getByRole('dialog', { name: 'Message notifications' })).toBeInTheDocument();
  expect(screen.getByText('No unread messages in this section.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh messages' })).toHaveClass('messages-alert-refresh');
  expect(screen.getByRole('button', { name: 'Refresh messages' })).toHaveTextContent('');
  fireEvent.click(screen.getByRole('button', { name: 'Close message notifications' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('shows only students and unread conversations from the current section', async () => {
  getDocs.mockResolvedValueOnce({ docs: [{ id: 'outside', data: () => ({
    studentId: 'outside-student', recipientId: 'coordinator-1', body: 'Other section message', read: false,
  }) }] }).mockResolvedValueOnce({ docs: [{ id: 'avery', data: () => ({ firstName: 'Avery', lastName: 'Student', idNumber: '1234' }) }] });
  render(<MessagesTab selectedSection={{ id: 'a', name: 'Section A' }} />);
  expect(await screen.findByRole('button', { name: 'Avery Student' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Sections' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Students' })).toBeInTheDocument();
  expect(screen.getAllByText('Section A').length).toBeGreaterThan(0);
  expect(screen.queryByText('Other section message')).not.toBeInTheDocument();
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
  expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveAttribute('placeholder', 'Write a message...');
  fireEvent.change(screen.getByRole('textbox', { name: 'Message reply' }), { target: { value: 'Please submit your weekly report.' } });
  const reply = screen.getByRole('textbox', { name: 'Message reply' });
  fireEvent.keyDown(reply, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(reply, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(reply, { key: 'Enter', repeat: true });
  expect(adminRequest).not.toHaveBeenCalled();
  fireEvent.keyDown(reply, { key: 'Enter' });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveValue(''));
  expect(adminRequest).toHaveBeenCalledWith('/messages', { method: 'POST', body: JSON.stringify({ recipientId: 'avery', body: 'Please submit your weekly report.' }) });
  expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('Please submit your weekly report.');
  expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveAttribute('placeholder', 'Write a reply...');
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
  fireEvent.change(screen.getByRole('textbox', { name: 'Message reply' }), { target: { value: 'Reply intended for Avery' } });

  rerender(<MessagesTab selectedSection={{ id: 'section-b', name: 'Section B' }} />);
  const taylor = await screen.findByRole('button', { name: 'Taylor Student' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Message reply' })).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: 'Avery Student' })).not.toBeInTheDocument();
  fireEvent.click(taylor);
  expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
});

test('no section selection leaves conversations unloaded', async () => {
  render(<MessagesTab />);
  expect(await screen.findByText('Select a section to see its students.')).toBeInTheDocument();
  expect(getDocs).not.toHaveBeenCalled();
});


test('incoming messages appear without refresh and preserve an unsent reply', async () => {
  jest.useFakeTimers();
  try {
    const students = { docs: [{ id: 'avery', data: () => ({ firstName: 'Avery', lastName: 'Student' }) }] };
    getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce(students);
    render(<MessagesTab selectedSection={{ id: 'a', name: 'Section A' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Avery Student' }));
    const reply = screen.getByRole('textbox', { name: 'Message reply' });
    fireEvent.change(reply, { target: { value: 'My unsent reply' } }); reply.focus();
    getDocs.mockResolvedValueOnce({ docs: [{ id: 'live-message', data: () => ({
      studentId: 'avery', conversationId: 'avery__coordinator-1', recipientId: 'coordinator-1',
      body: 'New student message', read: false, createdAt: '2026-11-05T11:00:00Z',
    }) }] }).mockResolvedValueOnce(students);
    await act(async () => { jest.advanceTimersByTime(10000); });
    expect(screen.getByRole('log', { name: 'Conversation' })).toHaveTextContent('New student message');
    expect(screen.getByRole('textbox', { name: 'Message reply' })).toHaveValue('My unsent reply');
  } finally { jest.useRealTimers(); }
});

test('long conversations render 50 messages and keep older pages reachable', async () => {
  getDocs.mockResolvedValueOnce({docs:Array.from({length:120},(_,i)=>({id:'m'+i,data:()=>({studentId:'avery',senderId:'coordinator-1',recipientId:'avery',body:'History entry '+i,createdAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),read:true})}))}).mockResolvedValueOnce({docs:[{id:'avery',data:()=>({firstName:'Avery',lastName:'Student'})}]});
  render(<MessagesTab selectedSection={{id:'a',name:'Section A'}} />);
  fireEvent.click(await screen.findByRole('button',{name:'Avery Student'}));
  const log=screen.getByRole('log',{name:'Conversation'});
  expect(log.querySelectorAll('.messages-bubble')).toHaveLength(50);
  expect(log).toHaveTextContent('History entry 119');
  expect(log).not.toHaveTextContent('History entry 0');
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  expect(log.querySelectorAll('.messages-bubble')).toHaveLength(50);
  fireEvent.click(screen.getByRole('button',{name:'Next'}));
  expect(log.querySelectorAll('.messages-bubble')).toHaveLength(20);
  expect(log).toHaveTextContent('History entry 0');
});
