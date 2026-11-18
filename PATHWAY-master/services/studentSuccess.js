let handler;

export function registerStudentSuccess(next) {
  handler = next;
  return () => { if (handler === next) handler = undefined; };
}

// Feedback never changes the saved result or delays the caller's state update.
export function showStudentSuccess(title, message) {
  handler?.({ title, message });
}

// Failures that need attention: same card, error character, stays until dismissed.
export function showStudentError(title, message) {
  handler?.({ title, message, tone: 'error' });
}
