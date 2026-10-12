# Full-system E2E — October 12, 2026

Status: PREVIEW BUILD SUBMITTED (05e74d52-3b27-4f1b-b531-756f0cf0f268); build completion and installed-new-APK acceptance remain pending. Historical checkpoint failures/pending statements below are superseded by this current summary where explicitly resolved. No paid AI calls or AI enablement in this run; earlier AI acceptance is separately identified.

## Current reconciled acceptance — October 12, 2026

| Scenario | Current result | Evidence boundary |
|---|---|---|
| Placement submission, revision, resubmission, approval | PASS | Coordinator browser plus owner phone screenshots; separate authorized TEST ONLY one-slot company |
| Missing-document final-review gate | PASS | Screenshot 1000653983 shows Action needed / 0 of 6; owner confirms submission blocked |
| First-login replacement and re-login | PASS, owner reported | Fixture recovered through owner-completed reset; initial failure root cause remains unknown; old-password rejection independently isolated |
| Evaluation required fields, submit, used-link rejection | PASS | Owner phone and coordinator/browser; expiry and API duplicate scenarios isolated |
| Owner email delivery/threading and PDF | PASS, desktop browser/file | Recipient Gmail thread and actual received PDF parsed/rendered; phone PDF opening not independently established |
| Clearance and global destructive/access mutations | PASS, isolated | No live eligible clearance or production recovery claimed |
| AI four-feature acceptance | Prior acceptance only | Four earlier calls; current backend disabled. No new paid calls, billing changes or AI enablement for this APK |
| Phone refresh, recovery, photo, keyboard, overlays | PASS, owner-reported Expo Go | Not installed-new-APK acceptance or exhaustive device coverage |
| Regression | PASS | Web 121 tests / 38 suites; backend 42 emulator tests; selected native/helper/mail 35 tests; Android export 4.72 MB |
| Native supervisor/admin management placeholders | NOT IMPLEMENTED | Not counted as functional passes; implemented web roles tested separately |
| Updated installed APK | PENDING | Startup/authentication, permissions, protected file opening, keyboard, refresh/navigation/layout still require owner verification |

Approval phone screenshot 1000653982 confirms placement Approved. No final deployment approval, clearance, signed endorsement issuance, or live email was triggered by this placement test. Build is a testing/demo preview, not full production readiness. Legacy files without secure metadata and iOS/web protected-file limitations remain documented. Dependency-audit findings require separate triage; no forced dependency upgrade was performed.

## Agent-executed results

| Target | Result | Evidence / boundary |
|---|---|---|
| Web regression | PASS | 38 suites, 121 tests; Jest runInBand |
| Backend/security workflows | PASS | 42 emulator integration tests, demo-pathway-security; includes role/rules, admin controls, registration/password replacement, attendance, document authorization, placement, final review, journal review, messaging, evaluations, clearance, simulated email |
| Helper/recovery/AI-safety tests | PASS | 42 tests across student helpers, Anthropic provider mocks, encrypted backup/recovery, attachment acquisition, health probe |
| Android bundle | PASS | output/release/e2e-android-check; Hermes bundle 4.69 MB; not installed-APK acceptance |
| Coordinator access | PASS, browser observed | Existing assigned coordinator session loads BSIT 4G requirements |
| Janeil baseline | Recorded | 11 of 11 requirements approved; coordinator UI reports legacy files need reupload for secure download. No requirements altered |
| Admin role boundary | PASS, browser observed | Attempt to open /admin with current non-admin session redirects to login |
| Admin live read-only workflows | PASS, browser observed | Owner signed in; overview, student/coordinator/section directories, company oversight, academic terms, global settings and audit logs loaded. Janeil search narrows 3 students to 1. Provisioning form renders; not submitted |
| Physical-device interactions | PENDING | Owner participation required; earlier owner reports do not verify refresh fixes from this run |
| Four live AI calls | PENDING | Budget unspent; existing $5 limit/auto-reload state must be verified before enablement |
| Live email/provider delivery | PENDING | Emulator SMTP/provider evidence is not live-delivery proof |

