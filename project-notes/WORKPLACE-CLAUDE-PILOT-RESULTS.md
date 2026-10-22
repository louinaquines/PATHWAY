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

## Release limitations

The adapter and runner are default-off and not connected to hosted submission or a scheduler. Current consent/source/lease and coordinator-assignment checks remain mandatory. Fluent language/safety review and unresolved release retention decisions remain separate gates. An unavailable result must never be interpreted as no concern.
