# PATHWAY phased completion roadmap

Updated October 11, 2026. This is the primary execution roadmap. Detailed historical evidence remains in NO-ANTHROPIC-COMPLETION-PLAN.md and the release verification ledgers. The manuscript stays untouched.

## Scope and working agreement

Implement the remaining system features without Anthropic or paid services. Preserve the existing design and coordinator-provisioned account workflow. Local implementations, isolated tests, owner device reports and production acceptance are separate statuses. No percentage or production-readiness claim without evidence.

Work in whole phases: inspect existing implementation, implement its scoped changes, test, fix regressions, update evidence and provide one phase handoff. Continue through safe independent work within the phase without asking the owner to choose every small step. If a required sample, credential, device or live-operation approval is missing, record that acceptance gate and continue unaffected work; never mark the phase complete with required gates open.

Local code and isolated testing are in scope. Production deployments, rule cutovers, real approvals, external email sends, paid upgrades and production restores need explicit authorization for the target operation. Prior test permissions are not blanket authorization. Never resend uncertain deliveries. Do not alter the manuscript or unrelated changes.

## Phase overview

| Phase | Outcome | Current status | Depends on |
| --- | --- | --- | --- |
| 1 | Reliable DTR import, comparison and saved review | Implemented locally; acceptance/hardening open | Existing DTR sample and completed scans |
| 2 | Real attendance analytics and explainable completion risk | Pending implementation verification | Authoritative hours and schedule contract |
| 3 | Journal analysis and document triage | Pending | Phase 1 extraction utilities; no AI service |
| 4 | Assisted company profiles | Pending | Public-site security controls |
| 5 | Company email conversations and email announcements | Pending; existing outbound transport reusable | Authorized mailbox and test recipient |
| 6 | Supervisor email OTP | Pending; single-use links exist | Existing evaluation and mail transport |
| 7 | Integrated reports and end-to-end workflow acceptance | Existing workflow features; consolidated acceptance open | Phases 1–6 |
| 8 | Free operator backup and isolated recovery | Production recovery incomplete | Secure operator access and isolated target |
| 9 | Security, deployment and release acceptance | Partial evidence; not signed off | All required feature and recovery gates |

## Phase 1 — DTR closeout

Deliverables:

- Keep Form 48 spreadsheet/image/single-page PDF import, editable transcription, source preview, protected submitted-file import, server comparison and saved review history.
- Harden parser limits, cancellation and error recovery; examine file/version binding, review idempotency, authorization and immutable history.
- Verify actual browser OCR worker and protected attachment/save/history integration, not only mocks.
- Test readable completed typed and handwritten DTRs; measure extraction quality and processing duration, including two copies, conflicts, uncertain cells and month errors.
- Maintain the distinction between digital elapsed span, AM/PM session totals and authoritative credited hours. No inferred absence or automatic approval.

Exit gate: focused and integration tests pass; original records remain unchanged; completed-scan acceptance and limitations recorded. The supplied blank XLS and tiny image do not establish OCR accuracy. Obtain a completed sample if none exists. Current local code is not deployed.

## Phase 2 — Attendance and completion risk

Deliverables:

- Reconcile Home, Logs, Logbook, Progress and exports with an explicit authoritative hour basis; avoid summing attendance and journal hours together.
- Replace fixed attendance/on-time fallback metrics with actual eligible records.
- Add configured working days, start time, allowed exceptions and completion deadline; absence/lateness calculations require these inputs.
- Show explainable progress velocity, projected completion and risk reasons, with insufficient-data states and method labels.

Exit gate: timezone, boundary dates, incomplete/duplicate shifts, cleared records, zero velocity, overdue/completed students and absent schedule tests pass. UI and exports reconcile. Prediction is rule-based, not a trained AI guarantee.

## Phase 3 — Journals and document triage

### Phase 2 implementation evidence — initial model

Removed the coordinator analytics Firestore fallback's fabricated 100% attendance/on-time values and percentage-only risk labels. Missing analytics now display Unavailable instead of zero/100%. Added a pure schedule-rule analytics model using explicit working days, start time, exceptions, reporting date, deadline and credited-hour history. It excludes the current partial day, uses Philippine-time punches, refuses ambiguous records, and never derives credited hours from raw shift duration or journals. This helper is not yet connected to production records or schedule configuration. Cross-screen hour reconciliation, API integration, schedule UI and full Phase 2 acceptance remain open. No deployment or live data changes.

### Phase 2 integration evidence

Added assignment/department-protected section analytics and transaction-protected schedule settings with audit logging, bounded reads, rate limiting and no-store responses. Coordinator analytics now exclusively uses that endpoint; API failure does not substitute fictional fallback data. Added section-wide work days, dates, start time and non-working exceptions UI, projection/reason display, and CSV formula-injection protection. The authoritative profile hoursRendered counter is credited by backend time-out alongside attendance hoursToday; projections use those completed daily records, never journal totals. This is the existing elapsed-span credit policy, not a claim that lunch is deducted or hours are approved by a supervisor.

Calculation/validation/denied-outsider tests passed (eight before adding the total-reconciliation route test). Production web build passed with existing chunk warnings. Full device and browser acceptance, mobile fallback reconciliation and deployed integration remain open; Phase 2 is not signed off. No live schedule, attendance, manuscript or deployment changes were made.

