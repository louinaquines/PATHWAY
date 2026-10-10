# PATHWAY completion baseline without Anthropic

Updated October 11, 2026 (Asia/Manila). This is a working acceptance checklist, not production sign-off or a percentage estimate.

## Scope and evidence

The owner requested a free implementation without Anthropic. The manuscript remains untouched. Its scope/objectives (paragraphs 460–529) and functional requirements (5891–5926) were inspected alongside backend routes, the analytics screen, and the existing release ledgers. This is not a claim that every manuscript paragraph, diagram, or code path has been reviewed.

Existing workflow evidence is recorded in RELEASE-VERIFICATION-2026-10-11.md and COMPLETION-PLAN-2026-10-09.md. Isolated fixture acceptance, owner-reported device acceptance, local implementation, and deployed acceptance are distinct.

## Ordered implementation backlog

| ID | Feature / current evidence | No-Anthropic implementation | Required acceptance |
| --- | --- | --- | --- |
| DTR | Uploaded files exist; extraction/comparison missing | Direct spreadsheet reading; browser-local image OCR and PDF page rendering; editable Form 48 transcription; authenticated comparison | AM/PM sessions, lunch breaks, missing/invalid dates, uncertain OCR, duplicate copies and conflicting copies tested; original attendance never overwritten |
| ATT | Time-in/out and optional geofence exist; analytics fallback contains fixed 100% attendance/on-time values | Actual record-based trends with configured working days, start time, exceptions and deadline | No inferred absence without expected schedule; timezone/date boundaries, incomplete shifts and approved-hour basis tested |
| RISK | Percentage-based status exists, not completion-velocity assessment | Explainable projection using eligible hours, observation window, schedule and deadline | Insufficient data stays unavailable; completed, overdue, zero-velocity and deadline-edge cases tested; method labeled rule-based, not trained prediction |
| JOURNAL | Submission/review exists; refinement calls Anthropic | Field/week completeness, repetition checks, coordinator-configurable skill keywords and limited sentiment cues; optional local writing checks | Originals preserved; findings show supporting text; no automatic grades/rejections or mental-health inference; mixed-language/short text limitations visible |
| DOC | Human review exists; manuscript document triage not established | File validity, required fields and available text checks, with explicit manual-review status | Unsupported/scanned/illegible files are not called valid; no signature authenticity claim; human approval remains authoritative |
| COMPANY | Manual company directory exists; assisted extraction missing | Public website extraction with source URL and coordinator review before saving | SSRF protection including redirects/DNS, size/time limits, inaccessible sites and inaccurate extraction handled; no private/login-only scraping |
| EMAIL | Evaluation/endorsement outbound transport exists; company reply hub missing | Authorized mailbox integration, conversation storage, incremental inbound synchronization and explicit refresh | Correct company/student/section authorization, reply threading, deduplication, attachments, retries, bounce distinction and mailbox-permission acceptance |
| ANNOUNCE | In-app announcements exist; email channel missing | Optional email delivery with per-recipient status and controlled retry | No automatic resend of uncertain deliveries; approved test inbox receipt; in-app notification still works if email fails |
| OTP | Hashed single-use evaluation links exist; email OTP missing | Expiring hashed codes, bounded attempts/resends and short-lived verified evaluation session | No answers/form disclosure before verification where required; used/expired/revoked tokens and concurrent submission blocked; code delivery failure tested |
| REPORT | Existing exports and analytics UI are partial | Combined attendance, journal, requirements and evaluation summaries with available analysis findings | Totals reconcile with authoritative records; unavailable metrics stay unavailable; section scope and CSV/spreadsheet safety tested |
| BACKUP | Local emulator recovery exists; production data recovery incomplete | Encrypted operator-run export, manifest/checksums, subcollection traversal, supported Auth export and attachment inventory; isolated restore with dry run | Corrupt backup, wrong target, partial failure, secrets handling, retention and isolated recovery tested; document consistency limitations explicit; file inventory is not a file backup |

## DTR reference contract

Read-only reference: C:/Users/Lenovo/Downloads/DTR.xls, Sheet1. Rows 11–12 define Day, AM Arrival/Departure, PM Arrival/Departure, and Undertime Hours/Minutes. Days 1–31 occupy rows 13–43. The copies occupy A:G and I:O. Sheet2 and Sheet3 are empty. The reference month is an example, not the month to assign new uploads. Times are blank, so this does not provide OCR accuracy evidence.

