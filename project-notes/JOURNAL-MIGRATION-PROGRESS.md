# SDD ledger — plan: project-notes/2026-10-22-JOURNAL-CONSENT-QUEUE-PLAN.md

User approved local implementation, no deployment/APK. Work remains in the existing checkout under the user's one-project preference. Earlier budget commit 91175d3 is the baseline; unrelated journal scoring/prompt/UI edits remain unstaged unless explicitly included in scope.

## Rulings

- Share strict consent version, actor freshness and actor-scoped digest helpers from workplaceJournalConsent.js, rather than duplicating protocol checks. Risk: shared module changes affect both APIs; focused integration tests cover both.
- Keep existing Firestore rules unchanged: default deny protects new root collections; real-role tests verify this while asserting legacy owner writes and new-entry reads still work.
- Add sourceHash to job pointers: legacy direct revisions do not advance sourceRevision, so future workers must check both. No provider receives text in this stage.
- Use existing Firestore locally generated auto IDs for opaque mobile request identities; no new Expo crypto dependency. Read exact SDK-54 docs before mobile edits. No Expo SDK API changes.
- Retain in-memory draft identities only, as scoped: app termination recovery is not implemented or claimed. Closing a draft is an intentional discard; failures keep it open.
- Stage one cohesive migration commit after all verification rather than intermediate commits sharing a partially registered server module. Risk: larger local review unit; independent review covers the full scoped change. Never push local main.
- Fix the leftover old Complete assertion in journal-week-range.test.js to the already approved Sufficient detail policy; also verify new server reporting periods against the same literal fixtures.

## Evidence so far

- Consent test first RED: missing module; then 3/3 passed in real demo emulators.
- Submission test first RED: missing module; then combined API suite 10/10 passed.
- Mobile helper first RED: missing service; then 3/3 passed (no external calls).
- Docker packaging RED: missing new modules; Docker COPY updated and packaging test passed. No image built or deployed.
- Mobile consent component and real screen branches tested with React Native host shims: 5/5 passed. One initial test used the wrong existing button label; corrected test selector, not product copy.
- Mobile screen/component/helper Babel syntax parse passed. These are not Android device or visual-layout tests.
- Full backend regression currently running; log output/release/journal-migration-full-backend.log. Additional bound/privacy/concurrency cases included where loaded by the runner; verify final output rather than assuming they ran.
- Independent reviewer Aristotle (01a16273-43b8-7bb1-8908-026401a03efe) reviewing API/mobile integration. No paid calls or production changes.

## Remaining gates

Read final full-suite output; run any newly added tests absent from that run; address important review findings with RED/GREEN evidence; verify scoped diff and commit; record limitations. No finished automatic-alert feature claim.

## Independent review fix pass

Aristotle identified three P2 findings: legacy resubmit/reject cycles could keep sourceRevision unchanged and be overwritten; eligibility changes blocked identical successful receipt replay; uncertain consent refresh retained a definitive stale choice. Reproduction logs: journal-migration-review-red.log (2 failing backend cases, 13 passed) and journal-migration-ui-review-red.log (1 failed, 5 passed).

Fixes: require expectedSource snapshot including original/refined/AI flag/hours/reviewedAt for rejected-entry revisions; check fresh role/password before receipt replay and gate only new writes on placement/clearance; clear displayed consent to unknown during refresh or uncertain writes. Snapshot comparison is server-owned hashing; mobile sends original expected fields over the authenticated backend boundary, never a claimed authoritative hash.

Ruling: add the expectedSource request field beyond the initial plan — sourceRevision alone cannot detect old direct-write clients; cost is a bounded extra original/refined snapshot in the authenticated resubmission payload, never in receipts/audit/jobs. This prevents silent data loss without prematurely closing legacy writes.

Ruling: receipt replay is an authenticated read of previously committed IDs/status, not a new journal mutation — placement deactivation should not make an uncertain success irrecoverable. Revoked role/password access still denies replay. This replaces the earlier cutover-note assumption that eligibility must block replay too.

Before fixes: full backend 121/121 passed; extra bound test then targeted migration suite 13/13; full web 184/184. These earlier green results do not substitute for final post-review verification, currently in progress.

## Final verification and handoff

All three review findings fixed in one pass, with observed failing reproductions before fixes. No deferred review findings. Final full backend npm test: 124 passed, 0 failed, 0 skipped; includes consent/submission, real transaction races, rollback, client-denial/legacy compatibility, 1001-history bound, stale legacy draft and committed-receipt recovery cases. Final full web suite: 185 passed across 43 suites, including actual mobile consent component and both LogbookScreen branches with host shims. Separate focused journal/provider/helper/packaging tests: 33/33 passed after fixes. Babel parse of all three changed mobile files passed. Logs: journal-migration-reviewed-backend.log and journal-migration-reviewed-web.log under output/release.

No Android/device or visual-layout run, no actual Docker image build, no live APIs/provider calls and no deployment. Host-shim tests verify interaction/state, not native rendering. Full emulator test logs include expected negative-authorization errors and harmless metadata lookup warnings. Source whitespace checks passed; final staged check must still run before commit.

Tasks 1–4 complete locally with the above review rulings. Commit includes only migration files and the leftover approved-label test correction, not prior user/UI/prompt/scorer edits. MANUSCRIPT-CHANGE-CHECKLIST.md has a pre-existing approved-label hunk; only its new migration note should be staged. Legacy compatibility and automatic processing remain off/default unchanged. Future worker, provider-price reservation, alerts, retention policy and release approval remain outstanding.
