import { act, fireEvent, render, screen, within } from '@testing-library/react';
import WorkplaceConcernReview from './WorkplaceConcernReview';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(),onSnapshot: jest.fn(() => () => {}) }));
const root = '/coordinator/workplace-concerns';
const row = { id: 'case-one', title: 'Potential workplace concern—needs review', studentId: 'synthetic-student', priority: 'high', state: 'open', version: 1, deliveryState: 'delivered' };
const evidence = 'PRIVATE original threat excerpt';
const record = { ...row, findings: [{ category: 'threat', quote: evidence, reason: 'Human review needed' }], history: [], reviewed: false, contacted: false, acted: false, evidenceExpired: false };
const access = { isCurrent: () => true, onDenied: jest.fn() };
let detail, failAction;
beforeEach(() => {
  jest.clearAllMocks(); detail = { ...record }; failAction = false;
  adminRequest.mockImplementation(async (path, options) => {
    if (path === `${root}/list`) return { records: [row], hasMore: false, cursor: null };
    if (path === `${root}/notices/list`) return { records: [{ id: 'notice-one', caseId: 'case-one', title: row.title, priority: 'high', read: false }], hasMore: false, cursor: null };
    if (path === `${root}/case-one/detail`) return detail;
    if (path.endsWith('/read')) return { id: 'notice-one', read: true };
    if (path.endsWith('/action')) {
      if (failAction) throw Error('Synthetic network failure');
      const body = JSON.parse(options.body);
      detail = { ...detail, version: detail.version + 1, ...(body.action === 'review' ? { reviewed: true } : {}),
        ...(body.action === 'dismiss_false_positive' ? { state: 'dismissed_false_positive' } : {}) };
      return { id: row.id, state: detail.state, version: detail.version };
    }
    throw Error(`Unexpected path ${path}`);
  });
});
async function open() { fireEvent.click(await screen.findByRole('button', { name: 'Open concern details' })); return screen.findByRole('region', { name: 'Concern details' }); }
test('uses authenticated POST reads and exposes excerpts only after explicitly opening details', async () => {
  render(<WorkplaceConcernReview access={access} />);
  await screen.findByRole('button', { name: 'Open concern details' });
  expect(screen.queryByText(evidence)).not.toBeInTheDocument();
  expect(adminRequest.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}', deadlineMs: 15000 });
  const panel = await open(); expect(within(panel).getByText(evidence)).toBeInTheDocument();
  expect(screen.getByText(/not continuously monitored/i)).toBeInTheDocument();
});
test('resolution guards and false-positive dismissal have distinct explicit controls', async () => {
  render(<WorkplaceConcernReview access={access} />); const panel = await open();
  const resolve = within(panel).getByRole('button', { name: 'Resolve genuine concern' }); expect(resolve).toBeDisabled();
  const dismiss = within(panel).getByRole('button', { name: 'Dismiss AI false positive' }); expect(dismiss).toBeDisabled();
  fireEvent.change(within(panel).getByLabelText('Review note or reason'), { target: { value: 'Training example, not an incident' } });
  fireEvent.click(dismiss);
  await screen.findByText('dismissed_false_positive');
  const body = JSON.parse(adminRequest.mock.calls.find(([path]) => path.endsWith('/action'))[1].body);
  expect(body).toMatchObject({ action: 'dismiss_false_positive', note: 'Training example, not an incident', expectedVersion: 1 });
  expect(body.requestId).toBeTruthy();
});
test('network errors preserve the draft and retry uses the same request identity', async () => {
  render(<WorkplaceConcernReview access={access} />); const panel = await open(); failAction = true;
  fireEvent.change(within(panel).getByLabelText('Review note or reason'), { target: { value: 'Keep this PRIVATE draft' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Dismiss AI false positive' }));
  await screen.findByRole('alert'); expect(screen.getByLabelText('Review note or reason')).toHaveValue('Keep this PRIVATE draft');
  failAction = false; fireEvent.click(screen.getByRole('button', { name: 'Dismiss AI false positive' }));
  await screen.findByText('dismissed_false_positive');
  const bodies = adminRequest.mock.calls.filter(([path]) => path.endsWith('/action')).map(([,options]) => JSON.parse(options.body));
  expect(bodies[1].requestId).toBe(bodies[0].requestId);
});
test('permission denial clears sensitive content; expired evidence is never rendered', async () => {
  detail = { ...row, evidenceExpired: true, findings: [{ quote: evidence }], history: [{ note: 'PRIVATE note' }] };
  const { unmount } = render(<WorkplaceConcernReview access={access} />); await open();
  expect(screen.queryByText(evidence)).not.toBeInTheDocument(); expect(screen.getByText(/evidence retention period has ended/i)).toBeInTheDocument(); unmount();
  adminRequest.mockRejectedValue(Object.assign(Error('Denied'), { status: 403 }));
  render(<WorkplaceConcernReview access={access} />); await screen.findByRole('alert'); expect(access.onDenied).toHaveBeenCalled();
});
test('late detail response cannot repopulate after access changed or component unmounted', async () => {
  let resolveDetail, allowed = true;
  const original = adminRequest.getMockImplementation();
  adminRequest.mockImplementation((path, options) => path.endsWith('/detail') ? new Promise(resolve => { resolveDetail = resolve; }) : original(path, options));
  const { unmount } = render(<WorkplaceConcernReview access={{ ...access, isCurrent: () => allowed }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open concern details' })); allowed = false;
  await act(async () => resolveDetail(record)); expect(screen.queryByText(evidence)).not.toBeInTheDocument(); unmount();
});
test('version conflict can refresh the selected case without losing its draft', async () => {
  const original = adminRequest.getMockImplementation(); let conflict = true;
  adminRequest.mockImplementation((path, options) => {
    if (path.endsWith('/action') && conflict) { detail = { ...detail,version: 2 }; return Promise.reject(Object.assign(Error('Case changed'),{ status: 409 })); }
    return original(path,options);
  });
  render(<WorkplaceConcernReview access={access} />); const panel = await open();
  fireEvent.change(within(panel).getByLabelText('Review note or reason'),{ target: { value: 'Preserve this reason across a conflict' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Dismiss AI false positive' })); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button',{ name: 'Refresh selected case' }));
  await screen.findByRole('button',{ name: 'Dismiss AI false positive' });
  expect(screen.getByLabelText('Review note or reason')).toHaveValue('Preserve this reason across a conflict');
  conflict = false; fireEvent.click(screen.getByRole('button',{ name: 'Dismiss AI false positive' })); await screen.findByText('dismissed_false_positive');
  const last = adminRequest.mock.calls.filter(([path]) => path.endsWith('/action')).at(-1);
  expect(JSON.parse(last[1].body).expectedVersion).toBe(2);
});
test('notice pagination reaches authorized records after an empty filtered first page', async () => {
  const original = adminRequest.getMockImplementation();
  adminRequest.mockImplementation((path,options) => path === `${root}/notices/list` ? Promise.resolve(JSON.parse(options.body).cursor
    ? { records: [{ id: 'tail', caseId: 'case-one', title: 'Authorized tail notice', priority: 'normal', read: false }], hasMore: false, cursor: null }
    : { records: [], hasMore: true, cursor: 'second-page' }) : original(path,options));
  render(<WorkplaceConcernReview access={access} />);
  fireEvent.click(await screen.findByRole('button',{ name: 'Load more concern notices' }));
  expect(await screen.findByText(/Authorized tail notice/)).toBeInTheDocument();
  expect(adminRequest.mock.calls.some(([path,options]) => path.endsWith('/notices/list') && JSON.parse(options.body).cursor === 'second-page')).toBe(true);
});
test('draft editing is disabled while its action is in flight so new text cannot be discarded', async () => {
  const original = adminRequest.getMockImplementation(); let release;
  adminRequest.mockImplementation((path,options) => path.endsWith('/action') ? new Promise(resolve => { release = () => resolve(original(path,options)); }) : original(path,options));
  render(<WorkplaceConcernReview access={access} />); await open();
  fireEvent.change(screen.getByLabelText('Review note or reason'),{ target: { value: 'Submitted reason' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Dismiss AI false positive' }));
  expect(screen.getByLabelText('Review note or reason')).toBeDisabled();
  await act(async () => release());
});