### Phase 2 local implementation closeout

Home, Attendance/Logs and Progress now share the studentHours helper for finite numeric attendance-credit totals and the same 486-hour legacy fallback; this fixes Progress's inconsistent 540-hour fallback. Logbook's separate aggregate is already labelled Reported journal hours, not credited completion hours. Home's verified-record percentage is labelled Verified records to avoid confusing it with schedule attendance rate. No stored hours were recalculated or modified.

Added stale-section response protection, schedule input bounds, and analytics UI tests for scoped schedule saving, unavailable metrics and backend failure without fabricated fallback. Twenty-six backend/helper tests passed (including nine analytics route/calculation tests and the mobile hours helper). Two analytics UI tests passed. Three changed mobile screens parsed using babel-preset-expo. Web build passed with existing large-chunk warnings. The required Expo SDK 54 reference was read before mobile edits.

Phase 2 local implementation is ready for acceptance, not fully signed off: actual browser/API/Firestore integration, deployed revision verification and owner-phone checks are outstanding. Focused mocked tests and syntax checks do not prove device behavior. No production deployment, schedule mutation, manuscript edit or billing change occurred.

Deliverables:

- Journal field/week completeness, repeated-content checks, configurable competency keywords and limited sentiment cues with supporting text.
- Replace or explicitly disable remaining Anthropic-dependent writing/refinement paths; preserve original entries.
- Check document format, expected fields and extractable text; unreadable/scanned/unsupported items require human review.
- Add review UI and findings without automatic grades, rejection, approval or signature-authenticity claims.

Exit gate: mixed-language, short/empty/repeated journals and malformed/illegible documents tested; manual-review limitations visible. No external paid API required.

## Phase 4 — Assisted company profiles

### Phase 3 initial implementation evidence

Added original-text-first journal field/week/hour checks, exact normalized repetition detection, competency keyword evidence and limited English text cues. The assigned-student-only API caps review at the latest 100 entries, with a truncation flag. Coordinator journal cards display findings and limitations; no originals, grades, approval status or hours are mutated. Existing section journalKeywords configuration can supply custom dictionaries, but a coordinator configuration editor remains outstanding.

The paid Anthropic rewrite call is removed from /refine-logbook; that endpoint explicitly returns unavailable with original-note submission guidance, even if an API key exists. The legacy student optional-rewrite UI remains to be removed/replaced. Document triage currently returns metadata warnings and manual_review only; contents, required fields and authenticity are not checked. Document review UI/extraction and full Phase 3 acceptance remain open. No production changes or manuscript edits.

### Phase 3 UI and extraction implementation

Replaced the student paid-rewrite button with a local Check notes checklist, preserving original notes and existing historical revised text. Added a compact, expandable white-card keyword editor in coordinator journal review with blue action, scoped transaction/audit API, category/keyword bounds and explicit save errors/confirmation. Keyword findings remain evidence cues, not grades or validated competencies.

Document preview now includes a manual-review panel. Supported PDFs receive local PDF.js text extraction limited to 5 MB, 20 pages and 100,000 extracted characters; sparse text warns about scans. Images and unsupported Word formats explicitly require manual inspection. No extracted text is sent to a paid service and no signature or field-completeness validation is claimed. The pure required-term checker is tested but per-requirement required-field configuration is not yet wired into the preview.

Five review-analysis backend tests and seven focused web tests passed, including keyword editor syntax/save and document-preview regression. LogbookScreen parsed with babel-preset-expo. Web build passed with existing chunk warnings. Browser visual acceptance, physical phone checks, required-field configuration and deployed integration remain open; Phase 3 is not fully signed off. No live records, deployment or manuscript edits.

### Phase 3 local feature closeout

Added per-section/per-requirement expected-text configuration to protected document preview. Configuration reads require assigned-section access; audited transactional writes recheck ownership and department, validate bounded terms and never mutate document status. Extracted PDF text remains in browser memory; missing expected labels are warnings, and present labels are explicitly not proof of filled fields or signatures. Preview is available while text checks run. Added journal gap warnings only between known submitted week numbers, with no invented reporting deadline or assumed initial week.

Six focused backend analysis/settings tests and eight web tests passed, covering transaction ownership checks, invalid terms, required-text UI/save, keyword editor and preview regression. Earlier mobile syntax verification remains separate. Local Phase 3 features are implemented; actual browser visual acceptance, phone and deployed integration remain open release gates. Supported text-PDF checking and explicit manual review for scans/Word are the declared scope; this is not AI, signature validation or automatic approval. No live records or manuscript changes.

Deliverables:

- Extract suggested company name, contact details and description from public websites, with source attribution.
- Require coordinator preview/edit/confirmation before saving.
- Enforce public-network-only fetching, DNS and redirect validation, timeout and response-size limits; reject private/internal addresses and login-only sources.

Exit gate: SSRF/redirect/DNS abuse cases and inaccessible/inaccurate pages tested. No background unapproved scraping or fabricated company details.

## Phase 5 — Email conversations and announcements

### Company sender implementation — October 11, 2026

