# Android preview build — October 12, 2026

## Updated QA preview — submitted October 12

- Build ID: 05e74d52-3b27-4f1b-b531-756f0cf0f268.
- Build page: https://expo.dev/accounts/louijay/projects/pathway-app3/builds/05e74d52-3b27-4f1b-b531-756f0cf0f268
- Android versionCode incremented from previous finished build 1 to 2; app version 1.0.0.
- EAS confirms existing remote Android keystore Build Credentials Tg6-TN99b5 (default); --freeze-credentials prohibits updating credentials. No store submission.
- Archive-stage inspection verified 194 mobile files, App.js, BackdropModal.js and versionCode 2. No backend/web/evidence/attachment files or matched .env/private key/service-account filenames in copied app payload. Inspection also contains EAS-created Git metadata; not represented as an empty Git directory.
- Upload completed, 32.4 MB; fingerprint computed; build accepted. Completion/APK artifact and installed-device acceptance are pending.
- Backend AI remains disabled; no new provider calls, billing changes, global settings changes, or backend deployment performed.
- After installation: startup, approved/unapproved login/session, protected PDF/image open, location permission denial, keyboard/composer, refresh skeletons, navigation/backdrop/layout, offline draft preservation, sign-out/re-login. Do not punch attendance unless legitimately eligible.

- Expo project: @louijay/pathway-app3 (1826dd53-e8bb-4dd2-82a5-80c5d8870e53).
- Android package: com.louijay.pathway; preview is an internal-distribution APK, not a development client or store submission.
- Build uses the hosted Render backend and public Firebase client configuration. Local .env, signing keys, backend, backups, attachments and release evidence excluded from archive.
- Firebase emulators are guarded by __DEV__ and are not enabled in release builds. No Anthropic API key included in mobile build configuration. AI backend remains disabled.
- Initial upload hit protected backend directory; first subsequent archive was empty and is not a valid release. Corrected exclusions and verified mobile sources in local archive inspection; backend directory contained no files.
- Usable-source build submitted: 64a039b0-0719-43a9-a0dd-5c3cff7611b1. Last observed status IN_PROGRESS; APK not yet available or device-tested.
- Build page: https://expo.dev/accounts/louijay/projects/pathway-app3/builds/64a039b0-0719-43a9-a0dd-5c3cff7611b1
- Latest UI edits are uncommitted but included in uploaded working-tree sources. Build metadata commit 70111b2 does not imply these edits are committed.
- Next: confirm build succeeds, install on Android, verify login/session persistence, documents/PDF, attendance/location, logbook and notifications. Paid AI/device test needs separate enablement authorization.
