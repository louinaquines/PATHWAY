import { adminRequest } from './adminApi';
import { auth } from './firebase';

test.each(['token', 'fetch', 'body'])('optional deadline bounds a stalled %s without replay', async stage => {
  jest.useFakeTimers();
  const original = global.fetch;
  const user = auth.currentUser;
  const stalled = () => new Promise(() => {});
  user.getIdToken.mockImplementation(stage === 'token' ? stalled : async () => 'token');
  global.fetch = jest.fn(stage === 'fetch' ? stalled : async () => ({ ok: true, json: stalled }));
  try {
    const result = adminRequest('/test', { method: 'PUT', body: '{}', deadlineMs: 50 });
    const assertion = expect(result).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    await jest.advanceTimersByTimeAsync(51);
    await assertion;
    expect(global.fetch.mock.calls.length).toBe(stage === 'token' ? 0 : 1);
  } finally { user.getIdToken.mockResolvedValue('test-token'); global.fetch = original; jest.useRealTimers(); }
});

test('actor change while reading response discards private body', async () => {
  const original = global.fetch, user = auth.currentUser;
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => { auth.currentUser = null; return { private: true }; } }));
  try { await expect(adminRequest('/test')).rejects.toThrow('session changed'); }
  finally { auth.currentUser = user; global.fetch = original; }
});

test('a token arriving after the deadline cannot start a late mutation', async () => {
  jest.useFakeTimers();
  const original = global.fetch, user = auth.currentUser;
  let finish;
  user.getIdToken.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  global.fetch = jest.fn();
  try {
    const assertion = expect(adminRequest('/test', { method: 'PUT', body: '{}', deadlineMs: 50 })).rejects.toMatchObject({ code: 'DEADLINE_EXCEEDED' });
    await jest.advanceTimersByTimeAsync(51); await assertion;
    finish('late-token'); await Promise.resolve(); await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  } finally { global.fetch = original; jest.useRealTimers(); }
});

jest.mock('./firebase', () => ({ auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } } }));

test('401 refreshes the token once and retries with the same payload', async () => {
  const original = global.fetch;
  const user = auth.currentUser;
  user.getIdToken.mockClear();
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: false, status: 401 })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
  try {
    await expect(adminRequest('/coordinator/example', { method: 'POST', body: '{"test":true}' })).resolves.toEqual({ success: true });
    expect(user.getIdToken.mock.calls).toEqual([[false], [true]]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][1].body).toBe('{"test":true}');
  } finally { global.fetch = original; }
});

test('persistent 401 stops after one retry and asks for sign-in', async () => {
  const original = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'Invalid authentication token' }) });
  try {
    await expect(adminRequest('/coordinator/example')).rejects.toMatchObject({ status: 401, message: expect.stringContaining('Please sign in again') });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  } finally { global.fetch = original; }
});

test('permission denial does not replay the request', async () => {
  const original = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) });
  try {
    await expect(adminRequest('/coordinator/example')).rejects.toMatchObject({ status: 403 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = original; }
});

test('network failure does not replay a potentially completed mutation', async () => {
  const original = global.fetch;
  global.fetch = jest.fn().mockRejectedValue(new Error('Connection reset'));
  try {
    await expect(adminRequest('/coordinator/example', { method: 'POST' })).rejects.toThrow('Connection reset');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = original; }
});

test('failed token refresh asks for sign-in without another fetch', async () => {
  const original = global.fetch;
  auth.currentUser.getIdToken.mockResolvedValueOnce('old-token').mockRejectedValueOnce(new Error('Revoked session'));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  try {
    await expect(adminRequest('/coordinator/example')).rejects.toThrow('Please sign in again');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  } finally { global.fetch = original; }
});

test('missing backend route reports version mismatch instead of generic request failed', async () => {
  const original = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('HTML response'); } });
  try {
    await expect(adminRequest('/coordinator/company-directory')).rejects.toMatchObject({ status: 404, message: expect.stringContaining('Restart the local PATHWAY workflow') });
  } finally { global.fetch = original; }
});