Render sender rollout: human approved transferring the separate company sender credentials to PATHWAY-backend. Saved six COMPANY_SEND settings only (owner UID, mailbox, client ID/secret, refresh token, enabled); existing inbox and personal GMAIL settings unchanged. Scoped backend commit db6e4aa75683d16c0b6bc69caafc4c8af1d0fc35 excludes unrelated local changes. Render deployment dep-db5b59bbc2fs73euusp0 succeeded/live (44.9s). No additional email sent. Conversation-level sending remains blocked until server-owned recipient/RFC reply metadata and sendEnabled approval exist. Hosted reply UI and authenticated live endpoint send acceptance remain pending.

Reply composer added locally: white layout, server-approved recipient, text-only send, delivery status and uncertain-attempt lock. Five component tests and nineteen backend tests pass. Inbox detail exposes reply capability only for approved server mappings and configured sender. Render still runs f3db0d8; no sender credentials uploaded and no new deployed reply/UI acceptance claimed. Operator confirmation requested before transferring the separate sender credentials to Render.

Live sender acceptance: after a local RFC Message-ID validation failure (Gmail IDs can contain `=`), fixed the validator and added regression coverage. Human explicitly authorized one reconciled retry. Gmail accepted the exact text “PATHWAY TEST ONLY — threaded reply check” to louinaquines@gmail.com; read-only read-back confirmed the sent message in the original test thread. Original and retry receipts are separate ignored local files. This verifies the local sender/provider integration, not inbox receipt or the deployed coordinator endpoint. Render sender configuration, UI and production endpoint acceptance remain pending.

Separate company send authorization completed and a live token refresh verified send plus basic identity scopes only. Existing inbox/personal sender credentials were not overwritten. Added dedicated threaded MIME sender and section-scoped reply endpoint with server-owned recipients, assignment checks, transaction reservation, request-content conflict checks, and uncertain-delivery blocking. Eleven local tests passed. Server/Docker wiring added; sending remains disabled without explicit COMPANY_SEND configuration and conversation send approval. No live email sent. Render deployment/configuration, UI composer, provider-thread metadata preparation, reviewed attachments, announcement outcomes and hosted acceptance are still pending. Phase 5 is not complete.

### Live inbound milestone — October 11, 2026

Backend commit f3db0d8 is deployed on Render. With explicit user approval, separate read-only OAuth configuration for pathwaysystem4@gmail.com and coordinator UID 6hNIQRfTVzXDPPHetPTEqZFelCm2 was saved in Render; existing send-only credentials were not changed. Environment deployment dep-db5aqmp42hec738aaveg succeeded. The authenticated local coordinator UI at localhost:8082, pointed at the deployed backend for this session only, linked the exact authorized test email to Dexter in BSIT 4G. Server checks verified loui@test.com, role, section ownership, department and student assignment before transaction creation. The persisted reply displayed its sender, timestamp, subject and full plain text. Test mappings expose only testMessageId, not unrelated messages grouped into the provider thread. No email was sent and no student approval state was changed.

Added local exact-test-link UI with section-change stale-response protection. Three focused UI tests pass; the deployed backend has fifteen focused inbox/link/configuration tests passing. Local UI changes are not yet deployed to Firebase Hosting. Evidence: company-inbox-live-linked-qa.png.

Phase 5 remains incomplete. The selected mailbox currently has read-only authorization; the existing send-only identity is a different mailbox. Sending threaded replies as pathwaysystem4@gmail.com requires a separate explicit send authorization, not reuse or expansion of the read-only token. General conversation creation, outbound threading/idempotency, reviewed attachment delivery, announcement recipient outcomes/retry acceptance and live hosted UI verification remain open. Do not treat the inbound milestone as full Phase 5 completion.

### Phase 5 progress — October 11, 2026

Added an independent, disabled-by-default read-only Gmail adapter. It requires explicit COMPANY_INBOX_ENABLED, owner UID, mailbox and separate OAuth client/refresh configuration; it never reuses send-only credentials. Tokens must have only gmail.readonly and the provider mailbox identity must match configuration. Requests and decoded text/JSON/MIME structures are bounded. Replies deduplicate by provider ID; HTML is not rendered and attachments are blocked rather than silently opened. Outbound provider acceptance is not labeled delivered.

Added coordinator section-scoped list/refresh endpoints with server-owned thread mappings, assignment/student checks and private no-store responses; browser callers cannot choose arbitrary provider thread IDs. Company Placements now contains a white company-email panel with sender/time, plain text, disconnected state and explicit refresh. No local credentials were inspected, OAuth permissions changed, email sent, or live mailbox read.

Phase 5 is not complete: owner mailbox consent/configuration, server-owned conversation creation/outbound reply association, safe reviewed attachment delivery, optional announcement recipient outcome/retry integration, and authorized real inbox/reply acceptance remain open. Current blocking choice is which mailbox owner authorizes read-only access. Google classifies gmail.readonly as restricted; production verification/security-assessment applicability must be resolved rather than promising fully free production email.

Verification: 22 backend inbox/send-only/preflight tests and six web conversation/placement tests passed. These are isolated/mocked tests, not real mailbox acceptance. No deployment was performed.

Mailbox selection/consent: user selected pathwaysystem4@gmail.com and authorized read-only connection. Separate operator bootstrap `security-tests/authorize-company-inbox.js` now requests only gmail.readonly with PKCE/state, checks mailbox identity, refuses existing-file overwrite and saves an ignored local token only after Google consent. Ten authorization/inbox tests passed. Google consent completion and production ownership configuration remain pending; launching the local consent page is not proof that the mailbox is connected. Existing send-only token is unchanged.

