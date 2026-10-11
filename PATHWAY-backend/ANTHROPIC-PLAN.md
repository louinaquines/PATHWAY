# Anthropic integration — phased, opt-in

## A — Foundation and student refinement (local implementation)

Server-only Messages API adapter; explicit model/configuration; fixed HTTPS provider; 25-second timeout; 8,000-character input/output and 32 KiB response caps; maximum 2 concurrent calls and configurable daily request cap per process; no automatic retries. Disabled by default and forcibly disabled in emulator workflows. Authenticated student route requires affirmative consent; no record writes. Mobile keeps the free checklist and adds an optional AI suggestion with disclosure; original text is preserved and suggestion is reviewed before submission. Human review remains mandatory; prompt instructions cannot guarantee factual accuracy or defeat every injection.

Mocked provider tests make no paid calls. Local changes are not deployed. No API key has been requested in chat, saved or activated.

Validation checkpoint: eight mocked provider tests and eight production preflight tests passed (16 total). Full isolated security suite passed 39/39, including authentication, role, consent, input validation and emulator AI denial. Android bundle export passed for the final suggestion/discard UI (1054 modules). Initial route-test assertion used the helper's wrong status property; corrected the test and reran all 39 successfully. UI visual/device acceptance and live paid-provider quality are pending. No production changes or paid requests occurred.

## B — Coordinator journal analysis (local implementation)

Separate explicit action on one owned entry, behind coordinator authentication, assignment ownership and affirmative sharing consent. Backend loads original notes (saved report fallback), never client-provided notes. Bounded structured completeness, possible competency evidence and tone cues require exact source quotes. Free deterministic checks remain separate; no grades, diagnoses, decisions or database writes. Response is private/no-store and shares the provider quota with student refinement. UI findings are discardable and stale requests are ignored when selection/text changes.

Validation: 13 mocked backend tests passed, including provider foundation, role/ownership/consent denial, safe errors, exact evidence validation and shared quota. Full web suite passed 114 tests across 36 suites before the additional stale-result test. Visual acceptance and real-provider quality remain pending; no paid calls or deployment occurred.

## C — Attendance-risk explanation (local implementation)

Analytics and the new one-student explanation route share the existing deterministic calculator and bounded attendance loader. Coordinator role, owned section, matching student department/section and affirmative consent are required before provider access. Only seven allowlisted aggregate fields are sent; no identity, raw punches, location logs, dates of individual shifts or journal text. Structured output must copy field values exactly, use unique known fields and bounded qualitative wording without digits; changed values are rejected. Original calculations remain authoritative, null remains unavailable and estimates are not guarantees. No writes or approvals occur. The Analytics table provides an opt-in, discardable explanation panel and rejects stale responses after metric/selection changes.

Validation: 28 focused backend tests passed (provider, journal, attendance calculator, coordinator analytics and attendance AI); all 118 web tests across 37 suites passed; Vite production build passed with existing PDF/chunk-size warnings. Visual acceptance and real-provider quality are pending. No API credentials activated, paid calls made or deployment performed. Shared in-process quota limitations described below still apply.

Full isolated security regression passed 41/41, including both coordinator AI routes with actual emulator authentication, ownership/consent denial and forced AI disablement. Attendance explanation checks confirmed no student-profile changes. Emulators shut down successfully afterward.

## D — DTR/document assistance (local implementation)

Optional panels in the PDF document preview and DTR comparison dialog. Coordinators review/redact up to 6,000 characters, explicitly confirm correction against the source and separately consent to Anthropic sharing. Long extracted text is explicitly marked as a partial excerpt. Images and image-only PDFs stay manual; no vision or file-byte sharing is added. The DTR route validates the entered Form 48 and recomputes comparison against bounded fresh server attendance, sending only comparison dates/status/issues plus the reviewed excerpt—not raw punches, locations, profile or file URLs. Combined provider source is capped at 8,000 characters. All findings are bounded and require exact source quotes; unsupported output fails closed. Client excerpts/transcriptions are honestly labeled as unverified, not server-extracted file proof. Source changes invalidate findings and confirmations. No OCR/table auto-correction, attendance writes, saved AI findings, signatures/authenticity verification or approval changes occur.

Validation: 26 mocked AI/provider/route tests passed; all 121 web tests across 38 suites passed; Vite production build passed with existing PDF/chunk warnings. Visual/device acceptance and live-provider quality remain pending. No credentials activated, paid calls made or deployment performed. Shared quota and activation restrictions remain unchanged.

Full isolated security regression passed 42/42, including authenticated document assistance assignment, review/consent denial, forced emulator disablement and unchanged student records. Emulators shut down afterward.

## Activation gate

Coordinator component visual checkpoint (2026-10-12): actual panels rendered with mocked requests in a loopback-only fixture; desktop/narrow layout, consent, success/discard and error states checked. Fixed excerpt label layout and wrapping. See AI-VISUAL-ACCEPTANCE.md. Full authenticated portal context and student mobile acceptance remain pending.

Set only backend secrets: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (explicit supported model), ANTHROPIC_DAILY_REQUEST_LIMIT (1–1000; start small), ANTHROPIC_ENABLED=1. Never use EXPO_PUBLIC_ or REACT_APP_ for the key. Confirm the desired model and provider spend cap in Anthropic Console before enabling. The in-memory cap resets on restart and is NOT a cross-instance dollar budget; durable quotas/provider spend limits remain required for production-wide cost protection.

Use synthetic notes for the first explicitly approved paid smoke test. Do not send existing student/company documents implicitly. Deploy backend and mobile changes only after acceptance/owner approval. Disable ANTHROPIC_ENABLED to return to the free/manual workflow. Do not mark all four phases complete after refinement alone.

Official reference: https://platform.claude.com/docs/en/api/messages/create
