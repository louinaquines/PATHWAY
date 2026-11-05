import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { fireEvent, render as renderComponent, screen, waitFor } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import { getDocs, updateDoc } from 'firebase/firestore';
import { adminRequest } from '../adminApi';

jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'admin-1' } }, db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), getDocs: jest.fn(), doc: jest.fn(), updateDoc: jest.fn() }));
const render = (element, path = '/admin') => renderComponent(
  <MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/admin/:page?" element={element} /></Routes>
    <LocationProbe />
  </MemoryRouter>,
);
function LocationProbe() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  return <><output aria-label="Current URL">{pathname}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
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
  fireEvent.click(await screen.findByRole('button', { name: /^Coordinators/ }));
  fireEvent.click(screen.getByRole('button', { name: /Create Coordinator/ }));
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
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
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

test('overview and student directory share department scope, with sections inside Students', async () => {
  const records = rows => ({ docs: rows.map(([id, data]) => ({ id, data: () => data })) });
  getDocs.mockResolvedValueOnce(records([
    ['a', { role: 'student', firstName: 'Alice', department: 'Education', sectionId: 'e1', accountApproved: true }],
    ['b', { role: 'student', firstName: 'Ben', department: 'Education', sectionId: 'e2' }],
    ['c', { role: 'student', firstName: 'Cara', department: 'Engineering', sectionId: 'c1' }],
  ])).mockResolvedValueOnce(records([
    ['e1', { name: 'Education A', department: 'Education', hoursRequired: 250 }],
    ['e2', { name: 'Education B', department: 'Education' }],
    ['c1', { name: 'Engineering A', department: 'Engineering' }],
  ]));
  render(<AdminDashboard />);
  fireEvent.change(await screen.findByLabelText('Filter by department'), { target: { value: 'Education' } });
  expect(screen.queryByText('Cara')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Sections/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Students/ }));
  fireEvent.change(screen.getByLabelText('Filter by section'), { target: { value: 'e1' } });
  expect(screen.getByText('Alice')).toBeInTheDocument();
  expect(screen.queryByText('Ben')).not.toBeInTheDocument();
  expect(screen.getByText('250 hrs')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Filter by department'), { target: { value: '' } });
  expect(screen.getByText('Cara')).toBeInTheDocument();
});

test('student URL opens directly and deactivation requires a named confirmation', async () => {
  getDocs.mockResolvedValueOnce({ docs: [{ id: 'student-1', data: () => ({
    role: 'student', firstName: 'Taylor', lastName: 'Student', accountApproved: true,
  }) }] }).mockResolvedValueOnce({ docs: [] });
  render(<AdminDashboard />, '/admin/students');
  expect(await screen.findByRole('heading', { name: 'Student Accounts' })).toBeInTheDocument();
  fireEvent.click(await screen.findByLabelText('Actions for Taylor Student'));
  fireEvent.click(screen.getByRole('button', { name: 'Deactivate account' }));
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Taylor Student');
  expect(adminRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'System Overview' }));
  expect(screen.getByLabelText('Current URL')).toHaveTextContent('/admin/overview');
  fireEvent.click(screen.getByRole('button', { name: 'Browser back' }));
  expect(screen.getByRole('heading', { name: 'Student Accounts' })).toBeInTheDocument();
});