Subsequent acceptance: user completed Google consent; local token metadata verifies pathwaysystem4@gmail.com and gmail.readonly. The user-sent message with exact subject `PATHWAY TEST - company reply` and expected text was found. `company-inbox-linked-qa.js` then exercised the real list/detail handlers and live read-only Gmail adapter with an isolated in-memory coordinator/section/student mapping: reply loaded, list passed, outsider denied. No Firebase writes or mailbox changes occurred. This does not link the actual loui@test.com account or prove browser integration. Actual account ownership, selected student/section mapping, browser acceptance and remaining outbound/announcement features are still open.

Account-context check: browser profile confirms the existing signed-in coordinator is loui@test.com, College of Computer Studies. Requirements workspace shows BSIT 4G and Dexter Tampus. User chose this section and allowed either test student; Dexter selected. Direct Admin SDK read could not complete from this workstation. No company-conversation mapping was written and no production inbox enabled. Actual linking remains pending supported backend access and mapping creation; do not describe the isolated fixture as a live account link.

Linking diagnosis: after explicitly setting pathway-57400 for a read-only lookup, Firebase reports app/invalid-credential because application-default credentials cannot be loaded. Added fixed-target `security-tests/link-company-test-reply.js` (dry-run default, explicit --apply required): verifies coordinator/department/BSIT4G/Dexter assignment, locates only the authorized test email, uses deterministic conversation ID and transaction rechecks, refuses conflicting overwrite and never updates the student. Twelve focused linking/inbox/local-configuration tests passed. Actual execution remains blocked by Firebase authorization; no mapping or deployment changed.

### Phase 4 implementation evidence

Added a coordinator-only, rate-limited public HTTPS preview endpoint and white/blue Company Directory import card. Preview suggests title/name, description, explicit mailto and tel contacts with source URL and warnings. Use suggestions only fills editable name/email/phone fields; normal existing Save is still required. Address, industry, capacity, geofence and active status are not inferred. Description is displayed as source context, not silently added to an unsupported company field.

Fetch restrictions: public DNS-resolved IPv4 only, reject mixed/private/reserved/IPv6 answers, pin HTTPS lookup to a checked address while retaining hostname TLS validation, validate each redirect, maximum three redirects, 10-second overall deadline and 1 MB HTML response, no credentials/custom ports, no compression or non-HTML responses. No browser script execution, login credentials or private scraping. IPv6-only and some legitimate sites intentionally fail closed; manual entry remains available.

Four focused parser/network-policy tests and eight production-preflight tests passed. DNS-private/mixed failures were tested before network access; actual redirect/body-limit and browser end-to-end acceptance remain open. This is local implementation, not production sign-off or universal scraping support. No company records or deployments were changed.

Deliverables:

- Connect an explicitly authorized mailbox using least-required permissions; never infer access from local credentials.
- Company conversation UI with section/student scoping, threading, inbound synchronization, deduplication, safe attachments and refresh state.
- Optional announcement email delivery with per-recipient outcome, bounce/accepted/uncertain distinction and controlled retries.
- Preserve in-app announcements when mail fails; do not send to dex@gmail.com, which previously bounced.

Exit gate: isolated transport tests plus explicitly authorized real inbox/reply/attachment acceptance. Mailbox consent and actual test recipients are external gates; quota suitability must be verified before deployment. No guaranteed free unlimited email.

## Phase 6 — Supervisor OTP

Deliverables:

- Expiring hashed codes, bounded attempts/resends, rate limiting and short-lived verified evaluation sessions.
- Gate protected evaluation access on verification; retain hashed single-use links and immutable question snapshots.
- Handle expiry, revocation, used tokens, concurrent submission and mail failure without disclosing codes or answers.

Exit gate: negative/concurrency tests pass and an authorized test inbox completes OTP and evaluation submission. Approval flow remains coordinator-owned.

## Phase 7 — Reports and workflow acceptance

Deliverables:

- Combine attendance, journal, document and evaluation findings in scoped reports; unavailable metrics stay unavailable.
- Reconcile report totals and protect CSV/spreadsheet output from formula injection.
- Exercise account provisioning → documents/rejection/resubmission → placement → endorsement draft/preview/signed test upload/email → final review → approved dashboard → attendance/journals/evaluation → clearance.
- Regression-test messages, unread badges, announcement overlay, keyboard, auto-scroll and current skeleton/UI consistency.
- Keep fictional test signatures clearly labelled TEST ONLY, never issued institutional documents.

Exit gate: isolated end-to-end evidence plus available owner Android acceptance; no real student approval or test cleanup without scoped authority. Other devices and iOS remain unverified unless available.

## Phase 8 — Backup and recovery without billing changes

October 12 closeout: the free isolated/scoped recovery workflow is verified; see PATHWAY-backend/PHASE8-ACCEPTANCE.md for the authoritative current acceptance matrix and operator runbook. Fourteen focused tests passed. The latest eleven-file downloaded archive passed dedicated emulator Auth/sign-in, profile typed readback and transactional/legacy link recovery checks. Dexter's original Auth hash was imported into the separate Spark recovery project without overwrite/reset; the operator's private sign-in reported original-password success and wrong-password denial. Full production backup/recovery remains acceptance-open for complete coverage, consistency, supported live adapters, independent recovery points, measured objectives and operational alerting. Historical checkpoints below remain for provenance and are not current completion claims.

