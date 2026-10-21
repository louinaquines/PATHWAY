# Manuscript change checklist: scoring, alerts, and workplace support

Date: 2026-10-21
Status: scoring and alert proposals approved by the user; implementation pending.

## Purpose and evidence boundary

Track the implementation rules we approved and the corresponding paper revisions. This is not a claim that every item below is absent from the manuscript. The current DOCX has not been rechecked paragraph by paragraph for this checklist. Earlier discussion identified broad diagram features but not exact scoring rules. Confirm each proposed change against the latest adviser-approved manuscript before editing the paper.

Manuscript candidate: `PATHWAY-OJT-Management-System-with-AI-Analytics-1.docx`.

Do not describe planned functionality as implemented, validated, or deployed. Workplace Support was implemented and tested in a separate local worktree; it has not been integrated into the primary checkout or deployed. Its release gates remain open. No preview APK is requested at this stage.

## Paper revision map

| Topic | What the approved design adds or clarifies | Paper sections to check |
| --- | --- | --- |
| Journal completeness | Weighted rubric, partial-credit rules, original-text assessment, unavailable-analysis state | Methodology, AI processing, instruments, system outputs |
| Attendance risk | Three tiers, observation window, denominators, missing-data treatment, deterministic calculations | Analytics methodology, conceptual framework, dashboard descriptions |
| Workplace concerns | AI-generated potential concerns versus direct student support reports; priority and human review | Student/coordinator workflows, NLP scope, privacy, limitations |
| Document triage | AI colour is advisory and separate from official approval; Red does not automatically reject | Requirements workflow, decision layer, diagrams |
| DTR comparison | Numerical discrepancy thresholds, OCR uncertainty, manual adjudication | OCR methodology, validation, escalation flow |
| Notifications | Trigger, recipient, timing, recovery, deduplication and reassignment rules | Architecture, notification workflow, functional requirements |
| Workplace Support | Optional evidence, private immutable reports, review/contact/action/resolution, student-visible states | Scope, use cases, flowcharts, data model, confidentiality |
| Verification | Distinguish unit/mock, emulator, browser, real provider, export and device evidence | Testing, results, limitations |

## Approved scoring and alert baseline

### 1. Journal completeness: 100 points

| Criterion | Weight |
| --- | ---: |
| Tasks performed | 30 |
| Learning or skills applied | 25 |
| Outcome or accomplishment | 20 |
| Challenges, or explicit statement that there were none | 15 |
| Valid reporting dates and hours | 10 |

Each criterion earns full points if complete, half if partial, and zero if missing. Total bands: 80–100 Complete; 50–79 Needs more detail; 0–49 Incomplete. No submission is Not submitted, not a scored zero.

Assess the original submission. Claude proposes narrative criterion judgments; application code applies weights. Validate structured dates/hours deterministically. Preserve original text and coordinator review. Do not reward length, English fluency, or AI-refined wording. AI failure is Analysis unavailable, never an automatic zero.

Paper change: disclose this rubric and the distinction between AI judgment and arithmetic. These weights are proposed project policy, not empirically validated educational measures.

### 2. Attendance risk

Use the last 20 scheduled workdays, excluding today, holidays, approved leave and recorded non-working exceptions.

`attendance rate = days with valid attendance / eligible scheduled days * 100`

| Tier | Trigger |
| --- | --- |
| Low | Attendance at least 90%, no consecutive-absence trigger, and projected hours meet deadline |
| Medium | Attendance at least 80% but below 90%; or two consecutive unexplained absences; or projected completion shortfall |
| High | Attendance below 80%; or three consecutive unexplained absences; or deadline passed with hours incomplete |

Use the highest applicable tier. Require five eligible days for percentage classification; otherwise show Insufficient data. Missing schedules/deadlines cannot silently produce Low. Missing checkout is Needs verification, not an automatic absence. Completed is separate progress status, not a fourth tier.

Completion projections use verified hours from the last 28 calendar days and remaining scheduled workdays. Show assumptions. Code calculates metrics and tiers; Claude can explain but cannot alter them.

Paper change: specify denominators, exceptions, threshold rationale and insufficient-data states. Do not claim predictive accuracy until evaluated.

### 3. Workplace concerns

- Direct student reports notify the current coordinator. The immediate-safety checkbox marks High priority.
- Separately, Claude examines original journals for reported threats, harassment, discrimination, coercion, unsafe conditions or mistreatment.
- An AI flag includes a short supporting passage and explanation. Keywords alone do not establish toxicity.
- Ambiguous concerns enter normal-priority review; explicitly reported immediate danger receives High priority.
- Label AI flags Potential workplace concern—needs review. AI failure is unavailable analysis, not absence of concern.
- Never automatically accuse a company, contact a supervisor or alter placement, grades or clearance.

