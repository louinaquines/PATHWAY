const { validId } = require('./workplaceJournalConsent');
const { isDeepStrictEqual } = require('node:util');
const { retentionDates, retentionStage, minimalConcernAudit, retentionTransaction, ACTIONS } = require('./workplaceConcernRetention');
function cleanupAllowed(db, enabled, env) {
  const local = value => /^(127\.0\.0\.1|localhost):[1-9]\d{0,4}$/.test(value || '') && Number(value.split(':')[1]) <= 65535;
  return enabled === true && db?.projectId === 'demo-pathway-security' && env.NODE_ENV !== 'production' && !env.K_SERVICE
    && local(env.FIRESTORE_EMULATOR_HOST) && local(env.FIREBASE_AUTH_EMULATOR_HOST);
}
async function runConcernRetentionBatch({ db, enabled, clock = () => new Date(), limit = 20, env = process.env, evidenceOnly = false } = {}) {
  if (!cleanupAllowed(db, enabled, env)) return { status: 'disabled', processed: 0, purged: 0, retired: 0 };
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw Error('Invalid cleanup limit.');
  const totals = { status: 'complete', processed: 0, purged: 0, retired: 0 };
  const checkpoint = db.collection('workplaceConcernWorker').doc(evidenceOnly ? 'evidence-retention' : 'retention');
  try {
    const saved = await checkpoint.get(), cursor = saved.data()?.cursor;
    if (cursor && !validId(cursor)) throw Error('Cleanup unavailable.');
    const base = db.collection('workplaceConcernCases').orderBy('__name__');
    let page = await (cursor ? base.startAfter(cursor) : base).limit(limit).get();
    if (page.empty && cursor) page = await base.limit(limit).get();
    for (const doc of page.docs) {
      const result = await retentionTransaction(db, clock, async (tx, time) => {
        const snap = await tx.get(doc.ref), item = snap.data(), now = time();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw Error('Clock unavailable.');
        if (!item) return {};
        const stage = retentionStage(item, now);
        if (stage === 'invalid') return { blocked: true };
        if (['open','evidence'].includes(stage)) return {};
        const safe = { ...minimalConcernAudit(item), evidencePurged: true,
          purgedAt: item.purgedAt || now.toISOString(),
          evidenceDeleteAt: item.evidenceDeleteAt || retentionDates(item.closedAt).evidenceDeleteAt,
          auditDeleteAt: item.auditDeleteAt || retentionDates(item.closedAt).auditDeleteAt };
        const purge = !isDeepStrictEqual(item, safe);
        if (stage === 'audit' || evidenceOnly) {
          if (purge) tx.set(doc.ref, safe);
          return { purged: purge };
        }
        if (!validId(item.studentId) || !validId(item.entryId) || !Number.isSafeInteger(item.sourceRevision) || item.sourceRevision < 1) {
          if (purge) tx.set(doc.ref, safe);
          return { blocked: true, purged: purge };
        }
        const jobs = db.collection('workplaceJournalAnalysisJobs');
        const canonical = await tx.get(jobs.doc(doc.id));
        const matches = await tx.get(jobs.where('studentId','==',item.studentId).where('entryId','==',item.entryId).where('sourceRevision','==',item.sourceRevision).limit(20));
        const linked = value => value.studentId === item.studentId && value.entryId === item.entryId && value.sourceRevision === item.sourceRevision;
        if ((canonical.exists && !linked(canonical.data())) || matches.docs.some(d => !['processed','cancelled','unavailable'].includes(d.data().state))) {
          if (purge) tx.set(doc.ref, safe);
          return { blocked: true, purged: purge };
        }
        // Re-query the first remaining rows after each committed stage: deletions are durable progress.
        let rows = matches;
        if (rows.empty) rows = await tx.get(db.collection('workplaceConcernNotices').where('caseId','==',doc.id).limit(20));
        if (rows.empty) rows = await tx.get(db.collection('workplaceConcernReceipts').where('result.id','==',doc.id).limit(20));
        if (rows.empty) rows = await tx.get(db.collection('auditLogs').where('targetType','==','workplaceConcernCases').where('targetId','==',doc.id)
          .where('action','in',ACTIONS.map(a => `workplace.concern_${a}`)).limit(20));
        // No related rows remain in this transaction; the missing terminal job prevents stale worker commit.
        if (rows.empty) { tx.delete(doc.ref); return { retired: true }; }
        if (purge) tx.set(doc.ref, safe);
        rows.docs.forEach(d => tx.delete(d.ref));
        return { purged: purge };
      });
      totals.processed++; totals.purged += result.purged ? 1 : 0; totals.retired += result.retired ? 1 : 0;
      if (result.blocked) totals.status = 'unavailable';
      await checkpoint.set({ cursor: doc.id });
    }
  } catch { totals.status = 'unavailable'; }
  return totals;
}
module.exports = { runConcernRetentionBatch };
