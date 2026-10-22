# General Journal Input Local Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax. One final independent review; no per-task implementer fan-out.

**Goal:** Validate ordinary journal inputs locally without expanding live provider eligibility.

**Architecture:** Extract the existing canonical request preparation into a pure exported helper. Keep fixture membership, prepared-request identity checks, controlled runtime and spending safeguards unchanged. Use synthetic unit tests; do not build a generalized worker/runtime yet.

**Tech Stack:** Existing Node/CommonJS and node:test; no dependencies.

**Spec:** 2026-10-23-WORKPLACE-GENERAL-INPUT-DESIGN.md.

## Global Constraints

- Original notes: nonblank string, maximum 8000 UTF-16 code units; preserve exact source.
- Entire serialized generation request: maximum 5000 UTF-8 bytes.
- Unchanged model/API version/request selectors/output ceiling, 14000-input engineering allowance and 9560-micro-USD reservation; no broader tokenizer guarantee.
- No live calls, credentials, stop removal, resets, price refresh, hosted enablement, deployment, APK or journal/backup deletion.
- Existing executable and adapter allowlists remain mandatory; no new general-input runtime switch.

## Review Focus

1. JSON escaping and multi-byte source must be measured after canonical serialization.
2. No normalization/truncation or source substitution is introduced.
3. Pure preparation must not bypass adapter membership or prepared-object identity validation.
4. Stored-journal eligibility remains distinct from provider-request eligibility.
5. Local synthetic success must not be reported as model accuracy or live general-input support.

### Task 1: Extract and test pure canonical request preparation

**Files:** Modify PATHWAY-backend/workplaceClaudeAdapter.js; create PATHWAY-backend/security-tests/workplace-general-input.test.js; inspect existing workplace-claude-adapter.test.js.

**Interfaces:** Export prepareWorkplaceClaudeRequest(rawNotes), returning the existing frozen object with model, inputTokenUpperBound, maxOutputTokens, features and request. Invalid source or serialized length throws a sanitized error with code CLAUDE_INPUT. This helper performs no HTTP, credential loading, registry insertion or authorization. createWorkplaceClaudeAdapter.prepare retains its allowed/enabled checks and calls the helper only after membership succeeds; it retains registry insertion itself.

- [ ] Write failing tests importing the helper: valid ordinary ASCII/Unicode source appears exactly in parsed messages[0].content.journalNotes; whitespace/nonstring/>8000-code-unit input rejects with CLAUDE_INPUT.
- [ ] Add byte-boundary tests that construct sources algorithmically using the fixed request overhead; accept a valid source yielding exactly 5000 serialized bytes and reject one yielding 5001. Include escaping and emoji cases; assert Buffer.byteLength rather than source.length.
- [ ] Run node --test security-tests/workplace-general-input.test.js from PATHWAY-backend. Expected RED because the helper does not exist.
- [ ] Extract the minimum existing serialization/limit logic; normalize only errors, never source. Preserve the existing factory's source/identity gates and prepared payload shape.
- [ ] Run node --test security-tests/workplace-general-input.test.js security-tests/workplace-claude-adapter.test.js. Expected zero failures and no external calls.

### Task 2: Prove isolation and unchanged fixed-fixture behavior

**Files:** Same tests; existing security-tests/workplace-claude-fixtures.js and workplace-controlled-runtime.js remain unchanged.

**Interfaces:** Consume the Task 1 helper and existing createWorkplaceClaudeAdapter factory; use injected synthetic fetchers that count invocations.

- [ ] Add tests: factory.prepare rejects a nonmember source even when the pure helper accepts it; analyze rejects a helper-produced object not registered through that adapter; both yield zero synthetic fetches.
- [ ] For every canonical fixture, compare helper/factory request strings, byte lengths, unchanged options and reserveCostMicroUsd(...)=9560 using a valid fixed test instant. Do not claim the allowance is a verified general token bound.
- [ ] Add an exact-source JSON-escaping round trip and a source-within-8000-but-request-over-5000 rejection. Assert the provided original string is unchanged. These tests cover Review Focus 1–4; documentation review covers 5.
- [ ] Run the two focused unit files. Expected zero failures; no actual provider endpoint.
- [ ] Run npm test once after the final code changes; expected zero failures/skips attributable to this increment. Preserve actual command/count/runtime in acceptance notes. No web/native changes imply no APK or redundant client build.
- [ ] Obtain one narrow independent read-only review of the scoped changes, emphasizing authorization bypass and limit semantics; fix Important findings with RED/GREEN tests and rerun affected verification. Preserve unrelated dirty work.
- [ ] Record limitations and verified results in WORKPLACE-CONTROLLED-CLAUDE-ACCEPTANCE.md. Scoped commit only after verification if permitted; never push/deploy.

## Handoff

This plan prepares validation only. Broad live analysis, token-bound verification, model-quality evaluation, original-journal/export retention and deployment remain separate gates. Execution method recommended: inline with one final reviewer, consistent with the user's request to reduce usage. Review the design and plan before implementation; no paid permission is implied.
