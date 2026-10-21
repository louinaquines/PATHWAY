# Automatic Attendance Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically evaluate attendance risk for the synthetic capstone demonstration, without a manual check button or paid hosting.

**Architecture:** Proposed builder choice: a scheduled GitHub Actions job calls a narrowly scoped, authenticated backend endpoint. The existing worker retains transactional state, notice deduplication and durable retries. The schedule targets the new due context at 00:15 Philippine time; hourly invocations resume incomplete work, rather than trusting a timer inside a sleeping Render instance.

**Tech Stack:** Existing Node/Express, Firebase Admin/Firestore, React, GitHub Actions; no new runtime dependency.

**Spec:** Scope and design below; existing attendance rules remain in MANUSCRIPT-CHANGE-CHECKLIST.md.

## Scope and approval

The user approved automatic checks, free hosting, synthetic accounts only and no manual button. This document proposes the remaining execution/security choices for review before implementation. It does not authorize paid services, access to real student records, deployment, secret changes or a preview APK.

## Design

- Use GitHub's scheduled workflow at minute 15 each hour (UTC); the server calculates the Philippine due date. The first target after midnight PH is 16:15 UTC on the previous calendar date. Delayed/missed triggers are possible; exact-time delivery is not promised.
- One completed normal student scan per due date. Resume the durable cursor after interruption. Retry failures on later scheduled invocations, with a bounded retry pass so a persistent bad record cannot spin indefinitely.
- Each HTTP invocation processes one existing batch of at most 25 normal students, plus the existing bounded retry allowance. The workflow makes at most 20 sequential batch requests per invocation window, with a 15-minute job timeout. Unfinished work stays pending for the next hourly run. These are builder-proposed demo budgets, not a claim of 500-student capacity.
- Authenticate POST /internal/attendance-risk/run using a dedicated high-entropy bearer secret held only in GitHub/Render secret settings. Timing-safe verification; default-off; no body/query time, project, student or batch overrides. No student identifiers, credentials or raw records in responses/logs. Invalid authentication causes no Firestore access. Rate-limit authenticated calls and use a durable lease to prevent simultaneous scan ownership.
- Hosted execution requires an explicit demo-only enable flag AND an exact allowlisted Firebase project ID. Keep local emulator checks intact. Do not make all production environments eligible merely by loosening localFirestore(). Demo data/project isolation must be confirmed before activation; otherwise leave hosted execution disabled.
- Server derives all evaluation times. Preserve existing source authorization, transactional source reads, retry persistence and deterministic notices. No Claude calls or emails.
- Persist last attempted run, last completed normal scan, due date, pending retry state and sanitized operational error. Mark a run fully successful only after its normal scan and pending retries have completed; incomplete/failed batches must not advance the success timestamp.
- Add a read-only coordinator Analytics status showing last successful check and pending/delayed/unavailable state. Require fresh approved-coordinator authorization; return no cross-section counts, names, identifiers or sensitive error messages. Global scan completion is operational status only, not a promise that every student's inputs are verifiable. No manual trigger in UI.
- Workflow permissions: contents: read only; fixed HTTPS backend URL supplied through configuration; no pull-request trigger and no manual workflow_dispatch. Concurrency prevents overlapping workflow runs. Avoid printing response bodies or secrets; respect bounded transient retries and fail visibly when the host cannot be reached.
- Deployment and secret provisioning are separate activation steps. Add no credentials to source or this document. Stop and report any missing access/approval; do not claim the schedule is live from local tests.

## Global Constraints

- Synthetic demonstration accounts only; no real student use before school adoption.
- Existing attendance thresholds, due time and in-app-only notification rules stay unchanged.
- No manual check button, paid resource, email, APK or unrelated placement UI edits.
- No fabricated success or exact-time guarantee; free-tier quota/capacity must be measured.
- Protect existing uncommitted work; implement in an isolated checkout.

## Review Focus

1. A sleeping/unreachable backend must leave recoverable progress and visibly fail the scheduled job.
2. Parallel calls/restarts must not skip students or duplicate notices.
3. Pending retries must not be hidden behind a misleading success timestamp.
4. Wrong credentials/project or unapproved coordinator must fail closed without data leakage.
5. Crossing 00:15 during a partial scan must not report the new due date complete without visiting its earlier students.

## Task 1: Bounded scheduled worker and secure hosted entry point

**Files:** Modify PATHWAY-backend/attendanceRiskAlerts.js and server.js; create PATHWAY-backend/attendanceRiskSchedule.js and security-tests/attendance-risk-schedule.test.js; extend security-tests/attendance-risk-alerts.test.js; update Dockerfile packaging.

**Interfaces:** POST /internal/attendance-risk/run accepts an empty object and returns only `{ status, hasMore, pendingRetries, dueDate }`, with no record counts or student IDs. Extend worker checkpoint semantics to distinguish daily scan completion from cursor rollover. Export installAttendanceRiskSchedule({ app, db, worker, clock }) from the new module.

- [ ] Write failing tests for default-off, invalid/missing secret, mismatched project, nonempty input, production/emulator guard separation, lease overlap/expiry, partial scan restart, due-boundary rollover and retry-only continuation.
- [ ] Run the new Node tests and the existing emulator alert tests; confirm failures are specific to missing scheduling behavior.
- [ ] Implement the authenticated entry point and minimal worker/checkpoint extension, preserving existing local guards. Add copied module to Docker packaging.
- [ ] Re-run focused tests: unauthorized requests perform no Firestore I/O; interruptions resume; repeated/parallel requests produce one notice per transition; unfinished retries never mark full success; a new due context covers the entire student scan.
- [ ] Commit only task files.