Paper change: distinguish disclosure, model flag, priority and coordinator-confirmed finding. Explain false positives/negatives, language limitations and human review. PATHWAY is not continuously monitored or an emergency response service.

### 4. Green/Yellow/Red document triage

| Colour | Advisory meaning |
| --- | --- |
| Green | Readable and apparent expected-document match; coordinator approval still required |
| Yellow | Uncertain, incomplete, ambiguous match or unreadable extraction; manual review |
| Red | Apparent wrong document or missing mandatory content supported by evidence |

Reject unsupported/oversized files through upload validation before AI. Red sends guidance that a replacement may be needed; it does not delete or officially reject the document. Mandatory resubmission requires coordinator confirmation.

Paper change: revise any diagram that equates AI Green with official approval, or AI Red with automatic final rejection. This human-confirmation safeguard is a deliberate difference from fully automatic resubmission.

### 5. Significant DTR mismatch

Compare only uploaded-DTR dates using Philippine time. Queue review if daily duration differs by more than 15 minutes, monthly totals differ by more than 60 minutes, a shift appears in only one source, or duplicate/overlapping entries occur.

Ambiguous/unreadable OCR means Needs verification, not confirmed mismatch. Coordinators decide outcomes. Never automatically change credited hours.

Paper change: disclose thresholds and OCR uncertainty, distinguish flagged discrepancy from adjudicated error, and describe the review queue.

### 6. Notifications

- Current assigned coordinator: attendance risk, workplace concerns and DTR discrepancies.
- Student: document guidance and confirmed resubmission requests.
- Journal/document/DTR notifications follow successful submission and analysis. Attendance is evaluated daily after the Philippine workday closes.
- Attendance: alert at first Medium/High classification and escalation; send one recovery update when an open risk clears.
- Deduplicate by student, source record/version and alert type. Retries update the same alert.
- Analysis changes alone do not repeatedly notify unless priority rises or evidence changes.
- Reading is separate from acknowledgment/resolution. Historical recipients cannot retain access after reassignment.
- In-app only: no automatic email or company contact. Immediate means queued after detection, not guaranteed immediate human attention.

Paper change: specify event-driven versus scheduled processing, timing assumptions, delivery limitations and duplicate prevention.

## Separate locally implemented Workplace Support feature

Home entry: Get workplace support. Required description in the student's preferred language; optional incident date, one PDF/JPEG/PNG up to 5 MB, and immediate-safety checkbox. Show assigned coordinator and privacy/safety explanations. No proof is required.

Student statuses: Submitted, Under review, Following up, Resolved. Students view original report/status but cannot edit, message or add files after submission. Preserve in-memory drafts on failure; uncertain deliveries reuse request identity. Reports and attachments are private to their owner and current assigned coordinator; investigation notes are coordinator-only.

Coordinator workflow: Review → Contact → Act → Resolve. Unreachable students remain open. Resolution requires successful contact, recorded action and a reason. In-app notices only. No automatic company contact or OJT eligibility changes.

Paper change: confirm whether this direct-report workflow is in scope and describe it separately from automatic AI journal concern detection. The latter has not been completed by implementing the support form.

## Work sequence

1. Write the detailed attendance-risk and coordinator-alert implementation plan against existing code.
2. Implement deterministic attendance calculations, tiering and deduplicated coordinator notifications locally.
3. Implement journal scoring and advisory workplace-concern analysis.
4. Implement advisory document triage and confirmation-based resubmission notifications.
5. Implement significant DTR discrepancy detection and coordinator escalation.
6. Run integrated privacy, access, retry and correctness checks; compare observed behavior with manuscript claims.
7. Update paper diagrams, methodology, limitations and results using actual evidence.

No production deployment or preview APK is included in this approval.

## Decisions still needed before their implementation phase

These operational details were not settled by approving the baseline:

- Exact daily evaluation time and handling different section shift end times.
- Treatment of uncertain attendance days in a risk denominator without falsely implying absence or Low risk.
- Exact projection formula, minimum history and zero-hours cases.
- Journal criterion examples, partial-credit boundaries and coordinator correction/audit rules.
- AI model/prompt/schema version, language evaluation and processing consent/privacy requirements.
- Per-document mandatory-field definitions and OCR reliability rules.
- DTR rounding, break periods, overnight shifts and handling incomplete comparison records.
- Notification source/version identifiers, reopening/recovery semantics and worker retry schedule.

Record decisions explicitly; do not present them as already defined in the manuscript.

## Revision tracking

- [ ] Locate exact current manuscript paragraphs/figures for each topic.
- [ ] Classify each item as already covered, clarification, addition or conflicting claim.
- [ ] Record manuscript page/section and adviser-approved replacement wording.
- [ ] Implement and test locally before writing completed-result claims.
- [ ] Include test conditions, failures, limitations and unverified release checks.
- [ ] Confirm final manuscript describes actual deployed behavior separately from planned/local behavior.
