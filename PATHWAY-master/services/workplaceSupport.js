import { auth } from '../firebaseConfig';
import { BACKEND_URL, requestBackend } from './backendApi';
import { uploadCloudinaryFile } from './cloudinaryUpload';
import { parseCalendarDate, calendarDateValue } from './calendarDate';

export const SUPPORT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const SUPPORT_STATUSES = ['Submitted', 'Under review', 'Following up', 'Resolved'];
export function hasUnsubmittedSupportDraft(form) {
  return !form.result && !!(form.description || form.incidentDate || form.immediateSafety || form.file || form.sending || form.pending);
}
export async function requestSupport(path, options = {}) {
  try {
    return await requestBackend(path, { timeoutMs: 30000, ...options });
  } catch (error) {
    if (path === '/student/workplace-support/context' && error.status === 404) {
      error.message = 'Workplace support service is not available on this server yet. Your coordinator could not be checked. Keep this screen open to preserve your draft and contact your coordinator directly.';
    }
    throw error;
  }
}
export async function openSupportNotice(notice, { request = requestSupport, navigate }) {
  const owner = auth.currentUser;
  if (!owner) throw new Error('Please sign in again.');
  await request(`/student/workplace-support-notices/${encodeURIComponent(notice.id)}/read`, { payload: {} });
  if (auth.currentUser !== owner) throw new Error('Your session changed. Please sign in again.');
  navigate('WorkplaceSupport', { reportId: notice.reportId });
}
export async function downloadSupportAttachment(id, transfer) {
  const owner = auth.currentUser;
  if (!owner) throw new Error('Please sign in again.');
  const token = await owner.getIdToken();
  if (auth.currentUser !== owner) throw new Error('Your session changed. Please sign in again.');
  const result = await transfer(`${BACKEND_URL}/student/workplace-support/${encodeURIComponent(id)}/attachment`, { Authorization: `Bearer ${token}` });
  if (auth.currentUser !== owner) throw new Error('Your session changed. Please sign in again.');
  return result;
}
export function philippineToday(now = new Date()) {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return calendarDateValue(new Date(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), 12));
}
export function validateSupportDraft(draft, today = philippineToday()) {
  const errors = {};
  const length = draft.description?.trim().length || 0;
  if (!length || length > 8000) errors.description = 'Enter 1–8,000 characters in your preferred language.';
  if (draft.incidentDate && (!parseCalendarDate(draft.incidentDate) || draft.incidentDate > today)) errors.incidentDate = 'Enter a valid YYYY-MM-DD date no later than today in the Philippines.';
  if (draft.file && (!SUPPORT_TYPES.includes(draft.file.mimeType) || !Number.isFinite(draft.file.size) || draft.file.size < 1 || draft.file.size > 5242880)) errors.file = 'Choose one PDF, JPEG or PNG up to 5 MB with a known file size.';
  return errors;
}
export async function loadSupportPage(kind = 'reports', cursor) {
  const path = kind === 'notices' ? '/student/workplace-support-notices' : '/student/workplace-support';
  return requestSupport(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'GET' });
}

// Memory belongs to one mounted screen and one authenticated user; never persist this state.
export function createSupportDraft({ uid, request = requestSupport, upload = uploadCloudinaryFile, onChange = () => {}, today = philippineToday,
  requestId = () => `support_${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}` } = {}) {
  const state = { description: '', incidentDate: '', immediateSafety: false, file: null, errors: {}, error: '', sending: false, pending: false, attachmentRejected: false, result: null };
  const owner = auth.currentUser;
  let intent = null; let receipt = null; let attachmentIntentId = null; let payload = null;
  const current = () => auth.currentUser === owner && owner?.uid === uid;
  const notify = () => onChange({ ...state });
  const clear = () => { Object.assign(state, { description: '', incidentDate: '', file: null, immediateSafety: false, errors: {}, error: '', result: null, pending: false, sending: false, attachmentRejected: false }); intent = receipt = attachmentIntentId = payload = null; notify(); };
  const check = () => { if (!current()) { clear(); throw new Error('Your session changed. Please sign in again.'); } };
  return { state, clear,
    update(fields) {
      if (!current()) { clear(); return; }
      if (state.sending || state.pending || state.result) return;
      if (Object.entries(fields).some(([key, value]) => state[key] !== value)) payload = null;
      if (Object.hasOwn(fields, 'file') && fields.file !== state.file) { intent = receipt = attachmentIntentId = null; state.attachmentRejected = false; }
      Object.assign(state, fields); notify();
    },
    async submit(available = true) {
      if (state.sending || state.result) return;
      try {
        check();
        if (state.attachmentRejected) throw new Error('Explicitly renew, replace or remove the attachment before sending. Your text and file are kept here.');
        state.errors = validateSupportDraft(state, today());
        if (Object.keys(state.errors).length) { notify(); return; }
        if (!available && !payload) throw new Error('Your coordinator is currently unavailable. Your draft is kept here; retry when a recipient is available.');
        state.sending = true; state.error = ''; notify();
        if (!payload) {
          if (state.file) {
            if (!intent) { intent = await request('/student/workplace-support/attachments/intents', { payload: { contentType: state.file.mimeType } }); check(); }
            if (!receipt) { receipt = await upload(state.file, intent, { timeoutMs: 60000 }); check(); }
            if (!attachmentIntentId) {
              const finalized = await request(`/student/workplace-support/attachments/${encodeURIComponent(intent.intentId)}/finalize`, { payload: { version: receipt.version, signature: receipt.signature } });
              check(); attachmentIntentId = finalized.attachmentIntentId;
              if (!attachmentIntentId) throw new Error('Attachment could not be confirmed. Retry or explicitly remove it.');
            }
          }
          payload = { requestId: requestId(), description: state.description.trim(), immediateSafety: state.immediateSafety,
            ...(state.incidentDate ? { incidentDate: state.incidentDate } : {}), ...(attachmentIntentId ? { attachmentIntentId } : {}) };
        }
        state.pending = true; notify();
        const result = await request('/student/workplace-support', { payload });
        check();
        if (!result.id || !SUPPORT_STATUSES.includes(result.status)) throw new Error('Delivery could not be confirmed. Retry this request.');
        state.result = { id: result.id, status: result.status };
      } catch (error) {
        if (current()) {
          state.error = error.message || 'Could not send. Your draft is kept here.';
          if (error.status === 400) state.pending = false;
          if (error.status === 409 && error.reason === 'attachment_uncommitted') {
            state.pending = false; state.attachmentRejected = true;
          }
        }
      }
      finally { state.sending = false; if (current()) notify(); }
    },
  };
}
