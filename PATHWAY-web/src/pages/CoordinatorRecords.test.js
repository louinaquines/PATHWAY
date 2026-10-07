import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import { adminRequest } from '../adminApi';
import ClassListTab from './ClassListTab';
import RegistrationsTab from './RegistrationsTab';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('authorized roster preserves section selection and account provisioning', async () => {
  getDocs.mockResolvedValueOnce({ docs: [] }).mockResolvedValueOnce({ docs: [{ id: 'section-a', data: () => ({ name: 'Section A' }) }] }).mockResolvedValue({ docs: [] });
  adminRequest.mockResolvedValue({ outcomes: [{ idNumber: '24228132', status: 'created', username: 'uclm-24228132' }] });
  render(<ClassListTab department="Computer Studies" coordinatorId="coord-1" />);
  await screen.findByRole('heading', { name: 'Import class list' });
  await screen.findByRole('option', { name: 'Section A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Assigned section' }), { target: { value: 'section-a' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Class list CSV content' }), { target: { value: '24228132,Taylor,Student' } });
  fireEvent.click(screen.getByRole('button', { name: 'Import and create accounts' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/provision-students', { method: 'POST', body: JSON.stringify({ sectionId: 'section-a', students: [{ idNumber: '24228132', firstName: 'Taylor', lastName: 'Student' }] }) }));
  expect(await screen.findByRole('list', { name: 'Import results' })).toHaveTextContent('uclm-24228132');
});

test('registration approval is preserved and account details show section and username', async () => {
  const snapshot = { docs: [{ id: 'student-a', data: () => ({ firstName: 'Taylor', lastName: 'Student', idNumber: '24228132', sectionId: 'section-a', department: 'Computer Studies', accountApproved: false }) }] };
  getDocs.mockResolvedValue(snapshot);
  adminRequest.mockResolvedValue({});
  render(<RegistrationsTab department="Computer Studies" sections={[{ id: 'section-a', name: 'Section A' }]} />);
  expect(await screen.findByText('Username: uclm-24228132')).toBeInTheDocument();
  expect(screen.getByText('Section: Section A')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/registrations/student-a/decision', { method: 'POST', body: JSON.stringify({ status: 'approved' }) }));
  await screen.findByRole('button', { name: /Approved Students/ });
});
