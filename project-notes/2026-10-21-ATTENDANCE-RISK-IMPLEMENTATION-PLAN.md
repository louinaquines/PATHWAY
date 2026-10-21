# Attendance Risk and Coordinator Alerts Implementation Plan

> For agentic workers: use subagent-driven-development or executing-plans task by task, with TDD and independent final review. Do not start implementation until the planning decisions below are confirmed.

**Goal:** Implement the approved Low/Medium/High attendance-risk rules and private, deduplicated coordinator alerts locally.

**Architecture:** A pure deterministic calculator feeds both analytics and a bounded daily evaluation worker. Persist risk episodes and notifications transactionally in backend-owned collections; authorize reads using current section assignment, never historical recipient identity alone. No AI call is needed for calculation or notification.

**Tech stack:** Existing Node/Express, Firebase Admin/Firestore, React portal and existing test emulators. No new dependency required.

**Spec:** `project-notes/MANUSCRIPT-CHANGE-CHECKLIST.md`, approved baseline rules. Operational choices below are proposals, not silently approved policy.

## Global constraints

- Local synthetic development only; no production deployment, paid provider call, email, or preview APK.
- Preserve the separately parked workplace-support worktree. Do not merge or change it for this phase.
- Preserve primary-checkout placement UI changes, document moves and health-monitor evidence.
- Code, not Claude, determines risk and numerical metrics. AI explanations remain optional and user-triggered.
- Latest20 eligible scheduled workdays; exclude today, holidays, approved leave and non-working exceptions. Percentages require5 eligible days.
- Low: at least90% and no higher trigger and feasible completion; Medium:80% to below90%,2 consecutive unexplained absences, or projected shortfall; High: below80%,3 consecutive unexplained absences, or overdue incomplete hours. Highest established trigger wins.
- Completed is progress state separate from risk; insufficient/unreliable data must not become Low or an invented absence.
- Use authoritative credited totals and per-day credited history, never add journal totals or infer credit from raw elapsed shift time.
- In-app coordinator alerts only; no grading, placement, approval, clearance or attendance mutations.
- Reassignment revokes future access to historical alerts; marking read is not acknowledgment/resolution.

## Inspected baseline

- `PATHWAY-backend/attendanceAnalytics.js`: existing28-calendar-day calculation, On Track/High Risk/Completed/Unavailable; projection currently treats shortfall as High.
- `PATHWAY-backend/attendanceAiReview.js`: shared loader queries28 days; maps completed record.hoursToday into creditedHours. Verify authoritative writer semantics before calling these verified credits.
- `PATHWAY-backend/coordinatorAnalytics.js`: analytics read/schedule write and summary counts; no automatic risk-notification worker.
- `PATHWAY-web/src/pages/AnalyticsTab.js`: existing analytics consumer; keep current visual language.
- `firestore.rules`: generic notifications permit historical recipient reads; do not put protected risk history in that collection without fixing all applicable access paths.
- Primary checkout has unrelated changes. No product files changed during this planning step.

## Operational decisions approved for local implementation

Approved by the user with “proceed” on 2026-10-21. Work is isolated from the parked workplace-support feature and primary checkout.

1. Daily evaluation: propose00:15 Philippine time, assessing dates strictly before the current date. Excluding today prevents premature absence claims; midnight also avoids guessing a universal shift-closing time. Overnight unresolved shifts remain uncertain. Workers catch up once on startup for the latest due date, not a historical alert storm.
2. Uncertain days: propose no percentage classification when an eligible day has a missing checkout, duplicate or invalid punches. Show Needs verification; retain separately established High triggers such as overdue incomplete totals, without treating uncertain days as absences or sending a recovery notice.
3. Projection: propose verified credited hours in the previous28 completed calendar days divided by eligible scheduled days in that interval; require at least5 eligible days and complete reliable credit coverage, counting confirmed absences as zero. Project remaining credit over future scheduled days. Zero reliable velocity with remaining work means projected shortfall (Medium unless a higher trigger applies), not a fabricated completion date. Missing reliable credit coverage means unavailable projection and prevents Low.
4. Leave: no approved-leave contract was established in the inspected loader. Propose a coordinator-only per-student excused-date list with bounded validation and audit, explicitly excluded from attendance and projection denominators. This needs a small editor/API and fresh assignment authorization; no leave-request workflow is implied.
5. Recovery: propose one recovery notice only when a previously open episode reaches reliably established Low or completed progress. Unknown/Needs verification pauses classification and does not resolve the episode. Medium after High updates the episode without another escalation alert. A later rise back to High alerts once per distinct transition, transactionally.

