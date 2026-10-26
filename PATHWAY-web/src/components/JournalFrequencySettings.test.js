import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { adminRequest } from '../adminApi';
import JournalFrequencySettings from './JournalFrequencySettings';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => jest.clearAllMocks());
test('department-wide daily selection saves a versioned setting with no scope or date input', async () => {
  adminRequest.mockResolvedValueOnce({ frequency: 'weekly', revision: 0 }).mockResolvedValueOnce({ frequency: 'daily', revision: 1 });
  render(<JournalFrequencySettings />);
  fireEvent.click(screen.getByRole('button', { name: /Journal settings/ }));
  fireEvent.click(await screen.findByRole('radio', { name: 'Daily' }));
  expect(screen.queryByLabelText(/effective date/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith('/coordinator/journal-settings', { method: 'POST', body: JSON.stringify({ frequency: 'daily', expectedRevision: 0 }) }));
  expect(await screen.findByRole('button', { name: /Journal settings · Daily/ })).toBeInTheDocument();
});
test('load failure cannot be saved as a guessed weekly default', async () => {
  adminRequest.mockRejectedValue(Error('Settings unavailable'));
  render(<JournalFrequencySettings />);
  fireEvent.click(screen.getByRole('button', { name: /Journal settings/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings unavailable');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});
