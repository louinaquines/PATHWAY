import { getDocs, query, limit, startAfter } from 'firebase/firestore';
export async function readPortalPage(base, cursor = null, size = 50) {
  if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error('Page size must be between 1 and 100.');
  const snapshot = await getDocs(query(base, ...(cursor ? [startAfter(cursor)] : []), limit(size + 1)));
  const shown = snapshot.docs.slice(0, size);
  return { records: shown.map(doc => ({ ...doc.data(), id: doc.id })), cursor: shown.at(-1) || null, hasMore: snapshot.docs.length > size };
}
// Scan a bounded window when Firestore cannot apply the text predicate itself.
// An empty result can still have a cursor into the next window.
export async function readMatchingPortalPage(base, cursor, size, matches, scanSize = 100) {
  const snapshot = await getDocs(query(base, ...(cursor ? [startAfter(cursor)] : []), limit(scanSize + 1)));
  const records = [];
  let scanned = 0;
  for (const document of snapshot.docs.slice(0, scanSize)) {
    scanned++;
    const record = { ...document.data(), id: document.id };
    if (matches(record)) records.push(record);
    if (records.length === size) break;
  }
  return {
    records,
    cursor: scanned ? snapshot.docs[scanned - 1] : null,
    hasMore: snapshot.docs.length > scanned,
  };
}

export function mergePortalRecords(current, incoming) {
  const records = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => records.set(item.id, item));
  return [...records.values()];
}
