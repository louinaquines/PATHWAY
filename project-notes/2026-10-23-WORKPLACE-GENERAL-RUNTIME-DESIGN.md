# General-input runtime safeguards — local design

Status: proposed design, not implemented or enabled. User authorized preparing the design; paid generation, automatic counting of student writing and production processing require separate approval.

## Intent

Prepare a synthetic-only local integration of ordinary-text request preparation, token-count validation and the existing consented journal worker. Preserve journal saves, exact original text, private human review and conservative accounting. Do not turn eight successful token-count samples into a claim that arbitrary writing has a proven cost bound.

Existing evidence: WORKPLACE-CONTROLLED-CLAUDE-ACCEPTANCE.md and 2026-10-23-WORKPLACE-INPUT-BOUNDARY-CHECK.md. Reuse workplaceJournalWorker.js, workplaceAnalysisBudget.js, workplaceAnalysisPricing.js and prepareWorkplaceClaudeRequest; do not replace the worker or relax the existing controlled executable.

## Builder decisions proposed for approval

1. New functionality is a network-free local test harness/analyzer only. It accepts injected count/generate transports, has no credential loading or default fetch, and is not imported by server.js or either existing dispatch runtime. Synthetic transport calls represent external boundaries but cannot establish model compatibility or accuracy.
2. Preserve nonblank original source <=8000 UTF-16 code units, whole canonical generation request <=5000 UTF-8 bytes, model/version/options, 14000-input engineering allowance, 1024-output ceiling and 9560-micro-USD reservation. No truncation or normalization. Storage-valid/provider-oversized journals save normally; analysis is unavailable.
3. Reserve the existing Firestore attempt and the existing local accounting layer before the first sharing boundary, including token counting. A count failure can therefore consume a generation reservation without generation; this intentionally conservative behavior is not an invoice charge. Neither receipt is refunded or reset.
4. Proposed sample-count admission threshold: positive safe integer <=12000 input tokens, leaving 2000 engineering tokens below the unchanged allowance. This margin is a builder recommendation, not provider certification or school policy. It does not prove arbitrary-input maximum billing; broader live processing remains blocked until an acceptable bound/risk policy is separately approved.
5. At most one count and one generation per selected job revision, no retries. The existing 10-attempt/100000-micro-USD UTC-day ceilings remain; both durable stores must authorize. A fresh UTC day does not remove the durable stop or authorize live continuation. No process-wide paid mode, arbitrary queue drain or historical scan.

## Workflow and authority

Use a new receipt-bound synthetic submission and call the existing worker with runBatch({limit:1,jobId}); do not manufacture authorization from caller-supplied notes or historical entries. Bind the selected job, student, entry, source revision/hash, consent revision/disclosure, canonical request hash and price-profile fingerprint before sharing. Ordinary text is data, not instructions.

The worker already reserves Firestore spending before analyzer.analyze and supplies assertReady. In the local analyzer, invoke that callback and independently confirm the selected binding, current UTC day, live lease and stop state before count; repeat after count and immediately before generation. Check current consent before counting because counting shares the same text externally. Withdrawal/source edits during count prevent generation. Withdrawal/source edits after generation prevent applying the result; previously shared text cannot be recalled.

The worker remains authoritative for final source/consent/lease checks and transactional case/notice application. Current coordinator assignment controls delivery. A reassignment must not leak notices to a previous coordinator. No company/supervisor notification, email, automated sanction or verified-toxicity label.

## Durable claims and stop behavior

Use job+revision identity for a persistent attempt claim; bind the immutable request hash and UTC day. Before count, persist that count may have started. Before generation, persist that generation may have started and establish the durable local stop, as in the controlled test. A process-local permission applies only to its already-owned attempt; the global stop blocks every new attempt. Stop removal is never implemented or automated.

If a process dies after either stage is claimed, a restart must not repeat it, even if it cannot tell whether HTTP occurred. Do not hold Firestore transactions open across transport calls. Receipts use compare-and-set ownership checks; late responses or stale owners cannot advance stages. Leases are checked again after transaction completion, not only within callbacks.

