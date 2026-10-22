# Workplace Queue Worker and Price Reservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with synthetic providers and real demo-emulator transactions.

**Goal:** Prepare a default-off durable queue worker that validates consent/source freshness and reserves a conservative request cost before any injected analysis operation. No live provider, dispatcher deployment or alert creation in this stage.

**Architecture:** A bounded worker processes already-created workplaceJournalAnalysisJobs using lease fencing and durable attempt identities. It connects the existing reservation boundary to a pinned price profile and a strictly bounded injected analyzer. This is the control plane only: a real concern detector, retained evidence, coordinator alerts and hosted dispatcher are separate release gates.

**Tech Stack:** Existing CommonJS, Firebase Admin transactions, Node test runner; no dependencies or installed services.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md, JOURNAL-BACKEND-CUTOVER.md, workplaceAnalysisBudget.js and studentJournalSubmission.js. Baseline local commit 7b0340b.

## Verified source facts — 2026-10-22

Official model pricing: https://platform.claude.com/docs/en/models/haiku-5-5/overview and https://platform.claude.com/docs/en/about-claude/pricing. Claude API model ID claude-haiku-5-5; global standard input/output USD per million tokens: 0.10/0.50 for prompts up to 100000 tokens, 0.50/2.50 above. For this profile deliberately reserve using the HIGHER 0.50/2.50 rates regardless of the actual small request tier. No cache/tool/priority/batch/region surcharge features are permitted by this profile.

Token counting https://platform.claude.com/docs/en/build-with-claude/token-counting is free but is described as an estimate. Do not claim an invoice guarantee from token counting, byte length or request count alone. No count-token calls are authorized by this plan: counting itself shares source text and requires the same privacy controls.

## Global constraints

- Local synthetic testing only. Default off, no Anthropic calls, emails, deployment, settings changes, APK or production data.
- Existing budget: maximum 10 attempts and 100000 micro-USD reserved per UTC day. Preserve UTC accounting in this local stage; user-visible reset semantics still require confirmation before enablement. UTC midnight is 08:00 Philippine time, not Philippine midnight.
- Reuse original rawNotes only (1–8000 chars). Check sourceRevision AND digest(rawNotes), consent granted/version AND exact consentRevision. Any intervening choice conservatively cancels that job, so withdrawal/regrant cannot revive it.
- Daily-budget exhaustion means delayed queued work, not a no-concern result. Provider failure means unavailable, never safe workplace. No coordinator finding or grade is written.
- Retention policy is unresolved: do not retain quotes, model reasoning, substantive detector results or concern-case evidence. This worker may store operational state and aggregate usage only. Real detector/alert integration must come later.

## Review focus

- Crash between budget receipt and send-state commit cannot result in a replayed paid call (Task 2).
- Expired leases cannot share or commit outcomes after another worker takes ownership (Task 2).
- Withdrawal/regrant and direct legacy edits invalidate queued work despite unchanged sourceRevision (Task 2).
- Midnight or restart does not reset an existing attempt ID or refund its reservation (Task 2).
- Unverified model/profile/input bounds cannot bypass the dollar guard (Task 1/2).

## Task 1 — Pinned local pricing contract

**Files:** Create PATHWAY-backend/workplaceAnalysisPricing.js and security-tests/workplace-analysis-pricing.test.js.

**Interface:** `reserveCostMicroUsd({model, inputTokenUpperBound, maxOutputTokens, now, profile}) -> positive safe integer`. The profile records reviewedAt, expiresAt, currency USD, standard-global-only operation and pinned rates. Initial reviewedAt 2026-10-22T00:00:00Z, expiresAt 2026-10-29T00:00:00Z (7-day fail-closed review interval, an engineering choice). Never fetch new rates silently or let a client supply rates. Model must equal claude-haiku-5-5; maxOutputTokens positive integer <=2048; input upper bound positive safe integer <=100000. Compute ceil(inputUpperBound * 0.5 + maxOutputTokens * 2.5) micro-USD. Reject an invalid/stale/future profile, unsupported request features, invalid bounds or a reservation exceeding 100000.

Input upper bound is a trusted server adapter contract, not an arbitrary frontend estimate. This stage tests arithmetic with explicit bounded synthetic requests only; no real sender may be wired until its whole serialized request, framing overhead and output/thinking limits have a reviewed conservative bound. Actual usage must never silently exceed that reservation: mark the profile unavailable and stop subsequent work if reported use contradicts the bound. No automatic refunds.