## Fixes during this run

- Refresh skeleton previously unmounted dashboard panels, risking local draft/state reset. Keep content mounted but hidden during refresh.
- Logs refresh now reloads panel-owned attendance and parent metrics together.
- Emulator backend startup allowance increased from 15 to 60 seconds. First run failed at startup; rerun passed all cases. This did not modify production behavior.

## Inventory limitations

- Student mobile routes implemented; standalone StudentRequirements route separate from onboarding.
- Web coordinator and admin portals are implemented testing targets. Admin company access is read-only; management is coordinator-only.
- Native CoordinatorDashboard, SupervisorDashboard, ManageUsers, ManageCompanies, ViewStudents, Reports, Evaluations route to Placeholder and are NOT IMPLEMENTED as native functional screens. Supervisor evaluation is provided through web /evaluate.
- Self-registration is disabled by design; provisioning/roster workflow is the supported onboarding route.
- Janeil's legacy files cannot be counted as secure coordinator download passes without valid asset metadata/reupload. Do not weaken file authorization to bypass this.

## Remaining sequence

### Authorized live placement fixture provisioned

Owner screenshot 1000653977.jpg confirms exact provisioned username uclm-qa261012p1 and LoginScreen invalid-credential message with password hidden. This is Firebase sign-in rejection, not a backend student-profile/placement gating error. Read-only Firebase console attempt did not expose the fixture's user metadata (Users view showed no rows), so password-change completion has not been independently verified. No account reset or auth settings changed. Need distinguish successful Save password and sign out from the separate Sign out action; do not assume password update merely from returning to login.

Owner reports first-login password screen was reached and returned to login after saving, but subsequent sign-in with the replacement password reports invalid username/password. Live first-password round trip FAIL (owner-reported), root cause not established. Mobile source signs out only after successful change-password response; login maps provisioned usernames to the synthetic Auth identity. Do not reset/recreate fixture or collect the replacement password to bypass this defect. Live placement test and APK release remain blocked pending diagnosis.

After explicit owner approval to create a new fictional student, used coordinator Authorized Roster normal import UI for one row: QA261012P1, TEST ONLY, Placement QA, assigned BSIT 4G. UI verified `1 created, 0 unchanged, 0 failed`, username uclm-qa261012p1. Expected UID roster-qa261012p1 follows supported provisioning contract; not independently queried. Evidence placement-fixture-created.png. No email sent, existing account reset, approval rewind, or Dexter/Janeil mutation. First-login password replacement is required and must be completed by owner; no replacement password recorded. Live placement submission/review remains pending that handoff. Initial access credential intentionally omitted from this report.

### Latest pre-build regression checkpoint

Final backend authorization/workflow rerun PASS: 42/42 tests, demo-pathway-security Auth/Firestore emulators, exit code 0, 64.16 seconds test duration. Covers scoped roles/rules, isolated first-password replacement, placement draft/submission/revision, final approval, attendance, messaging, evaluations, clearance and simulated endorsement mail. Emulators shut down successfully. No production fixture mutation or live mail send. Does not resolve live placement acceptance or native APK acceptance.

Actual recipient Gmail attachment downloaded through its normal Download attachment control to C:/Users/Lenovo/Downloads/test-only-endorsement.pdf. pypdf successfully parses one page; Poppler renders the page, visually inspected as readable fictional unsigned TEST ONLY endorsement. Evidence output/release/received-test-pdf.png. Desktop attachment acquisition/parsing/rendering PASS. Gmail inline preview did not visibly render; phone attachment opening still owner-dependent. No email sent, file edited, or placement/approval changed.

Fresh full web regression PASS: 38 suites, 121 tests. Selected mobile backdrop/keyboard/student-helper and company sender/reply regressions PASS: 35 tests. Fresh Android Expo export PASS: 1,058 modules, 26 assets, 4.72 MB Hermes bundle in output/release/e2e-android-final-check. This is bundling only, not APK construction or installed-device acceptance. No EAS build submitted. Remaining live placement fixture and attachment-opening acceptance are not resolved by these checks.

