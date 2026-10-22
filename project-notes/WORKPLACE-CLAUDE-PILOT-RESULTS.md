# Workplace Claude pilot — verification record

Date: 2026-10-22. Scope: fixed synthetic English, Filipino and Cebuano journal notes in local Firebase demo emulators only. No production deployment, APK, email or real student record access.

## Verified so far

- Final focused adapter, persistent-ledger and submission-to-private-review tests: **19/19 passed**, zero skipped. Evidence: `output/release/claude-review-green.log`.
- Fresh complete backend suite after review fixes: **183/183 passed**, zero skipped, 289.6 seconds. Evidence: `output/release/claude-pilot-final.log`. Baseline was 164/164. Do not add focused counts to the full suite.
- Seven integration tests exercise actual local HTTP consent, journal submission and coordinator review endpoints. They cover original evidence/private notices, assignment changes, declined/withdrawn consent, no-concern results, stale source/lease, accounting failure, usage-overrun braking, exact target-job payment and midnight rejection.
- HTTP provider responses in these tests are synthetic. They do not establish Claude accuracy, multilingual comprehension or emergency detection reliability.

## Real-provider evaluation

Independent review accepted the fixed-source engineering allowance and raised four Important findings. All four were addressed with regression tests: exact job/source binding, persistent failure stop, separately fsynced ledger continuity, and pinned UTC attempt identity. No second review was claimed. The post-fix full suite passed before the explicitly opted-in real-provider command was started. Outcomes are recorded below when that command finishes.

Planned sample: nine fixed notes, three immediate-danger, three ordinary/negated/training, three normal-priority concerns. No prompt tuning or automatic retries during the evaluation.

Proposed reservation: 9560 micro-USD per attempted request, up to nine planned requests (86040 micro-USD), within the existing daily ten-attempt/100000 micro-USD reservation allowance. This is an engineering reservation, not a provider-certified input bound, account spending limit or invoice guarantee.

### Observed paid-pilot attempt — 12:09 UTC

- Command: local Firebase demo `emulators:exec`, explicit paid-synthetic flag and process-only opt-in.
- **Stopped** at `en-danger`: unavailable, `PILOT_STOPPED`, `requestAttempted: true`.
- **One external fetch attempt**, **9560 micro-USD reserved** ($0.00956). Actual provider tokens/billed cost are unknown; no validated provider usage or decision was returned. This does not prove that Anthropic received or billed the request.
- **Eight untested**: fil-danger, ceb-danger, en-ordinary, fil-negation, ceb-training, en-coercion-injection, fil-harassment, ceb-mistreatment. Zero verified classification results; no accuracy percentage is meaningful.
- No automatic retry. The durable `.stopped` marker is present; reservations and the independent continuity journal remain intact. Do not remove/reset them to rerun without explicit review.
- Detailed failure classification was deliberately not retained by the current runner; the sanitized generic stop does not distinguish provider rejection, transport failure or output validation. This is a monitoring/debugging limitation, not a confirmed Claude service outage. A future approved diagnostic should retain allowlisted failure codes without raw provider bodies or secrets.
- Evidence: `output/release/workplace-claude-paid-run.log`, `workplace-claude-pilot-2026-10-22T12-09-47-298Z.jsonl`, and `workplace-claude-pilot-reservations.jsonl` plus continuity/stop sidecars.

**Status:** local adapter/workflow implementation and synthetic regression verification are complete; real-provider validation is blocked after the first unavailable attempt. No release or model-reliability claim is made.

## Deferred review items and implementation rulings

- Deferred: more granular sanitized failure codes; independent comparison of expected fixture evidence to returned evidence (literal-source validation remains enforced).
- Fixed-source token allowance is an engineering estimate accepted by review, not an invoice guarantee. Cost if wrong: live validation remains insufficient for a billing guarantee.
- Local placement checks mirror inline server guards instead of importing the hosted server; cost if wrong: fixture fidelity, not hosted authorization.
- Live availability/account allowance, language/safety accuracy, hosted authentication and production readiness were not established by this test. Cost if wrong: these results cannot justify release; release stays gated.

## Diagnostic-only follow-up

The user separately approved safe failure diagnostics, not another paid attempt. This addresses the earlier deferred generic-failure reporting limitation: HTTP status and fixed transport/response-validation/usage/accounting/worker/workflow codes now survive the pilot's worker boundary. Raw provider text, headers, keys and arbitrary error messages are excluded. Historical failure detail cannot be recovered.

Fresh verification: 21/21 focused tests and 185/185 full backend tests passed (overlapping counts), independent review found no Important bugs/security gaps. No new paid calls, deployments or changes to the durable stop/reservation. Unknown wrapper fallbacks and post-validation worker-persistence failure were inspected but not directly added as new test cases. See WORKPLACE-CLAUDE-FAILURE-DIAGNOSIS.md.

## Separately approved bounded diagnostic — 12:43 UTC

Added/reviewed a one-request mode after a RED regression demonstrated the original runner could send two requests. Full suite after the safety change: **186/186 passed**, zero skipped; focused **22/22** overlaps that count.

One new real request **passed** on `fil-danger` (expected/observed high); original evidence, private coordinator case and notice were validated through the local backend flow. Usage returned: 372 input and 184 output tokens. `en-danger` was not replayed. Seven fixtures remain untested. This is one descriptive synthetic success, not an accuracy measurement or resolution of the unknown historical failure.

Cumulative durable allowance: two attempts, 19120 micro-USD reserved; actual total billed cost unknown. Prior stop evidence archived intact, a new durable stop is present, and no remaining-fixture run is authorized. The CLI's all-nine completion check exits 1 for the intentionally bounded run despite its successful tested fixture; use the structured report, not that exit code, to interpret this partial result. Details and evidence paths are in WORKPLACE-CLAUDE-FAILURE-DIAGNOSIS.md. No production deployment or APK.

## Subsequently approved remaining seven — 12:50 UTC

The user separately approved the remaining evaluation. Exactly seven new fixed synthetic requests were sent; **all seven matched their expected categories**, with flagged private cases/notices verified locally and no-case results verified for the three ordinary/negated/training samples. No retry or prompt tuning occurred. Earlier receipts were skipped, not replayed. The stop was restored afterward.

Combined outcome: **eight passed, one historical unavailable**, not nine passed. Known successful-response usage is 2875 input / 1060 output tokens; cumulative reservation is nine attempts / 86040 micro-USD ($0.08604), not actual billing. No code/deployment/APK changes in this continuation. See WORKPLACE-SYNTHETIC-ACCEPTANCE.md for per-sample results, evidence, CLI exit-code limitation and manuscript-safe wording.

## Release limitations

The adapter and runner are default-off and not connected to hosted submission or a scheduler. Current consent/source/lease and coordinator-assignment checks remain mandatory. Fluent language/safety review and unresolved release retention decisions remain separate gates. An unavailable result must never be interpreted as no concern.
