# General journal input: local preparation design

Status: design proposal following approval to prepare the next change locally. Implementation and provider enablement are separate gates.

## Purpose and scope

Prepare the existing Claude adapter to validate ordinary original journal text with synthetic responses, without making arbitrary writing eligible for live provider processing. Reuse the current backend submission, consent, worker and decision validation. No new dependency, frontend redesign, hosted scheduler or historical scan.

## Existing constraints and proposed builder decisions

- Preserve the submission and detector maximum of 8000 JavaScript UTF-16 code units; do not relabel it as bytes or Unicode characters.
- Preserve the maximum of 5000 UTF-8 bytes for the entire serialized generation request, including instructions, JSON escaping and configuration. Measure after serialization, not just the source text.
- Preserve original text exactly: no trimming, normalization, translation or truncation for provider preparation. Whitespace-only text remains invalid.
- A saved journal can be valid for storage but too large for this analysis request. Its save must succeed independently; analysis becomes unavailable, not safe/no concern. Manual workplace support remains available. Do not introduce a new client status enum in this small change.
- Preserve the existing model, pinned API version, standard_only/global selectors, disabled thinking, low effort, 1024 output cap and response validators.
- Preserve the 14000-input engineering reservation and 9560-micro-USD calculation without claiming a tokenizer proof for ordinary writing. No general live send is permitted until that assumption has a separately verified basis. The single fixture's observed 324 tokens is not such a basis.

These limits and implementation choices are recommendations derived from existing code, not newly approved school policy.

## Minimal implementation boundary

Extract one side-effect-free request-preparation function into workplaceClaudeAdapter.js, exported for direct synthetic tests. It accepts original notes, uses prepareConcernRequest and creates the canonical serialized request. It returns the same prepared-request shape used today and enforces the serialized byte limit.

Keep createWorkplaceClaudeAdapter's existing allowedSources requirement and private prepared-request registry unchanged. Its prepare method must check source membership before delegating to the extracted function. A caller cannot pass an independently prepared object to analyze to bypass the registry. No new general-input mode, environment flag, provider factory or runtime wiring is introduced.

This deliberately separates ordinary-text validation from authorization to share it. A future runtime can only be designed after token/spend bounds and operational/retention gates are settled. It must not build an allowlist from untrusted caller input and treat that as authorization.

## Verification

Use Node's existing test runner and synthetic responses only. Exercise ASCII, Filipino/Cebuano-like Unicode text, emoji, quotes, backslashes and control-character JSON escaping; exact preservation; empty/whitespace/nonstring input; 8000 versus 8001 code units; and canonical requests immediately below/above 5000 bytes. Text meeting the source limit can still fail the serialized limit.

Also verify the real adapter continues rejecting arbitrary sources and independently prepared payloads, and that all canonical fixtures retain identical serialized requests and reservations. Unit tests may validate exact-quote output structure and malformed output; they cannot establish correct semantic handling of negation, injection or workplace danger. Such cases need a separately labeled model-quality evaluation.

## Exclusions and acceptance

No credential access, paid calls, counter/receipt reset, stop removal, price-profile refresh, source/backups deletion, production writes, deployment or APK. Existing fixture-only executable gates remain intact. Accept this increment only with observed RED/GREEN unit tests, the relevant regression suite, scoped diff review and documented results. No claim that automatic ordinary-student analysis is live or production-ready.
