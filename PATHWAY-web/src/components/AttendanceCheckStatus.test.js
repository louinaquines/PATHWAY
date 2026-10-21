import { act, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import AttendanceCheckStatus from './AttendanceCheckStatus';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
const current = () => true;
const value = { status: 'complete', dueDate: '2026-10-21', lastAttemptAt: '2026-10-20T16:15:00.000Z', lastSuccessfulCheckAt: '2026-10-20T16:16:00.000Z' };
beforeEach(() => jest.resetAllMocks());

test.each([
  ['disabled', null, /not enabled/], ['pending', null, /No successful check yet/],
  ['complete', value.lastSuccessfulCheckAt, /Last successful check/], ['unavailable', null, /unavailable/],
])('automatic check status %s is truthful without a run button', async (status, lastSuccessfulCheckAt, text) => {
  adminRequest.mockResolvedValue({ ...value, status, lastSuccessfulCheckAt });
  render(<StrictMode><AttendanceCheckStatus actorId="staff" sectionId="section" isCurrent={current} /></StrictMode>);
  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  if (status === 'pending') expect(screen.getByText(/catch-up/)).toBeInTheDocument();
});

test('status failure is sanitized and late results after section change are discarded', async () => {
  let finish;
  adminRequest.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockRejectedValue(new Error('PRIVATE failure'));
  const view = render(<AttendanceCheckStatus actorId="staff" sectionId="old" isCurrent={current} />);
  view.rerender(<AttendanceCheckStatus actorId="staff" sectionId="new" isCurrent={current} />);
  await screen.findByText(/unavailable/);
  await act(async () => finish(value));
  expect(screen.queryByText(/Last successful check/)).not.toBeInTheDocument();
  expect(screen.queryByText(/PRIVATE/)).not.toBeInTheDocument();
});

test('authorization failure clears status and invokes access boundary', async () => {
  const denied = jest.fn();
  adminRequest.mockRejectedValue(Object.assign(new Error('PRIVATE'), { status: 403 }));
  render(<AttendanceCheckStatus actorId="staff" sectionId="section" isCurrent={current} onDenied={denied} />);
  await screen.findByText(/unavailable/);
  expect(denied).toHaveBeenCalledTimes(1);
});