Use the uploaded document's month/year or request confirmation. Blank times are missing, not midnight or absence. Calculate AM and PM duration separately. Do not double-count the two printed copies. If copies disagree, require review. The current digital attendance stores a daily time-in/out span; do not invent midday punches or assume that elapsed time excludes lunch. Show endpoint comparisons separately from duration differences and disclose this schema limitation.

## Existing features: preserve and regression-test

Coordinator-provisioned accounts and mandatory password change; assigned-section access; requirements rejection/resubmission and private preview/download; placement/review gates; weekly journals; two-way messages and unread notifications; evaluation builder and token submission; academic terms/settings/audit; clearance checks. Presence in code is not universal device or production acceptance.

Registration language conflicts inside the draft manuscript: its scope describes student registration/immediate authentication while functional requirements describe coordinator-created accounts. Preserve the current owner-selected provisioning workflow; record the discrepancy without changing the manuscript.

## Release gates, after implementation

- Full scoped Firestore rules/index coverage and isolated regression suite, followed by separately authorized production cutover and denied-outsider checks.
- Deployment of tested local changes; confirm actual deployed revisions rather than assuming HEAD contains the dirty worktree.
- Remove temporary localhost access when local acceptance ends; verify deployed website still works.
- Backup restore evidence, failure-alert delivery and staging rollback rehearsal. Code rollback is not data recovery.
- Dependency assessment, upload/download limits, rate limits, privacy/retention and secret exposure checks.
- Physical Android acceptance on the owner's phone. iOS and other phones remain unverified unless devices become available. Standalone app/signing/store publication is a separate gate if required; Expo Go does not establish it.
- OCR latency/accuracy measured on representative completed scans, including handwriting. The draft's 30-second processing claim and 500-user free-tier capacity are targets to measure, not existing guarantees.

## Definition of done

Each backlog item needs implementation, tests, integration/UI acceptance and recorded limitations. Final acceptance must explicitly distinguish this no-Anthropic baseline from the manuscript's Anthropic/NLP claims. Rules and keyword checks do not satisfy those literal AI claims. Never label them as such.

No billing changes, paid API calls, manuscript edits, production approvals, email sends, rule deployments or production restores are authorized by this planning file. Separate live-operation approval and controlled test targets remain necessary.

## First implementation slice

Build pure Form 48 normalization and comparison helpers with synthetic unit tests. Then add a coordinator review interface and a section-authorized API using existing stored attendance. Add extraction only after the review/comparison contract works. Record slice completion without marking the whole DTR feature complete.

### Slice evidence — October 11, 2026

Implemented `PATHWAY-backend/dtrComparison.js` as a pure review-only helper. Ten synthetic Node tests passed using `node --test PATHWAY-backend/security-tests/dtr-comparison.test.js`. Coverage includes session/lunch separation, spreadsheet time fractions, duplicate/conflicting copies, leap dates, invalid/uncertain transcription, missing shifts, timezone and overnight review, explicit endpoint tolerance and immutable inputs. Endpoint matches remain distinct from session-duration differences; no approved/credited hours are inferred.

This is comparison logic only. No spreadsheet upload reader, OCR extraction, authenticated API, saved review or UI integration is implemented in this slice. No live records, manuscript, rules or deployments changed. Next: add section-authorized comparison API tests and coordinator review UI.

### API and manual review slice

Added POST `/coordinator/students/:studentId/dtr/compare`, requiring coordinator authentication, assigned-student ownership, validated period/transcription and rate limiting. Attendance is read server-side for the chosen month, never supplied by the browser or modified. Missing/outsider student requests are denied before attendance reads. Added a Requirements panel `Compare DTR` button for the selected student, opening a white Form 48 dialog with document month selection, AM/PM input and comparison findings. Editing invalidates displayed results.

Thirteen comparison/API helper tests and one focused UI test passed. API tests use injected database/auth dependencies; they are not live or emulator end-to-end acceptance. Uploaded-file extraction, OCR, saved reviews and deployed/visual browser acceptance remain open. This slice compares manually entered transcription only.

### Spreadsheet import slice

