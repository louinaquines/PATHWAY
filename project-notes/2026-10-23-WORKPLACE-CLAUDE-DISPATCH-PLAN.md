# Controlled Claude automatic-dispatch implementation plan

> **For agentic workers:** Use executing-plans inline, TDD and one final independent review. Implementation approval does not authorize paid requests or deployment.

**Goal:** Prepare an explicitly gated local submission-to-Claude-to-private-alert path, verified first with synthetic HTTP responses.

**Architecture:** Reuse the existing journal transaction, worker, validated Claude adapter, durable reservation controls and retention cleanup. Keep the fixed-fake runtime unchanged. Add a separate local controlled-test runtime, limited to an explicitly selected synthetic student and a single new journal request identity during a short authorized window. Do not turn the old nine-fixture pilot into an unrestricted background provider.

**Tech stack:** Existing Node/CommonJS, Express and Firebase demo emulators; no dependencies.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md, WORKPLACE-LOCAL-DISPATCH-ACCEPTANCE.md, WORKPLACE-SAFEGUARDS-ACCEPTANCE.md and WORKPLACE-CLAUDE-PILOT-RESULTS.md. This plan is local preparation, not general-student or hosted enablement.

## Global constraints

- No paid request, credential inspection, stop-marker removal, budget reset, production record access, push/deploy, email or APK under implementation approval.
- Default off; require exact demo-pathway-security, localhost Auth/Firestore, explicit controlled-Claude mode and valid start/end UTC timestamps spanning at most 15 minutes. Reject production NODE_ENV, K_SERVICE, mixed fake/Claude modes, missing/stale pricing or missing synthetic enrollment configuration before provider/worker access.
- Explicit configuration binds one synthetic student ID, one submission request ID and one exact allowlisted fixture source. Existing queue jobs, historical entries, other students and arbitrary notes cannot consume the paid allowance. Replays cannot arm a second job. This fixture limitation is not real-world NLP readiness.
- One external attempt maximum per approved test window, no automatic retries. Retain existing durable 10-attempt/100000-micro-USD UTC-day ceilings and conservative reservations across restart. Window limit does not replace either existing counter. Do not refund uncertain requests.
- Existing paid pilot receipts/continuity/stop remain intact. A stopped pilot must not be bypassed by a new ledger or test window; continuing paid work requires separately reviewed explicit authorization.
- Consent and original source/revision/hash are checked before sharing and before storing results. Current assignment controls private notices; human review remains mandatory. Submission succeeds independently of analysis.
- No raw key, request text or provider body in diagnostics. No fallback to another provider or fake success. Failure/unavailability must not mean no concern. Expired windows stop new sends, not promise cancellation of already shared text.
- New live API details/prices must be verified from official Anthropic documentation before any later paid test. Existing repository pricing is historical configuration, not a fresh price claim. No silent profile extension.

## Review focus

1. Disabled, expired or wrong-context startup must cause zero provider requests and no historical queue draining.
2. Two processes, replayed requests and restarts cannot bypass the one-attempt window or durable stopped state.
3. Withdrawal, source edits, reassignment and lease expiry cannot leak stale results or broaden recipients.
4. Unknown transport/accounting failures stop durably without refunds, retries or raw diagnostic disclosure.
5. Cleanup and shutdown remain bounded; fake and Claude modes cannot be confused or silently mixed.

### Task 1 — Controlled window and exact job eligibility

**Files:** create PATHWAY-backend/security-tests/workplace-controlled-dispatch.js and workplace-controlled-dispatch.test.js; inspect/reuse workplace-claude-pilot.js ledger API without changing prior receipts. Modify worker only if exact eligibility cannot be enforced before reservation and provider access through its existing jobId option.

**Interfaces:** createControlledDispatch({db,env,clock,ledger,fetcher,apiKey,window}) → {start,wake,stop}; window contains {studentId,requestId,source,startAt,endAt}. Implementation must derive the bound job from the committed actor-scoped submission receipt, not caller-supplied job IDs. start/wake return settled operational results with no source/key.

