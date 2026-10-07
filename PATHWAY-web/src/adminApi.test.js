import { adminRequest } from './adminApi';

jest.mock('./firebase', () => ({ auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } } }));

test('missing backend route reports version mismatch instead of generic request failed', async () => {
  const original = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, json: async () => { throw new Error('HTML response'); } });
  try {
    await expect(adminRequest('/coordinator/company-directory')).rejects.toMatchObject({ status: 404, message: expect.stringContaining('Restart the local PATHWAY workflow') });
  } finally { global.fetch = original; }
});
