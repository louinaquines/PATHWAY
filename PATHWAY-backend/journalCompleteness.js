const VERSION = 'journal-completeness-v1';
const CRITERIA = [
  ['tasks', 'Tasks performed', 30],
  ['learning', 'Learning or skills applied', 25],
  ['outcomes', 'Outcome or accomplishment', 20],
  ['challenges', 'Challenges or explicit none', 15],
];
const CREDIT = { full: 1, partial: 0.5, missing: 0 };

function validateNarrativeRubric(rubric, notes) {
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 8000 || !Array.isArray(rubric) || rubric.length !== 4) throw new Error('Invalid rubric');
  const seen = new Set();
  for (const item of rubric) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length !== 4
      || !['id', 'level', 'reason', 'evidence'].every(key => Object.hasOwn(item, key))
      || !CRITERIA.some(([id]) => id === item.id) || seen.has(item.id) || typeof item.level !== 'string' || !Object.hasOwn(CREDIT, item.level)
      || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 400
      || typeof item.evidence !== 'string' || item.evidence.length > 300
      || (item.level === 'missing' ? item.evidence !== '' : !item.evidence.trim() || !notes.includes(item.evidence))) throw new Error('Unsupported rubric judgment');
    seen.add(item.id);
  }
  return rubric;
}

function validPeriod(value) {
  const parts = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})\s+–\s+(\d{4}-\d{2}-\d{2})$/);
  if (!parts) return false;
  const dates = parts.slice(1).map(text => new Date(`${text}T00:00:00Z`));
  return dates.every((date, i) => Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === parts[i + 1])
    && dates[1] >= dates[0] && dates[1] - dates[0] <= 6 * 86400000;
}

function scoreJournalCompleteness(entry, rubric) {
  const unavailable = status => ({ version: VERSION, status, total: null, criteria: [] });
  if (entry == null) return unavailable('Not submitted');
  try { validateNarrativeRubric(rubric, entry.rawNotes); }
  catch { return unavailable('Analysis unavailable'); }
  const criteria = CRITERIA.map(([id, label, weight]) => {
    const judgment = rubric.find(item => item.id === id);
    return { ...judgment, label, weight, points: weight * CREDIT[judgment.level] };
  });
  const period = validPeriod(entry.weekRange);
  const hours = typeof entry.hours === 'number' && Number.isFinite(entry.hours) && entry.hours > 0 && entry.hours <= 168;
  const points = (Number(period) + Number(hours)) * 5;
  criteria.push({ id: 'metadata', label: 'Reporting dates and hours', weight: 10, points,
    level: points === 10 ? 'full' : points === 5 ? 'partial' : 'missing', evidence: '',
    reason: `${period ? 'Reporting period is a valid ordered ISO date range of up to seven days.' : 'Reporting dates could not be validated: a yearless label or missing/invalid ISO date range earns no date points.'} ${hours ? 'Weekly hours are within the plausible range (over zero, at most 168).' : 'Weekly hours are missing or invalid.'} Metadata checks do not verify attendance.` });
  const total = criteria.reduce((sum, item) => sum + item.points, 0);
  return { version: VERSION, status: total >= 80 ? 'Complete' : total >= 50 ? 'Needs more detail' : 'Incomplete', total, criteria };
}
module.exports = { validateNarrativeRubric, scoreJournalCompleteness };
