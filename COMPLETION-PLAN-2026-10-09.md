# Completion gates — October 9, 2026

Completion means implemented and accepted against agreed requirements, not an estimated percentage. Do not modify the manuscript. Do not reset existing demo records or deploy production without explicit authorization.

## Current recovery evidence

Restored the latest saved local emulator snapshot without seeding. Fresh coordinator emulator sign-in and a protected company-directory GET returned 200. Fresh approved student sign-in, ordered logbook read (one entry), and hours aggregation passed with the student's actual Firestore permissions. Existing browser/phone sessions were not inspected or refreshed, so their reported errors are not yet verified resolved. Intermittent backend restarts/connection resets occurred during startup and remain to be diagnosed.

## Ordered remaining acceptance gates

### Stable demo startup follow-up

Removed Node `--watch` from the local demo backend launch. Earlier logs showed repeated watcher restarts and protected requests intermittently failed with ECONNRESET. The exact filesystem event triggering the old watcher was not isolated; this fix removes automatic dependency restarts from the demo path rather than claiming that event is known. Backend code changes now require an intentional workflow restart. Expo and staff frontend refresh remain enabled. Production startup and token verification are unchanged.

Twelve focused startup/logout/production-guard tests passed. Backed up the live records, stopped the workflow owned by this task, and restarted from the latest verified snapshot without seeding. The corrected backend returned health 200 and ten consecutive protected coordinator directory reads returned 200. Student-permission reads found the same one journal as before restart and hours aggregation passed. Another verified snapshot export left the backend PID unchanged (17916). This is bounded local acceptance, not a long-duration soak test. Phone/browser stale-session recovery and the original user-visible errors still require runtime confirmation; no UI or refresh-token fix is claimed.

1. Local reliability: investigate backend restart instability, repeat clean startup/backup/restore, and verify existing browser/phone session recovery. Never weaken token checks to hide failures.
2. Accounts: pending and mandatory-first-login phone tests, authorized-roster import validation, duplicates/reimport, coordinator-assisted recovery, revoked-session behavior.
3. Workflows: rejection/resubmission, placement capacity/company suggestions, expired/reused evaluation links, eligible/ineligible clearance, attendance and journal exports with actual dynamic requirements.
4. Integrations: approved-recipient real email acceptance and public evaluation URL; real upload/private-download acceptance; agreed AI feature acceptance including failures, privacy, usage and cost limits.
5. DTR/OCR: blocked pending an agreed template, fields, verification rules and expected examples. Do not invent these requirements.
6. Release safety: dependency remediation/assessment, permissions/rules/indexes, hosting choice, container verification if selected, staging tests, production backup/restore, monitoring and rollback.
7. Mobile release: standalone Android and iOS/device acceptance, signing, privacy disclosures, store preparation. Expo Go acceptance alone is not store release acceptance.

## External decisions/configuration

October 10 Gmail HTTPS update: explicit provider mode implemented with SMTP default retained; transport/configuration/preflight 17/17 and isolated security 35/35 passed. Google accepted one approved synthetic email to louinaquines@gmail.com; inbox arrival awaits owner confirmation. Public evaluation/backend hosting, production identity/CORS, OAuth lifecycle and actual supervisor invitation/submission remain open. GMAIL-DEPLOYMENT.md records configuration and limits. No billing enabled or public deployment performed.

Email readiness: backend `check:email` now reports missing/invalid settings without revealing secrets or sending mail; four configuration tests passed. Current SMTP_HOST/PORT/FROM/USER/PASSWORD and public EVALUATION_WEB_URL are missing. Existing evaluation email code/local SMTP tests do not establish real delivery. Actual sender credentials, public hosting/backend reachability and an approved recipient remain required.

### Staff build-tool staging

Phone-independent QA follow-up: backend/rules 35/35, staff 50/50 and student helpers 18/18 passed. New backend `qa:student-readonly` passed six saved-demo logbook queries, signed-out denial and invalid-token 401 without record changes. No Android emulator found in standard SDK location/PATH. Physical Expo Go and natural expiry timing remain open; recovery/password logic acceptance is not full device UI acceptance. See PATHWAY-DOCUMENTATION.md.

Cutover update: Vite now runs on demo port 3001; Jest migration and CRA removal completed. Browser logins, routing, reloads, reads, sign-out and two actual Excel downloads passed. Staff tests 50/50, config 3/3, launcher 3/3 and build passed. Full staff audit retains 42 findings; production-only 8. Current artifact: build-vite. HMR/hosted acceptance, physical phone flows, approved SMTP/public evaluation URL/recipient and synthetic real-provider upload approval remain open. No production sign-off. See PATHWAY-DOCUMENTATION.md for evidence.