## Review focus

1. Missing checkout/duplicate records cannot produce false absence, Low, or recovery; Task1 tests uncertain inputs.
2. Twenty workdays can span more than28 calendar days; Task2 tests sparse schedules and bounded loading.
3. Retry/concurrent workers cannot duplicate notices or overwrite newer evaluation; Task3 tests transactions and ordering.
4. A coordinator changed during evaluation/read must not receive private student details; Task3 tests assignment races and historical notice access.
5. Restarts, sleeping hosts and missing configuration cannot silently promise daily alerts; Task3 tests disabled/default/local worker modes and documents operational limits.

### Task 1: Deterministic calculation and rule version

**Files:** modify `PATHWAY-backend/attendanceAnalytics.js`; extend `security-tests/attendance-analytics.test.js`.

**Interfaces:** `attendanceAnalytics({creditedHours,requiredHours,records,schedule,today,excusedDates=[]})` returns existing numeric metrics plus `ruleVersion:'attendance-risk-v1'`, `riskTier:'Low'|'Medium'|'High'|null`, `progressStatus:'In progress'|'Completed'`, `dataStatus:'Ready'|'Insufficient data'|'Needs verification'|'Unavailable'`, structured reason codes and observation counts. Keep legacy display risk/status only as an explicit compatibility projection; do not mix Completed into riskTier.

- [ ] Write failing boundary tests:18/20=90% Low with feasible projection;17/20 Medium;16/20 Medium;15/20 High;2/3 consecutive unexplained absences; overdue; completed; fewer than5 days; holidays/leave/today; uncertain punches; zero velocity; missing reliable credit history. Assert no input mutation or credited-total change.
- [ ] Run `node --test security-tests/attendance-analytics.test.js`, observe actual missing-behavior failures.
- [ ] Implement approved thresholds, deterministic Philippine-date arithmetic, highest established trigger and explicit uncertainty. Compare exact percentages before display rounding.
- [ ] Rerun focused tests; commit only calculator/tests after review-ready evidence.

### Task 2: Reliable inputs and analytics integration

**Files:** modify `PATHWAY-backend/attendanceAiReview.js`, `coordinatorAnalytics.js`, `anthropicAnalysis.js`; tests `attendance-ai-review.test.js`, `coordinator-analytics.test.js`; create focused loader tests if existing mocks cannot verify query bounds. If decision4 approved, create `attendanceExcusedDates.js` and its security tests.

**Interfaces:** `loadAttendanceMetrics(ref,student,section,today)` uses Task1 calculator, loads enough dates for both20 workdays and28-day velocity, fails explicitly when supported bounds are exceeded. Excused-date storage belongs to users' backend-owned attendance policy, not client attendance writes. Exact field contract is fixed before writing its migration/editor.

- [ ] Inspect authoritative attendance/hour writers and approved-leave representations; document source semantics. Missing totals must not silently become zero.
- [ ] Write/run failing sparse-calendar, missing-credit, malformed-date, eligibility and assigned-coordinator tests. Verify loader doesn't accept arbitrary client metrics.
- [ ] Integrate calculator using bounded data reads, no last28-days-only truncation of20 workdays. Return both explicit data completeness and tiers; update summary counts and optional AI aggregate allowlist without activating AI.
- [ ] If excused-date editor is approved, validate real unique dates/max366 and fresh role/department/section in transaction; audit changes without unrelated student fields. Test foreign coordinator/admin/client-write denial.
- [ ] Run focused Node/security tests and record commands/results; scoped commit.

