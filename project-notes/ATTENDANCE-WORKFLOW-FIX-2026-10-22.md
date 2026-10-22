# Attendance scheduler checkout fix — 2026-10-22

User authorized a workflow-only fix and publication, without publishing local journal changes. No manual attendance run, production record access, email, secret-value reads or settings changes are included.

## Cause

Natural scheduled run 39723801610 failed in actions/checkout before the processing step. Checkout fetched ed9319c successfully, then its Git auth cleanup failed: No url found for submodule path output/release/placement-gate-archive-v3 in .gitmodules. The processing step was skipped. This does not establish a backend outage or a failed attendance calculation.

The pinned checkout v4.2.2 source unconditionally traverses submodules when removing Git auth; setting submodules false does not avoid that path. Existing archive gitlinks and local archive contents are preserved, not deleted or rewritten.

## Small scoped correction

Based the isolated codex/attendance-workflow-fix branch on remote main ed9319c243a0891e120d21f2fc0eccf050984636, not local main's journal integration.

Replace checkout with one read-only GitHub contents API request for .github/scripts/attendance-risk-run.cjs at the run's exact GITHUB_SHA. Use the runner's built-in gh client and temporary read-only GitHub token only in the loading step. Save only that script under RUNNER_TEMP, then execute it in the processing step. Backend secret is supplied only to processing. Download failure fails the step; processing is skipped. Loading is capped at one minute.

No changes to cron, job enablement, concurrency, job budget, scheduler algorithm, backend origin, shared secret or archive data. No dependencies added. Publication is limited to .github/workflows/attendance-risk.yml and its .github/scripts/attendance-workflow-loader.test.cjs regression test.

## Evidence

- Existing scheduler tests: 6/6 passed before editing.
- New loader tests: both failed before checkout was replaced.
- After correction: 8/8 passed, executing the real YAML shell commands with a synthetic gh API boundary. Exact commit/ref and host are checked; a partial download exiting 23 does not execute processing.
- Real GitHub content API read at ed9319c matches the unchanged scheduler script, without executing it. Raw bytes 2832, SHA256 66a20ac84d9b6b86a3fd0ebc0938e6450a97a4cc1d6ebd8a2de13947645c17e9. No credential values or student records printed.
- git diff --check passed.
- Focused independent review: no Critical or Important findings. Deferred minor: the synthetic harness runs both shell steps in one process, so it does not establish real GitHub Actions environment isolation; the actual YAML scopes GH_TOKEN to loading and the backend secret to processing, as confirmed in review. No claim that synthetic tests validate Actions internals.
- Published remote main commit ee8f55af35908eda38884cc50c765a9bb327db74, parent exactly ed9319c. GitHub's commit API confirms only the two .github files changed. Journal/backend/portal runtime source was not published.
- Integrated the same fix into local main as 594e8b9, no conflicts. Merged-result eight-test suite passed again; diff --check passed. Existing unrelated primary edits remain unstaged.
- GitHub workflow state is active. Latest visible natural run remains 39723801610 on old ed9319c; no run of the new revision was visible at handoff. Do not claim successful live processing or verified matching scheduler secrets yet.

## Limits

Local/synthetic tests do not establish a completed live attendance scan or matching deployed scheduler secrets. Do not manually rerun the worker: preserve automatic-only scheduling. Wait for a subsequent natural scheduled run after publication. Journal code remains local and must not be bundled into this push.

No manual GitHub run/rerun or authenticated worker request was invoked. No Render/Firebase deployment command, account/configuration edit, credential-value read, production record request or email action was performed. A repository-connected host may independently react to the approved commit; application source at the published revision is unchanged.

References: https://github.com/louinaquines/PATHWAY/actions/runs/39723801610 ; https://docs.github.com/en/rest/repos/contents#get-repository-content ; https://raw.githubusercontent.com/actions/checkout/11bd71901bbe5b1630ceea73d27597364c9af683/src/git-auth-helper.ts .
