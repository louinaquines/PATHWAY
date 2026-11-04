import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks();
  adminRequest.mockImplementation(async path => {
    if (path.endsWith('company-directory')) return { companies: [] };
    if (path.endsWith('company-profile-preview')) return { preview: { name: 'Sample Company', email: 'contact@example.com', phone: '123', sourceUrl: 'https://example.com/', warning: 'Confirm these details.' } };
    return { company: { name: 'Edited Company' } };
  });
});
test('preview requires explicit use and an independent reviewed save', async () => {
  render(<CompanyDirectoryTab readOnly={false} />);
  await screen.findByText('No companies have been added yet.');
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Verified address' } });
  fireEvent.change(screen.getByLabelText('Company website'), { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByText('Preview details'));
  await screen.findByText('Sample Company');
  expect(screen.getByLabelText('Company name')).toHaveValue('');
  expect(screen.getByText('View source website')).toHaveAttribute('href', 'https://example.com/');
  fireEvent.click(screen.getByText('Use suggestions in form'));
  expect(screen.getByLabelText('Company name')).toHaveValue('Sample Company');
  expect(screen.getByLabelText('Address')).toHaveValue('Verified address');
  expect(adminRequest.mock.calls.some(([path]) => path === '/coordinator/companies')).toBe(false);
  fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Edited Company' } });
  fireEvent.click(screen.getByText('Add to directory'));
  await waitFor(() => expect(adminRequest.mock.calls.some(([path, options]) => path === '/coordinator/companies' && JSON.parse(options.body).name === 'Edited Company')).toBe(true));
});
test('preview failures offer manual entry and do not save', async () => {
  adminRequest.mockImplementation(async path => {
    if (path.endsWith('company-profile-preview')) throw new Error('Enter company details manually.');
    return { companies: [] };
  });
  render(<CompanyDirectoryTab readOnly={false} />);
  await screen.findByText('No companies have been added yet.');
  fireEvent.change(screen.getByLabelText('Company website'), { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByText('Preview details'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter company details manually.');
  expect(screen.getByLabelText('Company name')).toBeEnabled();
  expect(screen.queryByText('Use suggestions in form')).not.toBeInTheDocument();
});
test('read-only directory has no import or company mutation controls', async () => {
  render(<CompanyDirectoryTab />);
  await screen.findByText('No companies have been added yet.');
  expect(screen.queryByLabelText('Company website')).not.toBeInTheDocument();
  expect(screen.queryByText('Add to directory')).not.toBeInTheDocument();
});

test('matching is opt-in and saves parsed course codes separately from contact details', async () => {
  render(<CompanyDirectoryTab readOnly={false} />);
  await screen.findByText('No companies have been added yet.');
  expect(screen.getByLabelText('Company confirmed internship slots')).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'Host' } });
  fireEvent.click(screen.getByLabelText('Company confirmed internship slots'));
  for (const [label, value] of Object.entries({ 'Eligible courses': ' BSIT, BSCS, , ', 'Internship location': 'Manila', 'Supervisor name': 'Ana', 'Supervisor email': 'ana@example.com', 'Supervisor position': 'Lead', 'Supervisor phone': '123', 'Internship role': 'Software Developer Intern' })) {
    if (['Supervisor position', 'Supervisor phone'].includes(label)) expect(screen.getByLabelText(label)).not.toBeRequired();
    else expect(screen.getByLabelText(label)).toBeRequired();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByText('Add to directory'));
  await waitFor(() => expect(adminRequest.mock.calls.some(([path, options]) => path === '/coordinator/companies' && JSON.parse(options.body).matching?.acceptanceConfirmed)).toBe(true));
  const payload = JSON.parse(adminRequest.mock.calls.find(([path]) => path === '/coordinator/companies')[1].body);
  expect(payload.matching).toEqual({ acceptanceConfirmed: true, eligibleCourses: ['BSIT', 'BSCS'], location: 'Manila', supervisorName: 'Ana', supervisorEmail: 'ana@example.com', supervisorPosition: 'Lead', supervisorPhone: '123', internshipRole: 'Software Developer Intern' });
  expect(payload.email).toBe('');
  expect(payload.capacity).toBe(1);
});

test('editing restores matching settings while old records remain opted out', async () => {
  adminRequest.mockResolvedValue({ companies: [{ id: 'old', name: 'Old host', active: true }, { id: 'new', name: 'New host', active: true, matching: { acceptanceConfirmed: true, eligibleCourses: ['BSIT', 'BSCS'], location: 'Cebu', supervisorName: 'Ana', internshipRole: 'Developer Intern' } }] });
  render(<CompanyDirectoryTab readOnly={false} />);
  await screen.findByText('Old host');
  fireEvent.click(screen.getAllByText('Edit')[1]);
  expect(screen.getByLabelText('Company confirmed internship slots')).toBeChecked();
  expect(screen.getByLabelText('Eligible courses')).toHaveValue('BSIT, BSCS');
  expect(screen.getByLabelText('Internship location')).toHaveValue('Cebu');
  fireEvent.click(screen.getAllByText('Edit')[0]);
  expect(screen.getByLabelText('Company confirmed internship slots')).not.toBeChecked();
  expect(screen.getByLabelText('Eligible courses')).not.toBeRequired();
});
