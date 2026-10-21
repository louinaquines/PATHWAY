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
- Backend `npm test`: **99/99 passed**, using only pinned synthetic Auth/Firestore emulators and local service fixtures.
- Portal `npm test -- --runInBand`: **171/171 passed**, 42 suites.
- Production packaging preflight tests: **8/8 passed**. Dockerfile includes the new installer module.
- Synthetic portal development-mode build succeeded. Existing large-chunk warning remains; this is not an APK or deployment.
- Synthetic scan test covered 27 students over two normal batch calls; repeat completion did not advance scan version or add notices. Local HTTP fixture completed through one transient 503 and two successful batch responses (3 total requests). Separate tests stopped at 20 attempts, at the time budget, at pending backlog and immediately on authentication failure. These are observed bounded behaviors, not a billed Firestore read measurement or a school-wide capacity claim.
- Full source review pending at this point; any findings/fixes are recorded below before final handoff.

Logs are retained in this worktree's ignored `.superpowers/sdd/2026-10-21-AUTOMATIC-ATTENDANCE-CHECKS-PLAN/` directory: final-backend.log, final-web.log, final-packaging.log, final-web-build.log, and focused RED/GREEN runs. Counts overlap focused checks; do not sum them as distinct tests.

## Not live / release gates

No push, merge, hosted setting, account, credential, production dataset, paid resource or deployment was changed. No preview APK was built. Before activation, confirm a synthetic-only Firebase project, configure the secret on both sides, integrate and deploy the reviewed code/indexes, and observe an actual scheduled run. An actual container build/startup and deployed index behavior remain unverified here; local packaging validation is narrower.

Free-host execution may be delayed or unavailable. GitHub job allowances and Firestore billed reads/quota must be monitored during a synthetic hosted rehearsal. No continuously monitored service, immediate response, exact-time guarantee or large-student-load guarantee is claimed. The coordinator status describes processing, not universal correctness/availability of each student's attendance inputs.

See 2026-10-21-AUTOMATIC-ATTENDANCE-CHECKS-PLAN.md for the activation/disable runbook and MANUSCRIPT-CHANGE-CHECKLIST.md for paper changes.
