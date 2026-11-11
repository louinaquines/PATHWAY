import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDocs, where } from 'firebase/firestore';
import { adminRequest } from '../adminApi';
import ClassListTab from './ClassListTab';
import RegistrationsTab from './RegistrationsTab';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), getDocs: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

test('authorized roster preserves section selection and account provisioning', async () => {
  getDocs.mockResolvedValueOnce({ docs: [{ id: 'section-a', data: () => ({ name: 'Section A' }) }] }).mockResolvedValue({ docs: [] });
  adminRequest.mockResolvedValue({ outcomes: [{ idNumber: '24228132', status: 'created', username: 'uclm-24228132' }] });
  render(<ClassListTab department="Computer Studies" coordinatorId="coord-1" />);
  await screen.findByRole('heading', { name: 'Import class list' });
  await screen.findByRole('option', { name: 'Section A' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Assigned section' }), { target: { value: 'section-a' } });
  fireEvent.change(await screen.findByRole('textbox', { name: 'Student ID', exact: true }), { target: { value: '24228132' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'First name' }), { target: { value: 'Taylor' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Last name' }), { target: { value: 'Student' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create student account' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/provision-students', { method: 'POST', body: JSON.stringify({ sectionId: 'section-a', students: [{ idNumber: '24228132', firstName: 'Taylor', lastName: 'Student' }] }) }));
  expect(where).toHaveBeenCalledWith('sectionId', '==', 'section-a');
  expect(await screen.findByRole('list', { name: 'Import results' })).toHaveTextContent('uclm-24228132');
  expect(screen.getByRole('textbox', { name: 'First name' })).toHaveValue('');
});

test.each(['approved', 'rejected'])('registration can be %s from the last page', async status => {
  const student = { id: 'student-a', firstName: 'Taylor', lastName: 'Student', idNumber: '24228132' };
  let decided = false;
  adminRequest.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') { decided = true; return {}; }
    const params = new URLSearchParams(url.split('?')[1]);
    if (params.has('view')) return { counts: { pending: decided ? 25 : 26 } };
    if (params.get('cursor')) return { rows: decided ? [] : [student], total: decided ? 25 : 26 };
    return { rows: [{ ...student, id: 'first', firstName: 'Alex' }], total: decided ? 25 : 26, nextCursor: decided ? null : 'later' };
  });
  render(<RegistrationsTab selectedSection={{ id: 'section-a', name: 'Section A' }} />);
  await screen.findByText('Page 1 of 2');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Review Taylor Student' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Section A');
  expect(screen.getByRole('dialog')).toHaveTextContent('uclm-24228132');
  if (status === 'rejected') {
    fireEvent.click(screen.getByRole('button', { name: 'Reject', exact: true }));
    expect(screen.getByText(/Reject this student registration/)).toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: status === 'approved' ? 'Approve' : 'Reject registration' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/registrations/student-a/decision', { method: 'POST', body: JSON.stringify({ status }) }));
  expect(await screen.findByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
});
