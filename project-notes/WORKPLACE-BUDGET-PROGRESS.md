# SDD ledger — plan: project-notes/2026-10-22-WORKPLACE-BUDGET-PLAN.md

## Scope and rulings

Pre-flight: one task, no shared task interfaces. Existing journal/UI changes are unrelated and must remain untouched. Work stays in the existing project per the user's earlier one-checkout preference; no broad merge or push.

Ruling: retain the existing Firestore default-deny rules instead of adding redundant collection matches — there is no catch-all grant for the two new root collections; emulator tests explicitly exercise denial for student/coordinator/admin. Risk if wrong: private budget disclosure or client manipulation, hence real-rules tests are mandatory.

Ruling: this is a reservation boundary only — it accepts a trusted conservative micro-USD reservation and does not claim to calculate provider prices. It remains unwired/default-off. Caller-owned wall-clock time and attempt identity must be trustworthy at later integration; invalid configuration fails closed. UTC reset is internal/proposed until the user-visible reset is agreed.

## Task 1

- New test file first failed with MODULE_NOT_FOUND for the missing budget module.
- Implemented the small server-only transactional module. No credentials/provider integration, settings or deployment changes.
- Direct Node run: 3 unit tests passed; 4 emulator-dependent tests explicitly skipped outside emulators. A fake callback-retry test characterizes retry purity only; it does not claim concurrency guarantees.
- Full backend emulator run including the new tests is in progress; log output/release/workplace-budget-backend-tests.log.
- Fresh independent reviewer: Heisenberg (01a1625b-7d69-7f90-9785-3c0fe0cbbc20), focused only on this task.
- Budget evidence contains day/count/micro-USD only, no journal text or API key.

## Verified completion

Full backend `npm test`: 109 passed, 0 failed, 0 skipped, including all 9 new budget tests with real Firestore emulator concurrency, rollback and role-denial checks. Log: output/release/workplace-budget-backend-tests.log. Expected authorization-denial logs and emulator metadata lookup warnings did not fail tests.

Independent review found no correctness/security defects, but requested real concurrent cost-ceiling and same-attempt races. Added both characterization tests; both ran successfully in the full suite. No implementation changes were needed for those checks. No deferred review findings remain. Reviewer did not rerun tests; runtime evidence is from the implementer's full run.

Ruling: preserve a concise durable ledger in project-notes instead of removing review history or creating another worktree — user's one-project/document-folder preference and existing unrelated dirt take precedence. Cost if wrong: reduced branch isolation; only explicitly scoped files are staged, never the user's journal/UI edits.

Task 1: complete (verification: npm test → 109/109; no paid calls or production writes). This unit does not guarantee provider pricing, account-wide billing, worker delivery or consent enforcement: those are later integration gates. UTC date and opaque attempt identity must come from trusted server code when wiring callers. Full plan/spec retained for later stages. No push, deployment, automatic processing or APK build.
