# Workplace Concern Detector and Private Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, with test-first implementation and one independent whole-change review. Do not deploy.

**Goal:** Add validated workplace-concern decisions, private coordinator cases, in-app notices and the approved human-review/retention workflow, locally with synthetic analysis.

**Architecture:** Extend the existing default-off journal worker, preserving its budget, source/consent checks and lease fencing. A pure detector contract prepares instructions and validates structured decisions; case creation and minimal notices commit atomically with the worker outcome. Backend-only case access rechecks current assignment rather than trusting a saved recipient. No new dependencies or direct client access to case collections.

**Tech Stack:** Existing CommonJS/Express, Firebase Admin transactions and demo emulators, Node tests, existing coordinator React components/tests.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md, including the user's 2026-10-22 approvals: private in-app only, 90 days after closure for excerpts/notes, and reason-required false-positive dismissal without contact. Baseline worker commit: 9c69812.

## Global constraints

- Existing checkout per user preference. Preserve unrelated edits and the parked support worktree. Save Markdown under project-notes.
- Local-only, default off; synthetic notes and injected responses only. No Claude/token-count calls, credentials, emails, company notifications, deployment, APK, backfill or hosted scheduler changes.
- The detector is advisory, separate from journal scores and official decisions. Exact source quotes support a potential concern, not verified toxicity. Failure is unavailable, never safe.
- High priority requires an explicitly reported immediate danger; other potential concerns are normal priority. Negation, hypothetical examples, training quotations and embedded instructions must not themselves become reported incidents.
- Preserve source hash/revision, exact consent revision, account/placement authorization, five-job batches, lease fencing, two-attempt maximum, persistent daily allowance and pricing brake.
- Sensitive excerpts/reasons/notes live only in private case details, never notifications, list summaries, application errors or generic audit logs. Render text as text, not HTML.
- After resolution or false-positive dismissal, schedule sensitive-data removal at closure time plus 90 * 24 hours. While open, keep evidence as approved. No automatic reopening/reset of the deadline on reads/retries.
- Minimal audit lifetime is not approved. Locally propose opaque case ID, action, actor ID, timestamp and policy version only; no source text, notes, detector reasoning or names. This is a release gate, not permission for indefinite live retention.

## Review focus

1. Revocation or source edits while analysis is running must prevent case/notice creation without refunding uncertain spend.
2. Forged quotes, unknown categories, malformed JSON, extra fields and unsupported High classifications must fail closed.
3. Reassignment or disabled staff must remove former coordinator access on list, detail and action, even for old notices.
4. Duplicate delivery, retry/crash, missing recipients and concurrent actions must not duplicate notices, lose undelivered cases or override a closed disposition.
5. Expired evidence must not leak through list/detail/action or notes/audit/receipts, even before cleanup runs; cleanup must not touch open cases or reset deadlines.

## Task 1 — Pure detector contract

**Create:** PATHWAY-backend/workplaceConcernDetector.js and security-tests/workplace-concern-detector.test.js.

**Interfaces:** `prepareConcernRequest(rawNotes)` produces bounded instruction/source data with a version; it does not call a provider or invent a verified token bound. `validateConcernDecision(rawNotes, decision)` returns an immutable canonical decision or throws a generic validation error.

Decision: `{version:'workplace-concern-v1', findings:[...]}` with at most three findings. Each finding has exactly `category`, `priority`, `quote`, `reason`, `immediateDangerQuote`. Categories: threat, harassment, discrimination, coercion, unsafe_conditions, mistreatment. Priority: normal or high. Quote: exact contiguous source substring, 1–500 characters. Reason: 1–300 characters. High additionally requires a nonempty exact immediate-danger quote within the finding quote; normal requires null. Reject duplicate findings. An empty findings array means only “No concern flagged by automated analysis.” Schema/quote validation cannot establish semantic truth; documented human safety review remains required.

- [x] Write failing tests for all trust-boundary limits, exact quotes including Unicode, High evidence, empty findings, duplicates, injection-safe request separation and no source rewriting.
- [x] Run `node --test security-tests/workplace-concern-detector.test.js`; observe RED, implement minimal validator/preparer, rerun GREEN.
- [x] Add explicit synthetic English/Filipino/Cebuano scenario fixtures (actual danger, ordinary difficulty, negation, hypothetical/training material and prompt injection). Mock-response tests verify validation, not model accuracy; do not report linguistic detection accuracy from them.

## Task 2 — Atomic worker outcomes and private delivery

**Create:** PATHWAY-backend/workplaceConcernCases.js; security-tests/workplace-concern-cases.test.js. **Modify:** workplaceJournalWorker.js, its tests and security-tests/run-emulator-tests.js.

**Interfaces:** A synthetic analyzer may return `{usage,decision}`. Legacy usage-only adapters retain operational-only behavior and cannot create cases. Validate decisions against the fresh original notes. `planConcernOutcome({db,tx,jobId,job,decision,now})` reads all required assignment/case/notice records before producing writes applied inside the final fenced outcome transaction. There is no external callback/I/O inside that transaction.

Use private `workplaceConcernCases` and `workplaceConcernNotices` collections. Case ID derives from student, entry and source revision; notice identity derives from case and authorized recipient. Notices contain only case ID, recipient ID, generic potential-concern title, priority, createdAt and read state. Cases retain provenance, canonical findings, workflow state/version and current delivery metadata. No concern means no case/notice. Invalid output means unavailable with no case. Missing valid coordinator means awaiting delivery, not silently delivered.

