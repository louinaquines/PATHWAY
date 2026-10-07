import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import { getDocs, updateDoc } from 'firebase/firestore';
import { adminRequest } from '../adminApi';

jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'admin-1' } }, db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), doc: jest.fn(), updateDoc: jest.fn() }));
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('recharts', () => Object.fromEntries(['BarChart', 'Bar', 'CartesianGrid', 'Cell', 'Legend', 'Pie', 'PieChart', 'Line', 'LineChart', 'ResponsiveContainer', 'Tooltip', 'XAxis', 'YAxis'].map(name => [name, () => null])));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test('profile shortcut opens labeled fields and saves personal details', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  updateDoc.mockResolvedValue(undefined);
  render(<AdminDashboard />);
  await screen.findByText('Recent Student Registrations');
  const shortcut = screen.getByRole('button', { name: 'Admin Profile Settings' });
  fireEvent.click(shortcut);
  expect(shortcut).toHaveAttribute('aria-current', 'page');
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Alex' } });
  expect(screen.getByLabelText('Phone number (optional)')).toHaveAttribute('type', 'tel');
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  expect(updateDoc).toHaveBeenCalledWith(undefined, expect.objectContaining({ firstName: 'Alex' }));
  await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(4));
  await screen.findByRole('button', { name: 'Save Changes' });
});

test('create coordinator form has labeled fields and a password visibility control', async () => {
  getDocs.mockResolvedValue({ docs: [] });
  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create Coordinator' }));
  expect(screen.getByLabelText('First name')).toBeRequired();
  expect(screen.getByLabelText('Assigned department')).toBeRequired();
  const password = screen.getByLabelText('Initial password');
  expect(password).toHaveAttribute('type', 'password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(password).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(password).toHaveAttribute('type', 'password');
});

test('failed administrator load shows a visible error and allows reload', async () => {
  getDocs.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ docs: [] });
  render(<AdminDashboard />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load administrator records');
  fireEvent.click(screen.getByRole('button', { name: 'Reload records' }));
  await screen.findByText('Recent Student Registrations');
});

test('failed activation displays the server error without marking the student active', async () => {
  getDocs.mockResolvedValueOnce({ docs: [{ id: 'student-1', data: () => ({ role: 'student', firstName: 'Test', lastName: 'Student', accountApproved: false }) }] })
    .mockResolvedValueOnce({ docs: [] });
  adminRequest.mockRejectedValueOnce(new Error('Account update denied'));
  render(<AdminDashboard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Activate Account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Account update denied');
  expect(screen.getByRole('button', { name: 'Activate Account' })).toBeEnabled();
  expect(adminRequest).toHaveBeenCalledWith('/admin/students/student-1/account-status', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ accountApproved: true }) }));
});
