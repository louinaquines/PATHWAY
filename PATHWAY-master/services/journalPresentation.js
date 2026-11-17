export function journalEntryTitle(entry) {
  if (entry.frequency === 'daily') return `Daily journal · ${entry.periodStart || 'Date unavailable'}`;
  if (entry.frequency === 'weekly') return `Weekly journal · ${entry.weekRange || 'Reporting period unavailable'}`;
  return `Week ${entry.weekNum || '—'} · ${entry.weekRange || 'Reporting period unavailable'}`;
}
export function journalContextChanged(previous, next) {
  return !previous || ['department', 'frequency', 'revision', 'periodStart', 'periodEnd'].some(key => previous[key] !== next[key]);
}
export function validJournalSettings(value) {
  return Boolean(value && typeof value.department === 'string' && value.department.trim() && ['daily', 'weekly'].includes(value.frequency) && Number.isSafeInteger(value.revision) && value.revision >= 0
    && /^\d{4}-\d{2}-\d{2}$/.test(value.periodStart) && /^\d{4}-\d{2}-\d{2}$/.test(value.periodEnd));
}
