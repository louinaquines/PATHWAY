import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));

describe('CompanyDirectoryTab', () => {
  beforeEach(() => adminRequest.mockReset());

  test('loads capacity and saves an edited directory company through the admin API', async () => {
    const company = {
      id: 'company-1', name: 'Northwind Labs', address: '1 Main Road', industry: 'Technology',
      email: 'hr@northwind.test', phone: '555-0100', capacity: 8, occupiedSlots: 3, availableSlots: 5, active: true,
    };
    adminRequest
      .mockResolvedValueOnce({ companies: [company] })
      .mockResolvedValueOnce({ company: { ...company, capacity: 10 } })
      .mockResolvedValueOnce({ companies: [{ ...company, capacity: 10, availableSlots: 7 }] });

    render(<CompanyDirectoryTab />);
    expect(await screen.findByText((_, node) => node?.textContent === '3 / 8 placements · 5 available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/Internship capacity/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/admin/companies/company-1', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(adminRequest.mock.calls[1][1].body)).toMatchObject({ capacity: 10, active: true, name: 'Northwind Labs' });
    expect(await screen.findByRole('status')).toHaveTextContent('Northwind Labs was updated.');
  });

  test('creates a directory entry with numeric capacity', async () => {
    adminRequest
      .mockResolvedValueOnce({ companies: [] })
      .mockResolvedValueOnce({ company: { name: 'New Company' } })
      .mockResolvedValueOnce({ companies: [{ id: 'new-company', name: 'New Company', capacity: 4, occupiedSlots: 0, availableSlots: 4, active: true }] });

    render(<CompanyDirectoryTab />);
    await screen.findByText('No companies have been added yet.');
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'New Company' } });
    fireEvent.change(screen.getByLabelText(/Internship capacity/), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to directory' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/admin/companies', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(adminRequest.mock.calls[1][1].body)).toMatchObject({ name: 'New Company', capacity: 4, active: true });
  });
});