Legacy-link checkpoint — October 11: isolated student requirement recovery now handles old public upload links with absent asset/delivery fields, binds URLs exactly to HTTPS provider/cloud/resource/version/public ID, and preserves upload delivery mode. Real-emulator tests passed invalid-host/protocol/query/version URL denial, no-write dry run, concurrent one-winner/replay, stale-source denial and full-profile review/approval preservation. Nine backup/acquisition regression tests passed and emulators stopped successfully. No live provider, production link or manuscript change occurred. Actual legacy provider and recovered-ID API-prefix compatibility remain unverified; off-device storage/key custody needs an operator-selected target.

Actual-schema recovery checkpoint — October 11: restoreStudentRequirement now exercises users/TEST-ONLY-* nested requirements in the dedicated demo emulator. The real-emulator run passed full-profile comparison with exactly three provider identity fields changed, preserving rejected status/reason, submission timestamp, filename/size, placement binding, unrelated documents, account/deployment approval and clearance. Concurrent retries produced one atomic link/receipt commit and one replay; stale-source, missing-requirement and conflicting-ID requests were denied. Encrypted snapshot/attachment and account/relationship checks also passed. No live database/provider change occurred. Authenticated-document recovery only is covered; legacy public links, production export coverage, operator access, off-device durability/key custody and production recovery objectives remain open.

Transactional link rehearsal checkpoint — October 11: attachmentLinkRestore.js is restricted to the dedicated demo emulator and TEST-ONLY records. The real Firestore emulator passed concurrent identical retries (one commit and one replay), atomic attachment/receipt commit, no-write dry run, unchanged unrelated fields, and stale/conflicting/corrupt/wrong-project denial. `emulator-restore-qa.js --encrypted --attachments --links` also repeated eight-file encrypted recovery and five-account/student/company/attendance checks; emulators exited successfully. Production links, provider assets and student approval fields were not changed. The synthetic attachment-map schema is not production requirement-schema integration. Phase 8 remains open for production export coverage, authorized production adapters, off-device durability/key custody and recovery objectives.

Restored-byte provider re-upload checkpoint — October 11: after separate user approval, the recorded TEST ONLY PDF was acquired, encrypted/restored, uploaded as exactly one second unique authenticated QA asset with overwrite=false, and independently downloaded. All 2,145 bytes matched; original asset ID/version remained unchanged. Reconciliation dry run passed with zero database writes and zero student-link changes. Both QA assets were retained, with separate protected receipts preventing uncertain-send upload retries. Production source export coverage, transactional link reconciliation, off-device durability, operator key custody and production recovery objectives remain open; this is not a full Phase 8 sign-off.

Live provider acquisition checkpoint — October 11: after user authorization, cloudinary-recovery-qa.js created exactly one new authenticated TEST ONLY raw PDF in a unique pathway/test-only-recovery namespace with overwrite=false. Fixed-provider metadata/readback confirmed original asset/version and all 2,145 file bytes. Encryption, isolated restoration and PDF byte comparison passed. No student links or database records changed. A protected ignored receipt blocks duplicate upload following uncertain results; the test asset remains for review and was not deleted. This establishes live QA provider acquisition only, not student-reference coverage, restored-byte re-upload, transactional link replacement, off-device durability or production backup readiness. Those gates remain open.

Scoped acquisition checkpoint: added attachmentRecovery.js with explicit record/asset selections, source/provider version checks before and after byte acquisition, bounded adapter contract, staged partial-failure reporting, and dry-run reconciliation bound to original asset ID/version plus restored checksum. Nine combined backup/acquisition tests passed using real loopback HTTP and the existing TEST ONLY PDF. The encrypted round trip preserved identical bytes; negative tests reject authorization failures, metadata mismatch, changed source/version/asset, truncation and partial acquisition. Production download adapters, provider re-upload/readback and transactional link replacement are not implemented or accepted. No Cloudinary files, production records, credentials, paid services or manuscript were changed.

Attachment-byte follow-up: operatorBackup.js accepts an explicit list of local files with original document/version identifiers, stores bytes and a checksum-bound encrypted recovery manifest, and refuses missing files, duplicate versions, unsafe paths and invalid mappings. Six focused tests passed. `emulator-restore-qa.js --encrypted --attachments` restored eight archive files including the existing TEST ONLY endorsement PDF byte-for-byte, verified its synthetic document/version mapping, and successfully imported the snapshot into isolated emulators (five Auth accounts, student/company relationship and one attendance record). No remote files were fetched, provider uploads/production links changed, paid services enabled, or manuscript edited. OPERATOR-RECOVERY.md documents usage and boundaries. This does not prove coverage of real attachment references, browser preview usability, provider acquisition/re-upload, production recovery or off-device durability. Those Phase 8 gates remain open.

