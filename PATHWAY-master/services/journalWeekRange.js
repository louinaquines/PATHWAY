export function journalWeekRange(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new RangeError('A valid reporting date is required.');
  // Calculate the Philippine calendar week independently of the device timezone.
  const monday = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday.getTime());
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return `${monday.toISOString().slice(0, 10)} – ${sunday.toISOString().slice(0, 10)}`;
}
