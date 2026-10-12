# Android acceptance — Phase 9

Status: device acceptance pending. Expo Go and a signed standalone Android app are separate targets; neither is proven by a JavaScript bundle export.

## Safe first pass on the phone

Use Dexter's existing fictional test account in the current Expo Go session. Do not reset the password, approve a certificate, punch attendance or resubmit records for this first pass.

1. Record phone model, Android version, Expo Go version and the Metro port/QR used. Reload the current project so an older Metro session is not mistaken for the latest source.
2. Confirm sign-in reaches the expected dashboard and does not show a generic failure.
3. Open Requirements. Use View on the replacement test certificate; confirm it opens the replacement file. Leave it unapproved.
4. Open notifications; confirm the previously recorded rejection reason is visible and the unread badge agrees with the unread list. Reading may acknowledge a notification; record that separately from document status changes.
5. Open Logbook, Messages, Company placement and Progress. Confirm existing test records load and each screen scrolls without clipped buttons or keyboard obstruction.
6. Background and reopen the app. Confirm the session returns correctly. Sign out and confirm private screens are inaccessible; sign back in only if needed.

Send pass/fail for each step and a screenshot of any failure. Never send passwords, tokens or private document contents.

## Mutation acceptance — separate test fixture

After first-pass acceptance, use an explicitly identified disposable student fixture to test upload/cancel/replacement, journal submit/reject/resubmit, company draft/submit/revision, duplicate attendance and geofence permission denial, and final-review approval/dashboard unlock. Do not change Dexter's intentionally unapproved certificate merely to test unlocking. No new production mutation is performed by this checklist.

## Standalone release gate

Record whether a signed standalone build is required. Installation, native file picker/PDF open, location permissions, back navigation, keyboard behavior and session persistence must be retested in that build; Expo Go results are not standalone acceptance. iOS remains a separate unverified platform. No paid build service or signing credential setup is authorized here.

## Current agent evidence

Android bundle export succeeded: 1054 modules, 26 assets, one 4.68 MB Hermes bundle; output/release/android-bundle-phase9. This verifies bundling only, not an APK build, installation, phone UI or native integrations. No runtime code or dependency version was changed.

ADB is not on PATH, so no attached phone or emulator session was verified. Earlier web, backend and rules checks cannot substitute for native device acceptance.
