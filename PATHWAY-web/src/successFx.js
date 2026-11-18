// Shared success feedback for the coordinator portal (no characters).
let handler;
let quiet = 0;
export function registerSuccess(next) { handler = next; return () => { if (handler === next) handler = undefined; }; }
export function showSuccess(title, detail = '', kind = 'pop') { if (!quiet) handler?.({ title, detail, kind, id: Date.now() + Math.random() }); }
export function showToast(title, detail = '') { showSuccess(title, detail, 'toast'); }
// Run many requests without a popup per request, e.g. bulk approvals.
export async function quietly(fn) { quiet += 1; try { return await fn(); } finally { quiet -= 1; } }

const parse = body => { try { return typeof body === 'string' ? JSON.parse(body) : body || {}; } catch { return {}; } };
const DECISION = { approved: 'Approved', approve: 'Approved', rejected: 'Sent back', reject: 'Sent back', needs_revision: 'Sent back', returned: 'Returned' };
const RULES = [
  [/\/coordinator\/students\/[^/]+\/requirements\/[^/]+\/decision$/, 'POST', b => [DECISION[b.status] || 'Saved', b.status === 'approved' ? 'Requirement approved.' : 'The student was asked to fix it.']],
  [/\/undo-auto-approval$/, 'POST', () => ['Approval undone', 'Moved back to To check.']],
  [/\/coordinator\/company-placements\/[^/]+\/decision$/, 'POST', b => [DECISION[b.status || b.decision] || 'Decision saved', 'Placement updated.']],
  [/\/coordinator\/final-reviews\/[^/]+\/decision$/, 'POST', b => [DECISION[b.status || b.decision] || 'Decision saved', 'Final review updated.']],
  [/\/logbook\/[^/]+\/decision$/, 'POST', b => [DECISION[b.status || b.decision] || 'Entry reviewed', 'Logbook entry updated.']],
  [/\/students\/[^/]+\/clearance$/, null, () => ['Clearance saved', 'The student was updated.']],
  [/\/endorsements\/[^/]+\/send$/, 'POST', () => ['Endorsement sent', '']],
  [/\/reset-password$/, 'POST', () => ['Password reset', 'Share the new password with the student.']],
  [/\/coordinator\/sections$/, 'POST', () => ['Section created', '']],
  [/\/coordinator\/sections\/[^/]+$/, 'PATCH', () => ['Section saved', '']],
  [/\/requirements\/[^/]+\/link$/, 'PATCH', b => [b.submissionLink ? 'Link saved' : 'Link removed', '']],
  [/\/sections\/[^/]+\/requirements\/defaults$/, 'POST', () => ['Requirements added', 'Default documents were added.']],
  [/\/sections\/[^/]+\/requirements$/, 'POST', () => ['Requirement added', '']],
  [/\/sections\/[^/]+\/requirements\/[^/]+$/, 'DELETE', () => ['Requirement deleted', '']],
  [/\/sections\/[^/]+\/requirements\/[^/]+$/, 'PATCH', () => ['Requirement saved', '']],
  [/\/sections\/[^/]+\/term$/, 'PATCH', () => ['Term assigned', '']],
  [/\/coordinator\/terms$/, 'POST', () => ['Term created', '']],
  [/\/coordinator\/terms\/[^/]+$/, 'PATCH', () => ['Term saved', '']],
  [/\/coordinator\/terms\/[^/]+$/, 'DELETE', () => ['Term deleted', '']],
  [/\/coordinator\/provision-students$/, 'POST', () => ['Students added', '']],
  [/\/coordinator\/assign-student$/, 'POST', () => ['Student assigned', '']],
  [/\/coordinator\/student-roster\/[^/]+$/, 'DELETE', () => ['Student ID removed', '']],
  [/\/journal-(keywords|settings)$/, 'PUT', () => ['Settings saved', '']],
  [/\/analytics\/schedule$/, 'PUT', () => ['Schedule saved', '']],
  [/\/sections\/[^/]+\/announcements$/, 'POST', () => ['Announcement posted', 'Students were notified.']],
  [/\/announcements\/[^/]+\/remind$/, 'POST', () => ['Reminder sent', ''], 'toast'],
  [/\/coordinator\/evaluations\//, 'POST', () => ['Invitation sent', 'The evaluation email was sent.']],
  [/\/create-evaluation-token$/, 'POST', () => ['Evaluation link ready', ''], 'toast'],
  [/\/reviews$/, 'POST', () => ['Review saved', '']],
  [/\/admin\/settings$/, null, () => ['Settings saved', '']],
];
export function autoSuccess(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  if (method === 'GET') return;
  const clean = String(path).split('?')[0];
  for (const [re, m, make, kind] of RULES) {
    if ((m === null || m === method) && re.test(clean)) { const [t, d] = make(parse(options.body)); showSuccess(t, d, kind || 'pop'); return; }
  }
}
