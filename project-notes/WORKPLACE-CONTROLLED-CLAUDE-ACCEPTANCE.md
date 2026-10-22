# Controlled local Claude dispatch — implementation verification

2026-10-23. Implemented and verified locally. Initial controlled-dispatch backend suite: 244/244 passed; latest tier/routing follow-up: 247/247 passed (see below). Three initial Important independent-review findings fixed with RED→GREEN regressions; scoped Minor limitations are recorded below. This is not release approval or permission for a paid request.

## Boundaries

- Separate explicit controlled-Claude mode; exact demo project, localhost Auth/Firestore, nonproduction context, one selected synthetic student/request and one canonical fixture. A UTC window must be current and no longer than 15 minutes. Stale pricing disables the mode.
- The window is armed only if its actor-scoped journal receipt does not exist. A restart must match the saved window fingerprint. The committed receipt determines the new revision-1 job; callback arguments cannot select a job. Historical work, other students, revisions and arbitrary notes are excluded.
- A transactional window claim precedes local accounting. The existing worker reserves its Firestore daily allowance; the existing fsynced ledger reserves the local allowance. Neither uncertain reservation is refunded. Both retain the existing 10-attempt / 100000-micro-USD UTC-day ceilings.
- The durable pilot stop is written before HTTP, success or failure. The executable factory uses only the existing canonical paid ledger and refuses its stop; it cannot select/create another ledger. Tests use separate temporary synthetic ledgers. Existing paid receipts, continuity and stop have not been reset.
- The worker rechecks current source, consent, eligibility, lease and pricing immediately before provider access and before applying outcomes. Current coordinator assignment controls private in-app notices. No company contact, email, automatic sanctions or rewriting original notes.
- Startup/submission wakes target only the bound job; one bounded retention recovery runs per wake. The recovery target remains 15 minutes while awake, but a maximum-15-minute test window generally expires by the first timer tick. Expiry stops new sends, not text already shared. No continuous monitoring or guaranteed response time.
- Operational results contain only bounded status/count fields, never source, keys or provider body. Failure is unavailable, not a negative concern finding. No fallback provider or fixed-fake success.

## Wiring and configuration

Default/hosted startup does not load the controlled runtime. Fake and controlled flags together are refused. The ordinary local launcher remains unchanged and strips provider credentials; it is not an approved paid-test launcher.

The separate factory expects `PATHWAY_WORKPLACE_CONTROLLED_CLAUDE=1`, existing local emulator configuration, and `PATHWAY_CONTROLLED_STUDENT_ID`, `PATHWAY_CONTROLLED_REQUEST_ID`, `PATHWAY_CONTROLLED_FIXTURE_ID`, `PATHWAY_CONTROLLED_START_AT`, `PATHWAY_CONTROLLED_END_AT`. The API key is read only after local/window/fixture gates and the existing canonical ledger/stop checks. No checked-in defaults enable this mode.

## Verification record

