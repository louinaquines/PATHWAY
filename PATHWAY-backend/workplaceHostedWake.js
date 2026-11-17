// Uninstalled adapter: no HTTP listener, scheduler, environment or provider transport.
const { validId } = require('./workplaceJournalConsent');
function createHostedWakeAdapter({ enabled = false, authorize, claimWake, settleWake, runtime } = {}) {
  const unavailable = () => ({ status: 503, body: { error: 'Workplace wake unavailable.' } });
  if (enabled !== true) return { handle: async () => unavailable() };
  if (typeof authorize !== 'function' || typeof claimWake !== 'function' || typeof runtime?.wake !== 'function'
    || (settleWake !== undefined && typeof settleWake !== 'function')) throw Error('Explicit workplace authority required.');
  let busy = false;
  async function handle(request = {}) {
    try {
      if (typeof request?.authorization !== 'string' || request.authorization.length > 4096
        || !request.authorization.startsWith('Bearer ') || await authorize(request.authorization) !== true)
        return { status: 401, body: { error: 'Workplace authorization required.' } };
      if (request.method !== 'POST') return { status: 405, body: { error: 'POST required.' } };
      const b = request.body;
      if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 2
        || !Object.hasOwn(b, 'jobId') || !Object.hasOwn(b, 'wakeId') || !validId(b.jobId) || !validId(b.wakeId))
        return { status: 400, body: { error: 'Exact job and wake identity required.' } };
      if (busy) return { status: 409, body: { error: 'Workplace wake busy.' } };
      const jobId = b.jobId, wakeId = b.wakeId;
      busy = true;
      try {
        // claimWake must atomically persist a workplace-specific identity before execution; never refund uncertain claims.
        if (await claimWake({ jobId, wakeId }) !== true)
          return { status: 409, body: { error: 'Workplace wake already claimed.' } };
        const result = await runtime.wake({ jobId });
        if (!result || !['disabled', 'stopped', 'processed', 'busy', 'unavailable', 'complete', 'ready'].includes(result.status)
          || !Number.isInteger(result.processed) || result.processed < 0 || result.processed > 1) return unavailable();
        if (settleWake) await settleWake({ jobId, wakeId });
        return { status: 200, body: { status: result.status, processed: result.processed } };
      } finally { busy = false; }
    } catch { return unavailable(); }
  }
  return { handle };
}
module.exports = { createHostedWakeAdapter };
