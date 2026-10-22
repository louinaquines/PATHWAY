# Journal Consent and Atomic Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkboxes for tracking.

**Goal:** Prepare a backward-compatible, local migration to backend-owned journal submission with versioned opt-in and durable queued-job creation; do not run AI or deploy.

Implementation review amendment: rejected-entry requests also require `expectedSource` with exactly rawNotes/refined/aiRefined/hours/reviewedAt (null for missing fields). Server compares a canonical snapshot to prevent overwriting intervening legacy writes/reviews. Receipt replay verifies fresh role/password before returning existing IDs, but does not reauthorize placement for a write that already committed. No new writes are permitted by that replay. See JOURNAL-MIGRATION-PROGRESS.md for RED/GREEN review evidence.

Status: implemented and independently reviewed locally. Final verification: backend 124/124, web 185/185, separate focused journal/provider/helper checks 33/33. No deployment, preview APK, live consent collection, automatic worker or paid API calls. See JOURNAL-BACKEND-CUTOVER.md for remaining release gates and native/device test limitations.

**Architecture:** Add authenticated backend consent and journal APIs backed by transactions, retaining current Firestore read paths. Add an opt-in mobile migration path which is off by default during development, with no silent fallback to direct writes after a backend submission attempt. Backend submission creates a pending job only when submission-time consent is granted; the future worker must separately check current consent and automatic-processing enablement before sharing.

**Tech Stack:** Existing Express/CommonJS, Firebase Admin transactions/rules, React Native/Expo SDK 54, existing postBackend helper and UI components. No new paid service or dependency.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md. User approved preparing this migration locally on 2026-10-22 while retaining the live flow until an updated app is ready. This document awaits implementation review; no API or mobile changes have been made by writing it.

## Global Constraints

- No Claude calls, deployments, APK, rule publishing, student records or parked-worktree merges. Automatic processing remains disabled.
- Preserve fresh account/password, placement, company-active and cleared-record checks. Consent decline never blocks ordinary journal submission.
- Preserve exact original notes separately from refined display text. Never trust client status, week number, period, creation time, consent snapshot or queue state.
- UTC is the budget accounting proposal only; journal week periods remain Philippine-time Monday–Sunday.
- No deletion/retention automation or historical scan. Evidence-retention and false-positive disposition decisions remain future gates.
- Mobile code requires reading the exact Expo SDK 54 docs per PATHWAY-master/AGENTS.md before editing.

## Review Focus

- Response lost after commit: repeat with the same request identity returns the same journal/job, not duplicates (Task 2/3).
- Consent revoked concurrently with submission: atomic snapshot matches transaction ordering; future worker still rechecks consent (Task 1/2).
- Eligibility revoked after middleware: fresh transactional account and active-company checks deny mutation (Task 2).
- Rejected entry changed by coordinator before resubmission: revision/status conflict preserves both source and review (Task 2/3).
- Old apps continue direct writes during compatibility preparation, and are never falsely shown as automatically analyzed (Task 3/4).

## Existing boundaries inspected

- `PATHWAY-master/screens/LogbookScreen.js`: new entries use addDoc; rejected revisions use runTransaction. New weekNum is currently count + 1; revision retains existing period/date.
- `PATHWAY-master/services/backendApi.js`: requestBackend/postBackend support authenticated POST payloads and sanitized HTTP errors.
- `PATHWAY-backend/server.js`: requireUser validates fresh token/profile; assertActivePlacement reads the active company transactionally; assertRecordsOpen protects cleared records. Reuse these helpers without duplicating eligibility logic.
- `firestore.rules`: logbooks currently allow eligible owner creation and rejected/draft revision; direct reads must be preserved. New top-level consent/jobs/receipts are default-denied already, subject to real rules tests.

## Task 1 — Versioned consent API, no provider sharing

**Files:** Create `PATHWAY-backend/workplaceJournalConsent.js`, `PATHWAY-backend/security-tests/workplace-journal-consent.test.js`; modify server.js only to register the module using existing auth/rate/audit helpers, and extend the emulator runner to include these tests.

