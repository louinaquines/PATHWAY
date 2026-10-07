import { getDocs, query, limit, startAfter } from 'firebase/firestore';

export function mergeRecords(previous, next) {
  const records = new Map(previous.map(item => [item.id, item]));
  next.forEach(item => records.set(item.id, item));
  return [...records.values()];
}

export async function readRecordPage(baseQuery, size, cursor = null) {
  // One look-ahead document avoids showing a button for an empty final page.
  const snapshot = await getDocs(query(baseQuery, ...(cursor ? [startAfter(cursor)] : []), limit(size + 1)));
  const documents = snapshot.docs.slice(0, size);
  return {
    records: documents.map(item => ({ id: item.id, ...item.data() })),
    cursor: documents.at(-1) || cursor,
    hasMore: snapshot.docs.length > size,
  };
}

export function activityTime(value) {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  return new Date(value || 0).getTime() || 0;
}

export function buildActivity(attendance, journals, notifications) {
  return [
    ...attendance.map(item => ({ id: `a-${item.id}`, type: 'attendance', text: `Attendance logged: ${Number(item.hoursToday || 0).toFixed(2)} hrs`, createdAt: item.timeOut || item.timeIn || `${item.date}T00:00:00+08:00` })),
    ...journals.map(item => ({ id: `l-${item.id}`, type: 'journal', text: `Week ${item.weekNum || ''} logbook submitted`, createdAt: item.createdAt })),
    ...notifications.map(item => ({ id: `n-${item.id}`, type: 'notification', text: item.title || item.message || 'Coordinator update', createdAt: item.createdAt })),
  ].sort((a, b) => activityTime(b.createdAt) - activityTime(a.createdAt) || a.id.localeCompare(b.id));
}
