import { auth } from './firebase';

export const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

async function authenticatedFetch(path, options = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const send = async forceRefresh => {
    const token = await user.getIdToken(forceRefresh);
    if (options.signal?.aborted) throw new Error('Request cancelled.');
    if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');
    return fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  };
  let response = await send(false);
  // These API routes reject authentication before performing any mutation.
  // Never replay network failures, permission denials, or server errors.
  if (response.status === 401) {
    try { response = await send(true); }
    catch { throw new Error('Your session could not be refreshed. Please sign in again.'); }
  }
  return response;
}

export async function adminRequest(path, options = {}) {
  const { deadlineMs, ...requestOptions } = options;
  const user = auth.currentUser;
  const controller = deadlineMs ? new AbortController() : null;
  let timer;
  const execute = async () => {
    const response = await authenticatedFetch(path, {
      ...requestOptions,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        ...(requestOptions.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');
    if (!response.ok) {
      const message = response.status === 401 ? 'Your session has expired or is invalid. Please sign in again.' : data.error || (response.status === 404
        ? 'This feature is unavailable on the running backend. Restart the local PATHWAY workflow to load the updated server.'
        : `Request failed (HTTP ${response.status}). Please try again.`);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  };
  if (!controller) return execute();
  try {
    return await Promise.race([execute(), new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(Object.assign(new Error('Request timed out. Reload to check the current server state before trying again.'), { code: 'DEADLINE_EXCEEDED' }));
        controller.abort();
      }, deadlineMs);
    })]);
  } finally { clearTimeout(timer); }
}

export async function adminDocumentBlob(path) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const response = await authenticatedFetch(path);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(response.status === 401 ? 'Your session has expired or is invalid. Please sign in again.' : data.error || 'Could not download this document.');
  }
  return response.blob();
}

export async function adminDownload(path, fileName = 'document') {
  const objectUrl = URL.createObjectURL(await adminDocumentBlob(path));
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = String(fileName || 'document').replace(/[\\/\r\n]/g, '_').slice(0, 180);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