**Interface:** `installWorkplaceJournalConsent({app, db, requireUser, allowRate, audit, clock})`; POST `/student/journal-analysis-consent/read` returns `{granted, disclosureVersion, revision}` for the current student only. POST `/student/journal-analysis-consent` accepts exactly `{granted: boolean, disclosureVersion: 'workplace-journal-consent-v1', expectedRevision: nonnegative integer, requestId: opaque bounded ID}`. Use no-store responses.

Persist server-owned records in `workplaceJournalConsents/{uid}` plus backend-only idempotency receipts and audit. Initially revision 0/granted false. Check fresh student role/password readiness inside the transaction; consent settings must remain withdrawable even when placement is missing or clearance is completed. Reject stale revision with 409; retry of the same request and payload returns its saved result, changed payload with same ID returns 409. No text sharing, queue scan, profile-field write or eligibility side effect.

The disclosure says Anthropic receives original journal text only for opted-in submissions; withdrawal prevents future sharing, including queued unsent work, but cannot recall text already shared or erase existing human review records. No continuous monitoring or guaranteed emergency response. Do not claim a direct-support screen is deployed merely because its worktree exists.

- [ ] Write failing tests for read default, grant, decline, withdrawal without placement, stale revision, duplicate/changed request, audit rollback, wrong role, revoked password access and unauthorized/direct Firestore access.
- [ ] Run the test, observe the intended RED, implement the minimal routes/transactions, rerun GREEN in local emulators.
- [ ] Check consent audit contains version/actor/time but no notes, credentials or provider output. Save a scoped local commit after verification.

## Task 2 — Atomic journal submission and inert analysis job

**Files:** Create `PATHWAY-backend/studentJournalSubmission.js`, `PATHWAY-backend/security-tests/student-journal-submission.test.js`; modify server.js registration/audit action allowlist and emulator runner; reuse consent record contract from Task 1.

**Interface:** `installStudentJournalSubmission({app, db, requireUser, allowRate, assertRecordsOpen, assertActivePlacement, audit, clock})`; POST `/student/journals` accepts exactly `{requestId, rawNotes, refined, aiRefined, hours, entryId?, expectedRevision?}`. Reject nonnumeric/nonfinite hours or outside (0,168], blank/oversize originals, invalid refined text/bool and unexpected fields. Student identity comes only from authentication. Return `{entryId, revision, analysisStatus}` after durable commit, with no journal text in receipts.

For creation, preallocate a stable entry ID before the transaction and derive period/creation time from one server clock value using the existing Philippine date convention. Initialize a backend-only per-student sequence transactionally by querying at most 1001 existing entries. More than 1000 returns a recoverable sequence-initialization error for manual migration, with no writes. Otherwise set the next number to one plus max(existing entry count, valid positive safe-integer weekNum values); reject unsafe overflow. This bounded compatibility scan happens once, not every submission. Sequence allocation and journal creation must share a transaction so parallel backend creates cannot duplicate numbers. Legacy direct writes during compatibility are explicitly outside that numbering guarantee. For revision, require current rejected status and expected source revision (legacy entries map to revision 0); preserve existing period/weekNum/createdAt. Increment sourceRevision; do not overwrite approved/pending entries or stale coordinator decisions.

In the same transaction read current profile, active company, consent and receipt; save journal, audit and idempotency receipt. Use UID + requestId receipt key with a SHA-256 canonical payload hash; replay with same payload returns the original saved result, changed payload is 409. Receipts contain IDs/result/hash only. Rate-limit duplicate calls without turning a successful retry into a second write.

When consent granted, create backend-only `workplaceJournalAnalysisJobs/{stable uid-entry-revision key}` with source pointer/revision, consent revision/version, state queued, attempt count 0 and server timestamps. No source text copies or API credentials in jobs. When declined, save analysisStatus not-enabled and create no job. Consent opted-in with automatic worker disabled means queued, not analyzing/reviewed. Do not debit the budget at queue creation, and do not call the provider. Changed source/withdrawn consent must invalidate eligibility to send when the later worker checks it; the queue is inert until that worker exists.