October 11 isolated checkpoint: added operatorBackup.js for AES-256-GCM encrypted emulator exports, authenticated manifest/checksums, bounded input, unsafe-path rejection, no-overwrite destinations, no-write dry runs, explicit demo-only target validation and partial-write reporting. Four automated tests passed for round trip, wrong secret/corruption, wrong target/overwrite/incomplete export, and partial failure. `node security-tests/emulator-restore-qa.js --encrypted` successfully packaged/restored six real synthetic export files, imported them on dedicated demo emulator ports, and verified five Auth IDs, the approved profile/company relationship, and one attendance subcollection record. Emulators stopped successfully; production and the phone demo were not changed. OPERATOR-RECOVERY.md documents key handling, retention, recovery steps and limits. This is isolated recovery evidence, not a full Phase 8 sign-off: actual attachment bytes, production export/Auth hash support, off-device protection and production recovery objectives remain open. Phase 7 reports/workflow acceptance is a separate earlier gate.

Deliverables:

- Encrypted operator-run exports with manifest, checksums, subcollections, supported Auth export and actual attachment recovery strategy.
- Dry-run restore, target validation, partial-failure reporting, retention and protected key handling.
- Restore synthetic data/files into an isolated target and verify relationships, counts and attachment usability.
- Document operator responsibilities, consistency limitations, recovery steps and achievable recovery objectives.

Exit gate: corrupt/wrong-target/partial restore and isolated recovery tests pass. Attachment inventory alone is not a backup. Free operator tools do not provide managed PITR, high availability or proven production recovery; required provider/access/capacity limitations remain explicit.

## Phase 9 — Production release gates

October 12 optional Anthropic feature extension: owner selected phased integration for journal refinement, coordinator journal analysis, attendance-risk explanations and DTR/document assistance. Local foundation/student refinement added with affirmative sharing consent, optional discardable suggestions, original preservation, backend-only configuration, emulator isolation, bounded requests and no automatic retries. Sixteen focused tests and all 39 isolated security tests passed; Android bundle export passed. No paid calls, key activation or deployment occurred. Remaining AI phases and live/UI acceptance are tracked in PATHWAY-backend/ANTHROPIC-PLAN.md; this does not close Phase 9 or establish AI as the only remaining feature.

October 12 initial checkpoint: 35 web suites / 112 tests, 12 configuration/email tests, production Vite build, and all 36 isolated security tests passed. Updated the older evaluation integration test to exercise the OTP gate via local SMTP and reject unverified submission; production runtime protections were unchanged. PDF ESM failure did not reproduce. Bundle-size warnings remain. See PATHWAY-backend/PHASE9-READINESS.md for remaining release gates. No deployment, production setting change or manuscript edit occurred; Phase 9 is in progress, not complete.

Deliverables:

- Full Firestore rules/index coverage and outsider-denial tests, including new review collections; dependency, uploads, API limits, retention and secret-exposure review.
- Resolve known test-suite failures, including the existing PdfPreview/Jest ESM import failure, and run full regression suites.
- Prepare versioned deployment and rollback evidence; deploy only with explicit authorization, then verify actual deployed revisions.
- Remove temporary localhost origins after local acceptance; recheck production login and protected downloads.
- Verify failure-alert delivery, health monitoring, isolated rollback rehearsal and recovery readiness.
- Record Android acceptance, unverified platforms, free-tier capacity limits and whether a standalone signed Android app is required beyond Expo Go.

Exit gate: required tests, deployment checks, operational recovery evidence and owner acceptance recorded. If free-tier constraints leave production backup/recovery incomplete, classify the system as test/pilot-ready only—not 100% production-ready.

## Status reporting for every phase

### Phase 6 initial local implementation — October 11, 2026

Added hashed ten-minute supervisor OTPs, transactional five-attempt/five-send limits, a one-minute resend cooldown, IP rate limits, single-use code consumption and hashed thirty-minute verification sessions held only in browser memory. Form reads and transaction-protected submissions now require a valid session; used/revoked/expired evaluations fail closed. The OTP recipient comes only from the stored evaluation. The browser has an email-verification gate; no evaluation details are returned before verification. Three initial session/expiry denial tests pass and backend syntax checks pass. These changes are local, not deployed. Phase 6 is not complete: route-level/concurrency/mail-failure tests, complete UI regression and visual refinement, and an explicitly authorized synthetic live OTP/evaluation submission still require acceptance. No live email or approval was changed during this implementation.

### Phase 5 live announcement follow-up — October 11, 2026

User confirmed the received test PDF opens. User explicitly authorized temporarily setting only Dexter's Firestore profile email to louinaquines@gmail.com, sending one TEST ONLY announcement email, and restoring dex@gmail.com without changing Authentication or approval status. The hosted UI saved announcement FuEgEcwmF8FC9xZXicx0 at 06:35:42 Manila for the two fictional BSIT 4G student in-app notices; only Dexter was selected for email. A tool-review usage interruption prevented immediate status readback and cleanup. On continuation, the existing Firebase CLI connection restored dex@gmail.com and verified all unrelated fields unchanged across restoration; Authentication was untouched. Read-only Firestore verification found Dexter provider_accepted with attempt=1 and Janeil pending (not emailed). No resend occurred. Recipient inbox receipt of this announcement still needs user confirmation. This evidence does not establish automatic bounce detection or unrestricted production OAuth readiness.

### Phase 5 attachment and announcement implementation — local, October 11, 2026

