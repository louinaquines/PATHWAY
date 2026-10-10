import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AnalyticsTab from './AnalyticsTab';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
const section = { id: 'section', name: 'BSIT 4G' };
const payload = { students: [{ id: 'student', name: 'Test Student', hoursRendered: 120, hoursRequired: 540, completionPercentage: 22, attendanceRate: null, status: 'Unavailable', reasons: ['Insufficient history.'] }], totalStudents: 1, totalHoursLogged: 120, atRiskStudents: null };
beforeEach(() => { jest.clearAllMocks(); });
test('unavailable metrics stay unavailable and schedule saves through scoped API', async () => {
  adminRequest.mockResolvedValue(payload);
  const { container } = render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  expect(screen.getByText('Completion estimate unavailable')).toBeInTheDocument();
  expect(screen.queryByText('100%')).not.toBeInTheDocument();
  const dates = container.querySelectorAll('input[type=date]');
  fireEvent.change(dates[0], { target: { value: '2026-10-01' } });
  fireEvent.change(dates[1], { target: { value: '2026-12-31' } });
  fireEvent.click(screen.getByText('Save schedule'));
  await waitFor(() => expect(adminRequest.mock.calls.some(([path, options]) => path.endsWith('/schedule') && options.method === 'PUT')).toBe(true));
});
test('backend failure does not fabricate student metrics', async () => {
  adminRequest.mockRejectedValue(new Error('Backend unavailable'));
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable');
  expect(screen.queryByText('100%')).not.toBeInTheDocument();
});
