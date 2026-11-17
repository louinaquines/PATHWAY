const { createHash } = require('node:crypto');

// Only represented source dates participate. A digital span cannot prove lunch deductions.
function classifyEscalation(comparison) {
  const reasons = new Set();
  let monthlyDelta = 0;
  for (const row of comparison.results) {
    if (Number.isFinite(row.durationDifferenceMinutes)) {
      const delta = Math.abs(row.durationDifferenceMinutes);
      monthlyDelta += row.durationDifferenceMinutes;
      if (delta > 15) reasons.add('daily_duration');
    }
    for (const issue of row.issues) {
      if (/No digital attendance|DTR times are blank/.test(issue)) reasons.add('missing_shift');
      else if (/Multiple digital records/.test(issue)) reasons.add('duplicate');
      else if (/overlap/i.test(issue)) reasons.add('overlap');
      else if (!/midday punches/.test(issue)) reasons.add('source_ambiguity');
    }
  }
  if (Math.abs(monthlyDelta) > 60) reasons.add('monthly_duration');
  return reasons.size ? { status: 'needs_verification', reasons: [...reasons] } : null;
}

function escalationId(studentId, version, period) {
  return createHash('sha256').update(JSON.stringify([studentId, version, period])).digest('hex');
}

module.exports = { classifyEscalation, escalationId };
