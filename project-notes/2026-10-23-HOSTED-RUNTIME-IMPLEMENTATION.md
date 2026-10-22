# Local hosted-runtime implementation ledger

Scope: durable backend authority and bounded recovery preparation; simple multilingual human-review sheet. No deployment, APK, paid calls, production settings or historical journal scan.

Ruling: reuse the existing worker's leases, UTC budget and expired-sending quarantine rather than introduce a second queue. An exact job ID is required for each wake; there is no historical scan or autonomous scheduler. A separately authenticated future host caller must provide that ID. Cost if insufficient: continuous hosted scheduling remains a release integration task.

Ruling: retain the conservative one-attempt global stop. A successful attempt stops sharing before generation; only its in-process continuation ticket may finish. Restart cannot restore that ticket. No rearm API or automatic stop clearing is provided. Cost: an operator-approved future release must define any broader operating mode.

Implementation: workplaceHostedRuntime.js is uninstalled/default-off and requires explicit DB, key and transport. Shared Firestore records hold hosted controls, daily reservations and attempt-stage claims. The existing worker reservation is verified, not incremented a second time in the same ledger; the independent hosted ledger retains its own reservation. Unknown acknowledgements are not refunded/retried.

Authority checks current v2 consent, account/placement/company state, source revision/hash/request, worker/job lease, epoch, cutoff, pricing, UTC day and original reservation. Existing worker finalization handles fresh coordinator routing; the runtime never creates public notices or emails.

TDD: first default-off test failed with missing module; all initial emulator tests then failed with missing module before implementation. Initial unprivileged emulator startup was sandbox-blocked; the elevated isolated-demo run exercised the real database.

Human evaluation: a blank 12-example review sheet is prepared. Human labels and real model predictions remain external dependencies; no human review or model-quality scores are fabricated. Existing evaluation tooling remains unchanged.

Independent review: one Important recovery defect reproduced: a persisted stop prevented expired sending jobs from reaching quarantine. Regression RED: 9 passed / 1 failed, expected processed:1 but received processed:0. Fix adds a transaction-only stopped recovery path which preserves the stop, refuses active/malformed leases and never invokes a provider.

Ruling: regrade the review's cutoff and lost-ack test gaps as Important verification work because historical disclosure and uncertain spending are core boundaries. Use an effective cutoff with an older job; exercise reservation, count, generation and stop commit acknowledgement loss. Cost: additional isolated-emulator test time, but no external calls.

Ruling on review scope: live provider pricing/behavior, deployed permissions/scheduler and linguistic/model accuracy cannot be certified by this local run. Keep those release gates closed. Independently executed tests will be recorded below; no reviewer assertion substitutes for their results. Cost: hosted availability and model-quality acceptance remain pending external evidence.

## Final verification

- Isolated real-Firestore hosted tests: **11/11 passed**, zero skipped/failed, including the stopped-recovery RED→GREEN fix and all four selected acknowledgement-loss boundaries. Log: output/release/workplace-hosted-final-focused.log.
- Full backend command `npm test`: **303/303 passed**, zero failed/skipped/cancelled. Includes the final hosted runtime and all 11 tests. Log: output/release/workplace-hosted-full.log.
- Existing evaluation scorer: **2/2 passed**, verifies rejection of unreviewed labels and metric separation; not a model-quality measurement.
- JavaScript syntax check and scoped `git diff --check` passed. No frontend code changed; no web build or APK was run.
- Canonical reservation ledger SHA256 remains ee31eabf015e229bd20c477a32cae3257e4c8dc42df037b724a4e54659d48eb2; stopped marker remains fa9ac579d1e269285c22010d9ec469ededc29c66ceea6e430249e1235f219f4e.
- Dataset has 12 examples, 0 completed human reviews, languages en/fil/ceb. No new model predictions or paid calls. Human-review sheet prepared; measured detection quality remains pending genuine labels and predictions.

Final local status: durable exact-job runner/authority and synthetic verification complete, default-off/uninstalled. No live scheduler, production record, provider call, deployment, email, deletion or APK. Human review remains explicitly unfinished rather than invented. No deferred minor findings after the test-gap regrading above.
