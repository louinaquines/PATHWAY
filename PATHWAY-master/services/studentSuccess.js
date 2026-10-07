let handler;

export function registerStudentSuccess(next) {
  handler = next;
  return () => { if (handler === next) handler = undefined; };
}

// Feedback never changes the saved result or delays the caller's state update.
export function showStudentSuccess(title, message) {
  handler?.({ title, message });
}