### Latest live email and device checkpoint

Subsequent recipient-mailbox browser inspection supersedes the earlier nonreceipt result: signed-in Gmail identifies louinaquines@gmail.com and its Inbox contains `PATHWAY TEST - company reply`, dated October 11. Opening it shows the original message plus all three pathwaysystem4@gmail.com replies in the same conversation, including the fictional PDF delivery message and test-only-endorsement.pdf (2.1 KB), scanned by Gmail. Historical recipient delivery and Gmail threading PASS (browser-observed); no new send. Attachment presence PASS; preview click changed the URL but did not visibly render PDF contents, so file-opening acceptance remains unverified. Earlier owner nonreceipt is retained below as chronological evidence, not current proof of a delivery failure.

Owner subsequently reports company replies absent from Inbox and Spam; screenshot 1000653976.jpg shows evaluation invitation/verification messages, not company replies. Company-reply recipient delivery acceptance FAIL (owner-reported nonreceipt); root cause UNRESOLVED. In-app thread display and sender-side provider acceptance do not override this result. Source review confirms server-owned reply recipient, MIME To/In-Reply-To/References headers and provider-accepted-only semantics. Fresh company sender/replies/inbox isolated regression 24/24 PASS; no live sends or automatic retries. Existing nonsecret historical retry receipt names the authorized owner recipient; it proves acceptance only, not delivery. Recipient-side threading and attachment opening remain BLOCKED by nonreceipt. Investigation requires authorized sender-mailbox message headers/bounce evidence; do not infer spam filtering or wrong recipient without evidence.

Coordinator Company email conversation `TEST ONLY — Company reply — Dexter Tampus` loaded and refreshed through its normal UI. Browser-observed incoming owner-mailbox message `PATHWAY TEST - company reply` and three existing outbound `Re:` messages remain in one conversation. Outbound entries explicitly report provider acceptance, not confirmed inbox delivery. Existing PDF attachment entry reports attachment blocked and requires authorized-mailbox review. No new email sent. In-app thread display PASS; actual recipient-side threading and attachment receipt remain BLOCKED pending owner confirmation. Do not count provider acceptance as delivery.

Owner reports PASS for offline/reconnect with unsaved New Log draft preservation, requested screen refresh circles/skeletons, keyboard checks with no further overlap reported, profile-photo consistency after reauthentication, and the corrected stationary backdrop animation. These are owner-reported Expo Go evidence, not installed-new-APK acceptance or exhaustive keyboard coverage.

Live placement remains BLOCKED: current queue has no new eligible Janeil request, and existing approved Dexter placement is preserved. Isolated placement workflow PASS does not substitute for a live round trip. No approval rewind or placement mutation performed.

### Integration/recovery checkpoint

Fresh backend integration/helper/recovery/config run 46/46 PASS; frontend reviewed-attachment/announcement delivery tests 3/3 PASS. Covers isolated encrypted backup byte-preserving restore, corruption/wrong-key rejection, refusal of production targets/overwrites, attachment authorization/byte/version mismatch, provider failure and uncertain-mail retry handling, upload receipts, student routing and keyboard source configuration. Live liveness HTTP 200 in 242 ms, evidence health-2026-10-12T01-09-54-052Z. Live document integrity and owner-mailbox evaluation/OTP receipt established by prior checkpoints. No full production restore or live mail threading proven by these mocks. Device offline/reconnect, refresh skeletons, draft preservation, photo consistency and keyboard behavior remain owner-tested acceptance tasks; no emails sent or production data changed in this checkpoint.

### AI evidence reconciliation

Earlier acceptance report output/release/anthropic-in-app-acceptance.md records four completed paid in-app feature tests: coordinator journal, attendance and synthetic document excerpt (browser-observed), plus unsaved student refinement (owner screenshot 1000653947.jpg). Advisory labels, unavailable attendance metrics and discard were checked in coordinator flows; no approvals changed. Shutdown flag and deployment were verified at that time. This evidence predates the current E2E run; do not label as newly executed tests. Fresh provider-safety regression 9/9 PASS: disabled/emulator fail closed, bounded config/input/output, sanitized provider failures without retry, failed calls count toward daily cap and concurrency limit. No paid calls or enablement performed in this checkpoint. Newly built APK still requires device consent/discard/UI acceptance; current budget/auto-reload and flag would need fresh verification before any additional live enablement.

