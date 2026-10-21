# Attendance risk: local verification and release boundary

Date: 2026-10-21. Local implementation, verification and whole-change review complete; ready for a local integration decision. This is not production release acceptance.

## Approved scope

Deterministic Low/Medium/High risk, separate completion/data states, latest20 eligible workdays,28-calendar-day credited-hour projection, coordinator-managed excused dates, private daily in-app alerts and duplicate prevention. Daily due time00:15 Philippine time; current date excluded. No production changes, paid AI calls, email or preview APK.

## Current verified checkpoints

- Baseline5cb5795: backend43security tests and portal122tests passed before implementation.
- Calculator9cdc917+1c6f1c7:34focused tests plus43security tests passed. Independent review found and then cleared fractional forecast rounding and tiny positive-credit underflow defects.
- Inputs/API f16a93c+54b62d0:58focused tests before review; full backend58tests after fresh schedule-permission fix. Independent task review approved the fix. History covers the union of20 eligible workdays and28calendar days, with explicit overflow rejection.
- Excused dates are backend-owned, versioned, audited and denied to direct client access. Coordinator API checks fresh assignment/role/approval/department. Missing hours remain unavailable, not zero.
- Checkout credits are server-credited hours, not proof of coordinator verification; existing pending workflow status is preserved. No credit arithmetic was changed.
- Worker1684c16+c4f1d66: focused risk26/26, full backend85/85 and separate input/calculator/analytics58/58 passed. Independent scoped review cleared actionable routing, persistent failure isolation/fair retries and live due-context rollover. Original interrupted intermediate run is retained as failed evidence, not counted as a pass.
- Alerts use current-assignment authorization, private backend-owned collections and deterministic transition IDs. Reading does not resolve. Local timer is default-off and requires an awake process; this is not production scheduling acceptance.
- Browser environment: isolated demo Auth9099/Firestore8080, local backend3101 and Vite3001. Three synthetic QA identities seeded. Synthetic coordinator sign-in succeeded; inspected request destinations use loopback demo services. Walkthrough evidence is below.

## Browser walkthrough and committed-version confirmation

- Actual StrictMode rendering caught an indefinite Loading state despite HTTP200; implementer added failing lifecycle regression and fixed it. Real reload then rendered the Medium notice.
- Mark read left the episode open; a repeated worker evaluation kept exactly1 notice. Alert action opened Taylor Synthetic QA's assigned analytics, showing85%/Medium/In progress/Ready and the observation windows.
- Excused-date editor saved a synthetic future date and restored an empty list through the real versioned API. It disclosed that this changes exclusions, not leave approval or credited totals.
- High source fixture produced exactly2 notices (opened+escalated). Missing checkout plus500 target hours produced Completed/Needs verification with open episode and still2 notices, confirmed in the real analytics screen.
- Restored reliable inputs produced exactly3 notices with one recovered; repeating retained3. Browser displayed Reliable recovery/Low/Completed/Ready.
- New Medium episode produced4 total. With both coordinator browser sessions open, transferred only this student to a new section/coordinator while retaining old section ownership. Old UI cleared its cached notice history automatically. Worker added one assigned notice (5 total). New coordinator's protected refresh showed that assigned update.
- Early browser feedback also corrected acknowledgment wording and notice search hints/reason labels. Stale dashboard section-list navigation was fixed with a fresh owned-section server lookup and a failing/passing route regression; actual browser navigation opened the transferred student's analytics successfully.
- UI commitd947845 passed159/159 tests across40 suites, backend85/85 and synthetic development-mode build. Independent Task4 review approved spec/quality with no blocking findings. Remaining build/harness warnings are documented below, not hidden as pristine output.
- Repeated the controlled fixture on commitd947845: reset only this bounded synthetic history, fresh StrictMode reload, read/open analytics, repeat1, escalation2, uncertain completed/no recovery2, reliable recovery3/repeat3, new episode4, student-only transfer5. Both browser sessions remained open: old history automatically cleared; new protected refresh rendered Assigned risk update. Full-server old list0/old read403/current list1 passed again. No product changes occurred during this repeat.
- Desktop1920×1080 and390×844 notice screenshots were visually inspected for wrapping, visible controls and ordinary thin borders. Both browser error-console checks returned0 errors/0 warnings. Screenshots and CLI snapshots are untracked local artifacts under output/playwright and .playwright-cli, not committed product sources.
- Evidence comes from actual local browser+emulator+worker plus separate unit/mock tests and protected backend suites. No AI action, production call, email or APK build was used. Final whole-change review remains pending.

