const invalidTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
]);

function safeErrorCode(error) {
  const code = String(error?.code ?? 'unknown');
  return /^[a-zA-Z0-9/_-]{1,80}$/.test(code) ? code : 'unknown';
}

function reportUnavailable(log, label, error, stage) {
  const code = safeErrorCode(error);
  const details = String(error?.details || '') + ' ' + String(error?.message || '');
  let reason;
  if (code === '8' || code === 'resource-exhausted') {
    reason = /received message larger|message.*too large/i.test(details) ? 'message_too_large'
      : /bandwidth/i.test(details) ? 'bandwidth_exhausted'
      : /quota/i.test(details) ? 'quota_exceeded'
      : /rate limit|too many requests/i.test(details) ? 'rate_limited' : 'resource_exhausted';
  }
  log(label, { ...(stage ? { stage } : {}), code, ...(reason ? { reason } : {}) });
}

function createRequireUser({ auth, db, log = console.error }) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    let decoded;
    try {
      decoded = await auth.verifyIdToken(header.slice(7), true);
    } catch (error) {
      if (invalidTokenCodes.has(error.code)) return res.status(401).json({ error: 'Invalid authentication token' });
      reportUnavailable(log, 'Authentication dependency unavailable', error, 'verify');
      return res.status(503).json({ code: 'AUTH_DEPENDENCY_UNAVAILABLE', error: 'The server could not verify access. Please try again shortly.' });
    }
    let snap;
    try {
      snap = await db.collection('users').doc(decoded.uid).get();
    } catch (error) {
      reportUnavailable(log, 'Authentication dependency unavailable', error, 'profile');
      return res.status(503).json({ code: 'AUTH_DEPENDENCY_UNAVAILABLE', error: 'The server could not verify access. Please try again shortly.' });
    }
    if (!snap.exists) return res.status(403).json({ error: 'User profile not found' });
    const data = snap.data();
    if (data.role === 'student' && (data.passwordChangeRequired === true
      || (data.passwordEpoch && decoded.passwordEpoch !== data.passwordEpoch))) {
      return res.status(403).json({ error: 'Change your password and sign in again before accessing student records.' });
    }
    req.user = { uid: decoded.uid, role: data.role, data };
    return next();
  };
}

function createRetryTask({ task, intervalMs, onError, now = Date.now }) {
  let running = false, nextAttempt = 0, failures = 0;
  return async () => {
    if (running || now() < nextAttempt) return;
    running = true;
    try {
      await task();
      failures = 0;
      nextAttempt = now() + intervalMs;
    } catch (error) {
      failures++;
      nextAttempt = now() + Math.min(900000, Math.max(60000, intervalMs) * 2 ** Math.min(failures - 1, 4));
      onError(error);
    } finally { running = false; }
  };
}
module.exports = { createRequireUser, reportUnavailable, createRetryTask };
