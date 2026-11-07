import { getDocs, query, limit, startAfter } from 'firebase/firestore';
export async function readPortalPage(base, cursor = null, size = 50) {
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Page size must be between 1 and 100.');
  const snapshot = await getDocs(query(base, ...(cursor ? [startAfter(cursor)] : []), limit(size + 1)));
  const shown = snapshot.docs.slice(0, size);
  return { records: shown.map(doc => ({ ...doc.data(), id: doc.id })), cursor: shown.at(-1) || null, hasMore: snapshot.docs.length > size };
}
export function mergePortalRecords(current, incoming) {
  const records = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => records.set(item.id, item));
  return [...records.values()];
}
