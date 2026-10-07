# Student access QA — 2026-10-07

## Verified in this pass

- 34 backend/Firestore security tests passed against isolated Auth and Firestore emulators (`demo-pathway-security`, test ports 9199/8180).
- Provisioning accepts an assigned section and student ID/name records without an email inbox.
- Student self-registration is disabled.
- Initial sign-in requires password replacement; student data and attendance remain gated beforehand.
- Incorrect current passwords are rejected. The issued password stops working after replacement.
- Reimport preserves the replacement password and reports the account unchanged.
- Password recovery requires the assigned coordinator and identity confirmation; it returns a random temporary password and re-enables the password-change gate.
- 11 student identity/helper tests passed, including a new password-gate routing regression test.
- 8 staff login, API, and coordinator records tests passed.
- The running staff Login page at localhost:3001/login was inspected at the browser's default desktop viewport. The form rendered without obvious overlap.
- Running student app: an incomplete application showed the missing documents/placement fields and disabled final submission.
- A separate emulator-only student (`qa-student-1791373956679`) passed backend placement draft/submission, revision/resubmission, approval, replacement-placement document invalidation, and final-review revision/resubmission/approval. Document metadata was simulated; this does not verify actual file uploads.
- Reloading that student's session opened the approved dashboard with the correct official company.
- Approved dashboard sign-out displayed the loading state and returned to Login. Browser back did not restore the dashboard, and reopening the app remained signed out.
- Pending student dashboard: Documents → Continue to company selection opened Company correctly. Sidebar sign-out displayed the loading state and returned to Login.
- Authorized Roster rejected a malformed student row before provisioning. Successful CSV-file import was not exercised in the browser.
- Student Login, Logs, and Logbook were inspected at a 440 × 956 phone viewport. Logs used the requested heading; Logbook rendered its empty state and attendance link.
- No runtime errors were observed in the inspected student paths. Deprecation warnings remain for shadow styles and pointerEvents.

## Findings requiring follow-up

### Basic geofencing pass

- Coordinators can enable attendance geofencing in Company Directory and enter latitude, longitude, and a 50–2,000 metre radius. Existing companies remain optional/off until configured; ordinary edits without a geofence payload preserve existing settings.
- Both student attendance screens request foreground location only when the company policy is enabled. Permission denial, disabled services, location timeout, poor accuracy, stale fixes, and outside-area responses are surfaced without a successful punch.
- The backend resolves the official assigned company inside the attendance transaction and validates the fix itself. Successful punches store location evidence with their attendance record. There is no paid maps API or background tracking.
- Verification: 3/3 geofence unit tests, 34/34 isolated backend/security tests, and 4/4 company-directory UI tests passed. Coordinator production build and student web export succeeded. The temporary student export output was removed after verification; it can be regenerated.
- Native location configuration follows Expo SDK 54 Location documentation: https://docs.expo.dev/versions/v54.0.0/sdk/location/ . Native app rebuild and real Android/iOS permission/GPS testing remain required. Client-provided coordinates/timestamps are not spoof-proof; mock-location rejection only catches explicitly reported mock fixes.
- A dedicated rejected-location/violation review queue and manual attendance exception workflow are not included. Successful location evidence is stored under the existing protected attendance read permissions.
- Installing the location dependency reported 51 npm advisories in the student dependency tree (14 moderate, 35 high, 2 critical). No automatic breaking upgrades were applied; the advisories need triage before production release.

### Resumed QA — 2026-10-07

- Fixed clearance eligibility: the server now requires approved placement, final deployment approval, and a submitted supervisor evaluation in addition to account approval, requirements, and hours. The coordinator screen applies these gates and explains them.
- Reran the isolated local Auth/Firestore suite: 34/34 passed. Shared test fixtures are restored after the expanded clearance test.
- Added a separate-fixture completion QA command for attendance arithmetic, journal review, and evaluation replay checks. Its running-app attempt could not reach the previous local fixture and was stopped; it is not counted as passed.
- That eligibility change did not implement geofencing or post-clearance locking. A subsequent locking pass is recorded below; running-app/device acceptance remains outstanding.

### Post-clearance locking pass

- Cleared students cannot punch attendance, submit/change placements, request or review final deployment approval, review requirements or journals, or create/submit evaluations through the guarded backend paths.
- Placement and journal edits through Firestore are denied after clearance, including administrator journal edits/deletions. Attendance and evaluation records remain server-owned.
- Endorsement preparation/send reservation and evaluation invitation reservation check clearance before changes. Already-reserved mail attempts can still finish recording their delivery outcome; external SMTP delivery is not a transactional database operation.
- Reads, messaging, password recovery, and editable personal contact fields remain available. This is application-level locking, not protection against privileged Admin SDK/database-operator changes.
- No production rules or backend were deployed.
- Verification: 34/34 isolated emulator tests passed, including post-clearance attendance denial, journal/review denial, evaluation creation denial, and direct student/admin Firestore journal-write denial.

