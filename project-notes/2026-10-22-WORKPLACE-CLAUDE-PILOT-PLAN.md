# Local Claude Workplace Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline, test first, with one independent final review before any paid pilot. Do not deploy or weaken existing emulator/provider safeguards.

**Goal:** Connect the validated concern contract to Claude for a bounded synthetic-only local pilot, then verify real backend submission → queued analysis → private coordinator case/notice.

**Architecture:** A separate default-off adapter implements the existing worker's prepare/analyze interface. The existing journal AI adapter keeps its emulator block. The paid runner permits only a fixed synthetic fixture allowlist, uses the existing transactional workplace allowance plus an append-only local reservation ledger that survives emulator resets, and never installs a timer or hosted endpoint.

**Tech Stack:** Existing Node/CommonJS, native fetch/AbortController, fs for operational pilot receipts, Firebase demo emulators, existing Express fixtures/tests. No dependency installation.

**Spec:** WORKPLACE-JOURNAL-ALERT-DESIGN.md; WORKPLACE-DETECTOR-ALERTS-PROGRESS.md; workplaceAnalysisBudget.js; baseline 24c2e85. The user requested real Claude integration locally, synthetic English/Filipino/Cebuano evaluation and full workflow tests, not deployment.

## Verified provider facts — 2026-10-22

- Model: claude-haiku-5-5. Published global standard rates: input/output $0.10/$0.50 per million for prompts up to 100000 tokens; $0.50/$2.50 above. Continue using the higher rates in the existing local reservation profile. Source: https://platform.claude.com/docs/en/models/haiku-5-5/overview and https://platform.claude.com/docs/en/about-claude/pricing.
- Haiku 5.5 supports thinking disabled at high effort or below. Use thinking:{type:'disabled'}, output_config:{effort:'low'}, no tools/caching/batch/beta/region options. max_tokens includes any billable thinking and is an enforced output bound. Source: https://platform.claude.com/docs/en/build-with-claude/thinking.
- Token counting is an estimate; task budgets are advisory, not a hard cap. Neither proves an invoice ceiling. Sources: https://platform.claude.com/docs/en/build-with-claude/token-counting and https://platform.claude.com/docs/en/build-with-claude/task-budgets. No count-token requests or task-budget feature are needed for this pilot.

## Global constraints and proposed pilot envelope

- Local demo DB and explicitly enabled paid synthetic test only. No real student records, production data/settings, emails, deployed code, APK, automatic scheduling or credential display. Load the backend key only inside the explicitly invoked process; missing key stops before any request. Never print .env or tokens.
- Fixed allowlisted synthetic sources only; arbitrary journal text is rejected by the paid pilot adapter. Product-scale notes and automatic processing remain a later release gate.
- Entire serialized request must be at most 5000 UTF-8 bytes, including instructions and JSON framing. Reject oversize input without truncation. Reserve a proposed conservative **14000 input-token allowance**, including 9000 tokens of headroom above the request-byte ceiling, and **1024 output tokens**. At the existing higher-rate profile this reserves **9560 micro-USD per attempt**. This is an engineering allowance, not a provider-certified input-token bound or invoice guarantee; independent review must accept the envelope before a real call. Do not present it as universal for 8000-character journals.
- Preserve maximum 10 attempts and 100000 micro-USD reserved per UTC day. Plan at most **nine evaluation requests**, reserving at most 86040 micro-USD if the day's full allowance is available; existing reservations can reduce that. No automatic retries, prompt-tuning reruns or budget resets. Stop on first transport/provider/schema/usage-bound failure; retain the reservation and report the remaining fixtures untested.
- UTC accounting stays internal to this pilot. No account billing settings or account-wide spending promises. Usage from other AI features remains separate.
- No live calls until adapter tests, complete integration tests and the final independent review pass and an available persistent budget is verified. If the input allowance is not supportable in review, leave the real sender off and report that blocker rather than silently loosening the guard.

## Review focus

1. Secret values, raw provider errors and thinking blocks must never reach logs, tests or retained results.
2. Prepared payload tampering or unsupported options must fail before fetch; the sender must transmit exactly the validated bounded request.
3. Crashes, emulator resets, duplicate runs, midnight and lock contention must not erase already reserved paid attempts or trigger replay.
4. Input/output usage beyond the envelope must stop the pilot and activate the worker safety brake rather than permit the next fixture.
5. Real-provider success must still pass current consent/source/lease and coordinator assignment checks; malformed or unavailable analysis cannot become a no-concern result.

## Task 1 — Isolated bounded adapter

**Create:** PATHWAY-backend/workplaceClaudeAdapter.js and security-tests/workplace-claude-adapter.test.js.

**Interface:** `createWorkplaceClaudeAdapter({enabled, apiKey, allowedSources, fetcher})` returns `prepare(rawNotes)` and `analyze(prepared,{signal})`. Default disabled; exact fixed fixture membership is required before preparation or network work. Preparation uses prepareConcernRequest and returns the worker's five metadata fields; request is a canonical immutable serialized Messages payload. No DB calls, token counting or network in prepare.

