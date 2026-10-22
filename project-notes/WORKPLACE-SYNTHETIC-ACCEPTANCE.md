# Workplace concern synthetic evaluation — 2026-10-22

## Scope and result

The user approved up to seven additional paid requests for the seven remaining fixed synthetic notes. The unchanged reviewed runner made exactly seven requests in the run started at 12:50:23 UTC, without retries or allowance reset. All seven returned validated decisions matching their pre-recorded expected categories. Each flagged result also passed the local private coordinator case/notice checks; unflagged results created no case.

Combined history: **eight successful samples, one historical unavailable attempt**. No sample remains unattempted, but the English immediate-danger sample has no valid result. This is not a 9/9 pass, measured production accuracy, independent holdout study or evidence of emergency-response reliability.

| Fixed synthetic sample | Expected | Observed result |
| --- | --- | --- |
| English immediate danger | High | Unavailable in original run; not retried |
| Filipino immediate danger | High | High; prior single diagnostic passed |
| Cebuano immediate danger | High | High |
| English ordinary work | None | None |
| Filipino negated concern | None | None |
| Cebuano training example | None | None |
| English coercion with embedded instruction | Normal | Normal |
| Filipino harassment | Normal | Normal |
| Cebuano mistreatment | Normal | Normal |

## Accounting and safeguards

- Cumulative durable allowance: **nine attempts, 86040 micro-USD reserved ($0.08604)**, within the existing ten-attempt/100000 micro-USD daily limits. Reservation is not an invoice or actual billed-cost measurement.
- Eight successful responses returned a known total of **2875 input / 1060 output tokens**; the original unavailable attempt's usage/cost remains unknown. The seven-request continuation accounts for 2503 input / 876 output tokens.
- Prior two receipt identities were skipped, not replayed. The stop marker was restored after the run. Reservation journal and continuity history remain intact. No additional request is authorized by this result.
- No production records/settings/deployment, real student records, account/billing changes, emails or APK build were involved. The demo emulator was shut down after verification.

## Evidence and interpretation

- Seven-request run: `output/release/workplace-claude-remaining-seven.log` and `workplace-claude-pilot-2026-10-22T12-50-23-917Z.jsonl`.
- Earlier successful diagnostic: `workplace-claude-pilot-2026-10-22T12-43-40-813Z.jsonl`.
- Original unavailable attempt: `workplace-claude-pilot-2026-10-22T12-09-47-298Z.jsonl`.
- Durable reservations: `workplace-claude-pilot-reservations.jsonl` and its continuity/stop sidecars.
- No application source changed for the continuation. The latest verified code still has **186/186 backend tests passing**, zero skipped; this historical test result was checked, not rerun for a data-only evaluation.

The CLI exits 1 because its original completion predicate requires every row to be passed, while prior attempts are correctly marked previously_reserved. Structured output reports `status: complete`, `requests: 7` with all seven new rows passed. This exit does not indicate a failed provider request in this continuation; the overall nine-sample history still includes the earlier unavailable result.

Paper wording: report a small, fixed, synthetic local demonstration of advisory classification and private in-app routing. Do not claim validated multilingual accuracy, zero false alerts, complete workplace safety detection, production delivery or official findings against employers. Fluent language/safety review, consent and retention release gates, broader representative/independent evaluation and deployed end-to-end validation remain separate work.
