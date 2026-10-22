# Workplace local browser walkthrough — 2026-10-22

Scope: approved synthetic-only walkthrough of local integration commit cb2ded5. No product-code changes, deployment, paid/provider calls, external emails, production records or APK.

## Environment

Started the existing pinned demo emulator workflow after no app listeners were found. It restored the prior saved synthetic QA snapshot, not production Firebase. Student app: localhost:8083; coordinator portal: 127.0.0.1:3001; backend: 127.0.0.1:3100. Used only documented synthetic approved-student and coordinator accounts.

Playwright CLI was unavailable because npm registry DNS resolution failed; browser interaction used the connected in-app browser's Playwright locators/accessibility controls instead. This is a real browser walkthrough, not a new CLI/test-runner suite.

## Observed results

1. Coordinator login succeeded; Workplace concerns navigation opened the actual local private screen. Automatic-analysis-off and empty-results-do-not-prove-safety warnings were visible.
2. Student initially showed a stale-session restoration error. The visible Go to sign in recovery path succeeded with the synthetic account; dashboard and Logbook became usable. The initial stale-session cause was not diagnosed or changed.
3. Consent loaded off without automatic enrollment. Submitted one clearly labeled synthetic journal (8 hours); it appeared as Week 2, Under Review with an ISO reporting period. Demo DB verification: analysisStatus not-enabled, sourceRevision 1, no analysis job for that entry.
4. Explicitly opted in using Allow future analysis; submitted a second clearly labeled synthetic journal (8 hours). The success UI truthfully said analysis was queued and automatic processing inactive. Demo DB verification: one queued job with attempts 0; no provider processing.
5. Withdrew consent through the actual UI; it returned to analysis off. Demo DB confirmed granted false. The unsent job remains queued until a worker's consent check cancels it; withdrawal is not proof of immediate queue-state rewriting. No worker was invoked.
6. Manually seeded one explicitly labeled fictional concern and private notice in the demo DB, separate from the submitted journals, solely to exercise review UI. This was not an AI-generated result or evidence of automatic routing from submission.
7. Coordinator refreshed, opened details through the actual API, and marked the notice read. The case remained open. Record review succeeded; failed contact stayed open for follow-up and did not unlock resolution. Successful simulated contact, simulated action and a resolution reason then produced resolved state. No real contact or email occurred.
8. Demo DB confirmed reviewed/contacted/acted true; ordered history review → contact(failed) → contact(success) → act → resolve; evidenceDeleteAt is exactly 90 days after closedAt. No evidence purge was run. A screenshot was visually inspected in the browser tool; no screenshot file is claimed as a saved artifact.
9. Coordinator signed out after testing. Saved QA snapshot was verified before stopping only the walkthrough's inspected launcher process and child services. No test records were deleted; two synthetic journal entries and one resolved synthetic concern/notice remain in the recoverable demo snapshot.

## Evidence and limits

- Startup log: output/release/workplace-browser-workflow.log. Backup log: workplace-browser-backup.log. Verified snapshot: PATHWAY-backend/.emulator-data/2026-10-22T15-01-39-574Z-f745afc1.
- Windows Firebase CLI emitted a libuv shutdown assertion after exports; the existing backup wrapper verified complete snapshot files. This is a tooling warning, not a failed application operation or confirmed production outage.
- Existing code verification remains 187/187 backend and 201/201 web tests plus 5 bundler tests; no full suites were rerun for this browser/data-only task.
- Not checked in this walkthrough: native Android/iOS, small-screen responsiveness, network-failure recovery, transfer during a live browser request, false-positive dismissal, expiry/purge execution, hosted dispatcher or deployed clients. Automated regressions cover several of those separately; do not substitute them for device/production acceptance.
- The browser's visible final resolved state verifies this seeded human-review fixture only. Automatic submission-to-AI-to-alert processing remains off and is still a separate integration/release gate. Direct Get workplace support remains separate parked work.