### Task 3: Private risk episodes, notices and daily evaluation

**Files:** create `PATHWAY-backend/attendanceRiskAlerts.js`, `security-tests/attendance-risk-alerts.test.js`; integrate `server.js`, restrictive `firestore.rules`, additive `firestore.indexes.json`, test discovery where required.

**Interfaces:** `installAttendanceRiskAlerts({app,db,requireStaff,allowRate,audit,clock})` exposes protected `GET /coordinator/attendance-risk-notices?cursor=...` and `POST /coordinator/attendance-risk-notices/:id/read` with no client control of recipients/tiers. Returns bounded `{records,hasMore,cursor}`; opaque scoped cursors, no denied identifiers. Separate backend-only `attendanceRiskStates` and `attendanceRiskNotices`; generic notice title, report-free aggregate reasons, no raw punches/location/private narratives. Worker entry `evaluateDueAttendanceRisk({now,batchSize})` is testable without timers and never writes attendance.

- [ ] Write/run failing emulator tests for first Medium/High, escalation, recovery, repeat same date/version, concurrent workers, late stale evaluation, unavailable data, no recipient, transfer during work, changed department and old notice access.
- [ ] Transactionally re-read policy/assignment/version before committing evaluation+notice. Store episode/transition identity and last evaluated date; reject older snapshots. No read-route side effects or per-page-open alerts. Acknowledgment is not resolution.
- [ ] Wire a bounded persisted scan/cursor and retryable queue with server-only enablement. Default off outside explicit local test mode until release approval. Manual local invocation tests must not enable production. No public trigger endpoint.
- [ ] Test denied direct Firestore writes/reads, refreshed authorization, worker failure/restart and pagination. Document target scheduling/always-running requirements and pending notification transfer behavior.
- [ ] Run full backend security suite and focused calculator tests; scoped commit with complete logs.

### Task 4: Coordinator UI and complete local verification

**Files:** modify `PATHWAY-web/src/pages/AnalyticsTab.js` and `.test.js`; integrate protected risk notices in `NotificationsTab.js` and `.test.js`; optional excused-date editor per decision4. Update affected styles only, existing theme/components; create dedicated panel only if needed to keep responsibilities clear.

**Interfaces:** consume Task1/2 explicit tier/progress/data states and Task3 protected notices. Search/pagination labels must disclose loaded scope. Backend remains authoritative; no browser-stored private drafts. Existing announcements/inbox must remain working.

- [ ] Write/run failing UI tests for each tier, Completed separate, unavailable versus zero, projected shortfall, no false Low, notice read without resolving, pagination, account switch and lost assignment clearing.
- [ ] Show observation window, evidence reasons, limitations and verification-needed states. No thick left-border cards. Use bounded request deadlines covering token/fetch/body; preserve stable retry identity for any mutation.
- [ ] Run portal `npm test -- --runInBand`, `npm run build` with local/synthetic configuration and full backend `npm test`; no dependency installs/provider calls.
- [ ] Synthetic browser walkthrough: evaluate → coordinator notice → read → repeat no duplicate → escalation → uncertainty no recovery → reliable recovery; reassign while sessions open and deny former coordinator. Record mocked/emulator/browser evidence separately.
- [ ] Update manuscript checklist with actual implemented policy and observed test results, not predicted accuracy. Independent whole-change review, fix blocking findings, rerun affected/full tests. Preserve local work for integration choice; do not push/deploy/build APK.

## Coverage and execution handoff

Task1 owns numerical policy; Task2 authoritative inputs and analytics; Task3 alert consistency/private access; Task4 UI and integration evidence. Every review-focus item maps to a task above. Journal scoring, workplace AI detection, document triage and DTR escalation are later plans, not hidden additions to this phase.

The five operational decisions are approved. Use the previously chosen independent task-review approach. Do not alter the parked support workspace or overwrite unrelated primary-checkout changes.
