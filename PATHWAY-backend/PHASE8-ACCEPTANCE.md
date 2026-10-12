# Phase 8 acceptance — October 12, 2026

Status: free isolated/scoped recovery workflow verified. Full production recovery is NOT signed off.

## Verified evidence

- Encrypted operator-held-password archive; authenticated manifest and per-file checksums.
- Operator-reported Restricted Google Drive storage and upload/download round trip. Latest downloaded archive: PATHWAY-TEST-20261011-150239-b1cb69d374ef43ebaaecb02842844ae0.encrypted.json, SHA256 108DF2685A26AD752C1DE5ADA40F0C9DF36B712A95FE930410EE6C2E92CEE123. Eleven restored files passed checksum readback.
- Independently checked exact scoped Auth bytes and UID/email binding to Dexter's restored profile.
- One account imported without overwrite or password reset into pathway-recovery-test-20261011 on Spark. Operator-run private sign-in reported original-password success, matching UID/project and wrong-password denial; no tokens saved or source-project writes.
- Final downloaded-archive emulator rehearsal passed five synthetic Auth accounts, approved student/company relationship, attendance record, one real test-profile typed-field readback and overwrite refusal.
- Isolated document-link tests passed atomic receipt/link changes, concurrent single winner, replay, stale/corrupt/wrong-target refusal, legacy URL binding, and preservation of review, placement and approval fields.
- Prior approved QA provider uploads/readback preserved TEST ONLY PDF bytes. Actual fictional endorsement acquisition and byte recovery were verified; this does not establish recovery of every provider file.
- Fourteen focused automated tests passed for encryption, corruption/wrong-key refusal, missing bytes, unsafe paths, incomplete snapshots, partial failure, scoped identity and emulator target guards.

## Operator runbook

1. Operator owns export approval, password custody and backup checks. Keep the password separately from Drive and never send it through chat.
2. Back up before a planned release and after an approved test dataset change. Quiesce synthetic writers for demo exports. Do not label two sequential live reads a consistent production snapshot.
3. Package through backup-private.ps1. Upload encrypted output only to Restricted PATHWAY BACKUPS; retain the original checksum separately.
4. Download and restore through restore-private.ps1 using the original expected checksum. Failed checks mean no new known-good recovery point; keep the previous verified archive.
5. Rehearse only in dedicated emulators or the expressly approved recovery project. Do not run scoped-auth-import-qa.js again against its existing account: collision refusal is intentional.
6. Keep at least three distinct verified dataset snapshots when available. Multiple encrypted variants of the same demo snapshot are not independent recovery points. No automatic deletion is enabled.
7. On failure, inspect sanitized status, preserve isolated partial output, and choose a new restore directory. Do not overwrite live records or reset passwords to manufacture a passing recovery test.
8. Treat decrypted staging as sensitive. Never upload it, commit it, or automatically remove it without an authorized cleanup decision.

## Explicit remaining production gates

- Complete authorized inventory/export of all necessary Firestore collections/subcollections and Auth users; current scope is one live test profile/account plus an independent demo dataset.
- All referenced document bytes, company/section/messages/notifications and other excluded records; current archive is not a full live dataset.
- Consistency strategy, full relationship/count reconciliation and supported production restore adapters. Current production link writes remain disabled.
- Recovery of rules/indexes/deployment configuration and external mailbox access through separately controlled recovery procedures; do not archive refresh tokens indiscriminately.
- Three distinct recovery points, measured recovery time/point objectives, storage-capacity planning, recurring operator evidence and failure-alert delivery. No timing SLA or unattended backup claim is supported.
- Production-sized restore rehearsal and review of provider quota/access constraints before real student onboarding.

No billing changes, production-wide export/import, live link replacement, test-account deletion, or manuscript changes are authorized by this closeout. Proceeding to independent Phase 9 checks is possible while these gates remain visible; it does not imply production release approval.
