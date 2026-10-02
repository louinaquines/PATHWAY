// Audit events are authoritative only when recorded by the backend operation
// that performed the change. Client-authored audit requests are intentionally
// disabled; legacy callers remain as no-ops until each action has a server API.
export function recordAudit(action, targetType, targetId, details = {}) {
  void action;
  void targetType;
  void targetId;
  void details;
  return Promise.resolve({ recorded: false, reason: 'Client-authored audit events are disabled.' });
}
