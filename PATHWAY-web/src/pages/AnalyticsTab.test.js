import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { onAuthStateChanged } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';
import { StrictMode } from 'react';
import AnalyticsTab from './AnalyticsTab';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'staff' } }, db: {} }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => () => {}) }));
jest.mock('firebase/firestore', () => ({ onSnapshot: jest.fn(() => () => {}), doc: jest.fn(), collection: jest.fn(), query: jest.fn(), where: jest.fn() }));
const section = { id: 'section', name: 'BSIT 4G' };
const payload = { students: [{ id: 'student', name: 'Test Student', hoursRendered: 120, hoursRequired: 540, completionPercentage: 22, attendanceRate: null, status: 'Unavailable', reasons: ['Insufficient history.'] }], totalStudents: 1, totalHoursLogged: 120, atRiskStudents: null };
beforeEach(() => { jest.clearAllMocks(); auth.currentUser = { uid: 'staff' }; });

test('StrictMode replay loads analytics and the excused editor without stale results', async () => {
  adminRequest.mockImplementation(async path => path.endsWith('/analytics') ? payload : { dates: ['2026-10-02'], version: 2 });
  render(<StrictMode><AnalyticsTab coordinatorId="staff" selectedSection={section} /></StrictMode>);
  await screen.findByText('Test Student');
  fireEvent.click(screen.getByRole('button', { name: 'Edit excused dates for Test Student' }));
  await waitFor(() => expect(screen.getByLabelText('Excused dates (YYYY-MM-DD)')).toHaveValue('2026-10-02'));
  expect(screen.getByRole('button', { name: 'Save excused dates' })).toBeEnabled();
});
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

test('explicit tiers, progress and data quality override compatibility status and unknown counts', async () => {
  adminRequest.mockResolvedValue({ ...payload, completedInterns: 0, totalHoursLogged: null, averageHours: null, countsAvailable: { completed: false, highRisk: false, totalHours: false },
    students: ['Low','Medium','High',null].map((riskTier, i) => ({ ...payload.students[0], id: String(i), name: `Student ${i}`, riskTier,
      progressStatus: i === 0 ? 'Completed' : 'In progress', dataStatus: ['Ready','Insufficient data','Needs verification','Unavailable'][i],
      status: 'On Track', risk: 'On Track', reasonCodes: [{ code: 'PROJECTED_SHORTFALL' }], observationCounts: { attendanceEligibleDays: 5, projectionEligibleDays: 9 } })) });
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Student 0');
  for (const tier of ['Low','Medium','High']) expect(screen.getByText(`Risk: ${tier}`)).toBeInTheDocument();
  expect(screen.getByText('Progress: Completed')).toBeInTheDocument();
  expect(screen.getByText('Data: Needs verification')).toBeInTheDocument();
  expect(screen.queryByText('On Track')).not.toBeInTheDocument();
  expect(screen.getAllByText(/Projected shortfall/).length).toBe(4);
  expect(screen.getByText(/last 20 eligible/i)).toBeInTheDocument();
  expect(screen.queryByText('0 hrs')).not.toBeInTheDocument();
});

test('section change immediately clears rows and discards late response', async () => {
  let finish;
  adminRequest.mockResolvedValueOnce(payload).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  view.rerender(<AnalyticsTab coordinatorId="staff" selectedSection={{ id: 'other', name: 'Other' }} />);
  expect(screen.queryByText('Test Student')).not.toBeInTheDocument();
  view.unmount();
  finish(payload);
});

test('excused dates load fresh version, reject impossible dates and require conflict review', async () => {
  adminRequest.mockImplementation(async (path, options) => {
    if (path.endsWith('/analytics')) return payload;
    if (!options?.method) return { dates: ['2026-10-01'], version: 3 };
    throw Object.assign(new Error('Excused dates changed; reload before saving.'), { status: 409 });
  });
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  fireEvent.click(screen.getByRole('button', { name: 'Edit excused dates for Test Student' }));
  const input = await screen.findByLabelText('Excused dates (YYYY-MM-DD)');
  await waitFor(() => expect(input).toHaveValue('2026-10-01'));
  fireEvent.change(input, { target: { value: '2026-02-30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save excused dates' }));
  await screen.findByText(/unique real calendar dates/);
  fireEvent.change(input, { target: { value: '2026-10-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save excused dates' }));
  await screen.findByText(/reload before saving/);
  expect(screen.getByRole('button', { name: 'Save excused dates' })).toBeDisabled();
  expect(input).toHaveValue('2026-10-02');
  expect(adminRequest).toHaveBeenLastCalledWith('/coordinator/sections/section/students/student/attendance-excused-dates', expect.objectContaining({ method: 'PUT', body: '{"dates":["2026-10-02"],"expectedVersion":3}' }));
});

test('auth subscription removes private rows immediately and ignores an in-flight refresh', async () => {
  let resolve;
  adminRequest.mockResolvedValueOnce(payload).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  act(() => { auth.currentUser = null; onAuthStateChanged.mock.calls[0][1](null); });
  expect(screen.queryByText('Test Student')).not.toBeInTheDocument();
  await act(async () => resolve(payload));
  expect(screen.queryByText('Test Student')).not.toBeInTheDocument();
});

test('lost section assignment clears an open draft and later policy responses', async () => {
  let resolve;
  adminRequest.mockResolvedValueOnce(payload).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  fireEvent.click(screen.getByRole('button', { name: 'Edit excused dates for Test Student' }));
  act(() => onSnapshot.mock.calls[1][1]({ data: () => ({ coordinatorId: 'someone-else' }) }));
  expect(screen.queryByLabelText('Excused dates (YYYY-MM-DD)')).not.toBeInTheDocument();
  await act(async () => resolve({ dates: ['2026-10-10'], version: 2 }));
  expect(screen.queryByText('Test Student')).not.toBeInTheDocument();
});

test('fresh analytics 403 invalidates and hides the schedule editor', async () => {
  adminRequest.mockRejectedValue(Object.assign(new Error('Denied'), { status: 403 }));
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText(/Attendance access changed/);
  expect(screen.queryByText('Save schedule')).not.toBeInTheDocument();
});

test('available zero totals remain zero rather than being confused with unavailable data', async () => {
  adminRequest.mockResolvedValue({ ...payload, countsAvailable: { completed: true, highRisk: true, totalHours: true }, completedInterns: 0, atRiskStudents: 0, totalHoursLogged: 0, averageHours: 0,
    students: [{ ...payload.students[0], hoursRendered: 0, completionPercentage: 0, attendanceRate: 0, riskTier: 'High', progressStatus: 'In progress', dataStatus: 'Ready' }] });
  render(<AnalyticsTab coordinatorId="staff" selectedSection={section} />);
  await screen.findByText('Test Student');
  expect(screen.getAllByText('0 hrs')).toHaveLength(2);
  expect(screen.getAllByText('0%')).toHaveLength(2);
  expect(screen.getByText('Risk: High')).toBeInTheDocument();
  expect(screen.queryByText('Risk: Low')).not.toBeInTheDocument();
});