- Attendance punch controls should be checked for accessible button roles; the inspected accessibility tree exposed the label as text rather than a button.
- Logbook explicitly states that DTR upload and automated verification are unavailable. Treat this as an unfinished feature, not a tested capability.
- Verify the floating message control does not obstruct nearby links at narrow widths.

## Test-environment note

The sandboxed emulator startup timed out at its hub. The authorized retry outside the sandbox passed and shut down its isolated emulator services afterward. Permission-denied messages during the security suite are expected assertions for prohibited actions, not application failures.

## Still required before declaring end-to-end completion

### Android follow-up QA — October 8, 2026

- Corrected QA Cloudinary credentials passed authenticated ping (HTTP 200). QA enabled. The backend reloaded in place with pinned demo-emulator checks, without restarting/reseeding the current phone workflow.
- Real Cloudinary smoke test passed using the shared student upload helper and separate fixture `qa-student-1791394168775`: actual tiny PNG bytes uploaded, backend verified provider metadata/signature and saved the submitted requirement, then reuse of the same upload intent was denied (HTTP 403). One tiny fixture asset remains in the test cloud, referenced by that fixture. This establishes real image upload/backend verification, not phone file-picker, PDF/Word, or protected-download acceptance. No secrets were logged; the phone student and production records were not modified.

- Cloudinary QA credentials were populated and passed format validation, but the provider's authenticated read-only ping returned HTTP 401. QA activation was left disabled (`PATHWAY_CLOUDINARY_QA_CONFIRMED=0`); no document was uploaded and no secrets were printed. Recheck the same product environment's cloud name, API key, and API secret before retrying.

- Dedicated Cloudinary QA configuration prepared in ignored backend `.env.cloudinary-qa` (disabled until credentials and confirmation are provided). The local launcher enables a backend-only loader; inherited Cloudinary settings are removed, and only the three confirmed QA credentials are accepted. Expo/staff-portal child environments strip Cloudinary variables. Production and isolated mock suites remain unchanged. Three configuration-isolation tests passed. Restart the local workflow after configuration; avoid reseeding while an active fixture/device test needs its state.

- Real-device document-upload prerequisite check: the running local backend returns HTTP 503, `Document uploads are not configured. Contact your administrator.` No Cloudinary upload was attempted. Native file descriptor handling, actual web bytes, and provider-error propagation passed the 9-test helper suite, but these do not establish a real phone upload. A dedicated test Cloudinary configuration or explicitly labeled local mock is needed before continuing upload acceptance; do not silently reuse production credentials.

- User confirmed the login keyboard issue improved after keeping AuthPanel's animated container stable and adjusting Android input focus styling. Startup-state container regression and JSX checks passed.
- Fixed NotificationsScreen's prohibited coordinator-profile read. The new authenticated `/student/assigned-coordinator` endpoint derives assignment from the student's section and returns only ID/name. Caller-supplied coordinator IDs are ignored; direct private-profile reads remain denied.
- Notification and message loading no longer stops when coordinator-name lookup fails. Dashboard approval listeners stop during logout and ignore errors from an already-ended session.
- Verification: 35/35 isolated emulator security tests, 9/9 student helper tests, and 3/3 geofence unit tests passed. Both running demo student accounts passed notification queries, restricted coordinator lookup, and SDK sign-out in independent sessions; the phone session was not changed.
- Separate local fixture `qa-student-1791393099758` passed placement revision/resubmission, official assignment, document invalidation, final-review revision/resubmission and approval. Completion checks passed duplicate attendance protection, 8-hour arithmetic, journal approval, evaluation validation/single-use, and insufficient-hours clearance denial.
- Updated Android bundle compiled successfully through the running Expo server. These are backend/SDK/bundle checks, not confirmation of all phone navigation or physical GPS behavior. Actual uploads, permission-denied GPS, inside/outside physical location checks and phone logout/back navigation remain outstanding.
- No production deployment, real email delivery, or manuscript changes were performed.

- Browser verification of CSV file upload, per-row import failures, password-change error states, session restoration, and post-change login. Automated tests do not replace these checks.
- Phone/desktop authenticated coordinator and admin screen checks; console and network error review.
- Pending student browser-back checks and sign-out from the remaining individual pre-deployment screens. Approved dashboard back-navigation and pending sidebar sign-out passed as noted above.
- Actual device checks for Android/iOS. New credential entry and submission through browser automation require user handoff.
- Follow-up workflow QA: real requirements uploads, company suggestions, running-UI placement/final-review submission, attendance punches/logbook creation and review, supervisor evaluation, and clearance. Fixture-only backend placement/final-review transitions passed, but do not replace these UI checks.
- Separate implementation audits for AI integration and geofencing, plus production email delivery and deployment readiness.

No production accounts were created, no real emails were sent, and the manuscript was not changed.
