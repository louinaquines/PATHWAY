const DISCLOSURE_VERSION = 'workplace-journal-consent-v2';
const DISCLOSURE_TEXT = 'Optional: share original notes from future journal submissions with Anthropic for token counting and workplace-concern analysis. Potential concerns go privately to your assigned coordinator for human review; your company or supervisor is not notified automatically. You can decline or withdraw and still submit journals or request workplace support. Withdrawal stops future sharing and unsent queued work, but cannot recall text already shared or erase retained review records. AI may miss or misunderstand concerns; PATHWAY is not continuously monitored or an emergency service.';
const LIMITS = Object.freeze({ requestBytes: 5000, countAdmission: 12000, inputAllowance: 14000, outputTokens: 1024, attemptsPerUtcDay: 10, reservedMicroUsdPerUtcDay: 100000, reservationMicroUsd: 9560 });
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) throw Error('Invalid retention timestamp');
  const d = new Date(value); if (!Number.isFinite(d.getTime()) || d.toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) throw Error('Invalid retention timestamp'); return d;
}
function journalRetentionDryRun(item, now) {
  const base = { dryRun: true, deletes: 0 };
  try {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !item || item.completionVerified !== true || typeof item.completionEvidence !== 'string' || !item.completionEvidence.trim()
      || item.activeReview !== false || item.legalHold !== false || item.activeAnalysis !== false) throw Error();
    const completed = utc(item.completedAt); if (completed > now) throw Error();
    const due = new Date(completed), day = due.getUTCDate(); due.setUTCDate(1); due.setUTCFullYear(due.getUTCFullYear() + 1);
    const end = new Date(due); end.setUTCMonth(end.getUTCMonth() + 1, 0); due.setUTCDate(Math.min(day, end.getUTCDate()));
    return { ...base, status: now >= due ? 'eligible' : 'retain', deleteAfter: due.toISOString() };
  } catch { return { ...base, status: 'blocked' }; }
}
function backupRetentionDryRun(item, now) {
  const base = { dryRun: true, deletes: 0 };
  try {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || !item || item.legalHold !== false || item.restoreCoverageVerified !== true) throw Error();
    const created = utc(item.createdAt); if (created > now) throw Error(); const due = new Date(created.getTime() + 30 * 86400000);
    return { ...base, status: now >= due ? 'eligible' : 'retain', deleteAfter: due.toISOString() };
  } catch { return { ...base, status: 'blocked' }; }
}
const RELEASE_GATES = Object.freeze(['v2DisclosureAndRenewal','updatedClientRevision','backendRevision','backendOnlyRulesTested','durableAccountingAndStop','boundedRecoveryAndScheduler','humanReviewedEvaluation','retentionDryRunAndRestore','legacyClientTransition','rollbackRehearsal','priceProfileCurrent','deploymentAuthorization']);
function assessReleaseReadiness(evidence = {}) {
  const missing = RELEASE_GATES.filter(k => evidence[k]?.verified !== true || typeof evidence[k]?.reference !== 'string' || !evidence[k].reference.trim());
  return { readyForApproval: missing.length === 0, processingEnabled: false, missing };
}
module.exports = { DISCLOSURE_VERSION, DISCLOSURE_TEXT, LIMITS, journalRetentionDryRun, backupRetentionDryRun, RELEASE_GATES, assessReleaseReadiness };
