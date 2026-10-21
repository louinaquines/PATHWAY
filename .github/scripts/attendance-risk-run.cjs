const { setTimeout: sleepDefault } = require('node:timers/promises');

async function runScheduledChecks({ origin, secret, fetchImpl = fetch, sleep = sleepDefault, clock = Date.now }) {
  let base;
  try { base = new URL(origin); } catch { throw new Error('Scheduler configuration is missing or invalid.'); }
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash
    || !/^[a-f0-9]{64}$/.test(secret || '')) throw new Error('Scheduler configuration is missing or invalid.');
  const deadline = clock() + 780000;
  let failures = 0;
  for (let attempts = 0; attempts < 20; attempts++) {
    if (clock() >= deadline) throw new Error('Automatic check budget exhausted; saved progress resumes next hour.');
    let response, text;
    try {
      response = await fetchImpl(new URL('/internal/attendance-risk/run', base), {
        method: 'POST', redirect: 'manual', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        body: '{}', signal: AbortSignal.timeout(Math.min(90000, deadline - clock())),
      });
      text = await response.text();
    } catch {
      if (++failures > 2) throw new Error('Automatic check host unavailable; retry next hour.');
      await sleep(2000 * failures); continue;
    }
    if ([401, 403].includes(response.status)) throw new Error('Scheduler authentication rejected.');
    if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
      if (++failures > 2) throw new Error('Automatic check host unavailable; retry next hour.');
      await sleep(2000 * failures); continue;
    }
    if (response.status !== 200) throw new Error('Automatic check request rejected.');
    let value;
    try { if (text.length > 4096) throw new Error(); value = JSON.parse(text); } catch { throw new Error('Invalid automatic check response.'); }
    if (!['pending', 'complete', 'busy'].includes(value?.status) || typeof value.hasMore !== 'boolean'
      || typeof value.pendingRetries !== 'boolean' || !/^\d{4}-\d{2}-\d{2}$/.test(value.dueDate || '')) throw new Error('Invalid automatic check response.');
    failures = 0;
    if (value.status === 'complete' && !value.hasMore && !value.pendingRetries) return { status: 'complete' };
    if (value.status === 'busy' || !value.hasMore) throw new Error('Automatic check pending; saved progress resumes next hour.');
  }
  throw new Error('Automatic check budget exhausted; saved progress resumes next hour.');
}

if (require.main === module) {
  runScheduledChecks({ origin: process.env.ATTENDANCE_BACKEND_ORIGIN, secret: process.env.ATTENDANCE_SCHEDULE_SECRET })
    .then(() => console.log('Automatic attendance check complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { runScheduledChecks };
