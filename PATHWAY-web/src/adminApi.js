import { auth } from './firebase';

export const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

export async function adminRequest(path, options = {}) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export async function adminDownload(path, fileName = 'document') {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not download this document.');
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = String(fileName || 'document').replace(/[\\/\r\n]/g, '_').slice(0, 180);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