### First-login password checkpoint

Verified scenario in the freshly completed 42/42 emulator suite: provisioned synthetic student authenticates with temporary password, profile requires password replacement, restricted records and attendance deny access, wrong current password is rejected, successful password replacement invalidates the old password, new password signs in and clears passwordChangeRequired. Reimport does not reset the changed password. Scoped recovery invalidates old sessions/password epoch and requires replacement again. Automated isolated acceptance PASS; physical-phone password-entry/keyboard acceptance remains owner-dependent. No live passwords or account approvals modified.

### Clearance checkpoint

Live browser read-only matrix: BSIT 4G 2 students, 0 cleared, 0 ready for sign-off; Janeil requirements Approved but 120.02/540 hours Incomplete, Dexter requirements not_submitted and 0/540 hours Incomplete. No clearance action available or taken. Fresh frontend clearance export tests 2/2 PASS (CSV formula safety and HTML escaping). Emulator clearance scenario independently exercises missing account approval, requirements, placement, final deployment approval, evaluation and hours (including 0.01-hour deficit), cross-section/wrong-role denial, eligible approval, duplicate rejection, exactly one audit and notification, and post-clearance record locks. Live eligible-clearance mutation intentionally not performed.

### Evaluation acceptance checkpoint

Live evaluation round trip PASS: owner screenshots/reports confirm invitation and code receipt, successful verification, required-field submission blocked, and successful test submission. Coordinator Refresh Records independently confirms Janeil TEST ONLY Full-system evaluation QA status Submitted, all five ratings 3/5, exact fictional-test feedback. Reopened same invitation in a fresh browser tab: "Evaluation link is expired or already submitted", with no form available. No second submission attempted; API replay rejection independently covered by emulator tests. Live expiry remains isolated-only evidence. No student approvals changed.

Owner screenshots confirm live invitation and OTP emails reached the authorized mailbox and verification UI opened. Email receipt PASS (owner-provided evidence); Android notification-shade popup not observed, not an email-delivery failure. Verification and submission remain pending. Simplified post-request UI text locally to direct users to email; no new code request sent or OTP recorded.

Live owner-mailbox invitation: created one TEST ONLY Full-system evaluation QA record for Janeil, supervisor TEST ONLY Owner-controlled supervisor, at explicitly authorized louinaquines@gmail.com. Sent once with fictional-test disclaimer. Coordinator UI reports email server accepted invitation; record says Accepted by Gmail — inbox delivery not confirmed, Awaiting Response. No retry, no existing evaluation/approval changes. Token intentionally excluded from report. Owner receipt and OTP/browser submission pending.

Fresh evaluation helper tests: 10/10 PASS (OTP hashing/session expiry, one-use verification, throttling, mail failure, revoked/used/expired links, malformed forms and required/rating validation). Fresh frontend tests: 3 suites, 7/7 PASS (SupervisorEvaluationPage, EvaluationFormBuilder, EvaluationBuilderDialog). Earlier fresh 42-test emulator run includes verified evaluation submission, replay denial 410, coordinator scope, notification and simulated SMTP assertions. These do not establish live owner-mailbox delivery or live browser submission. Live evaluation verification remains pending a specifically identified owner-controlled mailbox and eligible fixture; no mail sent in this checkpoint.

### Placement follow-up

Live coordinator Company Placements eventually loaded after a slow initial fetch. BSIT 4G has zero awaiting company requests and zero final-review submissions; listed placement belongs to Dexter and is already Approved, with signed endorsement outstanding. Janeil has no request listed, so no live proposal was available to revise. No production placement/approval changes performed. Fresh emulator run passed company-placement ownership/atomic-assignment tests, student draft/submission/revision/resubmission with notifications and audit assertions, and approved-placement replacement invalidation. This is isolated backend evidence, not a live student UI round trip. Janeil live proposal entry remains owner/device-dependent; do not rewind her approval or change Dexter's existing placement.

