# Workplace audit retention and dispatch safeguards implementation plan

> **For agentic workers:** Use executing-plans inline, test-driven development, one independent final review and scoped local commits. Preserve unrelated changes in the existing checkout.

**Goal:** Enforce approved evidence/audit lifetimes locally and close the two deferred dispatch integration-test gaps.

**Execution status (2026-10-23):** completed locally; original task checklist below is the specification, not a release checklist. See WORKPLACE-SAFEGUARDS-ACCEPTANCE.md for final 219/219 backend, 201/201 web, review fixes and limitations. No push/deploy/APK or paid enablement.

**Architecture:** Keep the existing private review APIs and durable queue. Extend bounded cleanup with separate evidence expiry and final metadata expiry; every read must respect expiry even if physical cleanup is delayed. Use local synthetic emulators, injected clocks and fixed fake analysis only.

**Tech Stack:** Existing Node/CommonJS, Express and Firebase emulator tests; no dependencies or APK.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md; user approval of 90-day evidence and 12-month minimal audit retention; WORKPLACE-LOCAL-DISPATCH-ACCEPTANCE.md.

## Global constraints

- Local demo only, exact demo-pathway-security, explicit opt-in and localhost Auth/Firestore. No production, paid requests, email, deployment, historical production cleanup or original-journal deletion.
- Open cases retain evidence. Resolved and dismissed_false_positive both start retention at closedAt. Reading/failed contact never starts retention.
- Evidence and free-text review notes expire at closedAt + 90 elapsed days. Minimal audit expires 12 calendar months after closure, using UTC calendar arithmetic and clamping invalid month-end dates (Feb 29 → Feb 28). This calendar interpretation is an implementation proposal, not a legal claim.
- Minimal action data: action enum, actorId, at, optional outcome enum and priority enum. Case audit fields: case ID, studentId, entryId, sourceRevision, origin, ruleVersion, state, version, priority, createdAt, closedAt, evidenceDeleteAt, auditDeleteAt, evidencePurged and purgedAt. Omit sourceHash, quotes, reasons, free text and historical assignment/routing fields from the post-evidence case projection. Current assignment still authorizes access.
- At audit expiry, hide the entire case/linked notices; reject actions and receipt replays uniformly. Physically remove the case and its case-linked notices, concern-action receipts, workplace-concern audit events and matching terminal analysis job in bounded stages. Preserve original journals, consent records, journal-submission receipts and unrelated/global audit events.
- No indefinite per-case tombstone or extra audit copy. Prevent resurrection by transactional current-job/case checks and by deleting the associated terminal job before deleting the case. Original submission receipt replay does not recreate a job. If safe deletion cannot be established, fail closed and report cleanup unavailable, not successful completion.
- Legacy closed cases derive expiry from valid closedAt, never from cleanup time. Missing/malformed closure metadata hides evidence and the case until repair; never guess a new retention window or delete an open case.
- This phase wires bounded startup/recovery cleanup only into the explicit local fake runtime. Hosted scheduling remains a separate release gate. No budget reset or pricing extension.

## Review focus

1. Sensitive copies must not survive the evidence boundary in returned data or the post-purge case/history.
2. Stale receipt replays, notices and second authorization reads cannot reveal expired case metadata.
3. Partial cleanup, competing cleanup runs and active worker transactions cannot resurrect a deleted case or erase unrelated data.
4. Calendar anniversaries, leap days, legacy/malformed timestamps and clock changes cannot extend retention silently.
5. Concurrent first submissions, multiple dispatchers and mid-processing changes must preserve one job/result or discard stale output without duplicate attempts/notices.

### Task 1 — Retention policy and private read/action boundary

**Files:** create PATHWAY-backend/workplaceConcernRetention.js and security-tests/workplace-concern-retention.test.js; modify workplaceConcernReview.js and its tests.

**Interfaces:** retentionDates(closedAt) → {evidenceDeleteAt,auditDeleteAt}; retentionStage(item, now) → open/evidence/audit/expired/invalid; minimalConcernAudit(item) → allowlisted case/action fields. Existing installWorkplaceConcernReview signature remains compatible.

