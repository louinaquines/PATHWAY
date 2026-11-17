import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { adminRequest, adminDocumentBlob } from '../adminApi';
import WorkplaceSupportPanel from './WorkplaceSupportPanel';
import { onAuthStateChanged } from 'firebase/auth';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn(), adminDocumentBlob: jest.fn() }));
jest.mock('../firebase', () => ({ auth: { currentUser: { uid: 'coord' } } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => () => {}) }));
const report = { id: 'r1', studentName: 'Ana Local', companyName: 'Synthetic Company', idNumber: 'S-1', status: 'Submitted', priority: 'normal', version: 1, description: 'Private report', createdAt: '2026-01-01', attachment: null };
let history, detail, list, denied, post;
beforeEach(() => {
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'synthetic-request-id' });
  jest.clearAllMocks(); history = []; detail = { ...report }; list = [detail]; denied = false; post = null;
  adminRequest.mockImplementation(async (path, options) => {
    if (denied) throw Object.assign(Error('Denied'), { status: 403 });
    if (options?.method === 'POST') return post ? post(path, options) : { id: 'r1', status: 'Under review', version: 2 };
    if (path.includes('/events')) return { records: history, hasMore: false, cursor: null };
    if (path.includes('-notices')) return { records: [], hasMore: false, cursor: null };
    if (path.endsWith('/r1')) return detail;
    return { records: list, hasMore: false, cursor: null };
  });
});
test('requires complete paginated history before enabling actions', async () => {
  detail.status = 'Following up'; detail.version = 28;
  const original = adminRequest.getMockImplementation();
  adminRequest.mockImplementation((path, options) => path.includes('/events') ? Promise.resolve(path.includes('cursor=history-next')
    ? { records: [{ action: 'contact', contactOutcome: 'unreachable', version: 28 }], hasMore: false, cursor: null }
    : { records: [{ action: 'contact', contactOutcome: 'successful', version: 2 }, { action: 'record_action', version: 3 }], hasMore: true, cursor: 'history-next' }) : original(path, options));
  await open();
  expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Load more private history' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more private history' })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Act' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
});
test('auth change clears detail and an in-flight history response cannot restore it', async () => {
  let finish;
  const original = adminRequest.getMockImplementation();
  await open();
  adminRequest.mockImplementation((path, options) => path.includes('/events')
    ? new Promise(resolve => { finish = resolve; }) : original(path, options));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }));
  await waitFor(() => expect(finish).toEqual(expect.any(Function)));
  act(() => onAuthStateChanged.mock.calls.at(-1)[1](null));
  await act(async () => finish({ records: [{ action: 'acknowledge', version: 2, note: 'Late private history' }], hasMore: false, cursor: null }));
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(screen.queryByText('Late private history')).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Report details' })).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('account changed');
});
test('unmount ignores late private detail responses and releases auth listener', async () => {
  let finish;
  const unsubscribe = jest.fn(); onAuthStateChanged.mockReturnValueOnce(unsubscribe);
  const original = adminRequest.getMockImplementation();
  adminRequest.mockImplementation((path, options) => path.endsWith('/r1') ? new Promise(resolve => { finish = resolve; }) : original(path, options));
  const view = render(<WorkplaceSupportPanel userId="coord" />);
  fireEvent.click(await screen.findByRole('button', { name: /Open report.*Ana/ }));
  view.unmount(); await act(async () => finish(report));
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(adminRequest.mock.calls.some(([path]) => path.endsWith('/events'))).toBe(false);
});
test('protected attachment denial clears details without using a provider URL', async () => {
  detail.attachment = { url: 'https://synthetic.invalid/never-use' };
  adminDocumentBlob.mockRejectedValueOnce(Error('Denied'));
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Download protected attachment' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Attachment unavailable');
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(adminDocumentBlob).toHaveBeenCalledWith('/coordinator/workplace-support/r1/attachment', { timeoutMs: 30000 });
});
test('pending event prevents duplicate submissions', async () => {
  let finish; post = jest.fn(() => new Promise(resolve => { finish = resolve; }));
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  const button = screen.getByRole('button', { name: 'Save event' });
  fireEvent.click(button); fireEvent.click(button);
  expect(post).toHaveBeenCalledTimes(1);
  await act(async () => finish({ id: 'r1', version: 2, status: 'Under review' }));
});
test('loading failure exposes retry and empty view without persisting private content', async () => {
  const local = jest.spyOn(Storage.prototype, 'setItem');
  adminRequest.mockRejectedValueOnce(Error('Offline'));
  render(<WorkplaceSupportPanel userId="coord" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load');
  expect(screen.getByRole('button', { name: 'Refresh support' })).toBeEnabled();
  expect(local).not.toHaveBeenCalled(); local.mockRestore();
});
async function open() {
  render(<WorkplaceSupportPanel userId="coord" />);
  fireEvent.click(await screen.findByRole('button', { name: /Open report.*Ana/ }));
  await screen.findByText('Private report');
  await waitFor(() => expect(screen.queryByText('Loading private history…')).not.toBeInTheDocument());
}
test('sorts high priority first and searches student and company', async () => {
  list = [{ ...report }, { ...report, id: 'r2', studentName: 'Bea Test', companyName: 'Urgent Local', priority: 'high' }];
  render(<WorkplaceSupportPanel userId="coord" />);
  const buttons = await screen.findAllByRole('button', { name: /Open report/ });
  expect(buttons[0]).toHaveAccessibleName(/Bea/);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Synthetic' } });
  expect(screen.queryByRole('button', { name: /Bea/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Ana' } });
  expect(screen.getByRole('button', { name: /Open report.*Ana/ })).toBeInTheDocument();
});
test('keeps load more available on empty authorized scan pages', async () => {
  list = [];
  adminRequest.mockImplementation(async path => path.includes('-notices') ? { records: [] } : path.includes('cursor=next') ? { records: [report], hasMore: false } : { records: [], hasMore: true, cursor: 'next' });
  render(<WorkplaceSupportPanel userId="coord" />);
  await screen.findByRole('button', { name: 'Load more reports' });
  fireEvent.change(screen.getByRole('searchbox', { name: /Search loaded/ }), { target: { value: 'Ana' } });
  expect(screen.getByText(/No loaded reports match/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Load more reports' }));
  expect(await screen.findByRole('button', { name: /Open report.*Ana/ })).toBeInTheDocument();
});
test('only offers review on submitted reports and sends private note', async () => {
  await open();
  expect(screen.getByRole('button', { name: 'Contact' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Act' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.change(screen.getByLabelText('Private note'), { target: { value: 'Local private note' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/workplace-support/r1/events', expect.objectContaining({ body: expect.stringContaining('Local private note') })));
});
test('requires attempted contact for act and latest successful contact plus action and reason for resolution', async () => {
  detail.status = 'Following up'; detail.version = 5;
  history = [{ action: 'contact', contactOutcome: 'successful', version: 2 }, { action: 'record_action', version: 3 }, { action: 'contact', contactOutcome: 'unreachable', version: 5 }];
  await open();
  expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Act' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Resolve' })).toBeDisabled();
});
test('resolution requires a nonblank reason and displays private history', async () => {
  detail.status = 'Following up'; detail.version = 3;
  history = [{ action: 'contact', contactOutcome: 'successful', version: 2, note: 'Private call' }, { action: 'record_action', version: 3 }];
  await open(); expect(screen.getByText('Private call')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
  expect(screen.getByRole('button', { name: 'Save event' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Resolution reason'), { target: { value: 'Completed local follow-up' } });
  expect(screen.getByRole('button', { name: 'Save event' })).toBeEnabled();
});
test('retains identical request payload for lost response retry and prevents duplicate clicks', async () => {
  post = jest.fn().mockRejectedValueOnce(Error('Network lost')).mockResolvedValueOnce({ id: 'r1', status: 'Under review', version: 2 });
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry same event' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
});
test('stale event closes draft and requires fresh detail before further action', async () => {
  post = async () => { throw Object.assign(Error('Changed'), { status: 409 }); };
  await open(); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
  expect(await screen.findByText(/Report changed/)).toBeInTheDocument();
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
});
test('denied history refresh clears private details and notes', async () => {
  await open(); denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh report' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
});
test('account change discards late private responses', async () => {
  let finish;
  adminRequest.mockImplementation(path => path.endsWith('/r1') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ records: path.includes('-notices') ? [] : [report] }));
  const view = render(<WorkplaceSupportPanel userId="coord" />);
  fireEvent.click(await screen.findByRole('button', { name: /Open report.*Ana/ }));
  view.rerender(<WorkplaceSupportPanel userId="other" />);
  await act(async () => finish(report));
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
});
test('generic notice read uses separate endpoint and does not acknowledge report', async () => {
  adminRequest.mockImplementation(async (path, options) => {
    if (options?.method === 'POST') return { success: true };
    return { records: path.includes('-notices') ? [{ id: 'n1', reportId: 'r1', title: 'Workplace support update', read: false }] : [report] };
  });
  render(<WorkplaceSupportPanel userId="coord" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Mark support notice read' }));
  await waitFor(() => expect(adminRequest).toHaveBeenCalledWith('/coordinator/workplace-support-notices/n1/read', { method: 'POST', body: '{}', timeoutMs: 30000 }));
  expect(adminRequest.mock.calls.some(([p, o]) => p.endsWith('/events') && o?.method === 'POST')).toBe(false);
});
