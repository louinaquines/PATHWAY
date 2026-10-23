# Preliminary workplace detector evaluation — October 23, 2026

## Status

**Partial: 10 actual Claude predictions obtained; 2 examples not attempted because the existing daily allowance is exhausted.** All ten predictions agree with the user-approved reference labels. This is NOT a completed twelve-example evaluation or proof of real-world detection reliability.

Human reference labels were explicitly approved by Loui Jay Naquines on October 23, 2026 after seeing AI-assisted suggestions. This was not blind independent labeling, adjudicated expert review or a representative language benchmark.

## Actual execution

- Model: `claude-haiku-5-5`, unchanged application detector prompt and adapter; standard service tier, global inference, no tools/caching/batch. Only the twelve hash-pinned invented examples are eligible; no student accounts, Firestore records, production settings, deployments, billing/account configuration or emails were touched.
- Each attempt was reserved before sharing, token-counted, and limited to one generation. No automatic retries. Known stop markers were archived under the explicitly approved bounded local rearm, then restored before sharing and retained afterward.
- Dataset SHA256: `c370bd361646fbebce8401b3807628a48548d0f759161942e929099219a614b9`.
- Saved genuine predictions: `output/release/workplace-reviewed-evaluation-c370bd361646fbebce8401b3807628a48548d0f759161942e929099219a614b9.jsonl`. Rows record source/request hashes, deterministic attempt IDs, timestamps, model, counted input and returned usage. These are not fake-transport test outputs.
- Canonical ledger: `output/release/workplace-claude-pilot-reservations.jsonl`; all historical bytes retained as an unchanged prefix, confirmed against prior SHA256 `ee31eabf015e229bd20c477a32cae3257e4c8dc42df037b724a4e54659d48eb2`. Its continuity mirror matches. Ten stop-history archives retained, canonical stop restored, lock released.

## Results for the processed subset only

| Language | Planned examples | Actual predictions | Reference-label agreements | Unavailable | Not attempted |
|---|---:|---:|---:|---:|---:|
| English | 4 | 4 | 4 | 0 | 0 |
| Filipino | 4 | 4 | 4 | 0 | 0 |
| Cebuano | 4 | 2 | 2 | 0 | 2 |
| Total | 12 | 10 | 10 | 0 | 2 |

For those ten processed examples: zero false-positive disagreements, zero false-negative disagreements, zero priority errors and zero high-priority misses relative to the approved labels. All three immediate-danger examples were included. The remaining Cebuano workload and humiliation examples have no predictions yet; do not fill them with expected labels or count them as successes.

## Allowance and costs

UTC day 2026-10-23 has ten reserved attempts totaling **95600 microUSD ($0.09560)**. This preserves the existing 10/day and 100000-microUSD/day limits; no reservation was refunded or reset. It is an engineering reservation, not the invoice amount. Returned aggregate generation usage: 3243 input tokens and 996 output tokens. Do not confuse this API evaluation with Codex usage costs.

Current model/base pricing was checked against [Anthropic's model overview](https://platform.claude.com/docs/en/models/haiku-5-5/overview) and [pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing). The conservative existing $0.50/$2.50-per-million-token reservation rates were not reduced to obtain more attempts.

## Remaining work

Pending IDs: `ceb-workload`, `ceb-humiliation`. Earliest daily-cap reset: **October 24, 2026 at 8:00 AM Asia/Manila** (00:00 UTC), subject to other reservations, unchanged dataset, valid pricing and the same bounded approval. No automation or later execution has been scheduled. The current stop remains active; no more calls may be made today under this daily cap.

After those predictions are obtained, recompute metrics across all twelve genuine records and preserve any disagreement/unavailable response. Do not claim the full evaluation is complete from today's partial set. Broader unseen, independently reviewed examples remain necessary before any claim of general language reliability or live safety readiness.

## Software verification

New evaluator tests: 12/12 passed with fake transport and real temporary-file accounting. Full backend `npm test`: **315/315 passed**, no failed/skipped/cancelled tests; log `output/release/workplace-reviewed-full.log`. Independent review findings were reproduced and fixed before any paid call. These software tests are separate from the ten genuine provider predictions above. No APK, deployment or production activation.