Live attachment follow-up: after user approval, backend commit b182869f939a5e96dceffb96a7f40faed1a981cb was pushed and Render deployment dep-db5blhajnfac739ts160 reported succeeded/live. Firebase Hosting released the tested current working-tree web build. The hosted coordinator composer previewed the existing one-page test-only-endorsement.pdf, required explicit review, and sent exactly one reply to louinaquines@gmail.com at 06:26:46 Manila. Gmail accepted it; thread refresh showed the exact test body and attachment filename. Screenshot: company-pdf-reply-accepted.png. This establishes hosted preview/send/readback, not recipient inbox delivery or successful opening of the received attachment. No additional OAuth permissions or account approval changes occurred. Phase 5 UI source changes remain local/uncommitted; the hosted artifact includes the existing working-tree build dependencies.

Remaining gates: recipient confirmation that the attached PDF opens, plus an assigned student with a real explicitly authorized email address for the optional announcement-email integration test. No announcement was broadcast or emailed during this follow-up; dex@gmail.com remains blocked. Full Phase 5 completion is not yet established.

Added optional company-reply PDF attachments with a local preview and explicit human-review checkbox. Attachments are bounded to 512 KB, validated again by the backend, and sent as bytes rather than filesystem paths or remote URLs. Send is disabled while reading or awaiting review. Format checks are not antivirus scanning or signature verification; incoming attachments remain blocked.

Added independent optional announcement email delivery with a saved recipient snapshot, server-side assignment/email rechecks, per-recipient status, blocked known-bounced/invalid addresses, transactional send reservations, and explicit retries only for failures known to precede transport. Provider acceptance is not labeled delivery. Sending/unknown outcomes cannot be resent automatically. In-app announcements are preserved regardless of email outcome.

Verification: 40 focused backend tests pass; 35 web suites / 109 tests pass; production Vite build succeeds with existing large-bundle warnings. Transport tests are isolated fixtures, not evidence of live recipient delivery or actual Firestore concurrency. These additions have not been deployed. Manuscript, account approvals, mailbox credentials and live email state were not changed.

Phase 5 remains acceptance-open: inspect the new UI in-browser, deploy the scoped changes, send one explicitly approved TEST ONLY PDF reply to an approved real recipient, and test optional announcement email using an assigned student with a real authorized test address. Dexter's dex@gmail.com is known to bounce and must not be used for that test. Obtain exact recipient/content/file authorization before either live send; do not count mocked acceptance as completion.

### Phase 4 local acceptance — October 11, 2026

Company website preview implementation is locally verified. Nine backend tests pass, including public-address pinning, DNS revalidation after redirects, restricted redirect denial, redirect limits, DNS/request deadlines, oversized pages, compressed content and non-HTML denial. Three component tests pass for explicit preview/application/reviewed save, manual-entry fallback and read-only restrictions.

A read-only real fetch of https://www.microsoft.com succeeded through its redirect to /en-ph, returned title/description and correctly left undiscovered contact fields blank. Browser acceptance used the actual CompanyDirectoryTab with an explicitly isolated in-memory API fixture: preview → apply → edit company name/address → save → directory record and success notice passed. Browser layout was visually inspected. This fixture is not evidence of deployed authentication, database or production API integration.

Reproduce isolated browser QA from PATHWAY-web using `npx vite --config qa/company-profile.config.mjs`, then open http://127.0.0.1:3094/qa/company-profile.html. The fixture does not contact production or persist records. Jest uses a workspace cache to avoid the sandbox temporary-directory rename restriction.

Phase 4 local feature/testing work is complete; production deployment and authenticated deployed integration remain Phase 9 release gates. No live company records, manuscript or deployment were changed. Import remains human-reviewed, HTTPS-only, bounded and IPv4-only; unsupported websites require manual entry. It does not infer addresses, industry, capacity or attendance coordinates.

Record implemented deliverables, tests/commands and outcomes, integration/device evidence, local-versus-deployed status, limitations, blocked acceptance gates and the next phase. Do not overwrite historical results or promote a mocked test to live acceptance.

Immediate execution: finish Phase 1 hardening/integration checks. If readable completed scans are unavailable, leave its OCR acceptance gate open and proceed with independent Phase 2 implementation while requesting the sample once.

### Phase 6 supervisor OTP checkpoint — October 11, 2026

Live acceptance completed for the authorized TEST ONLY fixture TEST-ONLY-PHASE6-0d034a07bde71b7b: the user-supplied email code verified successfully on the hosted page, all five synthetic ratings and explicitly TEST ONLY comments were submitted, and Firestore readback confirmed verified session, submittedAt and used=true. Reopening the link denied access; direct POST replay returned HTTP 410 and evaluation updateTime remained unchanged. Full student-profile comparison confirmed no profile or approval changes. Evidence: tmp/phase6-submitted.png and tmp/phase6-used-link-denied.png. Phase 6 implementation and this single-recipient live acceptance are complete; this does not establish production-wide email deliverability, independent concurrency load testing, or completion of the other roadmap phases.

Live rollout follow-up: backend commit 78a2ccc deployed successfully through Render deployment dep-db5mmdnavr4c739bedfg. Hosting released the OTP screen and public-route startup fix (21a6b88). The public evaluation no longer waits for staff Firebase authentication; protected routes still require role verification and fail closed on profile lookup failure. Six focused web tests passed and the production rebuild succeeded. One new TEST ONLY evaluation was created for Dexter with the authorized fictional supervisor address louinaquines@gmail.com; no student profile or approval fields were changed. The hosted page confirmed one verification-code send and kept the form private. Human code entry, test submission and replay denial remain pending; Phase 6 is not complete. Evidence: tmp/phase6-render-live.png and tmp/phase6-code-sent.png.

