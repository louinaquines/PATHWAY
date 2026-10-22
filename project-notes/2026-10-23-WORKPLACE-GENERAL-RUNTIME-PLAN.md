# General-input runtime safeguards implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline after design/plan approval. No implementer fan-out; one final independent reviewer.

**Goal:** Verify count-before-generation accounting and privacy safeguards with injected synthetic transports only.

**Architecture:** An uninstalled test-only analyzer composes pure canonical preparation with existing worker assertReady and result validation. Persistent stage claims and fake local ledgers model uncertain boundaries without enabling any real transport or changing the existing executable runtimes.

**Tech Stack:** Existing Node/CommonJS, node:test and isolated Firebase demo emulators; no dependencies.

**Spec:** 2026-10-23-WORKPLACE-GENERAL-RUNTIME-DESIGN.md.

## Global constraints

- No default fetch, credential loading, actual HTTP provider calls, server/runtime installation, canonical pilot writes, stop removal, price refresh, counters reset, production access, deployment or APK.
- Preserve 8000 UTF-16 source units, 5000 serialized UTF-8 bytes, 14000 input allowance, 1024 output cap, 9560-micro-USD reservation and existing daily ceilings.
- Proposed count gate: positive safe integer <=12000; one count and one generation per selected new revision, no retry; existing 25-second total worker deadline and 90-second leases.
- No new client states, journal truncation, history backfill or automatic approval of real processing.

## Review focus

1. Counting shares source: validate current consent and revision before it and again before generation.
2. A receipt claim can commit without its response; restart must not duplicate either external boundary.
3. Cross-store uncertainty/late transaction completion/midnight must never recreate allowance.
4. Counted request substitution or stale result must not reach generation or private case storage.
5. Synthetic harness must not become a discoverable credentialed server mode or bypass the existing fixture-only runtime.

### Task 1 — Pure count validation and immutable request binding

**Files:** Create PATHWAY-backend/security-tests/workplace-general-runtime.js and workplace-general-runtime.test.js. Reuse workplaceClaudeAdapter.js and workplaceConcernDetector.js without expanding the live adapter's allowedSources/registry.

**Interfaces:** createSyntheticGeneralAnalyzer({countTransport,generationTransport,assertBound,claims,reserveLocal,stopLocal,clock}) -> {prepare,analyze}. All dependencies required; no live defaults. Transports return standard Response objects. prepare(originalNotes) returns the unchanged worker prepared shape using the existing adapter with a nonsecret SYNTHETIC-ONLY marker, one selected original source and injected generation transport. analyze(prepared,{signal,assertReady}) returns validated {usage,decision}, usage-only overflow for the real worker brake, or throws a sanitized non-TRANSIENT error. assertBound(prepared) checks the selected source/request/profile/day and exact Firestore budget receipt. claims exposes the Task 2 methods; reserveLocal(prepared) authorizes the fake reservation once; stopLocal({attemptId,sessionId}) establishes the fake stop and returns only an in-memory continuation ticket for this already-owned attempt. Existing stop at construction refuses all work. The analyzer must never synthesize a second generation decision validator or load a credential.

- [ ] RED unit tests: missing dependencies reject before side effects; prepare preserves exact ordinary source and rejects oversized serialization; counts 1/12000 permit synthetic generation, 0/12001/missing/negative/fractional/invalid JSON reject. Assert generation calls zero on rejection.
- [ ] Run node --test security-tests/workplace-general-runtime.test.js; expect missing-factory failures before implementation.
- [ ] Implement minimal composition with fixed canonical count-payload fields, exact request binding and bounded synthetic response parsing. Fresh assertReady/assertBound precede both transports and follow count. No new production adapter mode.
- [ ] RED tests: a tampered prepared object, interrupted signal, expired deadline or count-time source/consent change never reaches generation; invalid generation model/tier/geo/decision and usage overflow retain existing validation/brake semantics when consumed by worker.
- [ ] Run the new unit file plus workplace-general-input.test.js and workplace-claude-adapter.test.js; expect zero failures and zero real HTTP.

### Task 2 — Durable selected-job integration and uncertain outcomes

**Files:** Create PATHWAY-backend/security-tests/workplace-general-runtime-flow.test.js; extend the test-only module from Task 1; include both new test files in security-tests/run-emulator-tests.js. Inspect/reuse concern-fixture.js, existing worker, consent/submission routes and fake-ledger test patterns. Do not reset canonical paid evidence or saved QA state.

**Interfaces:** Add createSyntheticStageClaims({db,jobId,requestHash,day,sessionId,clock,assertBound}) -> {claimStage(stage,prepared),recordAcceptedCount(prepared,inputTokens)}. Store claims in workplaceSyntheticStageClaims, explicitly fake-only, keyed by digest([jobId,sourceRevision]); fingerprint includes selected source/consent/profile/request/day. Derive and bind the worker's actual owner from live job/control leases, not a caller-supplied owner. Require sending/attempts=1 and exact Firestore receipt digest([jobId,1]) matching day/cost before local reservation or sharing. Claim count once, then record the validated count/request hash under the same lease/session; generation claim requires this accepted evidence and fresh authority. Generation claim precedes durable fake stop and final checks; uncertain writes prevent transport. Restart with a different session cannot replay or resume a claimed stage even if count was accepted. The constructor refuses non-exact demo project or nonlocal emulator hosts before DB access. The harness wires onAccountingUncertain to its fake stop; no canonical paid writes.

- [ ] RED emulator tests: a new consented submission is selected by its committed receipt and revision; count cannot precede Firestore and fake-local reservations; generation requires accepted count and fresh guards; one case/private notice with outsider denial. Arbitrary/historical/mismatched jobs and default-off/wrong-context construction cause no transports.
- [ ] Implement the minimal fake claim store; no production imports/hooks. Use an isolated temporary fake ledger and never the canonical pilot file. Fail closed for duplicate, lost acknowledgment, missing ownership and late transaction resolution.
- [ ] RED tests: crash after count claim and after generation claim, concurrent workers, local reservation failure, Firestore lost acknowledgment/finalization failure, withdrawal/source edit during count or generation, reassignment, lease expiry after transaction return, midnight, stale pricing, count/generate timeouts and shutdown. Assert no retry/refund, no stale case, and retained fake stop/reservations.
- [ ] Verify the complete sequence uses one worker deadline, not two transport deadlines. Verify cancellation/price brake with real worker and injected responders; do not simulate a successful response by bypassing validation.
- [ ] Add the tests to the standard runner, run its relevant emulator subset and then npm test once after final code changes; expect zero failures. Preserve observed totals/runtime/log; do not claim model accuracy.
- [ ] One independent read-only review against all five focus items. Fix Important findings using RED/GREEN and affected verification; document Minor limitations and review exclusions.
- [ ] Record acceptance evidence in a new project-notes/WORKPLACE-GENERAL-RUNTIME-ACCEPTANCE.md, including untouched canonical ledger/stop checks and no hosted/provider activation. Scoped local commit after verification if permitted; no push.

## Plan review and execution boundary

The proposed 12000 threshold is an admission margin, not a proven token maximum. The analyzer remains test-only; implementing a real transport or installing a general-input runtime is outside this plan. Approval to execute this plan approves synthetic modeling of conservative reservations and count-sharing safeguards only, not their use for real data or approval of a revised disclosure. The 25-second budget covers analyze, not preparation/reservation/finalization. This plan does not supersede prior approvals limiting live processing to controlled exact fixtures. Builder-check resolutions in the design are binding requirements; all seven reviewer questions were resolved without expanding the proposed real-world authority.
