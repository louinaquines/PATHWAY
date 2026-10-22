# Local automatic journal dispatch implementation plan

> **For agentic workers:** Use executing-plans inline, TDD, one independent final review and scoped local commits. No live provider or production enablement.

**Goal:** Demonstrate submission → automatic worker → private case/notice without an open coordinator screen, using fixed fake AI fixtures in local demo emulators.

**Architecture:** Preserve atomic journal/job creation and the existing worker's leases, consent/source checks, budget and case validation. Add a default-off local dispatcher: immediate wake after successful submission, startup recovery and a 15-minute recovery timer. Durable work remains in Firestore; the timer is only a wake mechanism and requires an awake process. An isolated local entry point supplies a fixed fixture-only analyzer with no fetch or credential dependency; hosted server defaults remain inert.

**Tech stack:** Existing Node/CommonJS, Express, Firebase demo emulators and Node tests. No dependencies or APK.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md, JOURNAL-BACKEND-CUTOVER.md and WORKPLACE-BROWSER-ACCEPTANCE.md. Existing checkout; preserve unrelated dirt. This plan is a synthetic dispatch demonstration, not real detection or hosted scheduling.

## Constraints

- Require explicit local-dispatch opt-in, PATHWAY_LOCAL_WORKFLOW=1, exact demo-pathway-security and localhost Auth/Firestore emulator hosts; reject production NODE_ENV/K_SERVICE. No production, paid calls, key loading, email, rules changes or deployment.
- Fake responses match only documented exact synthetic notes. Arbitrary input produces unavailable, never an invented no-concern result. Expose fixture examples in the acceptance notes. Do not reuse the real Claude adapter or alter the paid pilot ledger/stop.
- Submission must commit and return success even if immediate wake throws or work later fails. Invoke wake only after transaction commit, never inside a transaction callback; consent-off submissions do not wake analysis.
- One in-process dispatch at a time. Coalesce concurrent wakes; retain one pending wake during an active batch. Bound each invocation to four batches of five jobs; leave further work durable for a later wake. Existing worker leases protect multiple processes.
- Wake at startup and every 900000 ms; use injected timers in unit tests. Recovery target is not a hosting or exact-time guarantee. Stop clears timers/pending wakes and does not cancel or refund an uncertain worker attempt.
- Fake analysis still uses existing durable attempt/reservation limits (synthetic reservations, no invoice), malformed-response rejection and current assignment checks. No reset to make tests/demo work.
- No changes to attendance scheduling, retention cleanup, direct support or mobile build flags. Keep UI copy explicit that automatic **AI** processing remains off; fake simulation is not represented as Claude output.

## Review focus

1. Default-off/remote/production entry points must cause zero worker/analyzer/timer access.
2. A wake failure or transaction replay must not duplicate journals/jobs or turn committed submission into apparent failure.
3. Concurrent wakes, restart and queued backlog cannot multiply attempts or lose durable jobs.
4. Withdrawal, stale text/revision, expired lease, daily limits and invalid fake source remain protected through the actual dispatch path.
5. Case/notice creation must work while coordinator UI is closed, with no provider network or company contact.

### Task 1 — Dispatcher and fixed fake analyzer

Files: create PATHWAY-backend/workplaceLocalDispatch.js, security-tests/workplace-local-dispatch.test.js and security-tests/workplace-local-analyzer.js. Reuse existing fixture definitions/decision validator, not heuristic keyword classification.

Interface: createWorkplaceLocalDispatch({db,env,runBatch,setIntervalFn,clearIntervalFn}) → {start,wake,stop}; start establishes one recovery timer and startup wake; wake returns a settled promise, catches worker errors without raw logs; stop clears owned scheduling. No import-time work. runBatch consumes existing worker {limit:5}; each wake drains at most four batches, exits on busy/unavailable or fewer than five processed. Pending wake is bounded/coalesced, not unbounded recursion.

- [ ] Write RED tests for disabled/remote/production no-I/O; startup and 900000-ms recovery; overlapping wakes bounded and serialized; error recovery; stop and pending work; four-batch ceiling. Fake timers, no real waits.
- [ ] Implement minimal dispatcher and fixture-only analyzer; verify GREEN. Exact fixtures return validator-checked concern/none decisions with synthetic operational usage; unsupported source fails before analysis.

### Task 2 — Post-commit wake and local wiring

Files: modify studentJournalSubmission.js, server.js, security-tests/start-local-workflow-apps.js, concern-fixture.js and run-emulator-tests.js; add security-tests/workplace-local-flow.test.js. A small dedicated local bootstrap may be added if needed to keep fake analyzer outside hosted imports.

Interface: installStudentJournalSubmission adds optional onJournalQueued callback, receiving only job ID. Existing callers omit it unchanged. Invoke after successful committed queued submission; errors cannot change the successful HTTP response. Idempotent receipt replay may wake the same job, but existing worker terminal state/receipts prevent duplicate analysis.

- [ ] RED HTTP/emulator tests: consent granted + submit produces one job/case/notice automatically with coordinator UI absent; no-flag yields no case; declined consent produces no job; wake failure preserves saved entry/success; replay/concurrent calls do not duplicate outcomes.
- [ ] RED recovery tests: stop dispatcher after durable submission, recreate it and process existing work; withdrawal before send cancels without analyzer; disallowed text stays unavailable; budget exhausted stays queued rather than false negative. Verify original notes are untouched.
- [ ] Wire local bootstrap/launcher behind explicit local fake-dispatch flag only. Default local UI mode stays unchanged unless flag is explicitly requested. No real adapter import, paid credentials, external fetch or silent provider fallback.
- [ ] Rerun focused tests GREEN and existing submission/worker regressions. Confirm server shutdown clears dispatcher scheduling without broad process changes.

### Task 3 — Verification and acceptance

- [ ] Fresh full backend suite; existing web/mobile suites if their contracts/source change. Record exact commands/results without adding overlapping counts.
- [ ] One read-only independent review focused on money/privacy/false-negative boundaries and bounded dispatch. Fix Important findings with RED→GREEN and green suite.
- [ ] Local synthetic walkthrough: submit an exact concern fixture with consent while coordinator UI is closed; verify one private case/notice, then open authorized coordinator review. Clearly label this fake analyzer demonstration. No paid request.
- [ ] Save results and limitations to project-notes/WORKPLACE-LOCAL-DISPATCH-ACCEPTANCE.md and scoped local commit. No push/deploy/APK. Hosted recovery, real automatic provider enablement, minimal-audit retention and native-device acceptance remain later gates.

## Handoff

New operational choices for review: an explicit fake-dispatch flag, startup/15-minute wake, at most four five-job batches per wake, and fixture-only responses rather than keyword simulation. This is not approval to enable real background Claude processing. Inline execution is recommended to keep implementation/review overhead bounded.
