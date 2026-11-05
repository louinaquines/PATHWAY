import { watchStudentInbox } from '../../PATHWAY-master/services/studentInboxLive';
import { onSnapshot, where } from 'firebase/firestore';

jest.mock('../../PATHWAY-master/firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), query: jest.fn(), where: jest.fn(), onSnapshot: jest.fn(),
}));

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  onSnapshot.mockImplementation(() => jest.fn());
});
afterEach(() => jest.useRealTimers());

test('notices and messages trigger one refresh for the signed-in student', async () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const stop = watchStudentInbox('student-a', refresh, jest.fn());
  expect(where).toHaveBeenCalledWith('recipientId', '==', 'student-a');
  expect(where).toHaveBeenCalledWith('participantIds', 'array-contains', 'student-a');
  onSnapshot.mock.calls[0][1]();
  onSnapshot.mock.calls[1][1]();
  await jest.advanceTimersByTimeAsync(500);
  expect(refresh).toHaveBeenCalledTimes(1);
  stop();
});

test('events during a request run once more afterward without overlapping requests', async () => {
  let finish;
  const refresh = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValue(undefined);
  const stop = watchStudentInbox('student-a', refresh, jest.fn());
  const changed = onSnapshot.mock.calls[0][1];
  changed();
  await jest.advanceTimersByTimeAsync(500);
  changed();
  changed();
  await jest.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(1);
  finish();
  await jest.advanceTimersByTimeAsync(500);
  expect(refresh).toHaveBeenCalledTimes(2);
  stop();
});

test('busy pagination is retried, and leaving the screen cancels callbacks and timers', async () => {
  const refresh = jest.fn().mockResolvedValueOnce(false).mockResolvedValue(undefined);
  const stop = watchStudentInbox('student-a', refresh, jest.fn());
  onSnapshot.mock.calls[0][1]();
  await jest.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(2);
  onSnapshot.mock.calls[0][1]();
  stop();
  await jest.advanceTimersByTimeAsync(1000);
  expect(refresh).toHaveBeenCalledTimes(2);
  for (const result of onSnapshot.mock.results) expect(result.value).toHaveBeenCalledTimes(1);
});

test('a signed-out session creates no listeners', () => {
  watchStudentInbox(null, jest.fn(), jest.fn())();
  expect(onSnapshot).not.toHaveBeenCalled();
});
