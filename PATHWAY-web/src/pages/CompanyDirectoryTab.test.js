import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));

describe('CompanyDirectoryTab', () => {
  beforeEach(() => adminRequest.mockReset());

  test('coordinator loads capacity and saves an edited directory company', async () => {
    const company = {
      id: 'company-1', name: 'Northwind Labs', address: '1 Main Road', industry: 'Technology',
      email: 'hr@northwind.test', phone: '555-0100', capacity: 8, occupiedSlots: 3, availableSlots: 5, active: true,
    };
    adminRequest
      .mockResolvedValueOnce({ companies: [company] })
      .mockResolvedValueOnce({ company: { ...company, capacity: 10 } })
      .mockResolvedValueOnce({ companies: [{ ...company, capacity: 10, availableSlots: 7 }] });

    render(<CompanyDirectoryTab readOnly={false} />);
    expect(await screen.findByText('3 / 8 placements')).toBeInTheDocument();
    expect(screen.getByText('5 available')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/Internship capacity/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/companies/company-1', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse(adminRequest.mock.calls[1][1].body)).toMatchObject({ capacity: 10, active: true, name: 'Northwind Labs' });
    expect(await screen.findByRole('status')).toHaveTextContent('Northwind Labs was updated.');
  });

  test('creates a directory entry with numeric capacity', async () => {
    adminRequest
      .mockResolvedValueOnce({ companies: [] })
      .mockResolvedValueOnce({ company: { name: 'New Company' } })
      .mockResolvedValueOnce({ companies: [{ id: 'new-company', name: 'New Company', capacity: 4, occupiedSlots: 0, availableSlots: 4, active: true }] });

    render(<CompanyDirectoryTab readOnly={false} />);
    await screen.findByText('No companies have been added yet.');
    fireEvent.change(screen.getByLabelText('Company name'), { target: { value: 'New Company' } });
    fireEvent.change(screen.getByLabelText(/Internship capacity/), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Require location for attendance'));
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '10.3' } });
    fireEvent.change(screen.getByLabelText('Longitude'), { target: { value: '123.9' } });
    fireEvent.change(screen.getByLabelText('Radius (metres)'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to directory' }));

    await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/companies', expect.objectContaining({ method: 'POST' })));
    expect(JSON.parse(adminRequest.mock.calls[1][1].body)).toMatchObject({ name: 'New Company', capacity: 4, active: true, geofence: { enabled: true, latitude: 10.3, longitude: 123.9, radiusMeters: 150 } });
  });

  test('admin can monitor companies but has no create or edit controls', async () => {
    adminRequest.mockResolvedValue({ companies: [{ id: 'one', name: 'Read-only company', active: true, capacity: 5, occupiedSlots: 1, availableSlots: 4 }] });
    render(<CompanyDirectoryTab readOnly />);
    expect(await screen.findByText('Read-only company')).toBeInTheDocument();
    expect(adminRequest).toHaveBeenCalledWith('/admin/companies');
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to directory' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  });

  test('failed loading is not displayed as an empty company directory', async () => {
    adminRequest.mockRejectedValue(new Error('Restart the local backend.'));
    render(<CompanyDirectoryTab readOnly={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Restart the local backend.');
    expect(screen.queryByText('No companies have been added yet.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to directory' })).toBeDisabled();
  });
});
