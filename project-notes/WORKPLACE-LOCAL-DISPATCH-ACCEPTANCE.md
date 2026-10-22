# Local synthetic automatic dispatch — 2026-10-22

Scope: local demo emulators only. This is a fixed-fixture simulation, not real NLP/Claude detection, production scheduling, or release approval. No paid requests, company contact, email, APK, deployment, pricing-ledger reset, rules publishing or production writes.

## Behavior

- Successful journal/job transaction returns HTTP success before a best-effort wake. A wake failure cannot roll back saved notes or change the successful response. Identical receipt replay can safely wake the same durable job.
- Explicit `PATHWAY_WORKPLACE_FAKE_DISPATCH=1` is required alongside `PATHWAY_LOCAL_WORKFLOW=1`, exact demo project and local Auth/Firestore hosts. Production and Cloud Run contexts are refused. Hosted/default server startup does not import the fake analyzer.
- Startup wake, immediate submission wake, and a 900000-ms recovery timer while the process is awake. One dispatch runs at a time; concurrent wakes coalesce, with a maximum four batches of five jobs per invocation. Busy/unavailable/error outcomes stop the invocation.
- Stop clears owned scheduling; it does not cancel/refund an uncertain worker attempt. Existing durable leases, source/consent checks and daily reservations remain authoritative.
- Exact notes in `PATHWAY-backend/security-tests/workplace-claude-fixtures.js` are the only supported inputs. Unsupported text is unavailable, never an invented negative result. Flagged evidence reasons visibly say FIXED SYNTHETIC SIMULATION ONLY, not a Claude result. Operational usage/reservations are synthetic.
- The existing worker pages over terminal records too. A short processed batch can postpone later jobs until another wake. No exact-time or complete-backlog-drain guarantee is made. Expired pricing still disables processing; demo setup never resets budgets or extends pricing automatically.

## Run locally

From `PATHWAY-backend` in PowerShell, in a new demo session:

```powershell
$env:PATHWAY_WORKPLACE_FAKE_DISPATCH='1'
npm run dev:emulator
```

Omit/unset that flag to retain the ordinary inert-queue local mode. The server logs a fixed-synthetic warning when enabled. Student/portal text continues to state that automatic AI processing is off; this does not enable real AI.

One exact concern fixture (fictional testing only; do not add a prefix or change punctuation):

> My supervisor is blocking the office door right now and says he will hit me now if I try to leave. I am afraid for my immediate safety.

Synthetic coordinator UI must remain closed during submission, then may be opened to inspect the private case. Consent still requires an explicit student choice; the fake dispatcher does not enroll anyone.

## Verification record

- `node --test security-tests/workplace-local-dispatch.test.js`: 7/7 passed after RED missing implementation. Covers gates, timer/start/stop, serialized/coalesced wakes, four-batch ceiling, errors/recovery and exact fixture validation.
- `node security-tests/run-emulator-tests.js --workplace-dispatch-only`: first HTTP integration run 11/13 (expected missing post-commit hook), then 13/13 passed in 10.9 seconds. Saved logs: output/release/workplace-dispatch-red.log and workplace-dispatch-green.log.
- Actual local HTTP/emulator assertions cover automatic private case/notice without coordinator UI, original-note preservation, replay deduplication, default-off, consent decline, failed wake/restart recovery, pre-send withdrawal/source edit, arbitrary-source unavailable, no-concern fixture and daily-limit delay.
- `npm test`: full backend suite 200/200 passed, zero skipped/failed, 298.540 seconds; output/release/workplace-dispatch-full.log. Expected permission-denied logs come from negative security tests; emulator SIGINT logs are teardown.
- One independent read-only review: no Critical or Important findings. Two minor coverage gaps deferred: dispatch-specific mid-processing revision/lease invalidation, and simultaneous first submissions/forced transaction replay/multiple runtime instances. Existing worker/submission suites cover related primitives but are not claimed as these exact dispatch scenarios.
- Web/mobile source and client contracts unchanged; no new web/mobile full-suite run or APK.
- Browser walkthrough: server started with explicit flag and printed the synthetic warning. Initial consent action was blocked; no workaround was attempted. User then explicitly approved enabling this synthetic student's consent, testing and withdrawing afterward.
- Submitted the exact English danger fixture through the student Logbook UI (8 hours; no optional AI refinement). Before opening coordinator UI, local metadata confirmed entry `Ujql69LhQv14WDckheF5`, job `81b136089a1c3f7cf58f19c63537c7ec71e60e4af3ad4ed631c7b79b193afa74`, state processed, attempts 1, one corresponding open High case and one minimal private notice. This was the fake analyzer, not Claude.
- Withdrew consent through the UI; it visibly returned to analysis off. Then signed in as the synthetic coordinator: the actual private screen showed the new unread High notification/open case and exact evidence with FIXED SYNTHETIC SIMULATION ONLY reason. Coordinator signed out. No contact, resolution or dismissal was fabricated. This one fictional case remains open in the recoverable QA snapshot.
- Startup recovery also cancelled the earlier walkthrough's queued job after its prior consent withdrawal, with attempts 0. No real provider request occurred.
- Snapshot verified: PATHWAY-backend/.emulator-data/2026-10-22T15-42-26-004Z-a1d7a565; output/release/workplace-dispatch-backup-pinned.log. Concurrent test/demo hubs exposed an existing CLI discovery limitation: ordinary backup initially targeted the isolated test hub, then discovery was missing after that hub stopped. Export was recovered using installed Firebase hub client pinned to verified localhost:4400 (Auth 9099, Firestore 8080), without editing CLI locator files. Earlier snapshots retained. Do not run demo backup concurrently with an isolated same-project suite; persistence hardening is outside this change.

## Later release gates

Real provider enablement and paid test authorization, hosted scheduling, minimal-audit fields/lifetime, retention cleanup operations, client cutover/rules, native-device verification, manuscript alignment and real deployment remain separate work.

## Implementation decisions and review scope

1. Used the existing checkout, per user preference; no new worktree or push. Risk: later integration must preserve unrelated local changes.
2. Preserved existing worker cursor/terminal-page behavior. Risk: queued jobs can wait for another recovery wake; durable work is retained.
3. Review exclusions remain outside this local-demo claim: unrelated dirty files; independent correctness of existing worker/budget/consent/case modules; native/production/provider accuracy; deployed scheduling, retention/purge and migration/backfill. Risk: separate release checks can reveal additional defects. The author independently verified the full backend run and actual browser behavior; reviewer did not rerun them.
4. Left existing snapshot discovery code unchanged, targeting the inspected hub for final export instead. Risk: simultaneous same-project suites/demo backups can select the wrong hub; final verified demo snapshot supersedes temporary test exports.

Only the inspected walkthrough launcher and child services were stopped after saving the snapshot. No records or prior snapshots were deleted. Paid/production/default automatic AI remains off.
