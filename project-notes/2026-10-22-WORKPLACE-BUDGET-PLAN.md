# Workplace Analysis Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a default-off persistent budget boundary for future automatic journal concern analysis without making provider calls or enabling processing.

**Architecture:** A server-only reservation transaction enforces request and conservative dollar bounds shared across worker restarts. It is not yet wired to submission, dispatch, Claude, or notifications. Later integration must reserve before each request and independently recheck consent and source revision.

**Tech Stack:** Existing CommonJS Node, Firebase Admin Firestore transactions and Node test runner; no new dependencies.

**Spec:** `project-notes/WORKPLACE-JOURNAL-ALERT-DESIGN.md`.

## Global Constraints

- Default off; synthetic tests only. No paid calls, production data/settings, deployments, APK, or parked-worktree merging.
- At most 10 attempts and 100000 micro-USD ($0.10) reserved per day; retries consume a distinct attempt and reservation.
- Persist before calling; uncertain outcomes retain reservation. Never claim provider billing has been capped globally.
- Missing verified pricing/reservation input must fail closed. This stage accepts a trusted conservative reservation, not a client-supplied price or cost.
- Proposed UTC accounting stays internal until daily reset semantics are confirmed. No automatic daily reset of an already issued attempt identity.

## Review Focus

- Concurrent workers reaching the last available slot must not overspend (Task 1).
- Retried transaction callbacks must not multiply reservations (Task 1).
- A process crash after reservation must not refund or reissue a call (Task 1).
- A replay across midnight must not re-reserve the same attempt (Task 1).
- Untrusted, unsafe integer or nonfinite cost/time inputs must fail closed (Task 1).

## Task 1: Persistent reservation boundary

**Files:** Create `PATHWAY-backend/workplaceAnalysisBudget.js` and `PATHWAY-backend/security-tests/workplace-analysis-budget.test.js`; extend `firestore.rules` and its emulator security tests only if client-denial rules are not already sufficient for the new collections.

**Interface:** `reserveWorkplaceAttempt({db, enabled, attemptId, now, reservedMicroUsd}) -> Promise<{status: 'disabled'|'reserved'|'already-reserved'|'daily-limit'}>`. Inputs are server-owned. `now` is a valid Date. Cost is a positive safe integer <=100000, representing a separately verified conservative worst-case request cost. Attempt IDs are stable opaque bounded IDs for job revision + attempt number, not journal content. Invalid inputs throw before database access. Exactly `enabled === true` permits reservation.

Use backend-only `workplaceAnalysisBudgetDays/{UTC-date}` totals and global `workplaceAnalysisBudgetAttempts/{attemptId}` receipts. In one transaction read receipt and day, return already-reserved for any previous receipt (even another day), then enforce count/cost before atomically writing both. Only reserved permits its caller to send; already-reserved never grants a replay. No automatic refund, deletion or content storage. Failed reservation means caller must not invoke Claude. Enforce safe nonnegative stored totals as well as new inputs; malformed counters block processing.

- [ ] Write tests for disabled/no DB access; one reservation persisted; duplicate ID in same and next day; exactly 10 attempts; cost equal to 100000 allowed and excess denied; malformed cost/time/counters; atomic rollback; concurrent last-slot requests; repeated transaction callback; adapter recreation with existing receipt after a simulated crash.
- [ ] Run `node --test security-tests/workplace-analysis-budget.test.js` in backend; observe failures against missing implementation rather than test setup errors.
- [ ] Implement only the reservation interface; use emulator transactions for concurrency/rollback tests rather than a fake claiming transaction guarantees. No provider integration or price fetching.
- [ ] Run targeted unit and emulator checks, then backend `npm test`. Verify direct Firestore client denial for all roles on both collections without exposing journal text.
- [ ] Review the scoped diff and commit only this unit and its tests after verification; do not push local main or include unrelated work.

## Later stages (separate plans after inspection/decisions)

Task 1 implemented locally on 2026-10-22; full backend suite 109/109 passed, including 9 budget tests. See WORKPLACE-BUDGET-PROGRESS.md for review and rulings. No automatic analysis has been enabled.

1. Consent storage + atomic backend journal submission/revision/job creation; preserve current submission eligibility and mobile behavior.
2. Verified model-price/input/output reservation calculation + durable worker leases/retries, then immediate dispatch and 15-minute recovery wiring. Remain disabled pending authorized synthetic test window.
3. Structured concern detector and private alert routing/deduplication; settle evidence retention and human false-positive disposition first.
4. Consistent student/coordinator screens, authorization and workflow tests, bounded separately authorized paid evaluation, manuscript reconciliation, release approval.

These stages are not implemented by Task 1. The operational decisions and independent review remain explicit gates; a budget module alone is not an automatic workplace-alert feature.
