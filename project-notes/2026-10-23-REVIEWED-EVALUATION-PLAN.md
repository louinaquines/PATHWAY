# Reviewed synthetic evaluation implementation and execution ledger

Approved specification: WORKPLACE-12-EXAMPLE-PAID-PREFLIGHT.md and user's explicit confirmation of reviewed local rearm, twelve examples only, reservations/stop history retained, unchanged daily/spending limits, no production changes and no automatic retries.

Goal: obtain actual predictions for the hash-pinned reviewed dataset without using student accounts/records or deploying anything.

Architecture: a local-only CLI reuses the existing Claude adapter, conservative price checker, canonical pilot ledger and scorer. Token counting precedes generation in one reserved attempt. The canonical stop is archived before each authorized reservation, immediately restored before sharing, and retained after every attempt. The ledger lock excludes concurrent evaluators. Each example has a deterministic attempt ID independent of day, so a reserved but unacknowledged attempt cannot be replayed. A valid disagreement also stops for human review; do not overwrite it with the reference label.

Files: security-tests/workplace-reviewed-evaluation.js (inert-by-default runner), workplace-reviewed-evaluation.test.js (real temporary-file ledger / fake HTTP transport), run-emulator-tests.js (full-suite inclusion). Dataset and review documentation retain the user's explicit approval; no release activation.

## Steps

- [x] Write tests for default-off, reviewed rearm, 10+2 daily split, retained stop history, invalid count, uncertainty and genuine disagreement.
- [x] Verify RED: all six fail because the evaluator module does not exist.
- [x] Implement the local-only evaluator; verify six tests GREEN with fake transport. Unprivileged Windows rename was sandbox-blocked; elevated synthetic tests passed.
- [x] Independent read-only safeguard review; fix Important findings with regression tests.
- [x] Run full backend suite once final implementation is ready; never call a paid API from a test. Final result: 315/315 passed, zero skipped/failed; output/release/workplace-reviewed-full.log.
- [x] Execute explicit paid CLI only after those gates pass; preserve its real result rows and stop at limits/failure. First bounded run: ten attempts, ten saved predictions, status daily-limit. Remaining two are not attempted.
- [x] Report partial/full results accurately, with no reliability claim from twelve AI-assisted examples. See WORKPLACE-REVIEWED-EVALUATION-RESULTS-2026-10-23.md.

Ruling: reuse the conservative 9560-microUSD reservation, rather than lower it to fit more requests. Ten attempts/day and 100000 microUSD/day remain unchanged; twelve need at least two UTC days. Cost: daily-limit completion is partial, not an automatic second-day schedule.

Ruling: this is model evaluation only, not another Firestore/browser workflow test. Existing backend privacy/routing tests cover those separate mechanisms. Cost: successful predictions do not certify hosted execution or end-to-end production readiness.

Ruling: approved rearm permits archiving known stop markers within this bounded evaluator only; no alternate ledger, history reset, production control change or unreviewed retry. Crashes preserve reservation/lock/stop evidence and block a silent resend. No automatic future execution is scheduled.

Review findings: exact-byte hashing and report/lock ordering reproduced RED and fixed GREEN. Regraded the completion-flag finding as Important because unavailable responses must not be counted as evaluated predictions; reproduced RED and fixed GREEN. Final focused unit run: 12/12 passed, zero skipped/failed; log output/release/workplace-reviewed-final-unit.log. Failed-before-fix evidence: workplace-reviewed-fix-red.log.

Ruling on review scope: official model/pricing pages were checked in preflight; runtime credentials and actual model responses will only be checked by the authorized CLI. Physical filesystem crash durability and production readiness are not certified by temporary-file tests. Language/model quality remains unmeasured until real predictions exist. Cost: results remain a small preliminary evaluation, not a production safety guarantee.

Executed under this authorization: ten reserved count+generation attempts on UTC day 2026-10-23, ten actual predictions matching approved labels, no unavailable responses. Reservation 95600 microUSD; no refunds/retries or production changes. Historical ledger prefix unchanged, continuity mirror matching, ten stop archives preserved, canonical stop restored and lock released. Two predictions remain until at least the next UTC day; no automation scheduled. The overall twelve-example evaluation is NOT complete. No deferred minor findings after regrading the misleading completion flag.
