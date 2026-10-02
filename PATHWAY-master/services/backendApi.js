import { auth } from '../firebaseConfig';

export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export async function requestBackend(path, { method = 'POST', payload = {} } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

  const response = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function postBackend(path, payload = {}) {
  return requestBackend(path, { method: 'POST', payload });
}
