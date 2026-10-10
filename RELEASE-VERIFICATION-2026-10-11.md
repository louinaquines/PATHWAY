# Release verification — October 11, 2026

This is an evidence ledger, not production sign-off.

## Verified

- Authorized live TEST ONLY upload: submitted test-only-fictional-signature.pdf through Dexter's student web session as Recommendation / Endorsement Letter. Student UI showed In review, two received documents, and zero approved. After coordinator refresh, the new file appeared Pending with View/Download controls. No approval or email was performed. The coordinator preview dialog loaded an iframe but its PDF area was blank in the Codex in-app browser; visual rendering remains unverified. Screenshot: test-endorsement-upload-preview.png.

- Live coordinator: prepared draft v1 for Dexter's TEST ONLY placement and opened the endorsement preview. It remains draft-only, awaiting a signed letter, and not sent. Screenshot: endorsement-draft-qa.png.
- Earlier isolated Auth/Firestore security run: 36/36 passed, including private endorsement delivery with local SMTP, partial-recipient retries, section ownership, final approval gates, and atomic dashboard eligibility updates. These are fixture-based tests, not real signed-document or inbox acceptance.
- This pass: 34/34 production-preflight, Gmail transport, stable startup, and student web-helper checks passed. Transport tests use mocked providers; no real email was sent.
- Local restore rehearsal: restored the saved demo snapshot on separate emulator ports; verified four Auth accounts, an approved profile, company/geofence data, and one attendance record. Production data was untouched.
- Web regression: 24 suites / 68 tests passed after supplying jsdom's missing native dialog methods in shared test setup. No live UI change or deployment was made.
- Live final review remains blocked with six missing required documents. The test certificate remains in review.
- Owner-confirmed live document test: rejected Dexter's test document with a reason, saw the reason in the app notification, uploaded a replacement that returned to In review, and confirmed View opened the replacement rather than the previous file. This is owner-reported phone/browser acceptance, not an independently repeated agent check. Keep the test certificate unapproved.

## Gates still open

### Isolated final approval check

- Dedicated emulator student qa-student-1791658818385 passed the backend workflow: incomplete final-review rejection, placement draft/submission, revision/resubmission, placement approval, placement-bound document invalidation, final-review revision/resubmission, and final approval. Five student notifications were verified.
- After reloading the student web UI at localhost:8083, the approved Home dashboard displayed Journey QA Host as confirmed, Final review approved in recent activity, and Home/Logs/Progress/Profile navigation. Screenshot: isolated-final-approval-qa.png.
- Document approvals used emulator-only metadata fixtures because Cloudinary is not configured in the demo. This does not verify real document uploads, signed-copy acceptance, coordinator approval clicks, or native phone dashboard routing. Dexter's production records were unchanged.

### Production inspection update

- Captured the actual active Firestore release and source under output/release/2026-10-10T18-50-43-497Z. The deployed source is firestore.messages-only.rules; release ruleset ID is 0417bf40-fd52-478c-b896-a3312e5cd9e0. The source SHA-256 is recorded with the release metadata.
- Read-only production API inspection succeeded: database is in asia-east1 and reports freeTier=true. Backup schedule and backup inventories returned empty objects. Point-in-time recovery and database deletion protection both report disabled.
- A production restore rehearsal therefore has no observed managed backup to restore. Enabling managed backups/PITR or creating a separate restore database can incur charges and needs an explicit owner decision before provisioning. No billing, backup policy, database settings, or rules deployment changed.
- Approved attachment transport test: provider initially accepted both recipients; owner screenshots establish louinaquines@gmail.com received the PDF and owner confirmed it opens. dex@gmail.com subsequently bounced with 550 5.1.1 / address not found. Do not resend to that address. This is synthetic attachment delivery, not issued endorsement acceptance.

1. Real endorsement upload/preview: obtain an authorized test PDF clearly marked TEST ONLY, not a fabricated institutional signature. Verify private access and coordinator review before any email.
2. Real delivery: confirm both server-derived recipients. Current test company uses company@example.invalid, and dex@gmail.com is not established as a controlled inbox. Do not send to either as a live acceptance test. Provider acceptance and inbox receipt are separate checks.
3. Full final approval UI: use a dedicated isolated test account with complete test document fixtures. Do not mark Dexter's missing live documents approved to force eligibility. Backend success and dashboard routing helpers already pass; this is not full live device acceptance.
4. Production rules: capture the actually deployed rules/version and a recovery copy; validate all student/coordinator/admin query shapes and required indexes. Deploy only Firestore rules, then perform scoped live checks. Do not replace live rules with an unverified local or compatibility file on rollback.
5. Remove CORS_LOCAL_TEST_ORIGIN after local browser testing ends, redeploy backend, and verify the deployed website still works while localhost:8082 is denied. Closing local access now would interrupt the remaining local tests.
6. Production backup/recovery: verify an actual scheduled production backup, retention, access restrictions, and restore into a separate database/project. Local emulator restore is not evidence of production recovery.
7. Monitoring: verify an external health/error alert and its destination with a controlled test. Existing /healthz and server logs are not proof alerts are configured.
8. Rollback: record the currently deployed Render revision, Firebase Hosting release, rules release, and exact environment configuration without copying secrets. Rehearse rollback in staging; avoid rolling production back as a test.

## Safety boundaries

- No real endorsement issued or emailed in this pass.
- No new live document approvals, final approval, clearance, production rules cutover, or environment removal in this pass.
- Current worktree contains many existing changes. HEAD dc1a174 alone does not contain all locally tested implementation; do not assume Deploy latest commit deploys the whole worktree.
