import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import WorkplaceSupportPanel from './WorkplaceSupportPanel';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
jest.mock('../firebase', () => ({ auth: { currentUser: null } }));
jest.mock('firebase/auth', () => ({ onAuthStateChanged: jest.fn(() => () => {}) }));
const report = { id: 'r1', studentName: 'Ana', companyName: 'Local', status: 'Submitted', version: 1, description: 'Private report', attachment: { assetRef: 'synthetic' } };
let original, payloads, finish, stage, attempts;
beforeEach(() => {
  original = global.fetch; payloads = []; attempts = 0; stage = 'fetch';
  auth.currentUser = { uid: 'coord', getIdToken: async () => 'token' };
  Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => 'deadline-key' });
  global.fetch = jest.fn(async (url, options) => {
    if (options.method === 'POST') {
      payloads.push(options.body); attempts++;
      if (attempts === 1) {
        const stalled = new Promise(resolve => { finish = resolve; });
        if (stage === 'fetch') return stalled;
        return { ok: true, json: () => stalled };
      }
      return { ok: true, json: async () => ({ id: 'r1', status: 'Under review', version: 2 }) };
    }
    if (url.endsWith('/attachment')) return { ok: true, blob: () => new Promise(() => {}) };
    const data = url.endsWith('/events') || url.includes('-notices') ? { records: [] }
      : url.endsWith('/r1') ? report : { records: [report] };
    return { ok: true, json: async () => data };
  });
});
afterEach(() => { jest.useRealTimers(); global.fetch = original; });
async function open() {
  render(<WorkplaceSupportPanel userId="coord" />);
  fireEvent.click(await screen.findByRole('button', { name: /Open report.*Ana/ }));
  await screen.findByText('Private report');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled());
}
test.each(['fetch', 'body'])('real helper bounds stalled %s and retries exact private event once', async stalledStage => {
  stage = stalledStage; await open();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.change(screen.getByLabelText('Private note'), { target: { value: 'Keep this private note' } });
  jest.useFakeTimers();
  const save = screen.getByRole('button', { name: 'Save event' }); fireEvent.click(save); fireEvent.click(save);
  await act(async () => { await Promise.resolve(); });
  expect(payloads).toHaveLength(1);
  await act(async () => { jest.advanceTimersByTime(30001); });
  const retry = screen.getByRole('button', { name: 'Retry same event' });
  expect(retry).toBeEnabled(); expect(screen.getByLabelText('Private note')).toHaveValue('Keep this private note');
  const firstFetch = global.fetch.mock.calls.find(([, o]) => o.method === 'POST');
  expect(firstFetch[1].signal.aborted).toBe(true);
  fireEvent.click(retry); fireEvent.click(retry);
  await act(async () => { await Promise.resolve(); });
  expect(payloads).toHaveLength(2); expect(payloads[1]).toBe(payloads[0]);
  expect(JSON.parse(payloads[1])).toMatchObject({ requestId: 'deadline-key', note: 'Keep this private note' });
  await act(async () => finish(stage === 'fetch' ? { ok: true, json: async () => ({ id: 'r1', status: 'Resolved', version: 99 }) } : { id: 'r1', status: 'Resolved', version: 99 }));
  expect(screen.queryByText(/Resolved/)).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('protected attachment body is bounded through actual helper', async () => {
  await open(); jest.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Download protected attachment' }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { jest.advanceTimersByTime(30001); });
  expect(screen.getByRole('alert')).toHaveTextContent('Attachment unavailable');
  expect(screen.getByRole('button', { name: 'Refresh support' })).toBeEnabled();
});
test('account change denies retry and late body cannot restore private content', async () => {
  stage = 'body'; await open();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  jest.useFakeTimers(); fireEvent.click(screen.getByRole('button', { name: 'Save event' }));
  await act(async () => { await Promise.resolve(); });
  act(() => { auth.currentUser = { uid: 'other', getIdToken: async () => 'other' }; onAuthStateChanged.mock.calls.at(-1)[1](auth.currentUser); });
  await act(async () => finish({ id: 'r1', status: 'Under review', version: 2 }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh support' }));
  await act(async () => { jest.advanceTimersByTime(30001); });
  expect(screen.queryByText('Private report')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retry same event' })).not.toBeInTheDocument();
  expect(payloads).toHaveLength(1);
  expect(global.fetch.mock.calls.filter(([, o]) => o.headers.Authorization === 'Bearer other')).toHaveLength(0);
});
