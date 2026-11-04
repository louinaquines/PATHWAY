import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CompanyBatchMatching from './CompanyBatchMatching';
import { adminRequest } from '../adminApi';

jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));

test('coordinator can edit a suggestion and must enter dates before confirming', async () => {
  const onConfirmed = jest.fn();
  adminRequest.mockResolvedValueOnce({
    planId: 'plan-1',
    rows: [{ studentId: 's1', studentName: 'Test Student', companyId: 'first' }],
    skipped: [],
    companies: [{ id: 'first', name: 'First host', availableSlots: 1 }, { id: 'second', name: 'Second host', availableSlots: 1 }],
  }).mockResolvedValueOnce({ assignedCount: 1 });
  render(<CompanyBatchMatching sectionId="section-1" students={[{ id: 's1', name: 'Test Student', accountApproved: true }]} onConfirmed={onConfirmed} />);
  fireEvent.click(screen.getByText('Match students to companies'));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Test Student' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate suggestions' }));
  const confirm = await screen.findByRole('button', { name: 'Confirm 1 assignment(s)' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } });
  fireEvent.change(screen.getByLabelText('Internship start date'), { target: { value: '2026-11-05' } });
  fireEvent.change(screen.getByLabelText('Internship end date'), { target: { value: '2026-12-05' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(onConfirmed).toHaveBeenCalledTimes(1));
  expect(JSON.parse(adminRequest.mock.calls[1][1].body)).toEqual({
    assignments: [{ studentId: 's1', companyId: 'second' }], startDate: '2026-11-05', endDate: '2026-12-05',
  });
});
