# Workplace Claude pilot failure diagnosis — 2026-10-22

Scope: read-only code/evidence investigation and existing fake-HTTP unit tests. No application-code edits, new paid requests, credential inspection, deployment, or stop-marker changes.

## Confirmed findings

The historical provider failure cannot be identified from retained evidence. This is a confirmed diagnostic-information loss, not a confirmed authentication, billing, model, network or Claude outage.

1. `workplaceClaudeAdapter.js` distinguishes transport (`CLAUDE_TRANSPORT_UNCERTAIN`), unsuccessful HTTP (`CLAUDE_PROVIDER`) and malformed/unsupported output (`CLAUDE_OUTPUT`). Unsuccessful HTTP bodies and status are not retained.
2. `workplaceJournalWorker.js` catches adapter errors and writes only unavailable/retry state; it does not preserve these safe codes. The pilot also cannot distinguish a validated adapter response followed by a failed database outcome from a provider failure.
3. `security-tests/workplace-claude-pilot.js` catches the final failure and records only `PILOT_STOPPED`, discarding the remaining distinction. The local emulator was ephemeral and shut down after the command.
4. Durable evidence confirms exactly one fetch invocation/reservation at 12:09:48.412 UTC and eight untested fixtures. It does not establish that the provider received/billed the request. The report was last written around 12:09:50 UTC, inconsistent with exhausting the configured 25-second timeout, but still consistent with an immediate network failure, HTTP rejection, output rejection or later workflow failure.

## Request compatibility check

Official documentation confirms `claude-haiku-5-5` is a fixed model ID without a date suffix: https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide . The thinking compatibility table permits `thinking: {type: 'disabled'}` at low effort for Haiku 5.5: https://platform.claude.com/docs/en/build-with-claude/thinking . These checks do not verify this account's access or explain the historical attempt. No evidence supports changing model IDs, increasing limits or rotating the key as a fix.

Existing adapter tests rerun: **6/6 pass**, fake HTTP only. They demonstrate distinct HTTP, transport and output failures before the worker/runner collapse them; they do not diagnose the prior real response.

## Recommended next change — before any retry approval

Add bounded, allowlisted diagnostics to the adapter-to-pilot boundary and test with fake HTTP: failure stage, fixed error code, HTTP status when available, safe stop-reason enum and usage-bound flags. Preserve no raw response bodies, headers, request text, thinking, key or arbitrary exception message. Capture adapter errors before the worker swallows them and distinguish successful provider validation from failed case persistence. Unknown values must become a fixed unknown code.

Keep the existing durable stop, reservation journal and continuity copy unchanged. Do not send a paid diagnostic, reset allowance, expand limits or deploy as part of this change. A later separately approved attempt can collect new evidence; it cannot recover the discarded historical response.

## Approved follow-up implementation

The user approved the diagnostic-only follow-up. Adapter exceptions now carry fixed stages/codes, numeric HTTP status where available, and fixed response-validation reasons/stop-reason enums. Unknown provider stop reasons become `unknown`; no provider text is projected into the diagnostic.

The pilot captures these allowlisted fields before the worker catches the exception. It separately identifies accounting, submission, worker, review/workflow and usage-bound failures. A `providerValidated` boolean distinguishes a validated decision followed by worker/review failure from missing valid provider output. These diagnostics are included in failure report rows and CLI output. The hosted worker and its response contract are unchanged.

Tests were written first and failed on missing diagnostics, then **21/21 focused tests passed** (`claude-diagnostics-red.log`, `claude-diagnostics-green.log`). Fresh complete backend regression: **185/185 passed**, zero skipped, 282.7 seconds (`claude-diagnostics-full.log`). Focused counts overlap the full suite and must not be added. All test HTTP is fake; no new paid request occurred. The historical single reservation and durable stop were checked and remain intact.

Independent read-only review found no Important bugs or security gaps in the four-file diagnostic diff. Coverage limitation: unknown wrapper fallbacks and post-validation worker-persistence failure were inspected but not directly exercised by the added fake-HTTP cases; the new workflow-failure case exercises the review boundary after validation. This is not a new real-provider success claim.

## Separately approved single-request diagnostic

The user approved proceeding to the bounded diagnostic. A runner safety gap was found before sending: the CLI had no one-request mode. Added `--diagnostic-once` / `maxRequests: 1` with allowed values only 1 or the original 9. The new regression failed because two HTTP calls occurred, then all **22/22 focused tests passed** after the fix. Independent static review found no Important issues. A fresh full suite is required before sending.

One-request mode skips already reserved fixture identities, sends at most one new fixed synthetic source, and durably stops after success as well as failure. Existing reservation history and continuity are not reset. The previous stop evidence must be preserved in a reviewed archive, and the stop restored if setup fails before a new one is written. No automatic retry, remaining-fixture run, deployment or setting change is authorized.

### Observed result — 12:43 UTC

- Before payment: full suite **186/186 passed**, zero skipped (`claude-once-full.log`, 288.1 seconds). Focused 22/22 overlaps this count.
- Exactly **one** new request. `en-danger` was skipped as previously reserved; `fil-danger` **passed**, observed high priority with validated exact source evidence. The actual local HTTP review APIs verified the private coordinator case and notice.
- Returned usage: **372 input / 184 output tokens**. One new 9560 micro-USD reservation; cumulative two attempts / 19120 micro-USD reserved ($0.01912). Reservation is not confirmed billing; the historical attempt's usage remains unknown.
- Seven remaining fixtures untested. No automatic retry or full-pilot continuation. The old stop is preserved as `.stopped.reviewed-20261022-once`; the new `.stopped` exists. Ledger and continuity history are preserved.
- Evidence: `output/release/workplace-claude-diagnostic-once.log` and `workplace-claude-pilot-2026-10-22T12-43-40-813Z.jsonl`.
- CLI limitation: the command exits 1 because its original completion check requires every fixture to pass. The bounded report explicitly says `status: bounded`, `requests: 1` and the tested fixture passed; this exit is not a provider failure. Leave as a documented minor rather than send another request or conflate a partial evaluation with a complete one.

The current backend key/request/model path succeeded once. The earlier unavailable attempt remains historically unexplained; this does not prove an outage, expired key, fixed historical defect or multilingual/emergency-detection reliability. No production deployment/settings, emails, real student records or APK were involved.