- Initial gate and integration RED: missing module / unavailable runtime. First focused GREEN: 8/8.
- Additional RED regressions identified expiry timer cleanup, competing wake stopping the valid owner, invalid clock propagation, misleading complete status, UTC midnight crossing and abandoned pre-send lease recovery. Evidence logs are under output/release/workplace-controlled-*.log.
- Focused `node security-tests/run-emulator-tests.js --workplace-controlled-only`: 22/22 passed, zero skips/failures, 35.100 seconds. Log: output/release/workplace-controlled-focused-green.log. Includes both daily ceilings, exact receipt/replay/restart binding, old receipt/source refusal, competing wake, stop/uncertainty, invalid output, usage overflow, consent/source/lease races, reassignment, no-concern result, cleanup failure and startup gates.
- One independent static read-only review found three Important issues. Regressions reproduced all three before the fix pass: a submission wake lost while startup was finishing an absent-receipt transaction; a lease expiring after the final authorization transaction callback; and unknown Firestore reservation failure without a durable pilot stop, including lost commit acknowledgement and failed job finalization.
- Fix pass retains pending wakes through both lifecycle layers, checks lease freshness after the transaction resolves, and invokes an accounting-uncertainty boundary that blocks the window and persists the existing pilot stop before finalization. No second review is claimed; fresh author-run full-suite verification follows.
- Historical full run during review-regression development: 241/244 passed, three expected review regressions failed, 401.020 seconds. Log: output/release/workplace-controlled-full.log. This is not a passing full-suite claim.
- Post-review focused run: 25/25 passed, zero skipped/failed, 41.408 seconds. Log: output/release/workplace-controlled-review-green.log. Actual emulator transactions are used; only transaction completion timing/failure is injected around the database boundary, and provider responses are synthetic.
- Final `npm test` in PATHWAY-backend: 244/244 passed, zero failures/skips/cancellations, 384.209 seconds. Log: output/release/workplace-controlled-final-full.log. This includes all three reviewer regressions and the existing backend security suite; focused counts overlap this total. Expected permission-denied logs are negative security tests and emulator SIGINT is teardown. Syntax checks and scoped staged-diff checks passed.
- Deferred Minor: inner completion or timer expiry can retain the executable ledger lock until explicit wrapper/server stop or a subsequent wrapper call. This conservatively prevents another process starting; normal shutdown releases it. No paid continuation is authorized.
- No client source/contract changes. No browser/native walkthrough, APK, live provider call, production access, push or deployment.

## Later paid-test authorization sheet — NOT APPROVED OR EXECUTED

- Destination: Anthropic Messages API, canonical validated Claude adapter only.
- Candidate fixture: `en-danger`, the exact immutable English synthetic source in workplace-claude-fixtures.js; no arbitrary student writing.
- Candidate actor: `c-student` in demo-pathway-security only. Confirm explicit current consent; do not enroll automatically.
- Request identity: a newly approved, unused request ID, chosen for that test. No historical receipt/backfill.
- Maximum: one external fetch attempt, zero retries. Historical engineering reservation: 9560 micro-USD ($0.00956), not an invoice guarantee. Existing daily counters still apply.
- Window: exact UTC start/end must be approved later; at most 15 minutes. No active window is approved by this sheet.
- Before any paid attempt: refresh official Anthropic API/model/pricing documentation, review the fixed-source token allowance, inspect nonsecret remaining allowances, and obtain explicit approval to handle the existing durable stop. Preserve historical stop/continuity evidence; never reset receipts or choose a fresh ledger to bypass it.
- Afterward: preserve reservation/uncertainty and the durable stop, withdraw synthetic consent if authorized, stop only owned local services, and record the observed result separately from these fake-response tests. Rollback is disabling the controlled flag and restarting the local server, not refunding reservations.

General-input bounds, language/safety evaluation, original-journal/backup retention, hosted scheduling/deployment, rules/client cutover and native release remain separate gates. Local window records are synthetic test/accounting guards, not a new real-student retention policy.

## Implementation rulings and review exclusions

- Arm only while the selected receipt is absent; restart requires the identical fingerprint. This can reject an already-saved synthetic submission, intentionally preventing historical/backfill authorization.
- Wire the server only after controlled-runtime safety tests; defaults remain off. Incorrect configuration means unavailable, never fallback.
- Spend the window before local reservation. Cross-store interruption can consume an allowance without a request; explicit later review is required instead of refund/retry.
- Keep coupled runtime/bootstrap artifacts in one scoped local commit after verification, avoiding missing intermediate modules. This trades finer commit granularity for an internally consistent change; unrelated edits stay excluded.
- The reviewer did not certify live API/model/pricing/token bounds/detection quality, production/real-student/legal suitability, independent older subsystem correctness, or exhaustive crash interleavings. Those remain separate checks; author-run suite evidence is not independent execution or a release guarantee.

## Next-gate local readiness check — 2026-10-23

Read-only filesystem inspection at 01:56:06 Asia/Manila (2026-10-22T17:56:06.022Z): the canonical reservation ledger records nine attempts / 86040 micro-USD reserved for the October 22 UTC accounting day. Its continuity copy matches, the durable stop is present, and no ledger lock is held. These are historical reservations, not an actual-billing statement or a new allowance authorization. No ledger, sidecar, stop, configuration or production record was changed.

