# Automatic attendance checks — local acceptance

Date: 2026-10-21. Base: bcc85c1. Scope: automatic-only synthetic capstone demonstration, in the isolated attendance-schedule worktree.

## Implemented

- Scheduled-only GitHub workflow, targeting minute 15 hourly. The server chooses the Philippine due context (00:15 cutoff), not client-supplied dates.
- Default-off, exact demo-project pin and dedicated scheduler secret. Ordinary remote/manual evaluation remains prohibited; no coordinator run button.
- At most 25 normal students plus 3 retry records per batch, durable scan progress, expiring lease with ownership checks before writes, daily scan restart and idempotent notices.
- Once the normal scan is complete, a bounded retry pass runs at most once per hourly window. Pending failures stay visible and do not advance last success. A new day cannot inherit an incomplete tail and claim its earlier students were checked.
- Read-only, fresh-authorized coordinator operational status in Analytics. It reveals no student IDs, names, counts, raw source data, credentials or internal errors. Old UI requests are discarded on scope changes.
- HTTP client: HTTPS origin only, no redirects, empty body, at most 20 total attempts, bounded transient retries and 90-second request/body timeout within a 13-minute budget. Job cap 15 minutes. Incomplete work fails visibly and resumes through a future schedule.
- No new runtime dependencies, AI calls, email or thick-border card styling.

## Verification observed

- Tests were written first: initial worker, endpoint, status route, UI and client checks failed on missing behavior before implementation. Endpoint tests additionally encountered a sandbox loopback EACCES restriction; authorized local run passed. Parser-only null rejection was separated from route validation in test setup; production parser was unchanged.
- Final backend `npm test` after the review fix: **100/100 passed**, using only pinned synthetic Auth/Firestore emulators and local service fixtures. The pre-review run passed 99/99; counts overlap and must not be added.
- Portal `npm test -- --runInBand`: **171/171 passed**, 42 suites.
- Production packaging preflight tests: **8/8 passed**. Dockerfile includes the new installer module.
- Synthetic portal development-mode build succeeded. Existing large-chunk warning remains; this is not an APK or deployment.
- Synthetic scan test covered 27 students over two normal batch calls; repeat completion did not advance scan version or add notices. Local HTTP fixture completed through one transient 503 and two successful batch responses (3 total requests). Separate tests stopped at 20 attempts, at the time budget, at pending backlog and immediately on authentication failure. These are observed bounded behaviors, not a billed Firestore read measurement or a school-wide capacity claim.
- One independent read-only review found no Critical issues and one Important restart/checkpoint defect. The reviewer reproduced the issue; the emulator regression also failed before the fix. A completed-scan shortcut now reconciles durable success if a previous process committed its final retry and stopped before finalization. The regression and full post-fix backend suite passed (100/100). No additional review minors were identified. Portal/build results above remain applicable: their source was unchanged by this backend-only fix.

Logs and the completed ledger are retained in this worktree's `output/release/automatic-attendance-checks-verification/` directory: review-fix-green-backend.log (final 100/100), final-backend.log (earlier 99/99), final-web.log, final-packaging.log, final-web-build.log, and focused RED/GREEN runs. The plan's temporary execution workspace was moved there without deleting evidence. Counts overlap focused checks; do not sum them as distinct tests.

## Not live / release gates

No push, merge, hosted setting, account, credential, production dataset, paid resource or deployment was changed. No preview APK was built. Before activation, confirm a synthetic-only Firebase project, configure the secret on both sides, integrate and deploy the reviewed code/indexes, and observe an actual scheduled run. An actual container build/startup and deployed index behavior remain unverified here; local packaging validation is narrower.

Free-host execution may be delayed or unavailable. GitHub job allowances and Firestore billed reads/quota must be monitored during a synthetic hosted rehearsal. No continuously monitored service, immediate response, exact-time guarantee or large-student-load guarantee is claimed. The coordinator status describes processing, not universal correctness/availability of each student's attendance inputs.

See 2026-10-21-AUTOMATIC-ATTENDANCE-CHECKS-PLAN.md for the activation/disable runbook and MANUSCRIPT-CHANGE-CHECKLIST.md for paper changes.

## Implementation choices and remaining costs

- Reused installed dependencies through worktree junctions rather than reinstalling/changing packages. If those shared dependencies change, repeat verification in a fresh environment.
- Kept the status display and workflow HTTP client in small separate files so their behavior could be tested without changing the existing layout. Cost: two small modules to maintain.
- Combined worker/status implementation into one commit because they share the installer and fixture. Cost: coarser commit granularity, not loss of test coverage.
- Retained the demo's three-record hourly retry pass after the normal scan completes. Cost: a large failure backlog can take multiple hours; pending status is intentional.
- Reported actual synthetic batch/request behavior, not invented billed Firestore reads. Cost: real free-tier allowance/capacity remains unproven until a separately approved synthetic hosted rehearsal.
- Review did not dynamically assess live delivery/cold starts, credentials/project/data isolation, deployed indexes/contention, actual container startup, billed capacity or browser rendering/accessibility. Cost: those remain release gates; the unchanged attendance calculator and optional AI/email behavior were not newly reviewed by that reviewer, although existing regression suites ran.
