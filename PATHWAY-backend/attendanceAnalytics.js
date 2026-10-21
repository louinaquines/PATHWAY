// Review-only analytics. Credited totals are supplied by the authoritative workflow;
// raw shift spans and journal hours must never be added to that total here.
const DAY = 86400000;
function dateMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (value < '2000-01-01' || value > '2100-12-31') return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}
function attendanceAnalytics({ creditedHours, requiredHours, records = [], schedule, today, excusedDates = [] }) {
  const now = dateMs(today);
  if (now === null || !Array.isArray(records) || records.length > 1000 || records.some(record => !record || dateMs(record.date) === null)) throw new Error('Invalid analytics inputs.');
  const exceptions = schedule?.exceptions ?? [];
  for (const dates of [exceptions, excusedDates]) {
    if (!Array.isArray(dates) || dates.length > 1000 || dates.some(date => dateMs(date) === null)) throw new Error('Invalid excluded dates.');
  }
  const validTotal = Number.isFinite(creditedHours) && creditedHours >= 0;
  const validTarget = Number.isFinite(requiredHours) && requiredHours > 0;
  const completed = validTotal && validTarget && creditedHours >= requiredHours;
  const result = { method: 'schedule-rule-based', creditedHours: validTotal ? creditedHours : null,
    completionPercentage: validTotal && validTarget ? Math.min(100, Math.round(creditedHours / requiredHours * 100)) : null,
    attendanceRate: null, onTimeRate: null, missedShifts: null, projectedCompletion: null,
    ruleVersion: 'attendance-risk-v1', riskTier: null, progressStatus: completed ? 'Completed' : 'In progress',
    dataStatus: 'Unavailable', reasonCodes: [],
    observationCounts: { attendanceEligibleDays: 0, attendedDays: 0, absentDays: 0, uncertainDays: 0,
      consecutiveAbsences: 0, projectionEligibleDays: 0, projectionCreditedDays: 0, projectionUncertainDays: 0, projectionMissingCreditDays: 0 },
    risk: completed ? 'Completed' : 'Unavailable', reasons: [], attendanceModified: false };
  const reason = (code, message, details = {}) => { result.reasonCodes.push({ code, ...details }); result.reasons.push(message); };
  const finish = () => {
    // Legacy display projection only; consumers must use riskTier and progressStatus independently.
    result.risk = completed ? 'Completed' : ({ Low: 'On Track', Medium: 'At Risk', High: 'High Risk' }[result.riskTier] || 'Unavailable');
    return result;
  };
  const start = dateMs(schedule?.startDate), deadline = dateMs(schedule?.deadline);
  if (deadline !== null && now > deadline && validTotal && validTarget && !completed) {
    result.riskTier = 'High'; reason('OVERDUE', 'Completion deadline has passed.');
  }
  const weekdays = schedule?.workingDays;
  const clock = /^(\d{2}):(\d{2})$/.exec(schedule?.startTime || '');
  if (start === null || deadline === null || deadline < start || !Array.isArray(weekdays) || !weekdays.length || weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6) || !clock || Number(clock[1]) > 23 || Number(clock[2]) > 59) {
    reason('INVALID_SCHEDULE', 'A valid work schedule and deadline are required.'); return finish();
  }
  const excluded = new Set([...exceptions, ...excusedDates]);
  const key = ms => new Date(ms).toISOString().slice(0, 10);
  const expected = ms => weekdays.includes(new Date(ms).getUTCDay()) && !excluded.has(key(ms));
  const attendanceDates = [];
  // Calendar inputs are bounded to 2000–2100, including sparse schedules and long leave.
  for (let ms = now - DAY; ms >= start && attendanceDates.length < 20; ms -= DAY) if (expected(ms)) attendanceDates.unshift(ms);
  const projectionDates = [];
  for (let ms = Math.max(start, now - 28 * DAY); ms < now; ms += DAY) if (expected(ms)) projectionDates.push(ms);
  const relevant = new Set([...attendanceDates, ...projectionDates].map(key));
  const byDate = new Map();
  records.forEach(record => {
    if (relevant.has(record.date)) byDate.set(record.date, [...(byDate.get(record.date) || []), record]);
  });
  function punchMs(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || dateMs(value.slice(0, 10)) === null) return NaN;
    if (Number(value.slice(11,13)) > 23 || Number(value.slice(14,16)) > 59 || Number(value.slice(17,19)) > 59) return NaN;
    return Date.parse(value);
  }
  const days = new Map();
  for (const date of relevant) {
    const items = byDate.get(date) || [];
    if (!items.length) { days.set(date, { state: 'absent', credit: 0 }); continue; }
    const record = items[0], timeIn = punchMs(record.timeIn), timeOut = punchMs(record.timeOut);
    if (items.length !== 1 || !Number.isFinite(timeIn) || !Number.isFinite(timeOut) || timeOut <= timeIn || key(timeIn + 8 * 3600000) !== date || timeOut >= now - 8 * 3600000) {
      days.set(date, { state: 'uncertain' }); continue;
    }
    const local = new Date(timeIn + 8 * 3600000);
    days.set(date, { state: 'attended', onTime: local.getUTCHours() * 60 + local.getUTCMinutes() <= Number(clock[1]) * 60 + Number(clock[2]),
      credit: Number.isFinite(record.creditedHours) && record.creditedHours >= 0 ? record.creditedHours : null });
  }
  const counts = result.observationCounts;
  counts.attendanceEligibleDays = attendanceDates.length;
  counts.projectionEligibleDays = projectionDates.length;
  let onTime = 0;
  for (const ms of attendanceDates) {
    const day = days.get(key(ms));
    if (day.state === 'absent') { counts.absentDays++; counts.consecutiveAbsences++; }
    else { counts.consecutiveAbsences = 0; if (day.state === 'uncertain') counts.uncertainDays++; else { counts.attendedDays++; if (day.onTime) onTime++; } }
  }
  let observedHours = 0, creditCorrection = 0;
  for (const ms of projectionDates) {
    const day = days.get(key(ms));
    if (day.state === 'uncertain') counts.projectionUncertainDays++;
    else if (day.credit === null) counts.projectionMissingCreditDays++;
    else {
      // Compensate decimal accumulation before converting credit into whole workdays.
      const adjusted = day.credit - creditCorrection;
      const total = observedHours + adjusted;
      creditCorrection = (total - observedHours) - adjusted;
      observedHours = total;
      counts.projectionCreditedDays++;
    }
  }
  const uncertain = counts.uncertainDays > 0 || counts.projectionUncertainDays > 0;
  const attendanceReady = counts.attendanceEligibleDays >= 5 && counts.uncertainDays === 0;
  const projectionReady = counts.projectionEligibleDays >= 5 && !counts.projectionUncertainDays && !counts.projectionMissingCreditDays && Number.isFinite(observedHours);
  if (counts.uncertainDays === 0) {
    result.missedShifts = counts.absentDays;
    if (attendanceReady) {
      result.attendanceRate = Math.round(counts.attendedDays / counts.attendanceEligibleDays * 100);
      if (counts.attendedDays) result.onTimeRate = Math.round(onTime / counts.attendedDays * 100);
    }
  }
  if (uncertain) reason('UNCERTAIN_ATTENDANCE', 'Incomplete, invalid or duplicate punches require verification.', { attendanceDays: counts.uncertainDays, projectionDays: counts.projectionUncertainDays });
  if (!attendanceReady) reason('INSUFFICIENT_ATTENDANCE', 'At least five reliable eligible workdays are required.');
  if (!projectionReady && !completed) reason('INSUFFICIENT_CREDIT_HISTORY', 'Insufficient reliable credited-hour history.');
  if (!validTotal || !validTarget) reason('INVALID_TOTALS', 'Valid authoritative credited and required hours are required.');
  result.dataStatus = uncertain ? 'Needs verification' : !validTotal || !validTarget ? 'Unavailable' : attendanceReady && (projectionReady || completed) ? 'Ready' : 'Insufficient data';
  const establish = tier => { if (({ Low: 1, Medium: 2, High: 3 }[tier]) > ({ Low: 1, Medium: 2, High: 3 }[result.riskTier] || 0)) result.riskTier = tier; };
  if (attendanceReady) {
    // Integer cross-products preserve the exact thresholds before display rounding.
    if (counts.attendedDays * 100 < counts.attendanceEligibleDays * 80) { establish('High'); reason('ATTENDANCE_BELOW_80', 'Attendance is below 80%.'); }
    else if (counts.attendedDays * 100 < counts.attendanceEligibleDays * 90) { establish('Medium'); reason('ATTENDANCE_BELOW_90', 'Attendance is below 90%.'); }
  }
  if (counts.consecutiveAbsences >= 2) {
    establish(counts.consecutiveAbsences >= 3 ? 'High' : 'Medium');
    reason('CONSECUTIVE_ABSENCES', 'Consecutive unexplained absences require attention.', { count: counts.consecutiveAbsences });
  }
  if (validTotal && validTarget && !completed) {
    if (projectionReady) {
      if (observedHours === 0) { establish('Medium'); reason('ZERO_VELOCITY', 'No credited-hour progress in the observation window.'); }
      else {
        // Divide totals first so a positive subnormal daily average cannot underflow to zero.
        const days = (requiredHours - creditedHours) / observedHours * counts.projectionEligibleDays;
        const nearest = Math.round(days);
        const roundingError = 8 * Number.EPSILON * Math.max(1, Math.abs(days));
        const neededDays = Math.max(1, Math.ceil(Math.abs(days - nearest) <= roundingError ? nearest : days));
        let scheduledDays = 0, projected = null;
        const horizon = Math.min(now + 3659 * DAY, dateMs('2100-12-31'));
        for (let ms = now; ms <= horizon; ms += DAY) {
          if (expected(ms) && ++scheduledDays >= neededDays) { projected = ms; break; }
        }
        if (projected === null) {
          reason('PROJECTION_HORIZON', 'Projection exceeds the supported horizon.');
          if (result.dataStatus === 'Ready') result.dataStatus = 'Insufficient data';
        }
        else {
          result.projectedCompletion = key(projected);
          reason('CREDIT_PROJECTION', 'Projection uses authoritative credited hours per eligible day; it is not a guarantee.');
          if (projected > deadline) { establish('Medium'); reason('PROJECTED_SHORTFALL', 'Projected completion is after the deadline.'); }
        }
      }
    }
  }
  if (!result.riskTier && !uncertain && attendanceReady && validTotal && validTarget && (completed || (result.projectedCompletion && result.projectedCompletion <= schedule.deadline))) establish('Low');
  return finish();
}
module.exports = { attendanceAnalytics };
