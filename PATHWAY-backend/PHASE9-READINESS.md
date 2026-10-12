# Phase 9 release readiness — October 12, 2026

Status: in progress; pilot-only, not production release approval.

Android checkpoint: native-platform JavaScript/Hermes bundle export passed (1054 modules; output/release/android-bundle-phase9). Device control is unavailable through ADB on PATH. ANDROID-ACCEPTANCE.md defines first-pass phone checks and separates Expo Go from signed standalone acceptance. Native device acceptance remains pending; no APK or production deployment was performed.

Current monitoring state: hourly Codex thread heartbeat pathway-health-watch is active for read-only pilot liveness checks and confirmed failure/recovery chat notifications. First scheduled run remains unverified. Recurring emails and independent always-on monitoring are not configured. Earlier disabled-state notes below describe prior checkpoints.

Alert receipt follow-up: owner screenshot confirms the one-time synthetic monitoring alert arrived in the approved mailbox Inbox. Alert transport/receipt acceptance is complete for that test. Automatic failure detection, scheduling and recovery notifications remain unverified and disabled.

Monitoring checkpoint: five local health-probe tests passed. Live /healthz initially timed out at 15 seconds, then returned HTTP 200/status ok in 284 ms on retry. Cause of the transient failure is unverified. One-shot evidence is saved; no scheduled monitor, alert delivery, provider readiness or sustained availability is established. See MONITORING-READINESS.md. No production settings or messages were changed.

Live student acceptance follow-up: owner-provided terminal output from student-rules-smoke-private.ps1 confirms Dexter's own profile and assigned section reads, all seven student query checks, other-profile denial, unscoped student-list denial and signed-out profile denial. The helper reported zero Firestore writes and no student approval changes. This completes the scoped live coordinator/student read acceptance for the rules rollout; it does not establish returned-data completeness, all client workflows or the remaining operational/mobile/recovery gates.

Owner-approved rules rollout follow-up: full firestore.rules deployed successfully to pathway-57400 using firestore:rules only. Fresh pre/post release evidence is recorded in RULES-ROLLOUT.md; the deployed source checksum matches the approved local source. Live read-only test coordinator profile/assigned-section/student queries passed, with unscoped and signed-out reads denied. Zero Firestore record writes or student approval changes occurred. Live student acceptance and the other release gates remain open. Earlier no-deployment statements below describe prior checkpoints, not the current deployed state.

## Initial local checks

- Web Jest: 35 suites / 112 tests passed, including PdfPreview. The historical PDF ESM test failure did not reproduce.
- Vite production build passed after retry outside the restrictive filesystem sandbox. Warnings remain for large JS/PDF-worker assets and mixed static/dynamic PDF imports.
- Production preflight and email-readiness unit tests: 12 passed. These validate configuration shape and packaging, not deployed secrets, service permissions, delivery or readiness.
- Initial isolated Firestore/API security run: 35/36 passed. Evaluation acceptance expected pre-OTP access and failed against the protected API. The test now requires the verification gate, denies unverified submission, requests a code through the local SMTP fixture, verifies it, and supplies the session for protected reads/submission. Runtime OTP protections were not weakened. Final rerun result pending.

## Remaining release gates

Query-authorization checkpoint: all 38 isolated security tests passed, including the added student inbox/history/proposal/final-review and coordinator section/student list query patterns. Wrong-section and anonymous queries, and unscoped coordinator student lists, were denied. Emulators shut down successfully. Production client smoke tests and deployment remain outstanding; this does not resolve mobile, operational or full production recovery gates.

Index checkpoint: the read-only production inventory captured at output/release/indexes-2026-10-11T16-58-14-428Z confirms all seven locally configured composite indexes are deployed READY. The reviewed inbox query shapes correspond to these indexes. See INDEX-READINESS.md for source-query coverage and limits: authenticated query execution and complete single-field exemption validation are not established by this inventory. No production writes occurred.

### Dependency and rollback checkpoint

October 12 npm runtime audits: backend zero advisories; web zero advisories; mobile 28 affected entries (23 high, five moderate, zero critical). Underlying advisories involve braces 3.0.3, image-size 1.2.1, node-forge 1.4.0 and sprintf-js 1.0.3, mostly through Expo/Metro and React Native tooling. This does not establish shipped-device exploitability. Do not run audit fix --force: proposed changes include an incompatible Expo downgrade. Compatible leaf updates/overrides and build/device regression remain required.

Read-only active Firestore rules/release evidence was captured at output/release/2026-10-11T16-41-25-847Z using the current CLI owner identity. No rules were deployed. Saved rule bytes are checksum-bound in release.json; this is rollback evidence, not a tested production rollback. Historical captures do not establish which rules are deployed now. Backup inventory reads succeeded but do not establish that backups exist or are sufficient.

Source review found the explicit temporary localhost:8082 exception, a 1 MiB JSON body limit, and endpoint-specific in-memory rate limits. The localhost exception remains unchanged pending owner-approved removal. In-memory limits do not establish multi-instance throttling or malware scanning. Full upload/secret/retention review remains open.

Security rerun follow-up: all 37 isolated security tests passed and the emulators shut down successfully. This includes the updated OTP-protected evaluation flow and direct read/create/delete denial checks for server-owned DTR reviews, section review checks, company conversations and reply attempts across unauthenticated and tested authenticated roles. This covers the tested cases, not a declaration of complete collection/index coverage.

Registry compatibility check: no newer published releases were available for braces (3.0.3), node-forge (1.4.0) or sprintf-js (1.1.3). A newer image-size release exists, but its major-version API differs from the function import used by the installed Metro; no blanket override was applied. These dependency gates remain open pending a compatible upstream update or a validated mitigation.

The current captured production rules source is firestore.messages-only.rules, not the full local firestore.rules validated by the isolated suite. Production enforcement therefore cannot be inferred from local results. RULES-ROLLOUT.md records the owner-approval, index-readiness, deployment, readback, smoke-test and rollback gates. No deployment occurred.

- Map remaining active collections/index queries to role/outsider denial coverage and verify production index readiness; the security-suite rerun and server-owned review/mail denial checks are complete.
- Review dependency advisories, upload boundaries, API/resource limits, retention and secret exposure without printing credentials.
- Versioned release artifact and rollback rehearsal; compare actual deployed revisions only through authorized read-only checks. No deployment is authorized here.
- Remove temporary localhost production exception only after local acceptance and explicit production-setting approval; verify deployed login/download behavior afterward.
- Health/failure-alert delivery evidence and supported operational response. Unit tests are not alert delivery.
- Android owner acceptance, unverified iOS/other platforms and Expo Go versus signed standalone-app scope.
- Phase 8 full production coverage/consistency/retention/recovery-objective gaps remain blockers; see PHASE8-ACCEPTANCE.md.

Existing uncommitted recovery work and unrelated deleted temporary spreadsheet dependencies were preserved. No production rules, configuration, provider data, billing, deployment or manuscript was changed.
