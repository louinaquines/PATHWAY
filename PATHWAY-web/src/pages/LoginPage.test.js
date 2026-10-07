import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from './LoginPage';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getDoc } from 'firebase/firestore';
import { auth } from '../firebase';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../firebase', () => ({ auth: { signOut: jest.fn() }, db: {} }));
jest.mock('firebase/auth', () => ({ signInWithEmailAndPassword: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('password visibility toggles without submitting the form', () => {
  render(<LoginPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
  expect(signInWithEmailAndPassword).not.toHaveBeenCalled();
});

test.each(['coordinator', 'admin'])('preserves %s sign-in destination', async role => {
  signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'staff' } });
  getDoc.mockResolvedValue({ data: () => ({ role }) });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'staff@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(`/${role}`));
});

test('shows accessible authentication errors and allows retry', async () => {
  signInWithEmailAndPassword.mockRejectedValue({ code: 'auth/invalid-credential' });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'staff@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
});

test('student accounts are denied staff portal access', async () => {
  signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'student' } });
  getDoc.mockResolvedValue({ data: () => ({ role: 'student' }) });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'student@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  expect(mockNavigate).not.toHaveBeenCalled();
});
