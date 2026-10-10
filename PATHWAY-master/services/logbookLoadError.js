export function logbookLoadErrorMessage(error) {
  const code = String(error?.code || '').replace(/^firestore\//, '');
  if (code === 'unauthenticated' || code.startsWith('auth/')) {
    return 'Your session could not be verified. Sign out and sign in again, then reopen your logbook.';
  }
  if (code === 'permission-denied') {
    return 'Your account cannot access these entries. Sign in again; if this continues, contact your coordinator to check your account access.';
  }
  if (['unavailable', 'deadline-exceeded'].includes(code)) {
    return 'The database could not be reached. Check your connection. For the USB demo, reconnect your phone and restore its port connections, then retry.';
  }
  return 'Your logbook entries could not be loaded. Try again; if this continues, contact your coordinator.';
}