Resolve assignment from the current student section and its coordinator; require active approved coordinator and matching department. Provide a bounded local recovery operation to route undelivered/reassigned open cases, without provider calls or timers. Identical replay never duplicates, overwrites a human disposition or extends retention. New source revisions retain distinct provenance.

- [x] RED real-emulator tests for atomic case/job/notice outcomes, crash/replay, no flag, malformed finding, withdrawn consent, same-revision raw edit, stale lease, missing recipient, reassignment and assignment query failure.
- [x] Implement minimal transactional planning/delivery; preserve existing worker-only tests and add new focused files to the runner behind `--workplace-concerns-only` and the default suite.
- [x] Verify every client role (including admin) is denied direct Firestore case/notice reads/writes by existing default-deny rules.

## Task 3 — Authorized review actions and retention

**Create:** PATHWAY-backend/workplaceConcernReview.js; security-tests/workplace-concern-review.test.js. Extend the local test fixture, not the hosted server.

**Interface:** `installWorkplaceConcernReview({app,db,requireStaff,allowRate,audit,clock,enabled})` registers local-tested coordinator list/detail/action/read endpoints only when explicitly enabled for the demo emulator. Export `purgeExpiredConcernEvidence({db,clock,limit})` as a bounded local cleanup operation, without scheduler registration.

Use POST reads with no-store responses, current actor/password/account and assignment authorization in transactions, fixed maximum 20 records and opaque actor-scoped cursor. List returns only minimal routing/status/priority fields. Detail returns evidence only before expiry and to the current coordinator. No unrestricted admin/student/supervisor access.

Actions use expectedVersion and requestId for concurrency/idempotency. Opening/reading does not resolve. Explicit actions: review, contact (success or failed), act (required note), resolve (successful contact, action and required reason), dismiss_false_positive (required reason, no contact requirement), change_priority (required reason). Failed contact leaves the case open. Closed cases cannot be implicitly reopened. Return generic denied/unavailable responses without case-existence leakage.

Keep free-text workflow history in one private bounded case payload (maximum 100 actions per case; refuse additional writes rather than truncate history). General audits and receipts contain no free text or whole response copies. Resolution/dismissal fixes evidenceDeleteAt to +90 days once. At/after expiry, detail/action projections suppress sensitive payload even if cleanup is late. Cleanup transactionally removes findings and free-text history, leaving a minimal tombstone/audit, and cannot touch open cases. This does not delete the student's original journal, whose separate retention policy is unchanged. No live cleanup is authorized.

- [x] RED emulator tests: current-assignment-only list/detail/action, forged IDs/cursors/extra fields, stale password/role changes, replay/stale versions, audit rollback, failed contact, resolution guards, justified false-positive dismissal, priority overrides and bounded history.
- [x] Test exact 90-day boundary, late cleanup read suppression, no evidence in generic audits/receipts/notices, concurrent cleanup/action, open-case preservation and idempotent cleanup.
- [x] Implement locally; do not register routes, flags or cleanup in production server.js.

## Task 4 — Local coordinator UI and final verification

**Create:** PATHWAY-web/src/components/WorkplaceConcernReview.js and WorkplaceConcernReview.test.js. Reuse established notification/dialog/form styles; inspect current components before choosing exact CSS imports. No live navigation registration or deployment in this stage.

Component accepts the existing authenticated API client, lists minimal private notices/cases, opens authorized details, presents potential-concern wording/priority/source evidence, and supports the Task 3 actions. Form failures preserve entered text. Explicitly distinguish genuine resolution from false-positive dismissal. Display unavailable/delayed/expired states truthfully. Include PATHWAY-not-continuously-monitored warning; no promise of immediate response. Pending/unreachable cases stay visibly open. Do not expose evidence in browser notifications or list cards.

- [x] RED React tests for authorized API use, no excerpts in lists, explicit detail loading, error/draft preservation, workflow guards, reason-required dismissal and accessible controls. Use the real component and mock only HTTP.
- [x] Implement component, run focused tests then full `CI=true npm test -- --watchAll=false --runInBand` in PATHWAY-web and full backend `npm test` against demo emulators. Run detector tests explicitly if not already included.
- [x] One fresh independent whole-change security/correctness review; fix important findings with RED/GREEN coverage and rerun affected/full suites. Save actual counts/limits in a progress ledger and MANUSCRIPT-CHANGE-CHECKLIST.md without overwriting unrelated edits.
- [x] Scoped local commit only. No push, deployment, APK, real provider evaluation or production settings. Completion means synthetic local integration, not live Claude accuracy or a hosted feature.

## Release gates outside this plan

Real Claude adapter with reviewed complete-request token bounds and current pricing; independently authorized paid safety evaluation/human review; minimal audit retention policy; student disclosure update for stored cases/withdrawal/retention; hosted dispatcher/recovery and cleanup authorization; live navigation/config registration; device/browser end-to-end and explicit deployment/cutover approval. Existing direct support work remains parked.

## Execution handoff

Native inline execution as previously preferred, with one final reviewer to control usage. User approved execution on 2026-10-22. Completed locally with one independent review and regression fixes; backend 164/164 and web 193/193 passed. Policy approvals are recorded in the design; release gates remain separate.
