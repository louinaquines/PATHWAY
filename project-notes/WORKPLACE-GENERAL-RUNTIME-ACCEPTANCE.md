# Synthetic general-input runtime acceptance — October 23, 2026

Status: synthetic-only implementation verified locally. Not a live general-input runtime; no deployment or ordinary-student sharing authorization.

## Scope

Approved 2026-10-23-WORKPLACE-GENERAL-RUNTIME-DESIGN.md and PLAN.md. Three new files under PATHWAY-backend/security-tests plus runner registration. Production server, existing worker/adapter/pricing, UI, native client and executable dispatch modes remain unchanged. All count/generation responders are injected synthetic functions; no HTTP defaults, key loading, provider calls, emails or APK.

The analyzer uses the existing canonical request serializer and response validator with a fixed nonsecret SYNTHETIC-ONLY marker. It preserves the 5000-byte serialized envelope, original source, model/options and conservative allowance. Counts must be safe integers 1–12000; this is a simulated admission policy, not approval for real-data use or a proven token/billing bound.

The test-only selection must arm before a new actor-scoped submission exists. The job is derived from that receipt; existing/historical receipts are refused. Persistent fake stage claims bind the actual worker lease owner, process session, source/consent revision, request/profile hash and UTC accounting day. Count admission is persisted before generation eligibility. No claim can be replayed after an uncertain boundary or restart.

Both Firestore and fake-local reservations precede simulated counting. Failed/uncertain count or generation does not refund/recreate allowance. Generation requires an owned fake stop ticket and fresh guards. Actual late transaction completion, source/consent changes, midnight, shutdown and stale results must prevent the next boundary or outcome. A failed stop write prevents generation and returns a sanitized error; no claim is made that an unwritable disk can always preserve a stop. Persistent claims/reservations are the additional fail-closed boundaries.

Temporary fake ledgers must be under a resolved temporary subdirectory. Canonical paid ledger paths and existing stops are refused. The worker's existing onAccountingUncertain callback is wired to fake stop, including uncertainty before analyze. No promise of cross-store atomicity, remote cancellation or recall of already-shared text.

## Implementation decisions

- Added explicit source/enabled/local-env and assertLocal inputs because source preparation is not sharing authority and the original callback list lacked stop-ownership validation. No production interfaces changed.
- Added pre-submission arm and derived the job from its receipt rather than trusting an independent job ID. A persisted synthetic selection prevents a restart from reclassifying a historical submission as new.
- Used the existing ledger in a test-only temporary wrapper, with a separate fake stop marker and process-local Symbol ticket. It cannot choose a canonical paid ledger.
- The worker's single 25-second analyzer deadline covers count plus generation; preparation, reservation and finalization are outside it. No new end-to-end deadline or lease renewal was introduced.

## Verification record

Initial seven unit tests failed because the implementation module was absent, then passed after minimal analyzer implementation. Initial integration RED failed on missing claim/accounting factories; first focused integration GREEN was 13/13. Expanded run was 20/20. A later unit test reproduced raw stop-write diagnostic propagation; the catch path now remains sanitized and starts no generation. The 24-test adapter/input/runtime focused run passed after that fix; subsequent final coverage adds shared-deadline, shutdown and post-transaction lease checks.

An early attempted new runner selector was not yet installed and selected the old default suite. That owned partial run was stopped and its listeners released; it is not counted as a completed regression. The explicit selector was then added, and subsequent focused runs selected only the intended files.

Canonical pilot evidence checkpoint before final verification: ledger/continuity SHA-256 ee31eabf015e229bd20c477a32cae3257e4c8dc42df037b724a4e54659d48eb2; started marker 80d018bef2052bf984bb58473c18192bb6165c106819b431aed2c364b01f3d9f; stopped marker fa9ac579d1e269285c22010d9ec469ededc29c66ceea6e430249e1235f219f4e. Stop present, no lock held. Saved QA snapshots were not imported/reset by these isolated test emulators.

Final focused run: **24/24 passed**, no failures/skips/cancellations, 80.812 seconds; output/release/workplace-general-runtime-final-focused.log. This includes the actual worker's 25-second timeout, post-transaction lease expiry and shutdown checks. Focused counts overlap the full suite, not additional coverage totals.

Independent static review found no confirmed Critical/Important issues. Two Minor test gaps remain explicitly deferred: the canonical-path rejection test omits other required arguments, so it does not isolate that path guard; restart tests simulate transport failure after claims but do not directly exercise a lost stage-transaction acknowledgment or crash immediately after accepted-count persistence. Those exact crash windows are not verified by the current tests; do not generalize the simulated restart result to exhaustive crash correctness. Reviewer did not execute tests, inspect canonical evidence independently or certify unchanged subsystems, unrelated edits or live/production behavior. No model-quality, hosted scheduling, general token-bound, production safety or native-release claim follows from synthetic acceptance.

Final fresh backend npm test: **277/277 passed**, zero failures/skips/cancellations, 462.228 seconds. Log: output/release/workplace-general-runtime-full.log. Focused counts overlap this total. Expected permission-denied messages are negative security checks; emulator SIGINT is successful teardown. Syntax and scoped diff checks passed. Canonical pilot hashes were rechecked against the checkpoint above and matched, with stop present and no lock. No web/native tests/builds were run because no client code changed. No production/provider enablement, paid requests or credential access occurred.

## Follow-up: strengthened review-gap tests

User requested continuation. Changed tests only: canonical-path rejection now supplies otherwise valid attempt/session/day/clock arguments, isolating the path restriction rather than accidentally failing required-input validation. Added committed-stage/lost-acknowledgement injection at count, accepted-count and generation stages using real emulator transactions. Each case confirms the write actually persisted, the next transport did not start, replay/new-session arming was refused, no case appeared, and the fake stop/reservation remained.

Fresh focused emulator suite: **25/25 passed**, no failures/skips/cancellations, 90.932 seconds; output/release/workplace-general-runtime-gap-check.log. No implementation code changed, so this is added characterization coverage, not a newly fixed runtime bug or a RED/GREEN implementation claim. The full 277-test result above predates this test-only follow-up; a full suite was not rerun. Lost acknowledgement after accepted-count persistence is now covered, but an actual process kill at every crash interleaving and arbitrary storage corruption remain unverified. These tests narrow the earlier review limitations; they do not prove exhaustive crash safety. No live calls, credentials, canonical reservations, stop removal, deployment or APK.
