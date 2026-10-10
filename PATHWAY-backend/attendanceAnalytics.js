// Review-only analytics. Credited totals are supplied by the authoritative workflow;
// raw shift spans and journal hours must never be added to that total here.
const DAY = 86400000;
function dateMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}
function attendanceAnalytics({ creditedHours, requiredHours, records = [], schedule, today, windowDays = 28 }) {
  const now = dateMs(today);
  if (now === null || !Number.isInteger(windowDays) || windowDays < 7 || windowDays > 90 || !Array.isArray(records) || records.length > 1000) throw new Error('Invalid analytics inputs.');
  const validTotal = Number.isFinite(creditedHours) && creditedHours >= 0;
  const validTarget = Number.isFinite(requiredHours) && requiredHours > 0;
  const result = { method: 'schedule-rule-based', creditedHours: validTotal ? creditedHours : null,
    completionPercentage: validTotal && validTarget ? Math.min(100, Math.round(creditedHours / requiredHours * 100)) : null,
    attendanceRate: null, onTimeRate: null, missedShifts: null, projectedCompletion: null,
    risk: 'Unavailable', reasons: [], attendanceModified: false };
  if (validTotal && validTarget && creditedHours >= requiredHours) { result.risk = 'Completed'; return result; }
  const start = dateMs(schedule?.startDate), deadline = dateMs(schedule?.deadline);
  const weekdays = schedule?.workingDays;
  const clock = /^(\d{2}):(\d{2})$/.exec(schedule?.startTime || '');
  if (start === null || deadline === null || deadline < start || !Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) {
    result.reasons.push('A valid work schedule and deadline are required.'); return result;
  }
  const exceptions = schedule.exceptions || [];
  if (!Array.isArray(exceptions) || exceptions.some(date => dateMs(date) === null)) throw new Error('Invalid schedule exceptions.');
  const expected = ms => weekdays.includes(new Date(ms).getUTCDay()) && !exceptions.includes(new Date(ms).toISOString().slice(0, 10));
  const lower = Math.max(start, now - windowDays * DAY);
  const byDate = new Map();
  records.forEach(record => { const ms = dateMs(record.date); if (ms !== null && ms >= lower && ms < now) byDate.set(record.date, [...(byDate.get(record.date) || []), record]); });
  let scheduled = 0, attended = 0, onTime = 0, timed = 0, observedHours = 0, eligibleDays = 0;
  for (let ms = lower; ms < now; ms += DAY) {
    if (!expected(ms)) continue;
    scheduled++;
    const items = byDate.get(new Date(ms).toISOString().slice(0, 10)) || [];
    if (items.length > 1) { result.reasons.push('Duplicate attendance requires review.'); continue; }
    if (!items.length) continue;
    const record = items[0];
    // Require explicit timezone; invalid or missing punches do not establish attendance.
    const punch = typeof record.timeIn === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(record.timeIn) ? Date.parse(record.timeIn) : NaN;
    if (!Number.isFinite(punch) || new Date(punch + 8 * 3600000).toISOString().slice(0, 10) !== record.date) { result.reasons.push('Invalid punch requires review.'); continue; }
    attended++; timed++;
    const local = new Date(punch + 8 * 3600000);
    if (local.getUTCHours() * 60 + local.getUTCMinutes() <= Number(clock[1]) * 60 + Number(clock[2])) onTime++;
    // Only explicitly credited per-day hours support a velocity estimate.
    if (Number.isFinite(record.creditedHours) && record.creditedHours >= 0) { observedHours += record.creditedHours; eligibleDays++; }
  }
  if (scheduled && !result.reasons.length) { result.attendanceRate = Math.round(attended / scheduled * 100); result.missedShifts = scheduled - attended; }
  if (timed && !result.reasons.length) result.onTimeRate = Math.round(onTime / timed * 100);
  if (!validTotal || !validTarget || result.reasons.length || eligibleDays < 5 || !scheduled) { result.reasons.push('Insufficient reliable credited-hour history.'); return result; }
  if (now > deadline) { result.risk = 'High Risk'; result.reasons.push('Completion deadline has passed.'); return result; }
  const velocity = observedHours / scheduled;
  if (!velocity) { result.risk = 'High Risk'; result.reasons.push('No credited-hour progress in the observation window.'); return result; }
  let remaining = requiredHours - creditedHours, projected = now;
  for (let count = 0; remaining > 0 && count < 3660; count++, projected += DAY) if (expected(projected)) remaining -= velocity;
  if (remaining > 0) { result.reasons.push('Projection exceeds the supported horizon.'); return result; }
  projected -= DAY;
  result.projectedCompletion = new Date(projected).toISOString().slice(0, 10);
  result.risk = projected > deadline ? 'High Risk' : 'On Track';
  result.reasons.push('Projection uses credited hours per scheduled day in the observation window; it is not a guarantee.');
  return result;
}
module.exports = { attendanceAnalytics };