Added browser-local XLS/XLSX import using the official SheetJS 0.20.3 package (installation source: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). The reader recognizes the supplied Form 48 headers, preserves two independent copies, converts Excel time fractions, and requires review confirmation before comparing. It does not evaluate formulas, import cached formula times, upload original workbook bytes, overwrite attendance, or infer the current month when header evidence is absent/conflicting. Multiple DTR sheets and unsupported layouts are rejected. Invalid-day populated rows remain visible rather than silently discarded. File input is limited to 5 MB and template dimensions are bounded; broader hostile-file resource isolation remains a hardening task before general release.

Read-only execution against the actual Downloads/DTR.xls succeeded: Sheet1, October 2023, two copies with 31 days each, no populated times. The supplied workbook was not modified. Ten focused import/dialog tests and thirteen comparison/API tests passed. Web build passed with existing large-chunk warnings. Full regression: 26 suites passed / 79 tests; App.test.js failed during import because the existing PdfPreview/pdfjs-dist ESM dependency cannot be parsed by that Jest test. This is not a full regression pass and was not silently repaired as part of spreadsheet work.

Still open: browser visual acceptance, extraction from saved student attachments, image/PDF OCR, saved review decisions, parser resource isolation and deployment. The import works through Requirements → selected student → Compare DTR → Import Form 48 spreadsheet.

### Scanned-file OCR slice

Added browser-side Tesseract.js 7.0.0 scanning for PNG/JPEG and single-page PDF (PDF.js rasterization). The user chooses one copy or two side-by-side copies. The OCR worker is bundled; engine/language assets require an initial external download. File content is processed locally and only reviewed transcription is posted to the comparison API. Files are limited to 5 MB; images over 20 megapixels are rejected after decoding; processing resolution is capped. Cancellation, a 120-second timeout, and worker/PDF resource cleanup are implemented. This does not prove safety against every hostile compressed image/PDF.

Table transcription uses OCR word coordinates, day anchors and arrival/departure headers. Low-confidence/unparseable cells are flagged. No reliable mapping produces blank editable rows, extracted text and explicit manual-entry guidance, not guessed timestamp alignment. The dialog retains the scan for checking, with review acknowledgement required; uncertain-cell flags remain until corrected. Original attendance and approvals remain unchanged.

Twenty-one focused web DTR tests passed across four suites, including PDF mocks, cancellation during initialization/recognition, timeout, positional mapping, uncertain cells, spreadsheet imports and dialog review. Earlier thirteen backend comparison/API tests remain separate evidence. The actual Tesseract engine processed the supplied low-resolution clipboard template locally in about 1.8 seconds but mapped zero day rows and detected no month. This verifies engine execution/fallback, not accurate time extraction; a readable completed DTR and actual browser worker run remain acceptance gates. No manuscript timing guarantee is claimed.

Next: native-browser scan/import acceptance on clear typed and handwritten examples, authenticated import from saved DTR attachments and persisted coordinator review. OCR is implemented locally but not deployed or accuracy-accepted. Official API reference: https://github.com/naptha/tesseract.js/blob/master/docs/api.md.

### Submitted DTR import

Added Import submitted DTR to the comparison dialog. The coordinator-only source route checks student assignment, returns an opaque file-version fingerprint, and streams the captured submission through existing authenticated document delivery. Replaced versions are rejected with HTTP 409 instead of silently importing another file. No document approval or attendance mutation is performed. Fourteen backend comparison/source tests and three existing dialog tests passed; Jest required a workspace-local cache due temporary-directory permission errors. Live/browser acceptance and saved coordinator review history remain outstanding. Not deployed.

### Saved DTR reviews

Added coordinator notes, Save review, and the latest 20 saved review snapshots. Saving requires an imported submitted-file version and manual review acknowledgement in the UI. The server rechecks assignment, clearance lock and file version, recomputes comparison using transaction-read attendance, stores an immutable review document and writes an audit event atomically. Repeated requests with the same review ID do not create duplicate snapshots. Client-supplied comparison results are ignored. No attendance, credited hours, requirement approval or student notifications are changed. History is explicitly labelled as a snapshot that can become outdated.

Five API tests passed, including stale source, cleared account, outsider, server recomputation and duplicate save checks; four dialog tests passed, including submitted import/save/history. Web build passed with existing bundle-size warnings. Tests use mocked database/browser dependencies, not live Firestore or native-device acceptance. Not deployed; readable completed scan acceptance, full security rollout and production release gates remain open.
