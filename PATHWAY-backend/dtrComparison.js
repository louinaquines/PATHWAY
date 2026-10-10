// Review-only Form 48 normalization. No database access or attendance writes.
const FIELDS = ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'];
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }

function parseTime(value, period) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value >= 1) invalid('Invalid spreadsheet time.');
    return Math.round(value * 1440) % 1440;
  }
  if (typeof value !== 'string') invalid('Invalid time.');
  const text = value.trim();
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*([ap])\.?m\.?)?$/i);
  if (!match) invalid('Use an unambiguous time such as 08:00 or 1:00 PM.');
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > 23) invalid('Invalid clock time.');
  const suffix = match[3]?.toLowerCase();
  if (suffix) {
    if (hour < 1 || hour > 12) invalid('Invalid 12-hour time.');
    hour = hour % 12 + (suffix === 'p' ? 12 : 0);
  } else if (period === 'pm' && hour >= 1 && hour <= 11) hour += 12;
  // Noon is allowed in AM departure; no correction of OCR characters is implicit.
  return hour * 60 + minute;
}

function normalizeForm48({ year, month, copies }) {
  if (!Number.isInteger(year) || year < 1900 || year > 2200
    || !Number.isInteger(month) || month < 1 || month > 12) invalid('Confirm the DTR month and year.');
  if (!Array.isArray(copies) || copies.length < 1 || copies.length > 2) invalid('Provide one or two Form 48 copies.');
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDate = new Map();
  copies.forEach((rows, copyIndex) => {
    if (!Array.isArray(rows) || rows.length > 31) invalid('Invalid DTR rows.');
    const seen = new Set();
    for (const row of rows) {
      if (!row || !Number.isInteger(row.day) || row.day < 1 || row.day > daysInMonth) invalid('Invalid day for the selected month.');
      if (seen.has(row.day)) invalid('A day appears twice in the same copy.');
      seen.add(row.day);
      const date = `${year}-${String(month).padStart(2, '0')}-${String(row.day).padStart(2, '0')}`;
      const issues = [];
      const times = {};
      FIELDS.forEach(field => {
        try { times[field] = parseTime(row[field], field.startsWith('pm') ? 'pm' : 'am'); }
        catch (error) { times[field] = null; issues.push(`${field}: ${error.message}`); }
      });
      let workedMinutes = 0;
      let sessions = 0;
      for (const [start, end] of [['amArrival', 'amDeparture'], ['pmArrival', 'pmDeparture']]) {
        if (times[start] == null && times[end] == null) continue;
        if (times[start] == null || times[end] == null) issues.push(`${start.slice(0, 2)} session is incomplete.`);
        else if (times[end] <= times[start]) issues.push(`${start.slice(0, 2)} departure must follow arrival.`);
        else { workedMinutes += times[end] - times[start]; sessions++; }
      }
      if (times.amDeparture != null && times.pmArrival != null && times.pmArrival < times.amDeparture) issues.push('AM and PM sessions overlap.');
      if (row.needsReview === true) issues.push('Transcription needs review.');
      const normalized = { date, times, issues, workedMinutes: issues.length || !sessions ? null : workedMinutes, copyIndex };
      const existing = byDate.get(date);
      if (!existing) byDate.set(date, normalized);
      else if (FIELDS.some(field => existing.times[field] !== times[field])) {
        existing.issues.push('Printed copies disagree.');
        existing.workedMinutes = null;
      } else {
        existing.issues.push(...issues);
        if (existing.issues.length) existing.workedMinutes = null;
      }
    }
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function timestamp(value) {
  // Require a timezone: never interpret source timestamps using the host timezone.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  const local = new Date(ms + 8 * 3600000);
  return { ms, date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

function compareDtr(form, attendance, { toleranceMinutes = 0 } = {}) {
  if (!Number.isInteger(toleranceMinutes) || toleranceMinutes < 0 || toleranceMinutes > 60) invalid('Invalid comparison tolerance.');
  if (!Array.isArray(attendance) || attendance.length > 366) invalid('Invalid attendance records.');
  const rows = normalizeForm48(form);
  const records = new Map();
  attendance.forEach(record => {
    if (!record || typeof record.date !== 'string') invalid('Attendance date is required.');
    records.set(record.date, [...(records.get(record.date) || []), record]);
  });
  const results = rows.map(row => {
    const issues = [...row.issues];
    const matches = records.get(row.date) || [];
    const populated = FIELDS.some(field => row.times[field] != null);
    const result = { ...row, issues, endpointDifferences: null, digitalElapsedMinutes: null, durationDifferenceMinutes: null };
    if (matches.length > 1) issues.push('Multiple digital records for this date.');
    if (!populated) {
      result.status = issues.length ? 'needs_review' : 'blank';
      if (matches.length) issues.push('Digital attendance exists but DTR times are blank.');
    } else if (!matches.length) { issues.push('No digital attendance for this date.'); result.status = 'needs_review'; }
    else if (matches.length === 1) {
      const start = timestamp(matches[0].timeIn), end = timestamp(matches[0].timeOut);
      if (!start || !end) issues.push('Digital shift is incomplete or has invalid timestamps.');
      else if (start.date !== row.date || end.date !== row.date || end.ms <= start.ms) issues.push('Digital shift needs date or overnight review.');
      else if (!issues.length) {
        const first = row.times.amArrival ?? row.times.pmArrival;
        const last = row.times.pmDeparture ?? row.times.amDeparture;
        result.endpointDifferences = { arrival: first - start.minutes, departure: last - end.minutes };
        result.digitalElapsedMinutes = Math.round((end.ms - start.ms) / 60000);
        result.durationDifferenceMinutes = row.workedMinutes - result.digitalElapsedMinutes;
        result.status = Object.values(result.endpointDifferences).some(delta => Math.abs(delta) > toleranceMinutes) ? 'discrepancy' : 'endpoints_match';
        if (Math.abs(result.durationDifferenceMinutes) > toleranceMinutes) issues.push('Session duration differs from the digital elapsed span; midday punches are not available.');
      }
    }
    if (!result.status || (issues.length && result.status === 'blank')) result.status = 'needs_review';
    return result;
  });
  return { method: 'form48-rule-comparison', timezone: 'Asia/Manila', toleranceMinutes,
    attendanceModified: false, results,
    digitalOnlyDates: [...records.keys()].filter(date => date.startsWith(`${form.year}-${String(form.month).padStart(2, '0')}-`) && !rows.some(row => row.date === date)).sort(),
    limitation: 'Digital records contain one daily elapsed span, not separate AM/PM sessions. Endpoint matches do not verify signatures, lunch deductions, or credited hours.' };
}
module.exports = { parseTime, normalizeForm48, compareDtr };
