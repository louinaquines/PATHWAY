// One-shot, read-only liveness probe. Does not send alerts or start a scheduler.
async function probeHealth({ url, fetchImpl = fetch, timeoutMs = 15000 }) {
  const started = Date.now();
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
    if (!response.ok) return { healthy: false, reason: 'http_failure', status: response.status, elapsedMs: Date.now() - started };
    const body = await response.json();
    return { healthy: body?.status === 'ok', reason: body?.status === 'ok' ? 'ok' : 'invalid_health_payload', status: response.status, elapsedMs: Date.now() - started };
  } catch (error) {
    return { healthy: false, reason: ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'network_or_payload_failure', elapsedMs: Date.now() - started };
  }
}
module.exports = { probeHealth };
