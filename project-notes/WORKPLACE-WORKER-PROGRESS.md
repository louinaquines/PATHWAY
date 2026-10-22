# SDD ledger — plan: project-notes/2026-10-22-WORKPLACE-WORKER-PLAN.md

## Scope and rulings

- Approved local-only control plane; existing checkout reused per user preference. No deployment, push, preview APK, provider request, timer, live route, detector or notification.
- Pricing is pinned with a seven-day review expiry. The reservation is a conservative local allowance, not a provider invoice guarantee. Real request token bounds remain a release gate.
- A bounded document-ID cursor avoids terminal head entries starving queued work; a global lease serializes batches. Maximum five jobs per invocation.
- Existing budget receipts survive crashes and UTC midnight. Uncertain send states are unavailable rather than resent; there are no refunds.
- Consent revision, raw source hash/revision, account/placement eligibility and lease ownership are checked in fresh transactions. Revocation after an already-sent request cannot recall that request.
- Pure synchronous preparation and injected synthetic analysis only. Operational usage is stored, not notes, quotes, reasoning, detector outputs or raw provider errors.
- A durable canonical price-profile brake stops remaining queued jobs after usage exceeds its bound. Invalid retry dates fail closed.
- Worker is deliberately not imported by server.js; Docker packaging and hosted scheduling are deferred until explicit integration approval.

## Evidence

- Pricing tests initially failed with missing module, then passed 2/2 after implementation.
- Real-emulator regression tests exposed same-batch brake continuation and malformed retry-date handling before fixes. Controlled concurrency test now forces overlapping workers.
- Cancellation clears usage to null (test corrected from expecting an absent field).
- Independent review found a lease-expiry-during-read defect. Added failing regression coverage, then rechecked time after source reads and immediately before analysis, including database commit latency.
- Focused real-emulator verification: 18/18 pass, zero skipped (`output/release/workplace-worker-green.log`). Tests include adapter calls outside transaction callbacks, final send/outcome expiry, and post-send-transaction expiry.
- The first full run overlapped test edits and caught the pre-send recheck shifting the outcome test's read count; corrected that test to expire specifically at the outcome boundary.
- Final full backend `npm test`: **142/142 passed, zero failures/skips**, exit 0 (`output/release/workplace-worker-full-backend-final.log`). Scoped whitespace check passed. No web/native UI changes; no device, Docker build, real-provider or deployment checks performed in this stage.
- Local implementation/review/verification stage complete. Keep the local commit unpushed; production remains unchanged.

## Remaining release gates

Real sender bounds and pricing review; structured concern detector; retention/false-positive policy; coordinator queue and private in-app alerts; authorized dispatcher/recovery integration; student/native release tests and explicit cutover. Automatic live workplace analysis is not enabled by this stage.
