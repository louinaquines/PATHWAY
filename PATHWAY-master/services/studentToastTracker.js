export function createStudentToastTracker(uid) {
  let ready = false;
  const seen = new Set();
  return snapshot => {
    if (snapshot.metadata?.fromCache) return [];
    const fresh = [];
    for (const change of snapshot.docChanges()) {
      const { doc } = change;
      if (doc.metadata?.hasPendingWrites) continue;
      const known = seen.has(doc.id);
      seen.add(doc.id);
      const data = doc.data();
      if (ready && !known && change.type === 'added' && !data.read
        && data.recipientId === uid && data.senderId !== uid) fresh.push({ ...data, id: doc.id });
    }
    ready = true;
    while (seen.size > 400) seen.delete(seen.values().next().value);
    return fresh.reverse();
  };
}
