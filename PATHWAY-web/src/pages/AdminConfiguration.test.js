import { fireEvent, render, screen } from '@testing-library/react';
import AcademicTermsTab from './AcademicTermsTab';
import SystemSettingsTab from './SystemSettingsTab';
import AuditLogsTab from './AuditLogsTab';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test('academic term edit populates the labeled form', async () => {
  adminRequest.mockResolvedValue({ terms: [{ id: 'term-1', name: 'Semester One', startDate: '2026-06-01', endDate: '2026-10-31', isActive: true }] });
  render(<AcademicTermsTab />);
  fireEvent.click(await screen.findByRole('button', { name: 'Edit Term' }));
  expect(screen.getByLabelText('Term name / school year')).toHaveValue('Semester One');
  expect(screen.getByLabelText('Start date')).toHaveValue('2026-06-01');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel Edit' }));
  expect(screen.getByLabelText('Term name / school year')).toHaveValue('');
});

test('workday controls expose their selected state and preserve save payload', async () => {
  adminRequest.mockResolvedValue({ settings: { expectedWorkdays: ['Monday'] } });
  render(<SystemSettingsTab />);
  const monday = await screen.findByRole('button', { name: /Monday/ });
  expect(monday).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: /Tuesday/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Save Global Settings' }));
  expect(adminRequest).toHaveBeenLastCalledWith('/admin/settings', expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"expectedWorkdays":["Monday","Tuesday"]') }));
  await screen.findByRole('status');
});

test('audit search filters events and metadata is expandable', async () => {
  adminRequest.mockResolvedValue({ logs: [{ id: 'event-1', action: 'account_created', actorId: 'admin-1', actorRole: 'admin', targetType: 'user', createdAt: '2026-10-07T00:00:00Z', details: { verified: true } }] });
  render(<AuditLogsTab />);
  expect(await screen.findByText('account_created')).toBeInTheDocument();
  expect(screen.getByText('View details').closest('details')).not.toHaveAttribute('open');
  fireEvent.change(screen.getByLabelText('Search audit logs'), { target: { value: 'no-match' } });
  expect(screen.getByText('No audit records match your query.')).toBeInTheDocument();
});
