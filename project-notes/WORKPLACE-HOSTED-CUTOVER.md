# Hosted and older-client cutover — prepared, not deployed

## Approved policies and local preparation

Optional disclosure v2 explicitly includes external token counting and analysis. Legacy v1 consent reads off without erasing its revision; the student must affirmatively choose again. Existing v1 requests are not valid v2 grants. The updated client preserves journals/manual support when consent is off. Provider preparation is uninstalled and disabled by default. No new hosted switch is wired into server.js.

The provider boundary requires explicit credentials/transport and durable authority methods: assertReady, reserve, claim, acceptCount, stop and assertContinuation. A future hosted implementation must bind those methods to the actual selected receipt, source/consent revision, request hash, current assignment, price profile, leases, UTC day and both durable accounting layers. Memory-only callbacks are insufficient for hosted approval. Do not pass no-op callbacks in production. The existing synthetic implementation provides test evidence, not a production durable store. Ephemeral Render filesystem storage cannot be assumed durable across deploys/restarts.

## Expand → update → contract

1. Keep processing OFF. Preserve the current deployed rules and older clients. Deploy nothing under this preparation batch.
2. In a later authorized release, install/test the backend submission API and v2 renewal before publishing the matching client. Verify revision hashes, auth errors, idempotency, offline/uncertain-save recovery and that missing consent does not block journals. No historical scan.
3. Publish and verify the updated student client with backend submission enabled. Older apps with direct Firestore writes continue during this compatibility phase, but cannot enter reliable automatic analysis. Show an update notice and do not claim direct writes create queue jobs.
4. Inventory supported installed versions and rehearse an outdated client's behavior. Obtain owner approval for minimum-version enforcement. Do not silently disable older submissions before an available update and communication path exist.
5. Test release-candidates/workplace-backend-journals.rules against updated and legacy clients. It preserves existing read permissions and denies every direct logbook write, including staff writes; verify every reviewer/admin workflow uses a protected backend API first. This is a candidate, not current firestore.rules. It must be rebased/reviewed if active rules change.
6. Only after separate deployment authorization: backend first, client verified, then candidate rules. Rules are an independent deployment. Do not deploy the candidate accidentally with routine Hosting release.
7. Enable a separately approved bounded provider pilot only after the readiness evidence is complete. The current factory is not a hosted scheduler or general queue dispatcher. Account budgets, fresh price profiles and explicit stop control remain mandatory; never reset paid receipts to make a pilot pass.

## Hosted recovery and rollback requirements

Use an authenticated bounded wake mechanism, durable shared leases/checkpoints and job identity/revision idempotency. No promise that a free sleeping host meets a 15-minute recovery target; verify actual scheduling and interruption behavior. Test source edits, withdrawal, reassignment, lost HTTP/DB acknowledgements, midnight, token usage overflow, unavailable provider and restart. No email recipients.

Rollback: stop provider sharing first, preserve reservations/uncertainty and pending receipts, retain the compatible backend API, and only restore previous rules after reviewing direct-write/duplicate risks. Never roll back to reinterpret v1 permission as v2. Do not erase accounting or pending jobs. Rehearse locally before any real cutover.

## Retention operations

Approved originals policy: 12 UTC calendar months after explicitly verified internship completion, February 29 clamped to February 28. Unknown/future completion dates, active analysis/review or holds block recommendations. Backups: 30 elapsed days, with no recommendation unless a newer restore strategy has been verified and holds cleared. Existing concern evidence policy remains 90 days after case closure, minimal audit 12 calendar months. All source/backup tools in this batch are pure dry runs; they do not read production or delete files/records. Real deletion needs a separately reviewed manifest, linked-record/attachment handling, independent backup inventory and explicit authorization.

## Readiness evidence

Use assessReleaseReadiness from workplaceRealUsePolicy.js to list missing evidence. This is a preparation checklist, not cryptographic verification: an operator must independently validate references. Even a complete checklist returns processingEnabled:false. Required: v2 renewal, exact client/backend revisions, backend-only rules tests, durable accounting/stop, bounded recovery, human-reviewed model evaluation, retention/restore, older-client transition, rollback, current pricing and deployment authorization.

Pending outside this local batch: real durable hosted orchestration, actual client/rules deployment, native-device acceptance, human labels and authorized model-quality evaluation. No real processing approval is implied by a successful unit test or proposed dataset label.
