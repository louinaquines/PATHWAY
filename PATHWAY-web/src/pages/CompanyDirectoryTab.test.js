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
