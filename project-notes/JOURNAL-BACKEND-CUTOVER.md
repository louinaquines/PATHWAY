# Journal backend migration — local preparation only

2026-10-22. No live deployment, rule publishing, preview APK, Claude request or automatic worker enablement is part of this work.

## Current prepared behavior

- POST consent read/update APIs provide versioned student opt-in, decline and withdrawal; stale choices return conflict instead of overwriting another session.
- POST /student/journals atomically saves original/refined notes, source revision, audit, replay receipt and (only if opted in) an inert queued-job pointer. Queue creation is not analysis, notification or an approval.
- Existing Firestore reads and legacy owner writes remain unchanged. New private collections are backend-only by default-deny rules.
- `EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION` is off unless exactly `1` at build time. Legacy builds never offer enrollment or call the new submission API. Migrated builds do not fall back to direct writes on errors.
- One request identity is retained for an unchanged open draft after network failure. The text stays visible on failure. Closing/discarding the draft or successfully finishing it ends that in-memory identity; persistence across app termination is not implemented. Do not claim crash-proof client drafts.
- Backend derives date/week and revision rather than trusting the phone. Revisions require currently rejected status, expected source revision and an expected original source/review snapshot (raw/refined text, AI-refined flag, hours, reviewedAt), preserving the original period/date/week. Snapshot matching catches legacy resubmissions which do not advance sourceRevision. Legacy yearless periods are not silently repaired.
- The backend initializes numbering from at most 1000 legacy entries, once; larger histories need explicit manual migration. Concurrent backend calls allocate distinct numbers. Simultaneous legacy direct writes are outside that guarantee during compatibility.

## Source and consent checks required by the future worker

Read current original notes, sourceRevision AND sourceHash, current account/assignment, submission-time consent version/revision, and current consent before sharing; then recheck before storing a result. Direct legacy revisions can change text without advancing sourceRevision, so revision alone is insufficient until direct-write cutover. A queued entry after withdrawal must not be sent. Withdrawal does not erase previous sharing or coordinator records. No worker exists in this migration, and no test of journal submission proves alert delivery.

Future worker cancellation rule: current consent must remain granted at the same consent revision/version captured by the job. Withdrawal followed by re-grant must not resurrect older unsent work. A new consent choice conservatively invalidates jobs from the earlier consent revision; do not silently backfill them.

Receipts use actor-scoped opaque identity + canonical payload hash; changed payload under the same identity conflicts. Fresh student-role and password authorization is always rechecked. Identical receipt replays return the committed ID/status even when placement/clearance subsequently changes; they perform no new writes. New request identities still require fresh eligibility/company checks. Source text never appears in queue pointers, receipts or audit details.

## Authorized release order (not executed)

1. Review this migration and test results; preserve rollback artifacts and current live configuration.
2. Separately authorize and deploy backend APIs, leaving paid processing off. Existing apps can continue direct writes but do not receive guaranteed automatic analysis.
3. Separately authorize an updated student app with the migration flag enabled; verify auth, consent choices, withdrawals, submission/revision, uncertain responses and eligibility using synthetic accounts. Do not enable the flag against an unready backend.
4. Decide minimum-client-version/update messaging. Inventory admin and draft editing before changing write rules; this implementation only migrates new pending submissions and rejected-entry revisions.
5. Separately authorize and deploy rules denying obsolete direct journal writes, retaining owner/admin/assigned-coordinator reads. Prove stale clients fail with clear update guidance. Do not publish deny rules while relying on old apps.
6. Only after pricing reservation, worker/dispatch, privacy, retention and human-review gates are complete, authorize an explicit synthetic automatic-processing test window. Immediate dispatch and 15-minute recovery are targets, not free-hosting guarantees.

## Rollback and limitations

Before direct-write closure, disabling the build-time migration path restores the legacy route in a newly distributed build, not remotely in an already installed one. After closure, rollback needs coordinated client/rules/backend compatibility; never silently reopen security rules as an error fallback. Backend-owned source metadata must not be deleted as rollback housekeeping.

No historical backfill, journal deletion, company contact, email, academic outcome, automatic consent or automatic AI charge. The direct Workplace Support worktree remains parked and is not made live by this migration. Students can contact their assigned coordinator without consenting to AI; do not advertise an unavailable support screen.