Local implementation protects evaluation reads and transactional submission with a verified, expiring session. Codes are hashed, expire after ten minutes, allow five incorrect attempts, and are sent only to the server-stored supervisor address. Requests have a one-minute cooldown and five-send lifetime cap. Mail failure invalidates the reserved code; verification consumes it once. Used, revoked and expired links fail closed. Sessions remain in browser memory. Expired submission verification returns to the verification screen while preserving answers.

Validation: six backend OTP tests passed (serialized in-memory transaction fixture, not a live Firestore concurrency test); 35 web suites / 110 tests passed before the recovery test, followed by four supervisor-page tests including recovery. Production Vite build succeeded with existing bundle-size warnings. No Phase 6 deployment, live OTP email, test evaluation submission, student approval change, or manuscript edit occurred. Phase 6 remains acceptance-open until deployment, live mailbox verification, and single-use submission/replay checks succeed. Render connection is required for agent-managed deployment; the suggested integration is not connected yet.

### Phase 5 reply UI release checkpoint — October 11, 2026

### Phase 5 general conversation hardening — local, October 11, 2026

Live rollout follow-up: user approved approved-placement-contact searches in pathwaysystem4@gmail.com (90-day window) and exactly one hosted reply to louinaquines@gmail.com containing `PATHWAY TEST ONLY — hosted reply verification`. Backend commit a37beca deployed successfully through Render deployment dep-db5ber59fdbs73c9alqg (45.5s); only COMPANY_INBOX_PLACEMENT_DISCOVERY_ENABLED=1 was added. Firebase Hosting release completed. General discovery ran for Dexter's approved test placement and returned zero matches without sending; no matching real company-contact positive acceptance is claimed. The fixed test conversation now shows both inbound and outbound messages by RFC reply ancestry. One click of hosted Send reply was accepted by Gmail and read back in the same thread at 06:10:33 Manila. Personal inbox delivery is not independently confirmed. Evidence: company-hosted-reply-verification.png and company-conversations-rollout-render.png. Focused backend tests: 31/31 pass. No duplicate test send, approval-state change, or manuscript edit occurred. Reviewed attachments and optional announcement email delivery/outcomes remain open; full Phase 5 is not complete.

Implemented approved-placement contact discovery (90-day / ten-message bounded search), server-owned student/contact/thread mappings, human student names, placement rechecks during discovery and send, RFC reply-ancestry filtering for inbound/outbound display, and delivery-status lookup that never sends. Discovery is disabled by default behind COMPANY_INBOX_PLACEMENT_DISCOVERY_ENABLED; it has not been enabled or deployed to Render. Browser request-ID guard now survives reload/navigation in sessionStorage without storing message text; unknown delivery remains locked for mailbox review.

Regression checkpoint: 33 web suites / 106 tests passed, production Vite build succeeded, and all 31 focused backend tests passed including status lookup and superseded-placement rejection. No live mailbox search beyond the authorized test, extra email, student approval, or manuscript change occurred. Phase 5 is not complete: broader mailbox access needs action-time approval, the hosted send endpoint needs an explicitly authorized test recipient/body, and reviewed attachment/optional announcement email outcomes remain open.

Follow-up: the user confirmed enabling the exact test conversation. The published coordinator UI completed server recipient verification and now displays the reply composer addressed only to louinaquines@gmail.com. No email was sent. Screenshot evidence: company-reply-enabled-live.png. General conversation rollout and broader Phase 5 acceptance remain open.

Render deployment dep-db5b79g473hc73ahfhug of f1914a9 succeeded and is live. Exact-test recipient preparation is server-verified; no additional email was sent during this checkpoint. The authenticated local coordinator UI loaded the exact inbound test message in BSIT 4G. Replies remain disabled pending action-time confirmation to enable the exact test conversation for louinaquines@gmail.com.

Web regression: all 33 suites / 104 tests passed using a workspace Jest cache outside the Windows sandbox. The startup test mocks the PDF module, which retains its separate tests. Production Vite build succeeded and Firebase Hosting release to pathway-57400 completed. This does not establish general company-conversation rollout or full Phase 5 acceptance.

### Phase 1 hardening evidence — October 11, 2026

Review IDs now bind to a request fingerprint: an identical retry returns the existing snapshot, while different findings using the same ID are rejected. OCR cancellation/failure releases allocated canvases; unavailable crop contexts fail safely. Table mapping now requires confident headers and day anchors instead of treating low-confidence positions as reliable. Added negative tests for these conditions.

Fifteen backend comparison/review tests passed; the four focused web suites previously passed 22 tests before the new anchor test. Final focused rerun recorded in the turn handoff. No live data, manuscript, deployment or approval was changed.

Phase 1 remains acceptance-open: actual browser worker/protected-file/Firestore integration, representative completed typed and handwritten scan accuracy, and broader hostile-file resource isolation are not established by mocked tests. The supplied XLS is blank and the tiny scan failed reliable mapping. Request a readable completed scan with fictional test details; do not call Phase 1 complete while these gates remain open.
