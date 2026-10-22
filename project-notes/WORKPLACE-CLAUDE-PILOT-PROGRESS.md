# SDD ledger — plan: project-notes/2026-10-22-WORKPLACE-CLAUDE-PILOT-PLAN.md

User approved the explained paid synthetic pilot on 2026-10-22. Baseline 24c2e85; existing checkout per user preference, no deployment/APK or changes to the existing provider's emulator block.

- Task 1: implementation complete — adapter missing-module RED then 6/6 fake-HTTP GREEN.
- Task 2: implementation complete — ledger missing-module RED then 5/5 GREEN; paid run still gated.
- Task 3: workflow RED on absent student-auth middleware, then 16/16 focused GREEN including five HTTP integration cases. Full regression suite and independent review in progress. No real calls yet.
- Ruling: hosted placement guards are inline and not exported; the demo fixture mirrors their checks rather than importing server.js and starting production services. Cost if wrong: fixture fidelity, not authorization in hosted runtime.

## Pre-flight

- Adapter → worker: preserve the existing five metadata fields and usage/decision result; usage overflow returns usage only to trigger the worker's durable brake.
- Accounting → adapter: every potential external send needs both the existing Firestore allowance and a durable local receipt; never reset the pilot ledger with emulator data.
- Fixture → runner: real sends accept only exact fixed synthetic notes. Credentials are loaded only by the explicit CLI entry, never exposed.
- Ruling: the 14000-token input allowance is a conservative engineering estimate for <=5000-byte fixed synthetic requests, not a tokenizer proof or invoice guarantee. Independent review is a paid-run gate; unsupportable bounds mean no real calls.
- Baseline full suite: 164/164 passed in output/release/claude-pilot-baseline.log.

## Independent review and fix pass

Reviewer accepted the fixed-source input engineering allowance, not an invoice guarantee. Four Important findings reproduced: shared queue identity, nonpersistent failure stop, ledger history continuity and midnight identity split. Fixed with 19/19 focused tests passing (`claude-review-green.log`). Fresh full suite running in `claude-pilot-final.log`.

Final full suite: 183/183 passed, zero skipped, after fixes; `claude-pilot-final.log`. Earlier in-flight full run loaded pre-fix code while new regressions were being added and failed; it is superseded by this fresh run, not counted as green evidence. Explicit paid synthetic command started only after final GREEN.

Task 3: local workflow verification complete; live validation BLOCKED. One fetch attempt at 12:09 UTC returned unavailable; 9560 micro-USD reserved, actual usage/cost unknown, eight fixtures untested. Durable stop retained; no retry or production change. See WORKPLACE-CLAUDE-PILOT-RESULTS.md. Scoped local commit only.

- Targeted job execution now uses the existing worker authorization/lease/budget checks, with an exact job ID and only the current fixture source allowed.
- A durable stop marker survives reset/restart; no automatic recovery command is supplied.
- A separately fsynced continuity copy must exactly match the reservation journal. Interrupted writes or loss of complete trailing rows fail closed. Deliberate coordinated deletion/tampering of all local state is outside this operational safeguard; files are not an external billing authority.
- One UTC attempt context binds submission and receipt; day changes/rollback before sending fail closed.
- Final: minor (deferred): reports collapse provider failures to PILOT_STOPPED; expected evidence is not independently compared to returned evidence. Decisions still require literal source quotes.
- Final: Ruling: live availability/key/account allowance can only be established by the explicitly authorized pilot; no invoice guarantee is inferred. Language/safety accuracy, hosted authentication fidelity and production readiness remain outside this local test. Cost if wrong: pilot results are insufficient for release, so release stays gated.
