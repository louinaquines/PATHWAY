import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MessagesTab from './MessagesTab';
import { getDocs, where } from 'firebase/firestore';

jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'coordinator-1' } }, db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(),
  getDocs: jest.fn(), updateDoc: jest.fn(), doc: jest.fn(),
}));

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