- [ ] Write failing emulator tests for atomic entry/job/audit rollback; denied consent/no job; same request retry after lost response; different payload conflict; concurrent creates with unique numbering; fresh company/clearance/password revocation; rejected-only revision conflicts; period preservation and original/refined separation.
- [ ] Implement and run these tests, plus explicit client-denial checks for jobs, consent and receipt collections for every role. Existing logbook read access stays unchanged.
- [ ] Run backend npm test and focused journal/provider tests; commit only verified migration files. No live rule change.

## Task 3 — Opt-in mobile migration and consistent consent UI

**Files:** Modify `PATHWAY-master/screens/LogbookScreen.js`; create `PATHWAY-master/services/journalSubmission.js` and an associated backend Node test using the existing mobile-helper loading pattern; reuse backendApi and existing checkbox/button/modal styles. Read SDK 54 docs first.

**Interface:** A journal submission helper wraps the POST API and retains one stable requestId per payload/revision until success or an intentional draft change. Generate identity once outside asynchronous submit/retry paths using existing supported randomness. Never derive IDs from private text; hash matching is server-only. Preserve draft text and hours on failed/uncertain submission; retry unchanged payload under the same ID. Never call addDoc as an error fallback.

Gate the migrated path behind explicit build-time `EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION=1`, off by default. This is a compatibility switch, not a security control or automatic-analysis enablement. The legacy path remains unchanged while off. The migrated UI reads versioned consent, offers grant/decline and withdrawal, and handles stale consent revision by refresh rather than overwriting a newer choice. If consent load fails, show unknown/retry and do not silently grant or change consent. Submission may proceed with server-read consent; UI must not falsely label that choice. Backend remains authoritative.

Do not offer automatic-analysis enrollment on a legacy/direct-write build: those submissions cannot guarantee job creation. Show Queued or Not enabled only from the backend result, not a claim of completion. Withdrawal remains available after opting in. Preserve client eligibility/loading controls and coordinator review success wording.

- [ ] Write failing helper tests for request identity reuse after network errors, changed drafts receiving new IDs, revision conflicts, and no direct-write fallback.
- [ ] Implement helper/screen integration and parse/test changed mobile code. Test consent states and failure drafts with synthetic UI data; no APK, credentials or live journals.
- [ ] Verify legacy disabled flag path does not invoke new APIs; migrated path does not direct-write. Commit scoped tested changes.

## Task 4 — Compatibility and cutover checklist (no cutover)

**Files:** Update `project-notes/MANUSCRIPT-CHANGE-CHECKLIST.md` and create `project-notes/JOURNAL-BACKEND-CUTOVER.md`.

- [ ] Record that compatibility mode intentionally permits old direct writes and therefore does NOT guarantee automatic analysis for all entries. No backfill is performed.
- [ ] Prepare, but do not publish, the rule-change plan to deny direct owner journal writes only when the updated client and backend are ready. Reconfirm any admin/draft-edit use before removing old write paths; preserve read access.
- [ ] Document release order: tested backend APIs → authorized updated client → verified migration → separately authorized direct-write closure → only later authorized automatic worker enablement after pricing/budget/retention gates. Update installed-client expectations; no surprise live lockout.
- [ ] Run full backend regression and relevant web/mobile tests. Review authorization/idempotency/consent races independently before commit/handoff. Keep free-refinement and coordinator user-triggered review behavior unchanged.

## Plan review notes

This is a staged preparation plan, not a promise of a finished automatic-alert feature. The 1000-entry initialization bound is an engineering choice for bounded legacy migration, not a manuscript requirement or maximum student journal allowance; larger histories need explicit manual migration. Retention/false-positive workflow decisions do not block consent plus inert jobs, but still block live concern-case storage. Paid requests, deployment and preview APK remain outside this plan. Native inline execution is recommended to minimize repeated context, with one focused independent review at the end.
