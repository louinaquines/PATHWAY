# Local workplace UI integration plan

> **For agentic workers:** Use executing-plans inline, test-driven development and one final independent review. User approved proceeding to local screen wiring. No paid request or deployment.

**Goal:** Connect existing student consent/submission and coordinator review UI in the pinned local emulator workflow only.

**Architecture:** Reuse the mobile LogbookScreen migration path and existing WorkplaceConcernReview component. Register review routes behind an explicit backend local flag; add a coordinator navigation entry behind matching demo/local flags. Reuse AttendanceAccess for actor/assignment invalidation, with an optional concern-specific denial message. The local launcher enables these UI flags only, not a worker/provider/dispatcher.

**Tech stack:** Existing React/Expo components, Node/Express, Firebase demo emulators and existing Jest/Node tests. No dependencies.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md and JOURNAL-BACKEND-CUTOVER.md. Latest main baseline 5eb1b3e; preserve unrelated dirty files. Mobile UI is already wired and must not be duplicated.

## Global constraints

- No hosted enablement, paid/provider requests, scheduler, cleanup execution, production changes, emails, rules cutover or APK.
- Default-off explicit flags; exact demo-pathway-security and local backend 127.0.0.1:3100. Production bundles cannot expose local concerns.
- Consent remains optional, withdrawal remains available and failed submissions retain notes. Existing legacy client path remains default outside the local launcher.
- Current coordinator authorization is enforced server-side; actor/assignment invalidation clears stale UI. Reuse private POST APIs, never direct client reads of concern collections.
- Keep the private review workflow and existing local-only warning. Do not integrate the separately parked direct-support branch.

## Review focus

1. Saved local tab cannot expose a disabled/production feature.
2. A user/assignment change must invalidate detail and action state, not just hide navigation.
3. Launcher flags do not enable worker/provider processing or change hosted defaults.
4. Consent/submission already exists; avoid duplicate forms or unsafe legacy fallback.
5. Empty queues must not imply that analysis ran or workplaces are safe.

## Task 1 — Local route and launcher wiring

Files: PATHWAY-backend/server.js; security-tests/security.test.js; security-tests/start-local-workflow-apps.js.

- [ ] Add a full-server API regression for coordinator private list versus anonymous/student denial under the explicit local flag. Run RED, register the existing installer using current auth/rate/audit helpers, rerun GREEN.
- [ ] Add only process-scoped launcher flags: backend review-local, portal review-local and existing Expo backend-submission flag. No worker creation, provider enablement or .env edits.

## Task 2 — Coordinator screen integration

Files: PATHWAY-web/src/pages/CoordinatorDashboard.js; new localWorkplaceReview.js and pages/WorkplaceConcernsTab.js; components/AttendanceAccess.js; pageMetadata.js; matching tests.

- [ ] RED tests: disabled/wrong-project/remote/production flags hide navigation and reject restored local tabs; enabled local dashboard navigation renders actual private review and API requests.
- [ ] Add a minimal flag helper, Workplace concerns sidebar entry, header and wrapper using AttendanceAccess. Allow a concern-specific denied message without changing existing attendance defaults.
- [ ] Verify denial/stale session behavior and existing mobile LogbookScreen consent/submission tests; keep student source unchanged unless a demonstrated gap requires a separate RED test.

## Task 3 — Verification and handoff

- [ ] Run focused web tests, full web suite and full backend suite; record exact results and limitations. Tests use synthetic providers only. No visual/device acceptance claim without an actual walkthrough.
- [ ] One read-only independent review, fix Important findings with regressions, then save a scoped local commit and update notes. No push, deployment or APK.
