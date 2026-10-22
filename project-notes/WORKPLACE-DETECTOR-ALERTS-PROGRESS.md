# SDD ledger — plan: project-notes/2026-10-22-WORKPLACE-DETECTOR-ALERTS-PLAN.md

Approved 2026-10-22; baseline 9c69812. Local synthetic implementation only; no provider, deploy, APK or live registration.

## Tasks

- Task 1: complete — missing-module RED then 4/4 pure contract tests GREEN. Synthetic scenario fixtures are not accuracy evidence.
- Task 2: complete — missing-module RED, transaction/privacy/reassignment tests GREEN. Existing price-brake branch required carrying control lease data into the tightened final check; existing regression exposed this before correction.
- Task 3: complete — missing-module RED then authorization/workflow/expiry tests GREEN. Pagination test IDs corrected to sort before the generated case ID; no production change was required for that fixture error.
- Task 4: complete — component tests RED/GREEN, independent review corrections and final full suites passed. Local-only scoped commit; no push or hosted registration.

## Pre-flight

- Task 1 → 2: canonical decision is validated against current raw source; worker keeps usage-only backward compatibility.
- Task 2 → 3: private case ID, current student/section assignment and optimistic version are shared; recipient snapshot is not access authority.
- Task 3 → 4: authenticated POST reads return only projected data; no excerpts in list or notices.
- Ruling: use the existing checkout and project-notes ledger per user preference; keep unrelated changes untouched. Cost: integration remains local and must be explicitly released later.
- Ruling: the plan's pure request contract is not a real Claude sender or verified token bound. Tests prove request/decision validation, not detection accuracy. Real provider integration remains gated.
- Baseline full backend suite: 142/142 passed (output/release/concern-baseline.log).
- Resumed focused backend integration: 38/38 passed, zero skips (output/release/concern-focused-second.log). Added further coverage for expiry during case planning and cleanup racing an action; final suite must include it.
- Request validation already rejects prototype-named actions with 400; regression test confirmed this without a code change.
- Usage-limit interruption prevented two planned test commands from starting; they were explicitly rerun after resumption. No provider calls, production enablement or deployments occurred.

## Independent review and one fix pass

- Reviewer found three important issues: stale-version draft recovery, inaccessible later notice pages, and two fault-injection wrappers omitting projectId. No critical issue reported.
- Draft conflict recovery now has an explicit selected-case refresh that keeps the note and obtains the current version; it never automatically retries a changed action. Notice pagination now consumes actor-scoped cursors, including empty authorized pages.
- UI regressions first failed 3/8, then the final complete web suite passed **193/193 across 44 suites** (output/release/concern-web-final.log).
- Reclassified the review's in-flight editable-note minor as important because completion could discard newly typed text. The note field is now disabled while sending; its regression failed before correction.
- Strengthened the two fault tests to assert that the injection hooks actually executed. Both failed before preserving the demo project identity in their DB wrappers; focused GREEN verification passed **40/40**, zero skipped (output/release/concern-review-backend-green.log).
- Ruling: semantic High/normal accuracy, real provider bounds, hosted registration and device/browser end-to-end remain release gates, not claims established by synthetic contract tests. Cost: this stage is not a live Claude detector or released emergency-support feature.
- Final review: one independent review; corrections verified by regression tests, no repeated review requested. No deferred minors: the editable-draft finding was reclassified and fixed because of possible text loss.

## Final evidence

- Full backend `npm test`: **164/164 passed, zero failures/skips**, exit 0 (output/release/concern-backend-final.log).
- Full web `CI=true npm test -- --watchAll=false --runInBand`: **193/193 passed across 44 suites**, exit 0 (output/release/concern-web-final.log).
- Focused backend including corrected fault hooks: **40/40 passed**, zero skips (output/release/concern-review-backend-green.log).
- Scoped whitespace check passed. No real Claude/token-count calls, student records, production writes/settings, emails, push/deployment, hosted cleanup/dispatcher, preview APK, device/browser E2E or visual build validation in this stage.
- The detector is a pure request/decision contract integrated with synthetic worker responses; it is not a live provider or a demonstrated language/safety classifier. Private routes and UI are deliberately not registered in the hosted app. Keep those limitations in the paper.