Current Anthropic documentation compatibility is recorded separately in 2026-10-23-ANTHROPIC-CONTROLLED-PREFLIGHT.md. Do not refresh the code's price profile, switch models or clear the stop based on documentation research alone. Current synthetic consent, an unused submission identity, an approved exact UTC window and separate permission for any external request are still required; none was activated by this check.

Preflight outcome: **HOLD the paid gate.** Official documentation confirms the configured model ID and disabled-thinking/low-effort combination, but the request omits the service-tier and inference-geography selectors assumed by FEATURES. The documented request default can use Priority capacity and an omitted geography follows workspace configuration. Any local patch must reconcile this with the pinned API version and permitted workspace geography; do not change workspace settings or bypass an API denial. The 14,000-token allowance is still an engineering assumption, not provider-certified.

Current documented short-prompt rates are lower than the code's historical reservation rates. This research does not lower the 9,560-micro-USD reservation, extend the price-profile expiry, verify this account or authorize credentialed token counting. See the separately cited research note for exact rates, limitations and prerequisites. Only documentation changed in this step; the previous 244/244 backend result remains historical code-verification evidence, not a fresh provider-compatibility test.

## Local tier/routing follow-up — 2026-10-23

User approved addressing the gaps locally using synthetic responses while retaining the conservative reservation. The adapter now requests `service_tier: "standard_only"` and `inference_geo: "global"`, matching the documented [tier selector](https://platform.claude.com/docs/en/api/service-tiers) and [inference geography selector](https://platform.claude.com/docs/en/manage-claude/data-residency). It requires response usage to report `service_tier: "standard"` and `inference_geo: "global"`; absent, null, unknown, Priority or US-only metadata is unavailable, not a validated decision. A workspace/API rejection never triggers fallback or workspace-setting changes.

The model, pinned API version, 14,000-input engineering allowance, 1,024-output cap, 5,000-byte serialized-request limit, 9,560-micro-USD reservation, original profile expiry and daily ceilings are unchanged. Tests prepare all nine canonical fixtures without HTTP and independently check each still reserves 9,560 micro-USD. This verifies local arithmetic/byte-limit behavior only, not provider tokenization, actual billing or account/API-version compatibility. No credentialed token count was authorized or performed; the paid gate remains held pending that separate review/authorization.

TDD evidence: the initial adapter run failed on omitted request selectors and accepting absent response metadata (workplace-routing-red.log). After the minimal adapter patch, 10/10 adapter tests passed in 0.156 seconds (workplace-routing-unit-green.log). Synthetic workflow fixtures now include explicit valid tier/geography fields; controlled-flow cases additionally reject missing geography, US geography and Priority responses with no case/notice or retry and with the durable pilot stop retained. No browser/native/client contract changes, paid calls, token-count calls, credential inspection, production access, deployment or APK are included.

One narrow independent read-only review found no Critical or Important issues. Deferred Minor: the routing-specific integration cases assert the stop and repeat wakes, but do not additionally reopen the ledger/start a fresh runtime; their aggregate HTTP count is weaker than an individual per-case count. Prior generic restart tests are not claimed as these exact routing-specific scenarios. Reviewer did not execute tests or certify live account/API-version compatibility, tokenization, older subsystems, production or unrelated edits; fresh suite execution remains the author's responsibility.

Final fresh `npm test` in PATHWAY-backend: **247/247 passed**, zero failures/skips/cancellations, 397.141 seconds. Log: output/release/workplace-routing-final-full.log. Unit counts overlap this full total. Expected permission-denied output belongs to negative security tests; emulator SIGINT is teardown. Syntax and scoped staged-diff checks passed. The price-profile source has no changes from ab9b279; neither its rates nor its expiry was refreshed. Web/native tests were not rerun because no client source/contracts changed. All response data in the new tests is synthetic; no live-provider compatibility claim follows from this result.