Side-by-side Vite build added without changing the live CRA launcher or tests. Build passed; config tests 3/3 and staff tests 50/50 passed. Preview routes/assets returned 200; browser execution/authentication remains unverified. CRA remains installed and dependency findings remain open. Cutover, local API origin, browser workflow/HMR, test-runner migration and CRA removal are next. See PATHWAY-DOCUMENTATION.md for details.

### Frontend exposure review

Fresh Android source-map review found no source paths for the selected audited gRPC/certificate/CSS/glob/image-parser packages; Firebase RN entries are present. Existing staff map review confirms Router/ExcelJS remain shipped and selected tooling paths are absent. No compatible same-major fix was established for several selected findings; no package changes applied. Staff tests passed 16 suites / 50 tests. Findings remain open, as do iOS/native, tested migrations and staging acceptance. Details are recorded in PATHWAY-DOCUMENTATION.md.

### Compatible backend dependency update

Storage 8.2.0 → 8.4.0 within Firebase Admin's declared ^8.1.0 range removed both backend production audit findings. Fresh production audit reports zero; the full backend tree retains 16 development-inclusive findings. Production guards passed 7/7 and isolated security passed 35/35. Node 22/container execution, staging, frontend/native and development-tool reviews remain open. Detailed evidence is in PATHWAY-DOCUMENTATION.md. No demo restart or production deployment performed.

### Release-safety recheck

October 9 read-only audits report backend 2 moderate, student 40 (28 high/12 moderate), staff 103 (64 high/36 moderate/3 low), with zero critical findings in all three. Counts include frontend toolchain dependencies and are not exploitability proof. Production guards passed 7/7 tests; packaging checks passed structurally. Docker is unavailable, so image build/start remains unverified. No forced package changes or deployment performed. Full details and remaining gates are now recorded in `PATHWAY-DOCUMENTATION.md`.

### Resubmission and clearance acceptance follow-up

The isolated backend/rules suite passed 35/35 tests after expanding clearance checks. Clearance independently rejects an unapproved account, unapproved requirements, missing final deployment approval, missing placement approval and hours 0.01 below the required total, even with a submitted evaluation. Denials leave the profile uncleared and create no clearance audit entry. Successful clearance creates exactly one notification and one audit record; repeat clearance and further locked-record mutations are rejected. Existing placement and final-review revision/resubmission tests also passed, verifying pending-review status, cleared review metadata and coordinator notifications/audits. These are automated backend/rules results; phone/browser UI acceptance remains separate. Demo data and the manuscript were not modified.

### Account recovery acceptance follow-up

The isolated security suite passed 35/35 tests, including extended end-to-end coordinator-assisted recovery. The temporary password retains the mandatory-change gate; replacing it requires signing in again, disables the temporary and initial passwords, releases the profile gate for the new login, and keeps the previous Firestore password epoch denied. Reimporting the class list preserves the recovered password. Existing coverage also verifies first-login replacement, section-scoped recovery and required identity verification. No live demo accounts or records were changed. Physical-phone first-login and recovery UI acceptance remain open; this is backend/rules acceptance, not full mobile acceptance.

### Student logbook diagnostic follow-up

All six actual logbook page/count/hours/status queries passed using a fresh approved-student emulator login. The USB device was absent from ADB, so physical reproduction remains unavailable. The Logbook screen now distinguishes session verification, denied access, unavailable database and unknown failures rather than labeling every failure as connectivity. Four helper tests passed. This is diagnostic guidance, not a fix for the unobserved original cause; no rules, token checks or records were changed.

### Staff token recovery follow-up

The shared staff API request/download helper now refreshes a rejected token once on HTTP 401. Persistent rejection gives explicit sign-in guidance; permission denials, network failures and server errors are not replayed. Account switching during token retrieval is blocked. Backend token and role checks remain unchanged. Focused mocked tests cover retry success, persistent rejection, permission denial, network failure and revoked refresh. This does not establish the cause of the original invalid-authentication report, cover every direct fetch in the portal, or fix student Firestore reads. Browser/phone reproduction remains an open gate.

AI credentials/provider and exact feature scope; approved email recipients/sender setup; public hosting and evaluation origin; DTR template/rules; production and store publishing authorization. No paid API calls or production release performed in this recovery pass.
