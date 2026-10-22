const { validId } = require('./workplaceJournalConsent');
const CLOSED = new Set(['resolved', 'dismissed_false_positive']);
const ACTIONS = ['notice_read', 'review', 'contact', 'act', 'resolve', 'dismiss_false_positive', 'change_priority'];
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw Error('Retention dates unavailable.');
  const date = new Date(value), normalized = value.includes('.') ? value : value.replace('Z', '.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== normalized) throw Error('Retention dates unavailable.');
  return date.getTime();
}
function retentionDates(closedAt) {
  const close = timestamp(closedAt), anniversary = new Date(close), day = anniversary.getUTCDate();
  anniversary.setUTCDate(1); anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1);
  const end = new Date(anniversary); end.setUTCMonth(end.getUTCMonth() + 1, 0);
  anniversary.setUTCDate(Math.min(day, end.getUTCDate()));
  return { evidenceDeleteAt: new Date(close + 90 * 86400000).toISOString(), auditDeleteAt: anniversary.toISOString() };
}
function retentionStage(item, now) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Clock unavailable.');
  if (item?.state === 'open') return 'open';
  if (!CLOSED.has(item?.state)) return 'invalid';
  try {
    const dates = retentionDates(item.closedAt), time = now.getTime();
    if (timestamp(item.closedAt) > time) return 'invalid';
    const bound = key => Math.min(timestamp(dates[key]), item[key] == null ? Infinity : timestamp(item[key]));
    if (time >= bound('auditDeleteAt')) return 'expired';
    if (time >= bound('evidenceDeleteAt') || item.evidencePurged === true) return 'audit';
    return 'evidence';
  } catch { return 'invalid'; }
}
function minimalConcernAudit(item) {
  const safe = Object.fromEntries(['studentId','entryId','sourceRevision','origin','ruleVersion','state','version','priority',
    'createdAt','closedAt','evidenceDeleteAt','auditDeleteAt','evidencePurged','purgedAt'].filter(k => item[k] !== undefined).map(k => [k,item[k]]));
  safe.history = (Array.isArray(item.history) ? item.history : []).flatMap(h => {
    try {
      if (!ACTIONS.includes(h?.action) || !validId(h.actorId)) return [];
      timestamp(h.at);
      return [{ action: h.action, actorId: h.actorId, at: h.at,
        ...(['success','failed'].includes(h.outcome) ? { outcome: h.outcome } : {}),
        ...(['normal','high'].includes(h.priority) ? { priority: h.priority } : {}) }];
    } catch { return []; }
  });
  return safe;
}
async function retentionTransaction(db, clock, work) {
  // One operational timestamp, not a case/audit copy: observed expiry never reverses on rollback.
  const ref = db.collection('workplaceConcernWorker').doc('retention-clock');
  const result = await db.runTransaction(async tx => {
    const saved = await tx.get(ref);
    let highest = saved.exists ? timestamp(saved.data().observedAt) : -Infinity;
    const time = () => {
      const value = clock();
      if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw Error('Clock unavailable.');
      highest = Math.max(highest, value.getTime()); return new Date(highest);
    };
    time(); let response;
    try { response = { value: await work(tx, time) }; }
    catch (error) {
      // Only expiry denial may commit the clock. Other failures must roll back all action writes.
      if (!error.retentionDenied) throw error;
      response = { error };
    }
    tx.set(ref, { observedAt: new Date(highest).toISOString() });
    return response;
  });
  if (result.error) throw result.error;
  return result.value;
}
module.exports = { retentionDates, retentionStage, minimalConcernAudit, retentionTransaction, ACTIONS };
