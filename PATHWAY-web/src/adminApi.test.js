import { adminRequest } from './adminApi';
import { auth } from './firebase';

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
