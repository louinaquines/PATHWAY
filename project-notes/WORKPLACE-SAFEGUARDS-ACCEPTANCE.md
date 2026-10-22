# Workplace safeguards — local implementation, 2026-10-23

Status: implemented and verified locally; three independent-review findings fixed with RED→GREEN regressions. Final backend suite 219/219 and web suite 201/201 passed. No production deployment, paid AI, email, APK, live purge or original-journal deletion.

## Approved policy and implementation

- Open cases retain evidence. Resolution or reason-required false-positive dismissal starts the retention clock, not reading a notification or failed contact.
- Evidence and free-text notes expire after 90 elapsed days. Minimal audit expires after 12 UTC calendar months; February 29 anniversaries clamp to February 28. This is an approved project policy, not a legal retention claim.
- Both dates are persisted on new closure. Legacy valid closedAt derives the dates; earlier recorded expiry wins. Invalid closure metadata is hidden and cleanup reports unavailable rather than guessing or deleting an open case.
- At evidence expiry, APIs omit findings and project action history to action/actor/time and validated outcome/priority enums only. Physical purge removes quotes, notes, source hash and historical routing fields; case/entry/student IDs, origin/rule version, state/priority/version and retention timestamps remain until audit expiry. No new free-text audit copy is made.
- At audit expiry, list/detail/notice/read/action and old receipt replay deny or omit the case, including the fresh authorization immediately before response. Late physical cleanup cannot make an expired case visible.
- Physical retirement drains matching terminal jobs, case notices, concern-action receipts and only allowlisted workplace concern audit events, then deletes the case after fresh transactional checks. Every related query/deletion stage is capped at 20; each invocation scans at most 20 cases. Progress is durable row deletion plus a rotating cursor, not an indefinite case tombstone. `complete` means the bounded batch completed, not all records have been removed; processed/purged/retired counts distinguish progress.
- Active/inconsistent jobs block final retirement without blocking already-expired evidence scrubbing. Malformed cases remain hidden and require repair. Original journals, consent records, submission receipts, unrelated cases and unrelated global audit events are not retired by this policy.
- Cleanup is explicit-enabled, exact-demo and local-emulator-only. One bounded recovery batch runs per enabled fake-dispatch wake, including startup and the 15-minute target while awake; cleanup failure cannot turn a committed journal into failed submission or trigger real provider fallback. Hosted scheduling remains unimplemented in this change.

## Verification so far

- Pure policy: 3/3 GREEN after missing-module RED; exact dates, leap-day clamp, early saved expiry, invalid timestamps, rollback hiding and free-text removal.
- API boundary: new real emulator tests first failed on missing auditDeleteAt and anniversary hiding, then passed with policy/access changes. Cross-boundary clock test exercises the second authorization before response.
- Linked cleanup: missing function RED; actual emulator verification covers multi-stage resume, competing cleaners, linked-copy removal, byte-for-byte preservation of original journal/consent and unrelated records, and unsafe-job blocking.
- Focused safeguards suite: 38/38 passed, zero skipped/failed, 70.950 seconds, before the extra active-job regression. Log: output/release/workplace-safeguards-focused.log.
- Additional active-job regression found that the guard returned before evidence scrubbing. RED showed findings still present; the fix scrubs expired evidence while preserving the unsafe job/case. Narrow cleanup/policy suite 7/7 passed, 19.578 seconds. Logs: workplace-safeguards-active-red.log and workplace-safeguards-active-green.log.
- Real dispatch integration now exercises competing initial identical submissions, separate runtime claims, revision/consent changes during analysis, and expired leases. Existing worker behavior passed these additional scenarios; analyzer pauses/mutations are test-only and transactions remain real.
- Web suite: 201/201 across 46 suites, 34.001 seconds; existing expired-evidence rendering/access-denial tests pass. No web source or native app source changed. Log: output/release/workplace-safeguards-web.log.
- One independent read-only review found three Important issues: legacy already-purged records could retain routing fields; expiry could cross inside assignment reads; clock rollback could restore expired visibility. All three were reproduced with failing emulator regressions and fixed in one pass. No separate Minor findings and no second reviewer were used.
- Historical full run during regression development: 214/217 passed, three expected reviewer regressions failed, 318.454 seconds. This is not a passing full-suite claim. Log: workplace-safeguards-full.log.
- Post-review focused run: 42/42 passed, zero skips/failures, 86.581 seconds, including legacy normalization, expiry inside authorization, monotonic expiry, and a paused real worker racing cleanup. Log: workplace-safeguards-review-fixes.log.
- Additional expiry regression reproduced an earlier list row surviving when a later assignment read crossed expiry. Fixed under the same reviewer finding by delaying page projection until all row authorization reads finish and using one final observed time. RED log: workplace-safeguards-list-red.log; GREEN in the final full suite.
- Final `npm test` in PATHWAY-backend: 219/219 passed, zero skipped/failed, 334.607 seconds; output/release/workplace-safeguards-final-full.log. This run includes every reviewer regression and the paused-worker cleanup race. Expected permission-denied output comes from negative security tests; emulator SIGINT is teardown. Syntax and scoped staged-diff checks passed.

## Review decisions and remaining scope

- Preserve typed safe history rather than discard all action metadata at 90 days, per approved audit policy; the existing UI currently hides the expired detail section instead of adding a new audit-history interface.
- A global transactional observedAt high-water mark contains no case/person references and prevents observed expiry reversing after clock rollback. A forward clock error can fail closed until trusted time catches up; concurrent requests can contend on this document. This is an operational timestamp, not an indefinite per-case audit/tombstone.
- Reviewer excluded unrelated dirt and independent correctness of older worker/submission/consent/budget/detector/assignment/routing code. Those remain separate verification scope; integration tests do not certify every underlying behavior.
- Reviewer did not rerun suites; the author runs and records exact results. Exhaustive interleavings remain unproven; one paused real-worker/cleanup race is now covered explicitly.
- Hosted scheduling/deployment, Firestore indexes/rules readiness, real-data migration, throughput and snapshot recovery remain release checks, not this local claim.
- Paid detection/pricing, emails/company contact, native/APK and a new browser walkthrough are not verified here. Web regression tests are recorded separately.
- Legal adequacy is not claimed. The manuscript checklist records the actual project policy and local status; it is not a substitute for the final manuscript edit/review.

## Limits

No live policy enforcement or hosted deletion is claimed. An asleep host, bounded rotating scans, unsafe jobs, malformed dates or storage errors may delay physical deletion; API expiry remains separate. No new native-device walkthrough, capacity test, real detection-quality evaluation or backup-system hardening. The previous default-off/fixed-fixture restrictions and daily reservation guards remain unchanged.

Retention here covers concern-case evidence/notes and associated operational copies in the active database. It does not erase original journal text, previous QA snapshot exports, or other independently retained source records. Backup/export retention must be addressed separately before any real-data release.