Unknown Firestore/local-ledger reservation outcomes block the attempt and stop processing; failure to finalize a job does not remove the stop or reservation. Cross-store atomicity is not promised. A mismatch between stores must never be reconciled by reducing totals, selecting a fresh ledger or deleting receipts. The canonical paid pilot is untouched during synthetic implementation tests; temporary ledgers are explicitly fake test resources, not a live bypass.

## Token-count and generation boundaries

Count only the canonical model/system/messages/thinking/output_config derived from the exact prepared request. Keep generation-only options in the generation request. Count response: HTTP success, <=32768 bytes, JSON with a positive safe-integer input_tokens <=12000. Reject missing, negative, zero, fractional, oversized, excessive and malformed results. No retry, fallback, output generation or misleading no-concern result on rejection.

Use the existing worker's single 25-second analyzer cancellation budget for the count/generation sequence, not 25 seconds per stage. This is not an end-to-end job deadline: preparation, reservation and finalization remain outside that timer. Each injected transport must honor its signal; abort/deadline/lease expiry prevents starting the next stage. Late output is discarded. This design does not promise recall/cancellation of remote work already accepted. Do not silently extend leases or bypass expired pricing to finish a slow call.

Generation must match the exact counted request binding. Preserve the adapter's model/end_turn/standard/global, usage, bounded-body and decision validation. Report actual usage separately from reservations. Usage above 14000 input or 1024 output triggers the existing durable price brake and no validated outcome; it is not automatically retried or refunded. A below-threshold count is an estimate, not an invoice cap.

## States and UI expectations

Reuse queued/leased/sending/processed/cancelled/unavailable and existing daily-limit delay behavior; internal count/generation claims do not introduce client status enums. Submission success is independent of analysis. Unavailable is not safe/no concern. Preserve direct workplace support regardless of consent or AI availability. No UI redesign or native build in this increment.

## Exit and remaining gates

Require RED/GREEN synthetic tests for counts, stage claims, races/crashes, consent/source/lease changes, cross-store uncertainty, stale pricing, midnight, duplicate delivery and shutdown. One final independent review and one final complete backend regression run after fixes. Record limitations; no production-readiness claim.

Before any later real transport implementation/enablement: approve the count-sharing disclosure, proposed 12000 threshold, accepted accounting risk, original-journal/export retention, durable hosted execution, client/rules cutover and a separately bounded live test. No live credentials, counts, generation, stop removal, spending-limit changes, production settings, deployment, data deletion or APK under this design.

## Builder-check resolutions

One independent read-only design review identified concrete interface clarifications, resolved here without broadening scope:

- Derive the current lease owner from the selected job/control documents and bind it transactionally; never accept an unrelated caller-supplied owner as authority. Bind a fresh process-session nonce too; a restarted process cannot resume a previously claimed boundary, including an accepted count.
- Before local reservation and both transports, read the exact Firestore budget receipt digest([jobId,job.attempts]); require its day/cost, the local receipt and the stage fingerprint to match the bound UTC day and 9560 reservation. At first entry, require job state sending and attempts exactly 1. Missing/uncertain/day-mismatched receipts stop without replacement reservation or refund.
- Persist accepted count and prepared-request hash in the fake claim store using the owning lease/session after count validation. Generation claim requires that evidence plus current authority; a count-started receipt alone is insufficient.
- Generation ordering is durable generation claim, fsynced fake stop, fresh authorization/binding check, then synthetic transport. Either uncertain write prevents transport. Fake stop is bound to attempt/session; only the already-running closure obtains an unforgeable in-memory continuation ticket. Existing stops block all new runtime construction; no disk ticket is restart permission. Any post-reservation count failure also writes the fake stop. Wire the worker's onAccountingUncertain to that fake stop, including failures before analyze begins.
- Reuse the current adapter's complete response validator with a fixed nonsecret SYNTHETIC-ONLY marker, one selected source and an injected synthetic generation fetcher. Do not load real credentials, provide real fetch defaults, extract a second divergent validator or change the production factory. Usage-only overflow results remain permitted so the real worker can set its durable price brake.
- Synthetic implementation models the proposed policies only. It does not approve the 12000 threshold/disclosure/accounting risk for real data. Consent-version checks alone are not proof that an actual disclosure covers external token counting. A future real disclosure/version migration requires its own review.

These resolutions are builder calls within the local-only design. No code, tests, transport calls or existing records were changed during document review.
