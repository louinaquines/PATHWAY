# Placement restrictions — October 13, 2026

## Implemented

- Backend time-in transaction requires final deployment approval, account approval, approved placement and an existing active company. Existing password and clearance checks retained.
- Firestore logbook create/draft submission/rejected-entry resubmission requires the same placement conditions. Reads retained; no production record changes.
- Open shifts may finish after placement/final-approval change, while account/password/clearance and existing-shift safeguards remain. New shifts retain original company ID for time-out location policy.
- Mobile Home/Logs and Logbook subscribe to profile/company eligibility; unavailable actions disabled with requested message. Draft state is not cleared by eligibility changes.
- Home placement uses approved assignment and directory name, not just legacy display text. Home avatar 60px only. Both startup labels OJT MANAGEMENT.

## Verification

- Backend/Firestore integration: 43/43 PASS after restoring an isolated journal fixture between tests. Missing/pending/rejected/nonexistent/inactive company, account/final gating, direct create/resubmit denial, read preservation, eligible journal writes, duplicate attendance, geofencing and open-shift completion exercised.
- Android export PASS: 1,059 modules, 26 assets, 4.72MB Hermes bundle at placement-gate-android-final. First sandbox export failed on temporary Hermes file permissions; network-enabled/outside-sandbox rerun succeeded.
- Janeil live-field inspection BLOCKED: no active authorized coordinator browser session. Historical account evidence is not a fresh field inspection. No account/placement/hour corrections performed.
- Actual narrow-screen/installed-device UI acceptance remains owner-dependent; source checks and bundling are not device passes.

## Release state

- Updated APK build submitted: 646ea530-3b48-4063-8777-d86f93a4dce4, preview/internal APK, versionCode 3, existing frozen remote keystore. Upload 32.5MB and fingerprint completed. Build page https://expo.dev/accounts/louijay/projects/pathway-app3/builds/646ea530-3b48-4063-8777-d86f93a4dce4. Completion and physical installed-app acceptance remain pending.

- Firestore rules compiled and deployed successfully to pathway-57400, rules-only.
- Scoped local commit f25fb8d contains only server.js and firestore.rules. All unrelated working-tree changes preserved.
- Owner subsequently explicitly authorized the exact default-branch push. git push origin main succeeded, 2120356..f25fb8d. Normal Render Manual Deploy triggered; deployment completion remains pending verification. Remote https://github.com/louinaquines/PATHWAY.git.
- Render deployment dep-db6gpibrjlhs73empcs0 succeeded / Live for f25fb8d; read-only backend liveness HTTP 200 in 355ms. Screenshot placement-gate-render-live.png. Firestore rules and backend are now deployed; AI/billing/global settings unchanged.
- Coordinator browser session restored by opening the portal. BSIT 4G official-assignment view lists two companies and two assigned students (Dexter and TEST ONLY Placement QA), not Janeil. This establishes no current displayed directory assignment for Janeil, but does not expose her complete raw profile fields. No record changed. Earlier no-session blocker superseded for this read-only observation.
- Version-3 archive inspection: 195 mobile files, eligibility hook present, versionCode 3, no backend/web/evidence/attachment payload files or matched credential/private-key filenames. EAS-generated Git metadata is present in local inspection as in prior builds.
- Owner must sign into coordinator for read-only Janeil verification and later perform installed-APK acceptance.