## Task 2: Automatic workflow and visible coordinator status

**Files:** Create .github/workflows/attendance-risk.yml; modify PATHWAY-backend/attendanceRiskSchedule.js, PATHWAY-web/src/pages/AnalyticsTab.js and AnalyticsTab.test.js; use existing Analytics stylesheet and request helper.

**Interfaces:** GET /coordinator/attendance-risk-status returns `{ status, dueDate, lastAttemptAt, lastSuccessfulCheckAt }`; timestamps nullable ISO strings. Status is disabled, pending, complete or unavailable. No manual run route is exposed to coordinators.

- [ ] Add failing status authorization/projection tests and UI tests for disabled, null history, pending, complete, request failure, and actor/section changes rejecting stale responses.
- [ ] Implement the status route and compact status text using the current portal UI, without new card decoration or thick left borders.
- [ ] Add the scheduled-only workflow with least permissions, a fixed configured HTTPS endpoint, concurrency, strict request limits/timeouts and a bounded HTTP retry policy. Keep it inactive until configuration is verified; missing configuration fails clearly without requests.
- [ ] Test workflow request-budget/timeout behavior with a local synthetic HTTP fixture, including cold-start timeouts, 401/403 (no retry), transient failures, incomplete work and exhausted budget. Never hit hosted student APIs during tests.
- [ ] Run the focused Analytics Jest tests and scheduling Node/emulator tests. Commit only task files.

## Task 3: Verification and activation handoff

**Files:** Update project-notes/ATTENDANCE-INTEGRATION-2026-10-21.md and project-notes/MANUSCRIPT-CHANGE-CHECKLIST.md; add a short activation/runbook section here.

- [ ] Perform one final applicable backend/portal regression run and production packaging check. Use synthetic records only; record actual results and measured read/request usage without claiming a school-wide capacity guarantee.
- [ ] Perform one independent final review focused on credentials, project isolation, cursor rollover, lease recovery and truthful status. Avoid repeated broad review loops.
- [ ] Document automatic processing versus optional AI, free-host scheduling delays, last-success semantics, demo-only scope and outstanding container/index verification.
- [ ] Hand off required GitHub/Render configuration for separate approval. Confirm exact demo project and synthetic dataset before enabling hosted execution. No deployment or account/settings changes in this implementation phase.

## Approval and implementation status

Approved by the user with “Proceed.” Implementation is isolated in the attendance-schedule worktree. The automatic workflow, authenticated endpoint, bounded worker and status UI are implemented; final verification/review evidence is recorded in the acceptance note. Hosted execution remains disabled. No settings, secrets, paid services, deployment or APK have changed.

## Activation runbook — separate approval required

1. Confirm the exact Firebase project is isolated for synthetic capstone accounts. Do not point this feature at existing real student records. Record that decision without listing account data.
2. Integrate/review the branch, deploy required Firestore indexes and verify the backend container can start. Local packaging checks do not substitute for a real container startup.
3. Generate a dedicated cryptographically random 32-byte hex secret outside source control. Store the same value as ATTENDANCE_SCHEDULE_SECRET in Render and GitHub Actions secrets. Never put it in a frontend variable, URL, repository file, chat, log or screenshot.
4. Configure Render ATTENDANCE_DEMO_PROJECT_ID to the confirmed project, and only then set ATTENDANCE_DEMO_SCHEDULE_ENABLED=1. Keep ATTENDANCE_RISK_ALERTS_ENABLED unset/0; the local continuous timer is not the hosted scheduler. No production credentials are needed on GitHub: only the narrow scheduler bearer secret.
5. On GitHub, set ATTENDANCE_BACKEND_ORIGIN to the deployed HTTPS backend origin (no path/query/userinfo), and set the repository variable ATTENDANCE_DEMO_SCHEDULE_ENABLED=1 last. Workflow must be on the default branch. This is scheduled-only, with no manual dispatch or UI button.
6. Wait for an actual automatic run. Verify its safe workflow result and coordinator last-success status using synthetic accounts. Test a failed/interrupted run before claiming hosted reliability; recheck project isolation before any future school adoption.
7. To disable: turn off the GitHub enable variable and Render demo flag. Rotate/revoke the scheduler secret if exposure is suspected. Do not delete attendance records or notices as a disabling step.

Known limits: GitHub schedules can be delayed, dropped or disabled by platform policies; Render free instances sleep. Check Actions activity/allowances before the defense. The client makes at most 20 total HTTP attempts and stops after 13 minutes (15-minute job cap); each batch covers up to 25 normal students. After the normal daily scan finishes, only one bounded pass of up to 3 retry records is attempted per hourly window. Backlog remains visible/pending and the job fails visibly rather than fabricating success. These budgets are demo safeguards, not measured school-wide capacity or uptime guarantees. A completed scan can still contain students with unavailable inputs; completion means processing finished, not that every student is Low risk or verified.

Official references checked during implementation: [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [GitHub secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets), [Render free limitations](https://render.com/docs/free).
