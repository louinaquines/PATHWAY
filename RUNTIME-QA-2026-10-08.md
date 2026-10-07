# Running-app QA — October 8, 2026

## Physical Redmi acceptance follow-up

After the user enabled USB debugging security settings, ADB input worked on the connected Redmi. Opened Expo Go on port 8084 and signed in with the existing approved emulator student account. Dashboard fonts, icons, profile photo, settings initials `AD`, and coordinator conversation initials `C` were visibly rendered.

Typed an unsent `Keyboard visibility QA draft` in the assigned coordinator conversation. The full draft and Send button remained visible above the open keyboard. Navigated away without sending the draft. This verifies composer visibility, not message delivery or populated message-bubble contrast.

Signed out through Settings; the app returned to empty Login fields. Android hardware Back exited to the phone launcher rather than reopening the dashboard. Reopened the PATHWAY project from Expo Go's recently opened list and confirmed it still showed Login with empty fields. Did not change approvals, attendance, requirements, passwords, or production resources. The brief logout loading animation was not captured, so its visual appearance is not confirmed by this pass. Pending-account and mandatory-first-login physical walkthroughs were not included.

## Environment and service recovery

Used only existing demo-pathway-security Auth/Firestore emulators on ports 9099/8080. Did not seed/reset fixtures, send messages or email, change approvals, or deploy production resources.

Backend port 3100 was missing; restarted it in pinned local emulator mode. `/healthz` returns HTTP 200 (`/health` is not a valid endpoint). Existing staff port 3001 showed stale source-map-loader compilation failure after dependency updates, although source-map-js is installed. Started a fresh emulator-only portal at http://127.0.0.1:3002 without stopping the original workflow. Student port 8083 initially timed out/appeared blank in the browser; started a fresh Expo instance at http://127.0.0.1:8084. Added only these exact local origins to this turn's backend CORS environment. No production environment files changed.

Existing emulator records were retained. The current visible section contains Avery Demo and Taylor Student; older Journey QA fixtures were not present in the inspected list and were not recreated.

## Browser checks passed

- Coordinator sign-in and sign-out; requirement student selection shows five approved documents and 100% / 5 of 5 approved.
- Logbook list loads both students; Avery's pending weekly journal and approve/reject controls display. Attendance/weekly journal switch and Export Data control are present. No decision or export download was performed.
- Placement review requests display company, student, supervisor, dates and approval status without the previous load error.
- Messages separates sections and students. Evaluation form and clearance screen load. Clearance shows both students incomplete on hours; no sign-off attempted.
- Administrator sign-in and overview render existing accounts/charts. Company oversight is read-only with capacity information, without a company-creation form.
- Fresh student Expo app reaches onboarding, login, approved dashboard, Logs, Progress, and Inbox. Avery's existing attendance and weekly submission appear. No captured student error-level browser logs were returned at the inspected point.

This is read-only navigation acceptance, not a full new mutation/end-to-end test. Fresh student inbox had no conversations; two-way sending was not retested. Evaluation email delivery, upload acceptance, geofence punches, new account/password workflows, and clearance completion remain separate tests.

## Findings and limitations

- Student Logs shows `Attendance history: 1 records` while its previous-record list is empty, because today's completed shift is displayed separately. Fix the previous-shift count and singular/plural wording.
- Original ports 3001/8083 were not repaired by terminating their parent workflow, to avoid interrupting or losing existing emulator data. Fresh QA ports are 3002/8084; backend remains 3100. Consolidate services with a verified snapshot before a planned workflow restart.
- Staff console retains React Router future-flag warnings. The earlier 3001 build error remains in this tab's historical logs; it is not a fresh 3002 compilation failure.
- Redmi QA phone is connected and its existing USB mappings for 8083, 3100, 8080, and 9099 remain. No physical-phone interaction or visual acceptance was performed. Fresh Expo 8084 is not yet mapped/launched on that phone.
- No manuscript changes.

## Attendance history follow-up

## Final automated auth/logout pass

Saved and validated a new recoverable emulator snapshot before testing. Firebase CLI again exited abnormally only after successful export; the persistence helper verified the snapshot files. No live account fixtures were reset.

All 35 isolated backend security tests passed again, including provisioning, mandatory first-login password replacement, stale-session restrictions, and approval gates. Seven production-preflight tests passed. Added three focused student logout-hook tests: sign-out followed by a Login-only navigation reset, duplicate-tap protection, and failed-sign-out control recovery/retry. All three passed. These tests do not simulate actual Android hardware Back or keyboard rendering.

Physical-phone keyboard visibility, icons/fonts, and hardware Back after logout still need user confirmation. Service consolidation is deferred until that phone acceptance is complete; current QA ports remain staff 3002, student 8084, backend 3100, and original emulators 9099/8080. No claim of full phone QA completion.

Corrected StudentDashboard's Logs count to use exactly the filtered records rendered in its history list, excluding today's shift when today is selected and counting only the selected date otherwise. Added shared filtering/count-label helpers and regression coverage for empty, today-only, previous-day, selected-day, and singular/plural cases. Daily Attendance's record label also uses singular wording for one record. All 24 student helper/geofence/pagination/feedback checks passed; diff checks passed.

Added USB reverse mapping for port 8084 on the connected Redmi QA phone and launched Expo Go with exp://127.0.0.1:8084. Metro served the Android bundle successfully (1169 modules). A manifest-assets resolution warning was emitted; icon/font appearance still requires physical-phone confirmation. This verifies launch/bundle delivery, not a visual walkthrough or a new attendance punch. Existing mappings and emulator data were preserved.
