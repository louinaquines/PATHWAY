import { auth } from './firebase';

export const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

async function authenticatedFetch(path, options = {}, observeStatus = () => {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  const send = async forceRefresh => {
    if (options.signal?.aborted) throw new Error('Request timed out. Please try again.');
    const token = await user.getIdToken(forceRefresh);
    if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');
    if (options.signal?.aborted) throw new Error('Request timed out. Please try again.');
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
    observeStatus(response.status);
    return response;
  };
  let response = await send(false);
  if (options.signal?.aborted) throw new Error('Request timed out. Please try again.');
  // These API routes reject authentication before performing any mutation.
  // Never replay network failures, permission denials, or server errors.
  if (response.status === 401) {
    try { response = await send(true); }
    catch { throw Object.assign(new Error('Your session could not be refreshed. Please sign in again.'), { status: 401 }); }
  }
  return response;
}

async function operation(options, perform) {
  const { timeoutMs = options.deadlineMs || 0, deadlineMs, ...fetchOptions } = options;
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Please sign in again.'), { status: 401 });
  const abort = timeoutMs ? new AbortController() : null;
  let timer, responseStatus;
  const timeout = abort && new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = Object.assign(new Error('Request timed out. Please try again.'), { code: 'DEADLINE_EXCEEDED' });
      if ([401, 403, 404].includes(responseStatus)) error.status = responseStatus;
      reject(error); abort.abort();
    }, timeoutMs);
  });
  const work = async () => {
    const result = await perform({ ...fetchOptions, ...(abort ? { signal: abort.signal } : {}) }, status => { responseStatus = status; });
    if (auth.currentUser !== user) throw new Error('Your session changed. Please sign in again.');
    return result;
  };
  try { return await (timeout ? Promise.race([work(), timeout]) : work()); }
  finally { if (timer) clearTimeout(timer); }
}

export function adminRequest(path, options = {}) {
  return operation(options, async (fetchOptions, observeStatus) => {
    const response = await authenticatedFetch(path, {
      ...fetchOptions,
      headers: {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers || {}),
      },
    }, observeStatus);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 ? 'Your session has expired or is invalid. Please sign in again.' : data.error || (response.status === 404
        ? 'This feature is unavailable on the running backend. Restart the local PATHWAY workflow to load the updated server.'
        : `Request failed (HTTP ${response.status}). Please try again.`);
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return data;
  });
}

export function adminDocumentBlob(path, options = {}) {
  return operation(options, async (fetchOptions, observeStatus) => {
    const response = await authenticatedFetch(path, fetchOptions, observeStatus);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw Object.assign(new Error(response.status === 401 ? 'Your session has expired or is invalid. Please sign in again.' : data.error || 'Could not download this document.'), { status: response.status });
    }
    return response.blob();
  });
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