- [x] RED tests for literal cost arithmetic (10000 input/2048 output -> 10120 micro-USD), ceiling, stale/future profiles, changed model/features, invalid or excessive bounds.
- [x] Implement the minimal pure calculator and run GREEN. Save explicit limitations in its source and test the fail-closed path before integrating.

## Task 2 — Default-off bounded worker with injected synthetic analysis

**Files:** Create PATHWAY-backend/workplaceJournalWorker.js and security-tests/workplace-journal-worker.test.js; extend emulator runner and Docker packaging tests/copy only if required. Do not register a live worker, setInterval, trigger, route or provider in server.js.

**Interface:** `createWorkplaceJournalWorker({db, enabled, analyzer, clock, priceProfile})` returns `runBatch({limit = 5})`. Only enabled === true permits work; limit must be 1–5. `analyzer` is an explicitly injected bounded adapter for synthetic tests, with `prepare(rawNotes)` returning immutable request metadata (pinned model, trusted input upper bound, output cap, request features) and `analyze(prepared)` returning `{usage:{inputTokens,outputTokens}}` or a classified error. Preparation cannot perform I/O or share notes. No actual model text/results are stored or accepted by this unit.

Claim due queued/retry jobs in bounded pages with a 90-second lease and unpredictable owner ID. Validate IDs, source and current student authorization, job consent fields/version, source hash and revision before analysis. Recheck clock/lease, enablement and fresh source/consent after pure preparation and immediately before calling the analyzer, then again before any outcome commit. A final recheck cannot eliminate a revocation racing an already sent request; disclose that limit.

Lease ownership and attempt number are server-owned. Derive stable attempt IDs from job ID + attempt number. Reserve through the existing persistent budget once per attempt; daily-limit leaves the job delayed and does not advance attempt count. Persist sending/attempt state before the call, and never invoke the adapter inside a Firestore retry callback. Expired owner cannot commit. A prior receipt/sending state with an uncertain send is terminal Analysis unavailable, not authorization to resend; retain cost reservation. A budget reservation before a crash but without a confirmed send is conservatively charged against the local allowance.

At most two request attempts per source revision: one initial plus one retry for an explicitly transient error. No retry for auth/configuration, invalid output, consent/source cancellation or unclassified/uncertain crash. Retry jobs are due 15 minutes later; immediate scheduling is not installed here. Output usage beyond the prepared cap flags this price profile unavailable via a backend-only durable guard; subsequent batches must stop. Provider invoice cost remains unverified; record bounded usage without journal excerpts or raw errors.

- [ ] RED unit and real-emulator tests: default disabled/no DB or analyzer; stale price/no calls; consent denied/withdrawn/regranted; changed raw hash with same revision; wrong account; duplicate/concurrent leases; final-source-change discard; max batch; two-attempt bound; no retry on auth/invalid/unknown; budget exhaustion; crash at receipt/send boundary; midnight; stale owner commit; exceeded usage disables later work. Prove analyzer calls occur outside retrying transactions.
- [ ] Implement minimal worker, then targeted emulator tests and backend npm test. Fresh independent whole-change review, one fix pass with RED/GREEN, then scoped local commit. No push or enablement.

Task 2 completed locally: focused emulator tests 18/18; final backend suite 142/142, zero skips. Independent review finding fixed with lease-expiry regressions. See WORKPLACE-WORKER-PROGRESS.md for evidence and limitations. The unchecked detailed task list above is retained as the original acceptance checklist; this completion record reports the verified stage outcome.

## Subsequent gates, explicitly outside this stage

Pricing contract for a real sender; structured workplace detector and safety-example human review; retention and false-positive handling; coordinator queue/notifications/access tests; authorized immediate dispatcher and 15-minute recovery wiring; student/native tests and staged release. Resolve budget reset time before exposing it to users. A synthetic injected-analyzer worker is not a deployed Claude feature.

Plan requires user approval before implementation. The 7-day pricing review expiry, 90-second lease and five-job batch are proposed engineering defaults; the existing two-attempt cap and 15-minute target reflect the agreed bounded-retry design. Keep all previously uncommitted journal scoring/UI edits out of this stage's commit.
