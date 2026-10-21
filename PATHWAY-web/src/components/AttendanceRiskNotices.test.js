import { act, fireEvent, render, screen } from '@testing-library/react';
import AttendanceRiskNotices from './AttendanceRiskNotices';
import { adminRequest } from '../adminApi';
import { onSnapshot } from 'firebase/firestore';
import { StrictMode } from 'react';
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: (db, collection, id) => `${collection}/${id}`, onSnapshot: jest.fn() }));

const notice = { id: 'notice', studentId: 'student', sectionId: 'assigned', title: 'Attendance risk update', kind: 'assigned', riskTier: 'Medium', progressStatus: 'In progress', dataStatus: 'Ready', reasonCodes: [], read: false };
const page = { records: [notice], hasMore: false, cursor: null };
const access = { isCurrent: () => true, onDenied: jest.fn() };
const snapshot = (fromCache, sectionId) => ({ metadata: { fromCache }, data: () => ({ role: 'student', sectionId }) });
let listeners, requests, trace;

function initialSourceEvent(event) {
  onSnapshot.mockImplementation((path, options, next, error) => {
    // Accept the old callback-only overload to reproduce its actual lifecycle too.
    if (typeof options === 'function') { error = next; next = options; }
    const listener = { active: true, next, error };
    listeners.push(listener); trace.push('listen');
    Promise.resolve().then(() => {
      if (listener.active) { trace.push(event === 'error' ? 'source-error' : event.metadata.fromCache ? 'cache-mismatch' : 'server-mismatch'); event === 'error' ? error({ code: 'permission-denied' }) : next(event); }
    });
    return () => { listener.active = false; trace.push('unsubscribe'); };
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks(); listeners = []; requests = 0; trace = [];
  adminRequest.mockImplementation(async () => {
    requests++; trace.push('GET');
    // Safety stop for the unfixed implementation, not the behavior under test.
    if (requests > 4) throw Object.assign(new Error('Synthetic request-loop safety stop'), { status: 429 });
    return new Promise(resolve => setTimeout(() => resolve(page), 10));
  });
});
afterEach(() => jest.useRealTimers());
async function settleRequests() {
  // Separate network turns let React commit cleared records before the next GET.
  for (let turn = 0; turn < 6; turn++) await act(async () => { await jest.advanceTimersByTimeAsync(10); });
}

test.each([false, true])('cached mismatch retains the listener until fresh authority (StrictMode=%s)', async strict => {
  initialSourceEvent(snapshot(true, 'old-section'));
  await act(async () => { render(strict ? <StrictMode><AttendanceRiskNotices access={access} /></StrictMode> : <AttendanceRiskNotices access={access} />); });
  await settleRequests();
  expect({ requests, trace }).toEqual({ requests: strict ? 2 : 1, trace: [...(strict ? ['GET'] : []), 'GET','listen','cache-mismatch'] });
  expect(onSnapshot.mock.calls[0][1]).toEqual({ includeMetadataChanges: true });
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading attendance notices…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh attendance notices' })).toBeEnabled();
  const original = listeners[0];
  await act(async () => original.next(snapshot(false, 'assigned')));
  await settleRequests();
  expect(await screen.findByText('Attendance risk update')).toBeInTheDocument();
  expect(requests).toBe(strict ? 3 : 2);
  expect(original.active).toBe(true);
  expect(listeners).toHaveLength(1);
});

test('metadata-only server confirmation of a cached mismatch triggers one authorized reload', async () => {
  initialSourceEvent(snapshot(true, 'old-section'));
  await act(async () => { render(<AttendanceRiskNotices access={access} />); });
  await settleRequests();
  expect(requests).toBe(1);
  adminRequest.mockImplementationOnce(async () => {
    requests++; return { records: [], hasMore: false, cursor: null };
  });
  await act(async () => listeners[0].next(snapshot(false, 'old-section')));
  expect(requests).toBe(2);
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  expect(screen.getByText('No attendance notices loaded.')).toBeInTheDocument();
});

test.each(['error', 'mismatch'])('persistent source %s gets one automatic refresh and never replays a listener loop', async kind => {
  initialSourceEvent(kind === 'error' ? 'error' : snapshot(false, 'old-section'));
  await act(async () => { render(<AttendanceRiskNotices access={access} />); });
  await settleRequests();
  expect({ requests, trace }).toEqual({ requests: 2, trace: ['GET','listen',kind === 'error' ? 'source-error' : 'server-mismatch','GET'] });
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading attendance notices…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh attendance notices' })).toBeEnabled();
  // Further source events cannot restart the automatic budget.
  await act(async () => listeners[0].next(snapshot(false, 'old-section')));
  expect(requests).toBe(2);
  // Explicit refresh may re-establish a failed listener; it is not an automatic loop.
  fireEvent.click(screen.getByRole('button', { name: 'Refresh attendance notices' }));
  await settleRequests();
  expect(requests).toBeLessThanOrEqual(4);
  expect(screen.queryByText('Attendance risk update')).not.toBeInTheDocument();
  expect(screen.queryByText('Loading attendance notices…')).not.toBeInTheDocument();
});