### Document test target mismatch

- Owner confirmed an upload to Dexter's narrative slot, but fresh coordinator UI showed OJT Narrative Report Not Submitted. Certificate of Registration instead showed a newly submitted phone screenshot (Oct 12).
- No document approved/rejected in this check because expected Maria-tang-an.pdf/narrative binding was absent. Ask owner to verify exact student, requirement, and file before continuing. Preserve endorsement and certificate decisions.

### Live messaging roundtrip

- Owner reported journal approval/notice and floating-add checks passed; phone evidence remains owner-reported.
- Coordinator browser observed Janeil's exact `TEST ONLY — end-to-end messaging check. Please acknowledge.` message, initially one unread. Opening conversation cleared unread indicator.
- Sent one TEST ONLY acknowledgment through Message reply; UI verified reply in conversation and cleared draft. No email sent. Evidence janeil-message-roundtrip-e2e.png.
- Student-side reply receipt remains pending owner confirmation. Keyboard changes passed configuration tests only; phone keyboard overlap remains unverified.

### Live coordinator journal revision

- Owner manually restored assigned coordinator session in BSIT 4G.
- Browser baseline: Janeil has seven journals. Weeks 1, 2, 4 approved; Week 3 rejected; Weeks 5, 6, 7 pending. Attendance displays four dates including one missing timeout; no attendance changed.
- Selected existing explicitly fictional Week 5 `test rejection` (40 reported journal hours). Confirmed Reject Entry once. UI verified Rejected with default feedback `Please revise and resubmit this weekly entry.` No custom-feedback field appeared.
- Evidence: janeil-week5-revision-e2e.png. This is a live mutation on the agreed Janeil fixture, not an official academic assessment. Approved journals and Dexter records were untouched.
- Student notification receipt and edit/resubmission remain pending owner phone interaction. No email sent and no AI request made.
- Owner reported resubmission. Browser refresh independently verified Week 5 pending with TEST ONLY revised journal text and unchanged 40 reported journal hours. Approved that designated fixture once; UI verified Approved. Evidence janeil-week5-approved-e2e.png. Other review decisions untouched. Owner still needs to confirm final approval notice/status on phone; notification receipt not independently verified.

### Admin live pass follow-up

- Verified manual admin session on hosted /admin. Navigation/read-only pass completed; no accounts created/deactivated, no settings/terms saved, no audits modified.
- Company directory loaded one TEST ONLY company after initial loading. Admin interface offers no company creation/edit action.
- Native admin placeholders remain not implemented. Provisioning and global mutations are tested in emulators, not live acceptance.
- Overview headline totals show 3 students while last-30-days charts/recent registrations are empty; date-filter semantics need investigation before labeling this a defect.
- AI budget still unspent in this run; no new build submitted.

1. Obtain manual admin sign-in and perform live non-global checks.
2. Verify Janeil eligibility/baseline for each permitted mutation; preserve Dexter and existing approvals not part of a specific scenario.
3. Verify AI provider safeguards, enable only flag, make at most four synthetic calls with no automatic retries.
4. Execute remaining live fixture workflows and capture before/after evidence; owner mailboxes only.
5. Verify refresh draft preservation on phone and installed APK after final fixes, then submit one incremented preview build only after release blockers resolved.
# Document opening follow-up

Owner resubmitted narrative after test rejection. Coordinator reload confirms Maria-tang-an.pdf returned to Pending, prior rejection feedback no longer displayed; other submitted documents remain Pending and approvals remain 0/11. Authenticated preview again renders 3-page PDF (4052 extracted characters). Downloaded resubmission exactly matches original SHA-256 3CF7F649E4DE319521E8D29CC59868D901B6CB9BA76D2EC8199FD4517AC40C76. Revision/resubmission round trip PASS (owner-reported student action, browser-observed coordinator status and byte verification); no final approval performed.