- [ ] Write failing tests for default-off, non-demo/remote/production, malformed/expired/overlong window, mixed modes and missing configuration; assert zero DB/HTTP/key-loading effects when disabled.
- [ ] Write real emulator tests with a synthetic HTTP responder: bound receipt/job alone is processed; unrelated queue rows and changed source remain untouched by the controlled paid path. Replayed receipt yields the same result/job.
- [ ] Implement minimal guards and receipt binding. Reuse real worker runBatch({limit:1,jobId}); never temporarily rewrite job identities or reset budgets.
- [ ] Run focused unit/emulator tests; expected zero failures. Preserve exact command/results and scoped local commit after GREEN.

### Task 2 — Durable single-attempt stop and lifecycle

**Files:** controlled runtime/tests above, workplace-claude-pilot.js only for a small shared reservation helper if needed; run-emulator-tests.js for a focused test selector.

**Interfaces:** adapter analyze uses the existing canonical request and validated decision contract. Before fetch, both durable accounting layers and the single-window attempt claim must succeed atomically within their own durable stores; failures between stores spend conservatively and stop, never refund. Existing stop/ledger lock behavior remains authoritative.

- [ ] RED tests: competing runtime processes/claims, restart after reservation, existing pilot stop, failure writing either ledger, lost response, invalid output, deadline crossing, price expiry and usage overrun. Assert at most one synthetic HTTP fetch; no recreated allowance or implicit retry.
- [ ] Implement startup/submission wake and 15-minute recovery target, limited by the short window and exact bound job. Single-attempt mode stops durably after a send, success or failure. Timers clear on stop; current in-flight uncertainty remains recorded.
- [ ] Test consent withdrawal/source revision changes/lease expiry during synthetic HTTP processing, current coordinator reassignment and no-case output. Keep original notes unchanged and sensitive details out of notices.
- [ ] Integrate existing bounded retention recovery without a second provider scheduling loop. Test cleanup failure does not change saved journal response or enlarge provider scope.
- [ ] Run focused tests GREEN; scoped local commit. Do not run actual Anthropic fetch.

### Task 3 — Isolated local wiring, verification and later authorization sheet

**Files:** server.js and security-tests/start-local-workflow-apps.js only as needed for separate opt-in wiring; new workplace-controlled-dispatch-acceptance notes; manuscript checklist addendum. Never enable mode in checked-in defaults.

- [ ] RED server/bootstrap tests prove fake mode stays unchanged, controlled mode needs every gate, missing credentials produces unavailable rather than fallback, and hosted startup never imports or arms the test runtime.
- [ ] Wire post-commit wake using existing onJournalQueued; bind the configured receipt/request identity independently of the callback. Do not modify mobile submission flags or advertise real automatic analysis as live.
- [ ] Run complete backend npm test; web tests if client contracts/source change; syntax/diff checks. No overlapping full-suite loops or simultaneous same-project demo workflow.
- [ ] One independent read-only final review focused on the five items above; reproduce/fix Important findings with RED→GREEN, then fresh full suite. Record deferred minors and actual limitations.
- [ ] Save acceptance evidence and an authorization sheet specifying exact fixture/student/destination (Anthropic), maximum one request, reservation estimate, window, persistent stop handling and rollback. Any actual paid attempt requires a later explicit approval and fresh official API/pricing verification; it is not executed by this plan.

## Decisions and exclusions

Proposed next step is controlled local preparation, not unrestricted analysis of arbitrary student writing. It deliberately keeps the existing fixed-source limitation and refuses historical/backfill work. Choosing a general-input token bound, prompt/data policy and linguistic/safety evaluation is separate work before broader use. Hosted scheduling, production deployment, original-journal/backup retention and native release remain later gates.

Recommended execution: inline implementation with one final independent reviewer, preserving the current checkout and unrelated edits. Review this plan before implementation; approval permits synthetic-response tests only, not paid sends.