- [ ] RED pure calendar tests: close 2026-10-22T12:00Z → evidence 2027-01-20T12:00Z, audit 2027-10-22T12:00Z; close Feb 29, 2028 → audit Feb 28, 2029 at the same UTC time. Invalid dates fail closed.
- [ ] RED HTTP tests: exact 90-day boundary removes quotes/notes while retaining safe action metadata; exact anniversary hides list/detail/notices and denies action/receipt replay. Check both initial and fresh response authorization after clock change.
- [ ] Persist both dates on closure; derive dates for valid legacy closure without extending earlier recorded expiry. Preserve open-case behavior and current assignment checks. Minimize only closed-case evidence; no raw source/notes in audit.
- [ ] Run `node --test security-tests/workplace-concern-retention.test.js`, then emulator concern/review tests; expected zero failures. Commit scoped policy/API changes after GREEN.

### Task 2 — Bounded cleanup of associated copies and local recovery

**Files:** modify workplaceConcernReview.js (or move its cleanup into workplaceConcernRetention.js without changing the public export), workplaceConcernCases.js as needed for no-resurrection checks, security-tests/workplace-local-runtime.js, concern-fixture.js and cleanup tests.

**Interfaces:** retain purgeExpiredConcernEvidence({db,clock,limit}) compatibility; add runConcernRetentionBatch({db,enabled,clock,limit=20}) → {status,processed,purged,retired}. Bound every scan/delete stage to 20 documents and persist a checkpoint. Cleanup errors do not change a committed journal response.

- [ ] RED emulator tests: 90-day purge keeps only allowlisted audit/action fields; 12-month retirement removes associated notices/action receipts/concern audit events and terminal job. Other cases, original journal, consent and unrelated audit records survive byte-for-byte.
- [ ] RED interrupted/resumed cleanup and two competing cleanup instances; no falsely reported completion, no case resurrection under a racing worker, no stale action restoring evidence. A nonterminal or inconsistent job blocks destructive final retirement until safe, while expired data remains hidden.
- [ ] Use exact case references and allowlisted workplace.concern_* audit actions when selecting linked data; do not scan/delete all auditLogs indiscriminately. Case-linked cleanup stages remain durable until all matching rows are drained; final transactional deletion rereads closed state and expiry.
- [ ] Connect one bounded cleanup batch to startup/recovery of explicitly enabled fake runtime, separate from provider batch results. Disabled/production/remote entry points cause zero cleanup access; stop prevents further scheduling. Do not turn recovery into an unbounded drain.
- [ ] Run focused emulator tests; expected zero failures. Commit scoped cleanup changes after GREEN.

### Task 3 — Deferred dispatch tests and final verification

**Files:** security-tests/workplace-local-flow.test.js, concern-fixture.js and run-emulator-tests.js; project-notes/WORKPLACE-SAFEGUARDS-ACCEPTANCE.md and manuscript checklist.

- [ ] Add actual emulator dispatch tests for competing first submissions with identical request identity, separate runtimes claiming the same queue, sourceRevision change during analysis, consent withdrawal during analysis and lease expiry before result commit. Test doubles may pause the fake analyzer, never replace transactions or worker logic. Assert one saved entry/job/notice on replay, bounded attempts, and no stale case.
- [ ] Run focused dispatch/retention/review tests. If existing implementation already passes a new regression, record it as added coverage, not a new bug fix; any discovered defect needs RED→GREEN.
- [ ] Run `npm test` in PATHWAY-backend; expected zero failed/skipped. Run web component tests only if response contracts change; inspect expired case UI behavior. Do not run the demo workflow concurrently with the isolated same-project suite because snapshot discovery is currently ambiguous.
- [ ] One independent read-only final review covering the five focus items; fix Important findings with failing regression then GREEN suite. Record minor deferrals explicitly.
- [ ] Save exact commands, results, chosen fields/calendar policy and limitations. Update manuscript checklist to distinguish approved policy, local enforcement and deployed behavior. Commit locally; no push/deploy/APK.

## Handoff and decisions for review

The 90-day and 12-month durations are approved. Proposed implementation details needing plan review: calendar-month UTC calculation, exact minimal fields, expiry of associated copies, bounded local cleanup and no indefinite tombstone. Recommend continuing inline execution with one final reviewer to contain usage. No product code changed by this plan.
