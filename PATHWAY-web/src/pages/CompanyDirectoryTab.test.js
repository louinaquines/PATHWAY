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
  fireEvent.change(screen.getByLabelText('Company website'), { target: { value: 'https://example.com' } });
  fireEvent.click(screen.getByText('Preview details'));
  await screen.findByText('Sample Company');
  expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  expect(screen.getByText('View source website')).toHaveAttribute('href', 'https://example.com/');
  fireEvent.click(screen.getByText('Use suggestions in form'));
  expect(screen.getByLabelText('Company name')).toHaveValue('Sample Company');
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: 'Verified address' } });
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
  fireEvent.click(screen.getByRole('button', { name: '+ Add company' }));
  expect(screen.getByLabelText('Company name')).toBeEnabled();
  expect(screen.queryByText('Use suggestions in form')).not.toBeInTheDocument();
});
test('read-only directory has no import or company mutation controls', async () => {
  render(<CompanyDirectoryTab />);
  await screen.findByText('No companies yet');
  expect(screen.queryByLabelText('Company website')).not.toBeInTheDocument();
  expect(screen.queryByText('Add to directory')).not.toBeInTheDocument();
});

test('admin directory pages companies and searches the complete directory', async () => {
  adminRequest.mockResolvedValue({ companies: Array.from({ length: 12 }, (_, index) => ({
    id: String(index), name: 'Company ' + String(index + 1).padStart(2, '0'),
    industry: index === 11 ? 'Education' : 'Technology', active: true, capacity: 2, occupiedSlots: 1, availableSlots: 1,
  })) });
  render(<CompanyDirectoryTab />);
  expect(await screen.findByText('Company 01')).toBeInTheDocument();
  expect(screen.queryByText('Company 11')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Company 11')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search companies' }), { target: { value: 'Company 12' } });
  expect(screen.getByText('Company 12')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Industry' }), { target: { value: 'Technology' } });
  expect(screen.getByText('No matching companies')).toBeInTheDocument();
});
