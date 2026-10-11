import { act, fireEvent, render, screen } from '@testing-library/react';
import AttendanceAiExplanation from './AttendanceAiExplanation';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => adminRequest.mockReset());
test('only sends explicit consent; shows computed value with explanation and allows discard', async () => {
  adminRequest.mockResolvedValue({ today: '2026-10-12', explanations: [{ field: 'attendanceRate', value: null, explanation: 'Reliable attendance data is unavailable.' }], limitation: 'Estimates are not guarantees.' });
  render(<AttendanceAiExplanation studentId="student" sectionId="section" />);
  expect(adminRequest).not.toHaveBeenCalled(); expect(screen.getByText('Explain current metrics').disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Explain current metrics'));
  await screen.findByText('Attendance rate: Unavailable');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/sections/section/students/student/attendance-ai', { method: 'POST', body: '{"consent":true}' });
  fireEvent.click(screen.getByText('Discard explanation')); expect(screen.queryByText('Attendance rate: Unavailable')).toBeNull();
});
test('new metrics discard stale pending result', async () => {
  let resolve; adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<AttendanceAiExplanation studentId="student" sectionId="section" metricsVersion="old" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Explain current metrics'));
  view.rerender(<AttendanceAiExplanation studentId="student" sectionId="section" metricsVersion="new" />);
  await act(async () => resolve({ explanations: [{ field: 'risk', value: 'On Track', explanation: 'Old explanation' }] }));
  expect(screen.queryByText('Old explanation')).toBeNull();
});
test('provider errors preserve free analytics and hide sensitive details', async () => {
  adminRequest.mockRejectedValue(new Error('secret'));
  render(<AttendanceAiExplanation studentId="student" sectionId="section" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Explain current metrics'));
  await screen.findByText('AI explanation unavailable. Calculated analytics remain available.');
});