### Reopened finding from the final repeat

The new coordinator's Refresh after student reassignment cycled repeated notice GETs and Firestore subscriptions until HTTP429. The earlier successful delivery and API authorization checks do not establish this repeated cache transition is correct. At that point the panel showed0 loaded/Loading; the browser error console recorded429. A stale initial cached student-reference snapshot is being investigated. Task4 is reopened for a bounded-refetch/lifecycle fix and regression; no rate limit will be raised to hide the problem. Earlier0-console-error checks preceded this failure and are not final acceptance. Fix and independent re-review are pending.

Fix candidateabb8d28 retains source listeners while hiding uncertain notices, waits for fresh server metadata and bounds automatic refetch to one per manual refresh cycle. Focused16/16 and fullweb165/165 across41 suites passed; synthetic build passed. Backend code unchanged. Repeated the actual away-and-back fixture transition with both browsers retained; manual refresh rendered Assigned risk update. The request trace remained at request550 across subsequent checks (no further notice GETs), unlike the prior200→429 loop. Screenshot attendance-refetch-fixed.png records the settled candidate. Independent scoped re-review pending; the prior429 stays in the historical console log and is not erased.

Independent scoped re-review approvedabb8d28: finding addressed, no new blocking breakage. This supersedes the pending fix/re-review statements above while retaining the failure history. Whole-change review remains the final local gate.

## Pending

- Integration decision; production rollout approval and target scheduling/index verification remain separate.

## Final local gate

Independent whole-change review of candidate3b548d9 found no Critical/Important blocker in the approved local scope and judged it ready for local integration. Final saved runs passed web165/165 across41 suites, backend85/85 and separate Node58/58. Logs are output/playwright/attendance-final-web.log, attendance-final-backend.log and attendance-final-node.log; no repeat runs were needed after the documentation-only handoff.

Production release is blocked: PATHWAY-backend/Dockerfile omits attendanceExcusedDates.js and attendanceRiskAlerts.js required by the server. Packaging/startup must be fixed and verified before release. Scheduling on an awake/always-running host, capacity, deployed indexes, rollback and production acceptance remain unverified. Live AI/provider behavior, exact DOCX paragraph comparison and parked workplace-support integration were outside this phase. Nothing was merged, pushed or deployed; no APK was built.

## Evidence limitations

Full logs live in this plan's ignored `.superpowers/sdd/2026-10-21-ATTENDANCE-RISK-IMPLEMENTATION-PLAN/` directory. Node calculator tests, mocked API tests, emulator transactions/rules and browser checks are different evidence types; do not add overlapping test counts or claim one establishes another.

Emulator runs retain the Firebase multiple-instance project warning, expected permission-denied diagnostics from negative tests and normal SIGINT shutdown output. Test ports9199/8180/4490/4590 are separate from other local workflow ports; warnings are not a pristine-output claim.

The final backend run also logged SDK MetadataLookupWarning ETIMEDOUT/ENOTFOUND despite its metadata-disable setting; all85 tests passed. Synthetic web builds retain PDF static/dynamic-import overlap and >500KB chunk warnings. These are nonblocking task-review observations, not evidence of production performance, clean harness output or a release-ready bundle. No dependency/config changes were made to conceal them.

The workplace-support feature remains parked in a separate worktree and is not integrated into this phase. Journal scoring, AI workplace detection, document triage and DTR escalation remain later phases, not completed claims.