Sender: POST only https://api.anthropic.com/v1/messages, redirect:error, caller cancellation plus 25-second deadline, no retries. Revalidate canonical metadata/request equality, byte ceiling and pinned model/features immediately before fetch. Response read cap 32768 bytes; require successful end_turn, expected model, text-only response, valid nonnegative integer usage, no nonzero cache/server-tool usage. Parse one bare JSON decision through validateConcernDecision; no Markdown repair or silent correction. Return {usage,decision}. For usage over the prepared allowance, return usage without retaining output so the existing worker persists its pricing brake; the pilot then stops. All failures use fixed sanitized codes, never provider body/key/thinking.

- [ ] Write adapter tests first: default-off/no I/O, absent key, disallowed source, canonical request/pinned endpoint and feature limits, oversize/tamper, cancellation/deadline, oversized response, invalid JSON/quotes/stops/model, unsafe usage, thinking/raw-error suppression and no retries.
- [ ] Run `node --test security-tests/workplace-claude-adapter.test.js` RED; implement; rerun GREEN using fake HTTP only. Leave the old anthropicAnalysis.js untouched.

## Task 2 — Durable paid pilot accounting and synthetic evaluation

**Create:** PATHWAY-backend/security-tests/workplace-claude-pilot.js, workplace-claude-pilot.test.js and workplace-claude-fixtures.js. Keep pilot support outside hosted runtime imports.

Fixtures: nine fixed notes, each under 500 characters and fitting the serialized envelope. Include three explicit present/immediate danger cases (one each English, Filipino, Cebuano), three ordinary/negated/training cases expected unflagged (covering those languages), and three normal-priority harassment/coercion/mistreatment cases, including one embedded instruction that must not control the result. Record expected priority and exact supporting source text independently; do not train/tune the prompt against these results during this run.

Runner: explicit `--paid-synthetic` plus PATHWAY_CONCERN_PAID_PILOT=1, pinned demo emulator and available backend secret required. Use a fixed nonsecret ledger under output/release/workplace-claude-pilot-reservations.jsonl shared across pilot restarts, and exclusive-create lock. Append/fsync an immutable reservation receipt before each potential fetch; uncertain receipts are never refunded/replayed. Ledger validation rejects corruption, duplicate attempt IDs, nonmonotonic timestamps or missing prior state after a started run. Retain an interrupted lock for explicit review rather than silently recover uncertain work. The ledger is additional protection against resetting the emulator; existing Firestore budget remains mandatory. Tests use temporary synthetic ledgers, never alter real pilot receipts.

Expose a side-effect-free `runPilot` entry with injected HTTP/clock/ledger/DB dependencies for tests; only the CLI main may load the key (quietly), enable real fetch and write results. A non-paid invocation performs no provider request. Fixed fixture identity + UTC day identifies attempts; rerunning skips completed/uncertain attempts, never reissues them automatically.

Per-result report: fixture ID/language/expected and observed concern priority, validated decision (synthetic source only), usage, reserved allowance, pass/fail and sanitized failure code. No reasoning/thinking, headers or credentials. Missing/malformed results count as unavailable/untested, never negative. Report these small-sample checks descriptively, not production accuracy or proof of safety. Meaning/urgency and fluent Cebuano interpretation still need human safety/language review.

- [ ] RED tests for durable cap, concurrent lock, crash-before/after receipt, corrupt ledger, missing state, restart/emulator reset, UTC transition, no paid opt-in and stop-on-first-failure. Implement minimal append-only accounting; verify GREEN without real HTTP.
- [ ] Prepare the nine-row report template; paid invocation remains gated until Task 3 and final review pass.

## Task 3 — Full local backend workflow and final gates

**Create:** security-tests/workplace-claude-workflow.test.js. **Modify:** security-tests/concern-fixture.js and run-emulator-tests.js only as needed to register these tests. No server.js or deployed UI navigation changes.

Extend the demo fixture to install the existing consent, journal submission and concern review modules together with separate mock-auth student/coordinator actors. Use POST /student/journal-analysis-consent to grant current disclosure version; POST /student/journals with {requestId,rawNotes,refined:rawNotes,aiRefined:false,hours:8}; execute the worker with the new adapter and a fake Messages response; list/read the resulting private coordinator case/notice through its actual API. Use production validation helpers where available; do not bypass placement authorization.

- [ ] RED integration cases: real submission creates one job, adapter result creates one case/notice with original evidence, no flag creates none, decline/withdrawal cancels sharing, same-revision edits and expired leases discard results, assignment changes deny former coordinator, paid accounting failure prevents fetch. Prove injection hooks run and preserve demo project identity in wrapped DBs.
- [ ] Implement fixture/test wiring; run focused tests then full backend npm test. No web code changes are expected; if the web API contract changes, run the full web suite too.
- [ ] One independent review of adapter, serialization/usage allowance, accounting and workflow; fix important findings with RED/GREEN and a green suite. No second paid run or expanded limit without asking.
- [ ] If the review accepts the envelope and the key/budget are available, execute the single paid synthetic pilot within the existing daily limits. If unavailable/blocked, preserve all work and report the precise limitation, not a service outage or fabricated result.
- [ ] Save verified outcomes, actual requests/usage/reservations, untested fixtures and release limitations to project-notes/WORKPLACE-CLAUDE-PILOT-RESULTS.md and update the manuscript checklist narrowly. Scoped local commit only, no push/deployment.

## Handoff

Native inline execution, one final reviewer, no APK. Please review this new paid-pilot plan before implementation: the serialized-input envelope and estimated input allowance above are newly proposed engineering limits, not an already verified provider guarantee.
