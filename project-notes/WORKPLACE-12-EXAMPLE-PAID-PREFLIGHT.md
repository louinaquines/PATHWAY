# Twelve-example paid evaluation preflight — October 23, 2026

User authorization: paid Claude evaluation of the twelve reviewed synthetic examples, subject to existing spending/daily limits; no production changes. This does not authorize unrelated journals, deployments, billing changes, or extra retries.

Initial preflight status: no paid calls, credentials loaded/printed, or reservation/stop changes at that point. After subsequent explicit local-rearm approval and 315 passing backend tests, ten genuine predictions were obtained within the daily cap. Two remain unattempted. See WORKPLACE-REVIEWED-EVALUATION-RESULTS-2026-10-23.md for current status; historical reservations and archived stop records were preserved, and no credentials were printed.

## Verified boundaries

- Dataset: WORKPLACE-MULTILINGUAL-REVIEW.json; twelve AI-assisted human-approved reference labels, reviewer Loui Jay Naquines, date 2026-10-23. Not blind independent labels or a validated language benchmark.
- Current model ID confirmed in official documentation: claude-haiku-5-5. Pricing checked at https://platform.claude.com/docs/en/models/haiku-5-5/overview and https://platform.claude.com/docs/en/about-claude/pricing.
- Official standard base pricing: $0.10 per million input tokens / $0.50 per million output tokens for prompts up to 100000 tokens, and $0.50 / $2.50 above that threshold. Existing $0.50 / $2.50 engineering reservation remains conservative for the bounded standard/global request; do not lower it to obtain more attempts.
- Existing per-attempt reservation: 9560 microUSD ($0.00956), input allowance 14000/output cap 1024. This is a conservative engineering reservation, not an invoice guarantee.
- Existing daily ceilings: ten attempts and 100000 microUSD. Ten such reservations total 95600 microUSD ($0.09560). Twelve total 114720 microUSD ($0.11472), requiring at least two UTC days and subject to any other reservations on those days. No retries or refunds of uncertain attempts.
- Canonical historical ledger remains output/release/workplace-claude-pilot-reservations.jsonl; its .stopped marker exists and requires explicit review before continuation. Existing reservations are retained, not reset at a new path.
- The old paid pilot is not an appropriate substitute: it contains nine different fixed examples, not this approved twelve-item dataset. Its outputs must not be presented as predictions for these twelve examples.

## Remaining authorization boundary

Explicit reviewed, bounded local rearm was subsequently approved by the user's “confirm” reply after this exact scope was presented. This is not approval to remove history, use an alternate ledger or change production. The new evaluator for the exact hash-pinned dataset must pass synthetic tests and the full backend suite before any sharing; it records reservation before sharing, persists each attempt/result, fails closed on uncertainty, checks current pricing and stops at its daily allowance. A failure or reference-label disagreement stops for review, without an automatic paid retry. Production remains unchanged.

Any remaining examples require a later UTC day; no scheduler/automation has been created. Final quality reporting requires genuine saved predictions for all twelve IDs and must report unavailable responses/misses separately rather than fabricate a completed score.
