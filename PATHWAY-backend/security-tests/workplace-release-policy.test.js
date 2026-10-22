const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
function policy() { assert.ok(fs.existsSync(path.join(__dirname, '../workplaceRealUsePolicy.js')), 'Approved policy module missing'); return require('../workplaceRealUsePolicy'); }
test('legacy stored permission is read as off at the existing revision for renewed disclosure', () => {
  const { consentValue } = require('../workplaceJournalConsent');
  const next = consentValue({ exists: true, data: () => ({ granted: true, revision: 4, disclosureVersion: 'workplace-journal-consent-v1' }) });
  assert.equal(next.granted, false); assert.equal(next.revision, 4); assert.equal(next.disclosureVersion, 'workplace-journal-consent-v2');
});
test('approved disclosure names counting, analysis, withdrawal and private human review', () => {
  const p = policy(); assert.equal(p.DISCLOSURE_VERSION, 'workplace-journal-consent-v2');
  assert.match(p.DISCLOSURE_TEXT, /token counting/); assert.match(p.DISCLOSURE_TEXT, /Anthropic/); assert.match(p.DISCLOSURE_TEXT, /withdraw/i);
  assert.equal(p.LIMITS.countAdmission, 12000); assert.equal(p.LIMITS.requestBytes, 5000);
});
test('original journal dry run uses UTC calendar anniversary and never recommends missing or blocked records', () => {
  const { journalRetentionDryRun } = policy(); const base = { completedAt: '2024-02-29T12:00:00Z', completionVerified: true, completionEvidence: 'synthetic-verification', activeReview: false, legalHold: false, activeAnalysis: false };
  assert.equal(journalRetentionDryRun(base, new Date('2025-02-28T11:59:59Z')).status, 'retain');
  const due = journalRetentionDryRun(base, new Date('2025-02-28T12:00:00Z')); assert.equal(due.status, 'eligible'); assert.equal(due.dryRun, true); assert.equal(due.deletes, 0);
  for (const patch of [{ completionVerified: false }, { completionVerified: undefined }, { completionEvidence: '' }, { completedAt: null }, { completedAt: '2024-02-30T00:00:00Z' }, { completedAt: '2027-01-01T00:00:00Z' }, { activeReview: true }, { legalHold: true }, { activeAnalysis: true }])
    assert.equal(journalRetentionDryRun({ ...base, ...patch }, new Date('2025-03-01T00:00:00Z')).status, 'blocked');
  assert.equal(journalRetentionDryRun({ completedAt: base.completedAt }, new Date('2025-03-01T00:00:00Z')).status, 'blocked');
});
test('backup dry run requires verified restore coverage and stops at exactly thirty elapsed days', () => {
  const { backupRetentionDryRun } = policy(); const b = { createdAt: '2026-01-01T00:00:00Z', legalHold: false, restoreCoverageVerified: true };
  assert.equal(backupRetentionDryRun(b, new Date('2026-01-30T23:59:59Z')).status, 'retain');
  assert.equal(backupRetentionDryRun(b, new Date('2026-01-31T00:00:00Z')).status, 'eligible');
  assert.equal(backupRetentionDryRun({ ...b, restoreCoverageVerified: false }, new Date('2026-02-01T00:00:00Z')).status, 'blocked');
});
test('hosted readiness is fail-closed and cannot itself enable processing', () => {
  const { assessReleaseReadiness, RELEASE_GATES } = policy(); const evidence = Object.fromEntries(RELEASE_GATES.map(k => [k, { verified: true, reference: 'local-evidence' }]));
  assert.equal(assessReleaseReadiness({}).readyForApproval, false);
  assert.equal(assessReleaseReadiness(evidence).readyForApproval, true); assert.equal(assessReleaseReadiness(evidence).processingEnabled, false);
  for (const key of RELEASE_GATES) assert.equal(assessReleaseReadiness({ ...evidence, [key]: { verified: true, reference: '' } }).readyForApproval, false);
});