Owner explicitly authorized narrative revision test. Coordinator rejected only Dexter's OJT Narrative Report (Maria-tang-an.pdf) with reason: "TEST ONLY — document revision/resubmission check. Please resubmit the same fictional Maria-tang-an.pdf to verify the revision workflow." Browser confirmed Rejected status and feedback. Other submitted requirements remain Pending and approvals remain 0/11. Evidence: dexter-narrative-revision-e2e.png. Student receipt/resubmission still awaiting owner action.

Coordinator live verification: Dexter's OJT Narrative Report shows Maria-tang-an.pdf, submitted Oct 12, Pending. Authenticated preview opens all-document metadata (3 pages, 4052 extracted characters) and displays page 1. Downloaded received copy SHA-256 exactly matches the owner's original attachment: 3CF7F649E4DE319521E8D29CC59868D901B6CB9BA76D2EC8199FD4517AC40C76. Upload integrity and coordinator preview/download PASS (browser-observed plus byte comparison). No approval/rejection action taken. Owner reports Android fix done; retain installed-APK retest requirement.

Owner screenshot confirms Dexter's fictional narrative PDF uploaded and is In review. Direct Cloudinary delivery returns HTTP 401 (deny or ACL failure), so upload acceptance does not establish viewing acceptance. Android file taps now download through the existing authenticated, ownership-scoped requirements endpoint and open a read-only content URI in the device viewer. Shared RequirementsScreen covers onboarding and standalone requirements; no new button or provider ACL changes. Temporary cache is removed after return. Expo SDK 54 intent-launcher dependency added. Native retest remains required; existing installed APK does not include this change. Web/iOS direct-link behavior is not fixed by this Android change.

# Live placement checkpoint — 2026-10-12

- Owner explicitly authorized creating a separate one-slot company to finish approval. Coordinator UI created TEST ONLY — Placement QA Company 2 (Information Technology, TEST ONLY — Cebu City, owner-controlled contact), verified Active and 0/1 placements. Existing company remained 1/1, unchanged. Evidence: placement-qa-company-2-created.png.
- Assigned fixture QA261012P1 to the new company and approved its revised On-site request through normal coordinator confirmation. Browser verified Approved, official company 2, unchanged supervisor/dates, an approval history snapshot at 2026-10-12 10:38:11 Asia/Manila, and Awaiting signed letter / Not sent. Evidence: placement-qa-approved.png. Live coordinator placement approval: PASS. Previous capacity blocker resolved through an authorized separate fixture, not a bypass.
- Final pre-deployment approval, document approvals, clearance, endorsement issuance and email delivery were NOT performed by this placement decision. Student-visible approval remains pending owner verification. No existing student assignment or existing company capacity was modified.

- Subsequent owner screenshot 1000653980 verifies student-visible Needs update and exact coordinator feedback. Owner then resubmitted; refreshed coordinator queue independently verifies Pending review with On-site and unchanged company, supervisor, and dates. Live revision/receipt/resubmission round trip: PASS. Approval remains BLOCKED by directory capacity; no capacity bypass or existing assignment change performed.

- Owner reports successful first-login password change and subsequent login on fixture QA261012P1 after owner-completed coordinator recovery. This supersedes the earlier failed login outcome; the initial failure's root cause is not established. No password is recorded here.
- Owner screenshot 1000653979 confirms placement submission. Coordinator browser independently shows TEST ONLY Placement QA, TEST ONLY — Placement QA Company, QA Intern, dates 2026-10-13 through 2026-12-29, and Pending review. Student submission / coordinator receipt: PASS (owner screenshot plus browser-observed).
- Coordinator requested changes only on this fixture: change work arrangement from Cebu city to On-site and resubmit. Browser verified Needs revision and the saved TEST ONLY feedback. Evidence: placement-fixture-needs-revision.png. Revision decision: PASS (browser-observed); student receipt and resubmission remain pending.
- Live approval is BLOCKED: the only active directory company is visibly marked at capacity and Approve is disabled. No capacity, global settings, or other student assignment was changed.

