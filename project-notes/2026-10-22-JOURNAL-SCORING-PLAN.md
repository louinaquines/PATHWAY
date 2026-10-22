# Journal completeness implementation plan

> **For agentic workers:** Use executing-plans for inline implementation, test-driven-development for changes, and one independent final review. Do not deploy.

**Goal:** Add an advisory, evidence-backed completeness score to the existing coordinator-requested journal review, preserving original journals and existing competency findings.

**Architecture:** Claude judges four narrative criteria against original notes; application code validates the response and calculates weights. Structured reporting metadata is assessed by code, never Claude. Extend the existing consent-gated endpoint and component rather than adding a second workflow.

**Tech stack:** Existing Node, Express, React, Node test runner and Jest. No new dependencies.

**Spec:** Approved journal baseline in MANUSCRIPT-CHANGE-CHECKLIST.md, section 1, and the user's approval on 2026-10-22 of full/half/zero credit, original-text evidence, unavailable-on-failure, advisory competency findings and coordinator-requested processing.

## Global constraints

- Weights: tasks 30; learning/skills 25; outcomes 20; challenges or explicit none 15; valid reporting dates and hours 10.
- Full means clearly described; half means mentioned with insufficient detail; missing means absent. No length or English-fluency bonus.
- Bands: at least 80 Complete; at least 50 Needs more detail; otherwise Incomplete. Preserve half points; do not round across boundaries.
- No submission is Not submitted, not zero. Unavailable or invalid analysis has no numerical total.
- Exact source quotes required for full/partial narrative judgments and competency findings. Missing judgments require empty evidence and a reason, not an invented quote proving absence.
- Assess rawNotes only. Legacy refined-only entries cannot receive an original-submission score.
- No record writes, stored grades, coordinator correction workflow, notifications, background analysis, automatic approval, deployment or APK.
- Keep current role, assignment, consent, quota and provider safety checks. No real provider calls or credentials during local tests.
- Current UI styles and stale-result protection remain intact.

## Implementation choices for review

- Version the rubric and provider schema as journal-completeness-v1. Preserve existing completeness, competencies and sentiment findings; add a separate rubric field so existing consumers remain compatible.
- Four narrative objects use fixed IDs tasks, learning, outcomes, challenges, with level full/partial/missing, reason and evidence. Require exactly one of each; reject unknown fields, duplicates, invalid levels and unsupported quotes.
- Metadata criterion: 5 points for a valid structured reporting period and 5 for finite numeric weekly hours greater than zero and no more than 168. Both valid earns 10; one valid earns 5; neither earns 0. This validates plausibility, not verified attendance.
- Before implementation, inspect the actual weekRange write format and existing date helpers. Accept only a demonstrably valid real-calendar ordered period of no more than seven days. Do not guess dates from an arbitrary label or invent missing dates. Legacy unparseable periods are explicitly reported as missing metadata.
- Prompt examples distinguish an activity alone from activity plus meaningful detail; do not demand verbose writing. Explicitly stating no challenges satisfies that criterion. Support the student's original language without claiming validated multilingual accuracy.
- The UI shows criterion label, points/weight, level, explanation and quote, overall band, rubric version, and a warning that this is not an academic grade or verified competency. Provider failure displays Analysis unavailable with no numerical score.
- Request remains explicit and permission-gated. Results are transient and discardable; no coordinator editing/audit feature is introduced.

## Review focus

1. Model-generated totals or favorable prose must not bypass deterministic weights.
2. Legacy refined-only text, impossible dates and numeric strings must not silently earn validated metadata points.
3. Mixed-language short-but-complete entries must not be penalized by word counts.
4. Invalid model output and outages must never display a zero or stale score.
5. Unauthorized requests must not read journals or invoke the provider.

## Task 1: Validated rubric and deterministic calculator

**Files:** Create PATHWAY-backend/journalCompleteness.js and security-tests/journal-completeness.test.js; modify anthropicAnalysis.js and security-tests/journal-ai-review.test.js.

**Interfaces:** validateNarrativeRubric(rubric, notes) returns the four validated judgments; scoreJournalCompleteness(entry, rubric) returns version, status, total and criteria. Provider analyzeJournal(notes) adds rubric while retaining existing finding arrays. Invalid output throws AI_OUTPUT through the existing provider boundary.

- [ ] Write failing tests for all-full=100, all-half=50, all-missing=0, fractional totals and 80/50 boundaries; metadata combinations; no submission and refined-only unavailable; real/invalid/reversed periods; finite hours and rejected coercion; duplicates, omitted criteria, invented evidence and provider-supplied totals.
- [ ] Run `node --test security-tests/journal-completeness.test.js security-tests/journal-ai-review.test.js`; expect feature assertions to fail before implementation.
- [ ] Implement strict schema validation, calculator and versioned provider prompt using the existing request transport. Add synthetic English, Filipino and mixed-language fixtures; these prove arithmetic/schema handling only, not actual Claude language quality.
- [ ] Rerun the same tests; expect zero failures.
- [ ] Commit only scoped backend files on the isolated feature branch.

## Task 2: Endpoint and existing coordinator UI

**Files:** Modify journalAiReview.js, security-tests/journal-ai-review.test.js, PATHWAY-web/src/components/JournalAiAnalysis.js, JournalAiAnalysis.test.js and existing CSS only if needed.

**Interfaces:** Endpoint adds scoring calculated from the server-loaded original entry and validated narrative rubric. UI consumes scoring; no request body score/text is trusted. The response's source and advisory limitation remain explicit.

- [ ] Write failing endpoint tests for original source, no writes, access/consent failure, invalid output, unavailable legacy originals and sanitized provider failures with no score.
- [ ] Write failing UI tests for total/band and all criterion explanations, unavailable without zero, discard, permission gating and stale journal responses.
- [ ] Run backend journal tests and `npm test -- --runInBand src/components/JournalAiAnalysis.test.js`; expect new assertions to fail.
- [ ] Integrate the calculator and render the result using existing component styles. Clear previous results when a fresh analysis begins so a failed retry cannot leave a prior score visible.
- [ ] Rerun focused tests; expect zero failures. Run backend `npm test` and web `npm test -- --runInBand`; report emulator/environment limitations separately from test failures.
- [ ] Update manuscript checklist with implemented behavior, rubric examples and verified evidence, clearly separating synthetic/mock tests from real-provider validation.
- [ ] One independent whole-change review; resolve important findings with regression tests. Commit only scoped changes and leave local for review; no merge, push or deployment.

## Execution and isolation gate

Primary checkout is main and has unrelated user edits. Recommended execution is native/inline in a new isolated journal-scoring worktree based on current main, leaving the existing scheduling and workplace-support worktrees unchanged. User approval of this plan and worktree creation is required before implementation.

Status: plan prepared; no product code changed, tests added, provider calls made or deployment performed for this phase.
