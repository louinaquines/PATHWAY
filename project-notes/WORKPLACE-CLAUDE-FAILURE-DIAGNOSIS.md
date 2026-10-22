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
