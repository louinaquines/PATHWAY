import { auth } from '../firebaseConfig';

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export async function requestBackend(path, { method = 'POST', payload = {}, timeoutMs = 0 } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const token = await user.getIdToken();
  if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');

  const abort = timeoutMs ? new AbortController() : null;
  let timer;
  const timeout = abort ? new Promise((_, reject) => {
    timer = setTimeout(() => { reject(new Error('Request timed out. Please try again.')); abort.abort(); }, timeoutMs);
  }) : null;
  const perform = async () => {
    const response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      ...(abort ? { signal: abort.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(payload) }),
    });
    const result = await response.json().catch(() => ({}));
    if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');
    if (!response.ok) {
      const retryAfterSeconds = Number(result.retryAfterSeconds);
      const retryMessage = response.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? `Too many requests. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).` : null;
      const error = new Error(retryMessage || result.error || 'The request could not be completed.');
      error.retryAfterSeconds = retryAfterSeconds;
      error.status = response.status;
      if (result.reason === 'attachment_uncommitted') error.reason = result.reason;
      throw error;
    }
    return result;
  };
  try { return await (timeout ? Promise.race([perform(), timeout]) : perform()); }
  finally { if (timer) clearTimeout(timer); }
}

export function postBackend(path, payload = {}) {
  return requestBackend(path, { method: 'POST', payload });
}
