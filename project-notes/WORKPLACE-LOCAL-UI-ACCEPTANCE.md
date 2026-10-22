# Local workplace UI integration — 2026-10-22

## What is connected

- The pinned local launcher enables the existing student journal backend-submission/consent path. No duplicate student form or new mobile implementation was added. Declining analysis still allows submission; automatic analysis remains inactive.
- Coordinator navigation gains **Workplace concerns** only with the explicit local review flag, emulator flag, exact demo project, exact local backend and a non-production bundle. A disabled feature cannot be restored through a saved tab.
- The existing private review component is mounted behind the current-actor/assignment access boundary. Represented student profile changes conservatively invalidate displayed evidence, notices and draft/action state; late responses cannot restore them. Server-side assignment checks remain the authority.
- The main backend registers existing review POST APIs only with both local flags and the pinned demo project; the installer additionally rejects production/remote emulator conditions. All seven review audit events are explicitly allowlisted; no wildcard is added.
- Vite exposes only the additional nonsecret public flag, not process.env or backend secrets. A real esbuild regression exercises the guard in a browser-like context without a process shim.

## How to use locally

From `PATHWAY-backend`, use the existing `npm run dev:emulator` workflow. Restart that workflow after backend/launcher edits. The launcher scopes these flags to its child processes:

- Student: `EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION=1`.
- Backend: `PATHWAY_WORKPLACE_REVIEW_LOCAL=1`, with the existing `PATHWAY_LOCAL_WORKFLOW=1` demo environment.
- Portal: `REACT_APP_WORKPLACE_REVIEW_LOCAL=1`, existing emulator/demo flags and `http://127.0.0.1:3100` backend.

The local student app is served on port 8083 and the staff portal on 3001. No .env, production flag, rule closure or deployed client is changed. This task did not start/restart a user-owned workflow or alter existing emulator snapshots. A queue without a dispatcher is not automatic processing; this integration starts no worker, timer, provider or cleanup job.

## Verification

- Actual dashboard navigation, guarded saved-tab restoration, private POST requests, access denial and student transfer regressions pass. The real student LogbookScreen/consent tests also pass using native host shims, not a replacement consent component.
- Full web suite after the privacy fix: **201/201 across 46 suites passed** (`output/release/workplace-ui-web-final.log`).
- Real bundler/environment tests: **5/5 passed** (`npm run test:vite-config`).
- Real-server regression exercises anonymous/student denial, coordinator list access, notice read and review/contact/action/priority/resolution/false-positive dismissal against the actual audit allowlist. Final full backend: **187/187 passed**, zero failures/skips, 297.9 seconds (`output/release/workplace-ui-backend-final.log`).
- One independent review found an Important transfer-privacy gap. A failing dashboard test reproduced retained evidence; profile invalidation fixed it, with a stronger regression clearing draft/notices and rejecting a late action response. No second review is claimed. The real-server audit regression also failed before explicit event registration was corrected.

No paid API request, provider processing, production data/settings, external emails, deployment, APK or rules cutover. No live browser/device walkthrough, screenshot or visual/native-build acceptance was performed; DOM/component tests and a bundler transform are not that evidence. Minimal audit retention policy and automatic dispatcher/cleanup remain separate release gates.

Subsequent approved local browser walkthrough completed with synthetic accounts; see WORKPLACE-BROWSER-ACCEPTANCE.md. Student decline/opt-in/queued-only submission/withdrawal and manually seeded coordinator review/contact/action/resolve were observed through the actual UI. This does not establish automatic AI processing, native-device acceptance or production readiness. No product source changed in that follow-up.
