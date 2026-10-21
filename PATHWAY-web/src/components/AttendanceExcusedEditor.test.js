import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AttendanceExcusedEditor, { parseExcusedDates } from './AttendanceExcusedEditor';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => adminRequest.mockReset());

test.each(['2026-02-29','2100-02-29','1999-12-31','2101-01-01','2026-13-01','2026-04-31','2026-1-01','2026-10-01,2026-10-01'])('real date parser rejects %s', text => {
  expect(() => parseExcusedDates(text)).toThrow(/unique real calendar dates/);
});
test('date parser accepts leap dates and boundaries, sorts and limits unique dates', () => {
  expect(parseExcusedDates('2100-12-31, 2000-02-29\n2000-01-01')).toEqual(['2000-01-01','2000-02-29','2100-12-31']);
  expect(parseExcusedDates('')).toEqual([]);
  const dates = Array.from({ length: 367 }, (_, index) => new Date(Date.UTC(2024,0,1 + index)).toISOString().slice(0,10));
  expect(parseExcusedDates(dates.slice(0,366).join(','))).toHaveLength(366);
  expect(() => parseExcusedDates(dates.join(','))).toThrow();
});
const props = { sectionId: 'section', studentId: 'student', isCurrent: () => true };
test('transient save failure preserves draft, stable target and expected version without automatic retry', async () => {
  adminRequest.mockResolvedValueOnce({ dates: [], version: 4 }).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce({ dates: ['2026-10-02'], version: 5 });
  render(<AttendanceExcusedEditor {...props} />);
  const save = screen.getByRole('button', { name: 'Save excused dates' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Excused dates (YYYY-MM-DD)'), { target: { value: '2026-10-02' } });
  fireEvent.click(save);
  await screen.findByText('Connection lost');
  expect(screen.getByLabelText('Excused dates (YYYY-MM-DD)')).toHaveValue('2026-10-02');
  expect(adminRequest).toHaveBeenCalledTimes(2);
  fireEvent.click(save);
  await screen.findByText(/Excused dates saved/);
  expect(adminRequest.mock.calls[1]).toEqual(adminRequest.mock.calls[2]);
});
test('conflict requires explicit reload and review of fresh version before another save', async () => {
  adminRequest.mockResolvedValueOnce({ dates: [], version: 0 }).mockRejectedValueOnce(Object.assign(new Error('reload before saving'), { status: 409 }))
    .mockResolvedValueOnce({ dates: ['2026-10-03'], version: 7 }).mockResolvedValueOnce({ dates: ['2026-10-03'], version: 8 });
  render(<AttendanceExcusedEditor {...props} />);
  const save = screen.getByRole('button', { name: 'Save excused dates' });
  await waitFor(() => expect(save).toBeEnabled()); fireEvent.click(save);
  await screen.findByText('reload before saving'); expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload excused dates for review' }));
  await waitFor(() => expect(screen.getByLabelText('Excused dates (YYYY-MM-DD)')).toHaveValue('2026-10-03'));
  fireEvent.click(save); await screen.findByText(/Excused dates saved/);
  expect(adminRequest).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ body: '{"dates":["2026-10-03"],"expectedVersion":7}' }));
});
test('fresh denial clears private draft and asks the access boundary to invalidate', async () => {
  const denied = jest.fn();
  adminRequest.mockResolvedValueOnce({ dates: [], version: 1 }).mockRejectedValueOnce(Object.assign(new Error('Denied'), { status: 403 }));
  render(<AttendanceExcusedEditor {...props} onDenied={denied} />);
  const save = screen.getByRole('button', { name: 'Save excused dates' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Excused dates (YYYY-MM-DD)'), { target: { value: '2026-10-02' } }); fireEvent.click(save);
  await waitFor(() => expect(denied).toHaveBeenCalled());
  expect(screen.getByLabelText('Excused dates (YYYY-MM-DD)')).toHaveValue('');
});
