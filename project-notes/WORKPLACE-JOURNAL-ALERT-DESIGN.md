# Automatic journal workplace-concern alerts — design for approval

2026-10-22. Status: proposed implementation design, not implemented or deployed.

## Approved user decisions

- Analyze automatically after successful journal submission, using original notes only.
- One-time explicit opt-in to sharing journal text with Anthropic; withdrawal applies to future submissions. Declining does not block journals or direct support requests.
- Explicit reports of immediate danger receive High priority; other potential concerns receive normal-priority review.
- Private, in-app coordinator alerts only. No automatic company contact, email, academic decisions, or placement changes.
- Human workflow: review → contact → act → resolve. Reading does not resolve. Unreachable students remain open for follow-up.
- Begin background analysis after successful submission; use a 15-minute recovery-check target for interrupted or queued jobs. Free hosting may delay checks beyond that interval; no guaranteed response time.
- Synthetic capstone testing only: automatic processing disabled by default and enabled only for explicitly authorized test windows. Maximum 10 provider attempts and $0.10 reserved spend per UTC day, including retries; stop at either bound. UTC accounting is an implementation proposal, not yet a user-selected reset time.

## Proposed implementation choices (not additional approved policy)

### Consent and submission

Show a versioned consent disclosure before enrollment, never prechecked. Explain what text is shared, who receives alerts, possible mistakes, withdrawal, and that PATHWAY is not continuously monitored or an emergency service. Persist consent changes server-side with actor, version and timestamp; never expose journals through consent records.

Use a backend-owned journal submission boundary to save the original entry and durable analysis job atomically. First inventory the existing mobile/Firestore submission path and preserve placement eligibility, revisions and submission validation; a screen-only callback is not reliable background scheduling. Journal submission remains successful even when later analysis fails. Consent declined means no provider request and a truthful Not enabled state.

Record consent version at submission and recheck current consent before sharing. Withdrawal cancels queued unsent jobs as a privacy safeguard, as well as excluding future submissions. Before storing a result after a provider call, recheck consent and source revision; discard a stale result without pretending already shared text can be recalled. Existing coordinator records follow an explicitly documented retention policy; no deletion or retroactive scan is included here. Explain these withdrawal limits to the student.

### Durable background work and spending

Use a durable bounded queue and short worker batches, not only an in-memory timer or an open coordinator screen. An automatic dispatcher must actually be wired and verified; a queue without a dispatcher is incomplete. Do not change the existing attendance schedule while implementing this feature.

Proposed initial bound: one initial request per journal revision and at most one retry for transient network/server failures. Never retry auth rejection, invalid structured output or consent denial automatically. Persist attempt count and lease ownership so restarts and duplicate events cannot multiply requests. Provider quota exhaustion defers work, visibly, without claiming a negative analysis. Configure a shared persistent daily request budget and bounded concurrency before enabling automatic calls; the current adapter's process-local cap alone is insufficient across restarts.

No background work or paid calls are enabled by this design document. Verify dispatcher feasibility on existing infrastructure before enabling the immediate/15-minute targets. Do not silently consume credits under the journal-review feature's separate user-triggered request budget.

The dollar guard requires a pre-request conservative reservation using verified model prices, bounded input, maximum output (including billable thinking), and applicable pricing multipliers. Count all attempted calls, including failures/retries. Commit reservations atomically across workers before the request; never refund an uncertain request automatically or rely on restarting the adapter to reset limits. Record actual usage when available separately from reserved cost. If pricing is missing/stale/unsupported, disable requests rather than claim the dollar cap is enforced. Keep excess work queued with Analysis delayed—daily limit reached. This guard is a local application ceiling, not an account-wide Anthropic billing limit; independent feature calls can still spend credits.

### Analysis contract

Keep concern analysis separate from journal completeness points; do not use a low score or negative sentiment alone as a trigger. Review reported threats, harassment, discrimination, coercion, unsafe conditions and mistreatment in the original language. Treat instructions, hypothetical examples, negation and quoted training material as untrusted context, not automatically as incidents.

Return a bounded structured decision with exact original evidence and a short reason for every flag. High priority requires evidence explicitly describing immediate danger, not an inferred diagnosis or keyword alone. Validate schema, quote membership and lengths; acknowledge these checks cannot establish semantic truth. UI label: Potential workplace concern—needs review, including High flags. A successful no-flag result says No concern flagged by automated analysis, not Safe workplace. Provider failure says Analysis unavailable. Never change or polish the source to obtain an alert.

### Alerts, access and deduplication

Create a private coordinator review item and notification atomically only after validated detection. Recheck current assignment at delivery and every subsequent list/read/action. No company or supervisor recipients. Notifications contain minimal summary/routing metadata, not sensitive excerpts; evidence is fetched only in the authorized detail view.

Use student + entry revision + alert type as an idempotency key. Retries update the existing analysis/item. Priority escalation or materially changed evidence can issue a new event, never a duplicate for identical evidence. Define material change conservatively from validated source revision/evidence, not free-form model wording. Revocation/reassignment removes former coordinator access; lack of an assigned coordinator retains undelivered work visibly for later routing.

Keep AI-originated items distinct from direct student support reports. Link to the source revision and retain provenance. Do not merge or modify the parked Workplace Support worktree automatically. Reuse its established workflow only after inspecting integration compatibility; no broad merging of unrelated edits.

### Coordinator actions and student expectations

Use explicit acknowledgment, contact, action and resolution records with audit timestamps. Failed contact leaves the item open. Resolution needs successful contact, recorded action and a reason; closing an AI false positive should be a separately justified human disposition, not a fabricated contact. Define that disposition in the implementation plan before building the queue UI.

The coordinator can override AI priority with a reason. No automatic sanctions or verified-toxicity labels. Students retain direct support access regardless of consent or AI availability. Do not promise immediate human response or present automation as emergency monitoring.

## Verification and release gates

Use synthetic notes only. Test consent denial/withdrawal, atomic submit/job creation, stale revisions, worker restart, concurrency, quotas, bounded retries, malformed/unsupported quotes, negation and injection, priority cases, duplicate delivery, reassignment, missing recipients and private access. Verify workflow guards and UI errors with mocked providers before separately authorized paid evaluations. Human review of safety examples remains necessary.

Use existing consistent UI components; coordinator-only details must not leak through student APIs or raw Firestore reads. Test student consent/support availability and coordinator review/actions together. Document limitations and actual test outcomes in the manuscript checklist. No deployment, production enablement, retroactive journal processing or APK build without authorization.

## Decisions still needed before automatic enablement

1. Verify implementation feasibility for immediate dispatch and a 15-minute recovery target; obtain hosted enablement authorization separately.
2. Verify current model pricing and reservation bounds before any automatic paid test. Confirm UTC versus Philippine-time daily reset before connecting the guard to a user-visible allowance.
3. Retention rules for stored concern evidence and human false-positive closure disposition. These block storing live concern cases/releasing coordinator workflow, but do not block the default-off budget unit.

Next step: review/approve this design, settle the operational decisions, then create a small staged implementation plan. Do not start provider-triggering product code from this document alone.
