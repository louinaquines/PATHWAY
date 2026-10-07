# PATHWAY OJT Management System

## Project Documentation and Change Log

**Last updated:** 2026-10-07
**Project status:** Local development  
**Primary reference:** `PATHWAY-OJT-Management-System-with-AI-Analytics-1.docx`

### 2026-10-07 — Company placements browsing

- Company Placements now has Companies and Placement Reviews workspaces. Companies supports responsive grid/list views and company-name or assigned-student-name search.
- Cards show directory contact details, global capacity, and officially assigned students from the selected section. Pending proposals are not counted as assigned students; inactive/unlisted companies with existing approved placements remain visible.
- Section student records are fetched freshly alongside placement records. Existing proposal decisions, final reviews, endorsement preparation/delivery, confirmation dialogs, and assignment history remain in Placement Reviews.

### 2026-10-07 — Direct supervisor evaluation emails

- Coordinators prepare the invitation, confirm its supervisor recipient, optionally add a message, and send it directly through PATHWAY's backend SMTP transport. No email-app redirect or company chat account is required.
- Email uses a seven-day, single-use evaluation link. Configure `EVALUATION_WEB_URL` on the backend to the public staff website origin (HTTPS, e.g. `https://your-project.web.app`), alongside `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD`. Localhost origins are allowed only for the isolated demo workflow.
- Sending is limited to the evaluation's creating coordinator and currently assigned student. Recipient and evaluation details come from the stored invitation, not arbitrary send-request fields.
- Email status is separate from evaluation completion. “Sent” means the email server accepted it, not delivered to the inbox or read. Repeat sends of an accepted invitation do not send again. An interrupted or uncertain attempt is blocked from automatic resend and requires mail-service review.
- Production mailbox delivery and spam-folder acceptance still require configured SMTP and a public evaluation page. The manuscript is unchanged.

### 2026-10-07 — Company management responsibility change

- Coordinators now own company-directory creation, editing, capacity configuration, and deactivation through the Company Directory page and coordinator-only backend endpoints.
- Admin company access is read-only for monitoring company records and placement capacity. Admin creation and update endpoints reject mutations, including calls from an older admin interface.
- Existing companies and placements are preserved. Student company suggestions and coordinator placement approvals are unchanged.
- Manuscript revision needed: describe the admin's company role as monitoring rather than directory maintenance. This documentation records the agreed change; the manuscript itself has not been edited.

---

## Approved Planned Change — Student Account Provisioning

**Decision recorded: 2026-10-06. Status: local implementation added; not deployed.**

This section records the team's revised onboarding requirement and the exact manuscript revisions needed later. It supersedes student self-registration as the target design. The decision/checklist below is retained; the implementation entry immediately afterward records the work completed and remaining acceptance limitations. Historical entries remain records of earlier behavior. **The manuscript has not been edited.**

### Agreed target workflow

1. The coordinator uploads an authorized class list containing student identities and associates it with the correct section and department. The list does not contain student email addresses.
2. The system provisions student authentication accounts and profiles from the authorized list, linked to their section and coordinator. Students cannot self-register.
3. Each student's fixed username is `uclm-{StudentID}`. Their initial password is `UC@{StudentID}`. Example: Student ID `24228132`, username `uclm-24228132`, initial password `UC@24228132`.
4. On first login, the student must replace the initial password before accessing dashboards, student records, or any pre-deployment or OJT operation. The username stays unchanged; the password is not permanently fixed.
5. The password-change gate must be enforced by protected backend operations and database access rules, not only by navigation or a screen. Completion is recorded only after a successful authentication password change and a trustworthy server-side completion check.
6. After changing the password, the student enters the appropriate dashboard according to their pre-deployment status. Account provisioning and password setup do not automatically grant final OJT deployment clearance.
7. Reuploading a class list must not reset existing passwords, recreate accounts, or silently move students between coordinators or sections. Imports must detect duplicates and ownership conflicts and report per-entry outcomes, including partial failures.

### Authentication and recovery design to implement

- Preserve Firebase Authentication using a generated, unique email-shaped internal identifier mapped to the username. This identifier is not a real student inbox, is not presented as a contact email, and must never be used for email delivery or email-based password recovery. The exact identifier domain and mapping remain implementation details to finalize.
- Remove the student signup entry and disable the public student self-registration operation. Merely hiding the registration screen is insufficient.
- Store passwords only through Firebase Authentication. Do not retain readable initial or changed passwords in Firestore, uploaded class-list records, application logs, or exports.
- Provide coordinator-assisted recovery for students in the coordinator's assigned sections after identity verification. Use a random temporary recovery password rather than restoring the predictable initial password. Require another password change before restoring student access, revoke existing sessions, and record an audit event without the password.
- Student email addresses are not required for enrollment. Any optional contact-email feature added later must remain separate from the internal authentication identifier.
- The Student ID-derived initial password is predictable. First-login enforcement reduces exposure but does not prove the person signing in is the intended student. Before implementation is finalized, define controlled credential distribution and identity verification, plus login abuse protections.

### Manuscript revision checklist

These are proposed revisions for the team to apply to the manuscript later, not edits made to the DOCX. Section names and figure labels are used rather than unverified page numbers.

| Manuscript location | Existing statement or conflict | Required revision |
|---|---|---|
| Scope and Delimitation — class-list pre-verification paragraph | The student attempts registration and the system checks their submitted ID against an uploaded master list, granting immediate access after verification. | State that the coordinator uploads the authorized list and the system provisions accounts. Replace student registration with username login and mandatory first-login password change before protected access. State that no student email is required. |
| Program Workflow explanation | The student journey begins with mobile account registration and coordinators vet new registrations. | Begin the student journey with a coordinator-provisioned account, login, mandatory password replacement, then pre-deployment tasks. Describe coordinator import/provisioning instead of reviewing self-registration requests. |
| Overall Use Case Diagram and role explanation | The Student role includes Register Account. | Remove student self-registration. Add coordinator class-list upload/account provisioning and student first-login password change and password-change actions. Describe coordinator-assisted recovery. |
| Figure 19 — System Use Case Model — Register Account | Triggering actor is Student; inputs are Name, Student ID, Email, and Password through a mobile registration option. | Replace with a coordinator-triggered provisioning use case: authorized list, section/department ownership validation, duplicate detection, account creation, fixed username and initial-password convention, and outcome reporting. Document mandatory password replacement in a separate student use case. |
| Access Account use case and student login screen logic | Login descriptions use institutional credentials and route directly into the student's workspace after authentication. | Specify `uclm-{StudentID}` login, `UC@{StudentID}` for initial login only, and password-change-required routing before any workspace access. Include failed login, incomplete password setup, recovery, and session invalidation cases. |
| Coordinator student-registration review modal description and logic | A pending self-registration is reviewed and Approve and Activate generates credentials. | Replace or repurpose this UI/use case around authorized roster import and provisioned-account management. Keep deployment/document approval distinct from account provisioning; eliminate approval of self-registration requests. |
| Program Specification — Functional Requirements — Registration and Account Activation Process | Coordinator-created accounts and a forced first-login credential change are already stated. | Retain that direction, but explicitly define class-list-driven provisioning, no self-registration, username/initial-password convention, email-free onboarding, protected first-login enforcement, safe reimports, and coordinator-assisted recovery. |
| Database Design — Users description and data dictionary | Authentication credentials and an `is_first_login` flag are described. | Clarify that passwords are managed by Firebase Authentication, not stored as readable user-table fields. Define username, authentication UID/internal identifier, Student ID, section/coordinator links, password-change-required state, and server-owned completion/reset metadata. Explain that the state gates access, not just routing. |
| Related-system comparison and any remaining Student ID verification claims | Some passages describe ID verification during student account registration. | Update claims about PATHWAY to authorized roster validation during coordinator provisioning. Do not rewrite descriptions of other researchers' systems as though they use PATHWAY's new flow. |
| Module list, onboarding storyboards, and evaluation questionnaire | Student Registration, registration inputs, and automatic registration through ID verification appear. | Rename the relevant module to Class List Account Provisioning; replace signup storyboards with first-login password setup and coordinator account management; update questionnaire wording to assess authorized-list provisioning and onboarding. |

### Acceptance checks before marking this implemented

- Authorized coordinator imports provision correctly scoped accounts; unauthenticated, wrong-role, and cross-section requests are denied.
- Students can sign in with their usernames; no student self-registration path remains usable.
- Initial-login and recovery-password sessions cannot read protected student records or perform operations before password replacement, including direct API/database attempts.
- Successful replacement unlocks the correct student workspace; the original password no longer works, and interrupted/failed changes do not incorrectly unlock access.
- Reimports preserve changed passwords and existing account links; duplicate IDs and conflicting ownership produce clear outcomes.
- Coordinator recovery is scoped, audited, revokes previous sessions, and re-enforces password replacement without recording passwords.
- Account provisioning does not bypass document review or final deployment approval.

**Original decision-record boundary:** the initial documentation update changed documentation only. The implementation described below was added afterward; the manuscript remains unchanged.

### 2026-10-06 Local implementation and verification

- Added coordinator-only `/coordinator/provision-students` with assigned-section validation, name/ID validation, deterministic usernames and internal Firebase identifiers, per-student results, and server-owned audit records. Class List accepts CSV files or pasted rows in the exact format `StudentID,FirstName,LastName`, with at most 250 students per request. Commas inside names/quoted CSV fields are not supported by this initial importer.
- Added username login using `uclm-{StudentID}` and internal identifiers at `students.pathway.invalid`. This reserved, non-delivery domain is not a student contact email. Student passwords remain in Firebase Authentication, not roster documents or exports.
- Removed student registration navigation and signup prompts, and replaced `/register-student` with a retired-operation response. The old registration source file is no longer registered as a navigation screen. Direct Firebase client signup configuration has not been changed in a live project; an Auth identity alone cannot create a PATHWAY user profile or gain record access.
- Added mandatory Change Password routing, minimal authenticated profile bootstrap, current-password verification, server-side password replacement, token revocation, and password-epoch claims. Backend operations and Firestore rules block protected record access before replacement and reject old token epochs after resets. Password operations remain fail-closed on partial failure, with operation-lock cleanup allowing coordinator recovery when the database is reachable.
- Added a voluntary Change Password action for provisioned students in Settings. Student recovery now directs users to their assigned coordinator instead of email reset. The Class List reset action requires an identity-verification confirmation, returns a random temporary password once with no-store response headers, revokes sessions, re-enforces password replacement, and records a password-free audit event.
- Class-list reimports return existing ready accounts as unchanged. Existing self-registered accounts are flagged for manual migration rather than being recreated or having their passwords reset. Existing email-based accounts and local demo fixtures can still use email login during transition; the new provisioning flow does not require student email.
- Verification: isolated Auth/Firestore emulator security suite passed 34/34 tests; student web helpers passed 8/8; identifier/password-policy unit tests passed 2/2; production packaging/configuration tests passed 4/4. Staff production build and student Expo web export passed. No production service was deployed or accessed by these tests.
- Remaining acceptance: hands-on coordinator CSV upload/reset and student first-login checks in the running UI and on native devices; controlled distribution and identity verification for predictable initial credentials; legacy-account migration policy; production Firebase client-signup settings and coordinated backend/rules/client rollout. These are not represented as completed or production-ready.

The manuscript revision checklist above remains applicable: no manuscript wording, figures, or tables were modified.

### 2026-10-06 Authentication UI follow-up

- Replaced the obsolete single active Sign In tab with a plain form heading; retained the actual submit button as the primary action.
- Changed the username field's email icon to a user icon. Suppressed the nested browser input outline on login fields while retaining their enclosing blue focus border, and prevented flex-width overflow.
- Added matching visible focus borders and keyboard avoidance to the password-change form. Browser/native visual acceptance remains separate from successful bundling.

### 2026-10-06 Student sign-in screen redesign

- Reorganized login into a compact campus hero, inset rounded account card, Student Access label, Welcome Back heading, and separate coordinator-access guidance.
- Enlarged input and password-visibility targets, retained explicit field focus borders, added username/current-password autofill hints, and improved accessible error announcements.
- Kept one primary sign-in action and a concise first-login password-change explanation. Username authentication, mandatory password replacement, and coordinator recovery behavior are unchanged. No manuscript or production configuration was edited.

### 2026-10-06 Sign-in layout preference refinement

- Restored the previous Welcome campus header and full-width white panel with rounded top corners, following the user's layout preference. The inset card, Student Access badge, and separate help footer were removed.
- Retained username-specific iconography, clean visible focus borders, larger field/button targets, autofill hints, accessible errors, and concise password-setup/account guidance. Authentication and manuscript content remain unchanged.

---

## 1. Purpose

PATHWAY is an OJT management system for students, coordinators, supervisors, and administrators. It manages student registration, requirements, attendance, logbooks, evaluations, analytics, notifications, and clearance.

This document records:

- What has been implemented
- What has been tested
- Known issues and limitations
- Features still planned
- A chronological history of future updates

This file is the project’s working technical record. Every future system update should add an entry to the change log and update the relevant status sections.

---

## 2. Project Structure

| Component | Purpose |
|---|---|
| `PATHWAY-web` | React web portal for administrators and coordinators, plus supervisor evaluation pages |
| `PATHWAY-master` | Expo React Native mobile application for students and future mobile roles |
| `PATHWAY-backend` | Express and Firebase Admin backend for protected operations |
| `firestore.rules` | Firestore access-control rules |
| `PATHWAY-OJT-Management-System-with-AI-Analytics-1.docx` | Official manuscript for the system requirements |

The project is currently intended for local development. No production deployment is part of the current scope.

---

## 3. User Roles and Main Workflows

### Student

Implemented workflow:

1. Receive a username account provisioned by the coordinator's authorized class-list import.
2. Sign in and replace the initial password before accessing student records.
3. Upload required documents.
4. Monitor requirement status.
5. Resubmit rejected requirements.
6. Record daily time-in and time-out.
7. Submit weekly logbook entries.
8. View rendered hours and progress.
9. Receive notifications.
10. View supervisor evaluation results.
11. View clearance status.

Current platform: mobile application.

### Coordinator

Implemented web workflow:

1. Sign in through protected role-based authentication.
2. Select an assigned section.
3. View students belonging to that section.
4. Review, approve, or reject requirements.
5. Review and approve/reject logbook entries.
6. Manage sections and section requirements.
7. Import the authorized class list into an assigned section and provision student accounts.
8. Assist with identity-verified student password recovery; preserve existing passwords on reimport.
9. Generate supervisor evaluation links.
10. Review evaluation submissions.
11. Review attendance and progress analytics.
12. Mark eligible students as cleared.
13. View notifications and manage the coordinator profile.

### Administrator

Implemented web workflow:

1. Sign in through protected role-based authentication.
2. View system dashboard statistics and charts.
3. Manage student account activation.
4. Manage coordinator accounts.
5. View sections and assignments.
6. Create and activate academic terms.
7. Configure global system settings.
8. Review audit logs.
9. Export dashboard records.
10. Manage the administrator profile.

---

## 4. Implemented Features in the Current Baseline

The following features have a usable implementation in the current project. “Implemented” means a working baseline exists; advanced manuscript requirements may still be incomplete.

- Firebase Authentication and role-based routing
- Class-list student account provisioning, username login, and mandatory first-login password replacement
- Coordinator account creation
- Student account approval and activation
- Requirement upload, review, rejection, and resubmission
- Section and requirement configuration
- Student assignment to sections
- Daily attendance time-in and time-out
- Automatic work-hour calculation
- Weekly digital logbook submission
- Coordinator logbook review
- Supervisor evaluation links with expiration and one-time submission
- Evaluation results and student notifications
- Student progress tracking
- Coordinator clearance workflow
- Basic academic-term configuration
- Basic global system settings
- Basic authenticated audit logging
- Coordinator search, pagination, filtering, loading states, and exports
- Admin dashboard charts, search, notifications, profile controls, and exports
- Web page metadata, protected-page `noindex` behavior, semantic navigation, and SVG icons

The current evaluation workflow uses a temporary one-time token. It does not yet include the manuscript’s passwordless supervisor Gmail OTP/MFA handshake.

---

## 5. Manuscript Compliance Matrix

The official manuscript’s Program Specification defines the following requirements. This table is the authoritative comparison with the current implementation.

The comparison was checked against the manuscript’s Scope and Limitation section and its Program Specification requirements for registration, requirements, attendance, DTR/OCR, journals, company directory, geofencing, communication, analytics, evaluations, reports, terms, settings, audit logs, backup/restore, and clearance. The manuscript also identifies Tesseract.js, Cheerio/Axios, Expo Location, Nodemailer, IMAP polling, Anthropic Claude, Cloudinary, and Firebase as planned technology components; their presence in the manuscript does not mean they are already implemented in this repository.

| Manuscript requirement | Current status |
|---|---|
| Student registration and Student ID verification | Implemented baseline |
| Multi-tenant login and role-based dashboards | Implemented for web admin/coordinator and mobile student; other mobile roles remain incomplete |
| Requirement submission, deadlines, review, rejection, and resubmission | Implemented baseline; AI validation is missing |
| AI Green/Yellow/Red requirement validation | Not implemented |
| Digital attendance with optional geofencing | Digital time-in/time-out implemented; geofencing is not implemented |
| Manual DTR upload, OCR, and discrepancy checking | Not implemented; intentionally deferred |
| Digital journal submission and AI refinement | Journal submission implemented; optional AI refinement exists but is not stable/complete |
| Company directory and assisted profile creation through scraping | Not implemented |
| Geofence configuration and violation review | Not implemented |
| Coordinator announcements to in-app notifications and email | In-app notifications implemented; email broadcast is not implemented |
| Email communication hub and IMAP replies | Not implemented |
| Attendance-pattern modeling | Basic metrics exist; advanced AI/time-series modeling is not implemented |
| Completion-risk tiers | Basic rule-based status exists; complete velocity-based predictive modeling is not implemented |
| Journal completeness, competency, and sentiment auditing | Not implemented |
| Student performance and progress analytics | Basic analytics and exports implemented; full AI analytics output is incomplete |
| Supervisor evaluation rubric and score storage | Implemented baseline through one-time links; Gmail OTP/MFA is missing |
| Formal report generation | CSV exports exist; complete manuscript-level reports are not implemented |
| Academic-term configuration | Basic create/edit/activate workflow implemented; term-specific section parameters and deadlines are incomplete |
| System settings configuration | Basic global settings implemented; comprehensive permissions and framework controls are incomplete |
| Audit logs | Basic protected audit viewing and recording implemented; complete coverage and strict action authorization remain incomplete |
| Database backup and restore | Not implemented |
| Clearance verification and record freezing | Eligibility check and clearance status implemented; immutable record freezing is not implemented |

---

## 6. Partially Implemented Features

### Analytics and risk detection

Basic progress and attendance analytics are available. The rule-based risk model still needs to be aligned completely with the approved specification:

- `High Risk`
- `Medium Risk`
- `Low Risk`
- `Completed`

Risk reasons, recent activity, missed workdays, and attendance-pattern calculations require further verification and completion.

### Audit logging

Audit records are stored and visible to administrators. Coverage and server-side authorization still need strengthening so that each action is generated by the correct backend operation rather than relying on a broadly callable audit endpoint.

### Clearance

Eligibility checks for account approval, requirements, and required hours are present. Completed clearance records still need an enforced immutable/frozen state.

### Company and placement workflow

The current system stores basic company information and uses company fields in student and evaluation records. The manuscript additionally requires a company directory, web-assisted profile creation, student company proposals, placement assignment, slot-capacity checks, endorsement generation, and stakeholder notifications. Those workflows are not yet implemented.

### Supervisor verification and communication

The current public evaluation link is protected by a temporary one-time token. The manuscript additionally requires passwordless supervisor MFA with Gmail OTP delivery, email announcements, company messaging, and IMAP reply storage. These are not yet implemented.

### Mobile application

The student workflow is substantially implemented. Mobile coordinator, supervisor, and complete mobile administrator workflows are not yet complete.

---

## 7. Deferred Features

These features were intentionally deferred and should not be treated as accidental omissions:

- OCR for documents and DTR uploads
- AI-assisted requirement validation
- Improvements to AI logbook refinement

AI logbook refinement currently exists as an optional feature, but it depends on external AI configuration and is not part of the stable baseline.

---

## 8. Features Still To Be Implemented

### Manuscript-required features

- AI requirement validation with Green/Yellow/Red triage
- GPS and geofencing attendance verification
- Manual DTR upload and discrepancy checking
- Company directory
- Company placement and endorsement management
- Email communication hub and IMAP replies
- Database backup and restore
- Journal competency analysis
- Journal sentiment analysis
- Advanced attendance-pattern modeling
- Complete predictive completion-risk modeling
- MFA or equivalent additional account protection

### Mobile features

The following screens currently require real implementations instead of placeholders:

- Mobile coordinator dashboard
- Mobile supervisor dashboard
- Mobile user management
- Mobile company management
- Mobile student directory
- Mobile reports
- Mobile evaluations

### Security and data integrity

- Enforce coordinator department and section boundaries in Firestore rules and backend operations.
- Ensure evaluation links can only be created for students assigned to the requesting coordinator.
- Complete audit coverage for all required actions.
- Freeze records after clearance.
- Move Firebase service-account credentials outside the project and rotate any exposed credential.

---

## 9. Verification Status

The following checks have been completed during development:

- Web test suite passes.
- Web production build passes.
- Backend syntax check passes.
- Student registration and login were tested.
- Coordinator login and dashboard access were tested.
- Requirement submission and review were tested.
- Attendance time-in/time-out was tested.
- Logbook submission and review were tested.
- Supervisor evaluation submission was tested.
- Clearance and student progress were tested.
- Academic terms, system settings, and audit logs were tested.
- Analytics CSV export was tested.

The following still require dedicated acceptance testing:

- Cross-department and cross-section privacy
- Firestore rules for every role
- Mobile behavior on the supported Expo SDK
- Full admin CRUD behavior
- Clearance immutability
- Backup and restore once implemented
- Manuscript-by-manuscript acceptance testing

---

## 10. Development Rules

1. Preserve existing Firebase data and schemas unless a migration is explicitly approved.
2. Do not modify backend or mobile files during a web-only UI task.
3. Do not begin mobile redesign work without the approved mobile `DESIGN.md`.
4. Keep OCR and AI requirement validation deferred until they are formally approved.
5. Test authentication, role routing, Firebase reads/writes, and affected workflows after every functional change.
6. Update this document after every meaningful system update.
7. Record known limitations honestly instead of marking incomplete behavior as complete.
8. Never commit service-account private keys or other backend secrets.

---

## 11. Future Update Format

Every future update should add an entry using this format:

```text
### YYYY-MM-DD — Short update title

Area: Web / Mobile / Backend / Firebase / Documentation

Implemented:
- What changed

Files or systems affected:
- Relevant paths or services

Verification:
- Tests or manual workflows completed

Known limitations:
- Remaining issues, if any

Next step:
- Planned follow-up work
```

---

## 12. Change Log

### 2026-09-11 — Initial project documentation created

Area: Documentation

Implemented:

- Added this root-level project documentation and change-log file.
- Recorded the current architecture, workflows, implemented features, partial features, deferred features, and remaining work.
- Documented the development and verification rules for future updates.

Verification:

- Confirmed the project contains separate web, mobile, backend, and Firestore-rules components.
- Confirmed the web test suite, web build, and backend syntax check previously passed.

Known limitations:

- This document describes the current known state; it does not itself implement pending features.

Next step:

- Add a dated entry whenever a feature or workflow is changed, tested, deferred, or completed.

---

### 2026-09-11 — Mobile Pre-deployment Document Submission Screen Redesign (Figure 39)

Area: Mobile (`PATHWAY-master`)

Implemented:

- Fully redesigned the Pre-deployment Document Submission Screen (`screens/RequirementsScreen.js`) to match Storyboard Figure 39 from the system manuscript (`PATHWAY-OJT-Management-System-with-AI-Analytics-1.docx`).
- Created a custom, zero-dependency vector icon component library (`components/Icons.js`) covering Menu, Bell, File, Upload, Trash, Refresh, Chat, CheckCircle, AlertCircle, and Sparkles.
- Created centralized design tokens (`theme.js`) defining PATHWAY Academic Navy (`#004B87`), Sky Blue accents (`#0284C7`), status badges (Verified, Required, Issue Detected), and elevation shadows.
- Implemented a 4-step progress stepper (`1: Doc Submission` active, `2: Company`, `3: Review`, `4: Approval`).
- Implemented all 5 standard Pre-deployment document cards with dynamic status states:
  - **Application Form**: Verified status with `app_form_signed.pdf`, size, trash remove action, and `✨ AI Validation: PASSED` pill badge.
  - **Updated Resume**: Required status with dashed dropzone, upload icon, and `⏳ Awaiting Upload` status indicator.
  - **Medical Certificate**: Issue Detected status with `med_cert_scan.jpg`, refresh re-upload action, and `⚠️ AI Flag: Date Illegible` banner.
  - **Endorsement Letter & Signed MOA**: Standardized upload dropzones.
- Integrated native file picking via `expo-document-picker`, simulated AI OCR scanning with status updates, Cloudinary file uploads, and Firestore sync.
- Added interactive Floating Chat Support Bubble (`💬`) with an AI Assistant guidance drawer modal.
- Added top navigation bar with Hamburger Sidebar Drawer and Notification Bell with unread badges.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-master/components/Icons.js`
- `PATHWAY-master/theme.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Executed `node --check screens/RequirementsScreen.js` — passed (exit code 0).
- Executed `node --check theme.js components/Icons.js` — passed (exit code 0).
- Verified compatibility with Expo bundler and Firestore user document structure.

Known limitations:

- Pre-deployment Step 2 (Company Details), Step 3 (Final Review / Figure 40), and Step 4 (Approval / Figure 41) will be connected as subsequent screens are redesigned.

Next step:

- Proceed to the next storyboard screen (e.g. Figure 40: Final Review Screen or Figure 42: Student Home Dashboard).

---

### 2026-09-11 — Requirements Workspace as Student Pre-deployment Dashboard

Area: Mobile (`PATHWAY-master`)

Implemented:

- Students with an approved account but incomplete or pending requirements now enter `RequirementsScreen` directly after login.
- Students with approved requirements continue to enter the full `StudentDashboard`.
- Students whose account is still awaiting account approval continue to see the account-review state.
- The requirements screen remains the student’s pre-deployment workspace while documents are being submitted or reviewed.
- Removed Student Dashboard, Daily Attendance & Logs, Progress Analytics, and Notifications navigation items from the requirements burger menu.
- Removed the duplicate sidebar notification entry while preserving the notification bell in the Step 1 document-submission header.
- Changed the Step 1 save action so it keeps the student in the requirements workspace instead of navigating away to the student dashboard.
- Reduced the burger menu action area to a single `Log out` button.

Files or systems affected:

- `PATHWAY-master/screens/LoginScreen.js`
- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Reviewed the login routing conditions for pending, incomplete, and approved student requirement states.
- Reviewed the requirements drawer to confirm that only `Log out` remains as an action.
- Confirmed the Step 1 notification bell remains in the document-submission screen.

Known limitations:

- Company Details, Final Review, and Approval steps remain unimplemented and are still represented by the existing Step 2–4 progress indicator.
- The visible AI/OCR validation states remain simulated and are not a production OCR service.

Next step:

- Test the three student login states on Expo Go SDK 54: account pending approval, requirements pending/incomplete, and requirements approved.

---

### 2026-09-11 — Removed Simulated AI Validation from Requirements

Area: Mobile (`PATHWAY-master`)

Implemented:

- Removed simulated AI/OCR scanning, automatic approval, filename-based issue detection, AI pass badges, and AI flag messages from `screens/RequirementsScreen.js`.
- New uploads now move directly to `submitted` and display `Pending Review` until a coordinator approves or rejects them.
- Existing coordinator-managed `approved` and `rejected` requirement states remain supported.
- Rejected documents now provide an ordinary `Upload Replacement` action without claiming automated validation.
- Removed the fake AI validation notifications and simulated assistant guidance that referred to document flags.
- Kept the notification bell, document picker, Cloudinary upload path, Firestore requirement updates, deletion flow, and coordinator review workflow unchanged.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed the requirements screen no longer contains simulated AI/OCR validation logic or `issue_detected` states.
- Confirmed uploaded files are persisted with `status: 'submitted'` and remain available for coordinator review.
- Confirmed the mobile requirements drawer still contains only `Log out`.

Known limitations:

- AI-assisted requirement validation and OCR remain deferred and are not represented as active functionality.
- Real coordinator rejection reasons continue to come from the coordinator review workflow and are not generated on the student device.

Next step:

- Test one new upload, one coordinator approval, and one coordinator rejection/resubmission using Expo Go SDK 54.

---

### 2026-09-11 — Mobile Upload Empty State and Native Back Navigation

Area: Mobile (`PATHWAY-master`)

Implemented:

- Updated empty requirement cards to clearly show `Submit a file` and `Not submitted` instead of an ambiguous waiting-only label.
- Kept the native document picker action on the empty upload area.
- Added Android hardware Back-button handling so the burger drawer closes first, and the notifications modal closes when it is open.
- Did not add an extra in-screen Back button.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed empty requirements still use the existing upload handler.
- Confirmed the native Back handler only consumes the event when the drawer or notifications modal is visible.
- Confirmed logout and the existing requirements workflow remain unchanged.

Known limitations:

- The native Back button behavior must be manually confirmed on the physical Android phone through Expo Go SDK 54.

Next step:

- Open the requirements screen, press the burger icon, press the phone Back button, and confirm the drawer closes and the requirements screen remains visible.

---

### 2026-09-11 — Dismiss Requirements Drawer by Tapping the Overlay

Area: Mobile (`PATHWAY-master`)

Implemented:

- Added a touchable backdrop behind the requirements burger drawer.
- Tapping the dimmed main-screen area now closes the drawer and returns the student to the requirements screen.
- Preserved the native phone Back-button behavior and the drawer's single `Log out` action.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed the backdrop is positioned behind the drawer card, so it receives taps only outside the sidebar.

Known limitations:

- The interaction should be manually confirmed in Expo Go on the physical phone.

Next step:

- Open the burger drawer and tap the shaded area to the right of it; the drawer should close immediately.

---

### 2026-09-11 — Support Android Gesture Back for Requirements Modals

Area: Mobile (`PATHWAY-master`)

Implemented:

- Added native `onRequestClose` handlers to the requirements burger drawer and notifications modal.
- Android system Back gestures, including edge-swipe navigation, now close the currently open modal before returning from the screen.
- Kept tap-outside dismissal for the burger drawer as an additional normal drawer behavior.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed each modal's native close request updates the same state used by its visible property.

Known limitations:

- Must be manually verified on the Android phone because Expo Go controls the final native gesture environment.

Next step:

- Open the burger drawer, swipe from the appropriate screen edge using the phone's Back gesture, and confirm only the drawer closes.

---

### 2026-09-11 — Responsive Requirements Workspace Layout

Area: Mobile (`PATHWAY-master`)

Implemented:

- Added responsive sizing to the Requirements screen using the device window width.
- Narrow phones under 360px now use smaller horizontal padding, a compact title, compact step labels, smaller cards, and a compact primary action.
- Wider devices at 600px and above now center the requirements content at a readable maximum width instead of stretching it edge to edge.
- Made the four-step tracker adapt its item widths so it remains within narrow screens.
- Prevented long file details from forcing uploaded-document rows wider than the screen.
- Adjusted the drawer width for compact phones and capped it on wider devices.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Reviewed responsive width branches for compact, standard, and wide device sizes.
- Confirmed the changes affect layout only; upload, Firestore, review, and navigation behavior are unchanged.
- Ran `npx expo export --platform web` successfully after the responsive changes.

Known limitations:

- Other mobile screens still need their own responsive pass as they are reviewed or redesigned.

Next step:

- Preview the Requirements screen in Expo Web at narrow and wide browser widths, then test it on at least one additional physical Android device if available.

---

### 2026-09-11 — Collapsible Requirement Cards and Vector Status Icons

Area: Mobile (`PATHWAY-master`)

Implemented:

- Made each requirement container clickable and collapsible.
- Collapsed cards now show only the requirement name, status badge, and expand indicator.
- Tapping a card reveals its upload area or existing-file actions.
- Preserved document picking, uploaded-file deletion, coordinator approval, rejection, and replacement-upload behavior.
- Replaced the remaining emoji-based bell, trash, refresh, chat, and sparkle visuals in the shared mobile icon library with vector-style React Native shapes.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-master/components/Icons.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed new requirement cards start collapsed and expand only after selection.
- Confirmed no emoji-based icons remain in the shared mobile icon components used by the requirements flow.

Known limitations:

- Other mobile screens may still contain text symbols or older icon implementations and should be reviewed during their own UI pass.

Next step:

- Test one empty requirement, one pending upload, one approved file, and one rejected file in Expo Web and on Android.

---

### 2026-09-11 — Hide Step Progress Fill on Initial Step

Area: Mobile (`PATHWAY-master`)

Implemented:

- Removed the filled 25% progress segment from the document-submission stepper while the student is on Step 1.
- Kept the step tracker and Step 1 indicator visible.

Files or systems affected:

- `PATHWAY-master/screens/RequirementsScreen.js`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Confirmed the progress-fill element is no longer rendered on the Step 1 screen.

Known limitations:

- Steps 2–4 are not connected yet, so their progress-fill behavior will be added when those screens are implemented.

Next step:

- Preview the Step 1 screen in Expo Web and confirm the tracker has no filled progress line.

---

### 2026-09-11 — Enabled Expo Web Preview

Area: Mobile (`PATHWAY-master`)

Implemented:

- Added Expo SDK 54-compatible `react-dom` and `react-native-web` dependencies.
- The mobile project can now be launched in a local browser with `npx expo start --web` for faster UI review and screenshot sharing.

Files or systems affected:

- `PATHWAY-master/package.json`
- `PATHWAY-master/package-lock.json`
- `PATHWAY-DOCUMENTATION.md`

Verification:

- Expo installed 19 packages, including the required web-rendering dependencies.

Known limitations:

- The install reports existing dependency-audit findings; they were not changed as part of enabling the local web preview.
- Browser file selection may differ slightly from Android's native document picker.

Next step:

- Run `npx expo start --web` in `PATHWAY-master` and open the localhost URL shown by Expo.
### 2026-09-11 — Step 2 Company Selection and Placement

Implemented the first Directory + Proposal workflow for student company placement.

- Added the mobile `Company` screen and route for Step 2.
- Students can search active directory companies, select one, or propose a new company.
- Added draft, pending review, needs revision, rejected, and approved placement states.
- Added eligibility protection: Step 2 redirects students to Requirements until requirements are approved.
- Pending submissions are read-only until coordinator review; returned or rejected proposals can be edited and resubmitted.
- Added `companies` and `companyProposals` Firestore rules without changing existing collections.
- Added coordinator web Company Placements review tab scoped by coordinator department and selected section.
- Coordinators can approve, request changes, or reject proposals with a reason and notify the student.
- Existing Step 3 and Step 4 remain locked; company directory administration remains deferred.

Files updated: `PATHWAY-master/App.js`, `PATHWAY-master/screens/CompanyScreen.js`, `PATHWAY-web/src/pages/CoordinatorDashboard.js`, `PATHWAY-web/src/pages/CompanyPlacementsTab.js`, and `firestore.rules`.
### 2026-09-11 — Pipeline step navigation update

- Students can now open Step 2 even when requirements are not submitted or are still pending coordinator review.
- Step 1 remains the document submission screen.
- Step 2 opens the company placement interface without bypassing coordinator approval rules.
- Step 3 (Review) and Step 4 (Approval) are clickable and show clearly marked coming-soon states because their workflows are not implemented yet.
- No Firestore schema, approval permission, or existing requirements workflow was changed.
### 2026-09-11 — Step 2 stepper navigation fix

- Made the stepper on the Company Placement screen interactive.
- Step 1 now returns to Document Submission.
- Steps 3 and 4 show temporary coming-soon messages until their screens are implemented.
- Added the missing horizontal stepper track behind the numbered circles.
### 2026-09-11 — Step 2 progress line color

- Added a PATHWAY blue active segment to the Step 2 progress line.
- The remaining pipeline track stays light gray to distinguish completed/current progress from future steps.
### 2026-09-11 — Requirement-dependent Step 2 progress

- Removed the always-visible blue progress segment.
- Step 2 now shows the blue progress line and completed Step 1 border only when every stored requirement is submitted or approved.
- Incomplete requirements keep the pipeline track inactive while still allowing the student to open Step 2.
### 2026-09-11 — Step 3 Final Review and Submission

- Added mobile `ReviewScreen` and registered the `Review` navigation route.
- Step 3 summarizes requirement statuses/files and the latest company placement proposal.
- Added read-only section edit links back to Requirements and Company Placement.
- Added validation for missing required documents and company/supervisor fields.
- Added `finalReviewRequests` submission records with requirement and company snapshots.
- Prevented duplicate pending final review submissions and added coordinator notifications.
- Added coordinator final-review request display and approve/request-changes/reject actions.
- Added Firestore access rules restricting students to their own requests and coordinators to their department.
- Step 4 remains a placeholder and is not activated.
### 2026-09-11 — Final Review UI consistency

- Matched the Review screen stepper to the Requirements and Company screens.
- Added consistent step labels, progress track, completed check marks, active state, and inactive approval state.
- Replaced the long comma-separated missing-item warning with readable itemized rows for narrow screens.
- Kept review data read-only and preserved the existing edit navigation.
### 2026-09-11 — Review stepper alignment correction

- Restored numbered circles on the Review stepper to match Step 2.
- Kept the completed circles blue without replacing their numbers with check icons.
- Shortened the Step 3 active progress line so it ends before the active circle and no longer overlaps it.
### 2026-09-11 — Step 4 Pre-deployment Approval

- Added the mobile Approval screen with pending, needs-revision, rejected, and approved states.
- Added the storyboard-style approved card and Enter Dashboard action.
- Connected Step 4 navigation from Requirements, Company, and Final Review.
- Coordinator approval now updates `finalReviewRequests` and the dedicated student `preDeploymentStatus` field without changing requirement records.
- Login and Student Dashboard routing recognize approved pre-deployment status.
- Updated Firestore rules so students cannot set approval status and coordinators can set it only within their assigned department.
- Added student notifications for coordinator approval decisions.

Verification: Expo web export completed successfully; coordinator web build remains covered by the existing production build check.

### 2026-09-14 — Approved Student Dashboard

Area: Mobile

Implemented:
- Replaced the approved student dashboard with a React Bits-inspired native layout.
- Added five functional tabs: Home, Logs, Progress, Notifications, and Profile.
- Added animated tab transitions, active-tab styling, unread notification indicators, and safe-area-friendly bottom navigation.
- Added responsive profile, hours, attendance, pending-actions, OJT-progress, company-placement, and recent-activity cards.
- Added data-driven dashboard metrics from existing user, attendance, logbook, and notification records.
- Replaced dashboard emojis with reusable native vector-style icons.
- Applied the student mobile palette using navy, electric blue, white surfaces, and yellow status accents.
- Preserved pre-deployment gates, existing navigation routes, Firebase collections, and approval routing.
- Kept the AI Insight card deferred because AI functionality is not implemented.

Files or systems affected:
- PATHWAY-master/screens/StudentDashboard.js
- PATHWAY-master/components/Icons.js
- PATHWAY-DOCUMENTATION.md

Verification:
- Existing data collections and routes remain unchanged.
- Dashboard calculations use existing Firestore records only.
- Expo React Native dependencies were not changed.

Known limitations:
- The React Bits Pro web block was not installed because this project is Expo React Native SDK 54.
- The dashboard currently uses a native recreation of the interaction pattern.
- Detailed Progress, Notifications, and Profile content continue to use their existing screens or read-only dashboard panels.

Next step:
- Run the mobile Expo Web export and device checks at narrow-phone, standard-phone, tablet, and web widths.

### 2026-09-14 — Student Navigation and Profile Settings

Area: Mobile

Implemented:
- Reduced the approved student bottom navigation to Home, Logs, Progress, and Profile.
- Removed the notification control from the dashboard header and bottom navigation.
- Added a Profile settings section for notification preferences, appearance, help, and privacy information.
- Added a reusable native settings icon and settings-row layout.
- Kept the existing Notifications screen and notification data workflow available without changing Firebase data.

Files or systems affected:
- PATHWAY-master/screens/StudentDashboard.js
- PATHWAY-master/components/Icons.js
- PATHWAY-DOCUMENTATION.md

Verification:
- Navigation remains limited to four bottom tabs.
- Existing notification records and notification screen were not deleted.
- No backend, Firebase schema, or dependency changes were made.

### 2026-09-14 — Logs Hub Refinement

Area: Mobile

Implemented:
- Expanded the Logs tab into a combined attendance and weekly logbook hub.
- Added OJT hours summary with progress and remaining-hours information.
- Added current-shift summary with time-in, time-out, hours, and missing-time-out warning.
- Added recent attendance records and recent logbook entries using existing Firestore data.
- Preserved the existing Log Today and Logbook workflows as the detailed action screens.
- Kept AI insights, GPS/geofencing, DTR OCR, and mismatch detection deferred.

Verification:
- Expo Web export completed successfully.

### 2026-09-14 — Logs UI Consistency Fix

Area: Mobile

Implemented:
- Analyzed the current PATHWAY-master Logs implementation and preserved its inline attendance workflow.
- Added the missing visual styles for OJT accumulation, progress, current shift, time-in/time-out controls, duration, attendance history, and status badges.
- Kept daily attendance inside the Logs tab and preserved the existing Firestore time-in, time-out, and hours-rendered updates.
- Kept weekly logbook actions and records in the same consistent card system.

Verification:
- Expo Web export completed successfully.
- No backend, Firebase schema, navigation route, or attendance/logbook mutation was changed.

### 2026-09-14 — Progress Analytics Screen Refinement

Area: Mobile

Implemented:
- Replaced the Progress tab placeholder with a storyboard-inspired progress analytics view.
- Added a navy total OJT hours hero with rendered, required, remaining, and completion values.
- Added attendance analytics for attendance days, completed shifts, missing time-outs, and verified days.
- Added requirement status and approved-document totals from the existing student record.
- Added logbook progress totals for submitted, approved, and pending entries.
- Added a coordinator clearance status card.
- Added navigation links to attendance, requirements, logbook, and the detailed Progress screen.
- Kept the storyboard AI performance insight deferred because AI is not implemented.

Verification:
- Expo Web export completed successfully.
- Existing Firestore reads, writes, navigation routes, and detailed Progress screen were preserved.

### 2026-09-14 — Global Message and Logbook Actions

Area: Mobile

Implemented:
- Added a floating message button visible on Home, Logs, Progress, and Profile.
- Connected the message button to the existing Notifications screen for coordinator and system updates.
- Added a floating plus button visible on the same four tabs.
- Connected the plus button to the existing Logbook screen for adding a weekly entry.
- Styled both actions consistently with the student dashboard palette and bottom navigation.

Verification:
- Expo Web export completed successfully.
- Existing notification and logbook workflows were reused without schema or backend changes.
- No Firebase schema, backend API, or attendance/logbook mutation behavior was changed.

### 2026-09-14 — Inline Daily Attendance Controls

Area: Mobile

Implemented:
- Confirmed and retained daily time-in, time-out, duration, and attendance history directly inside the Logs tab.
- Kept the separate Attendance screen route available for compatibility, but the student Logs workflow no longer depends on opening it.
- Reused the existing attendance Firestore mutations and hours-rendered update behavior.
- Kept the Logs UI consistent with the OJT accumulation, current-shift, history, and weekly-logbook cards.

Verification:
- Expo Web export completed successfully.

### 2026-09-14 — Editable Student Profile Picture

Area: Mobile

Implemented:
- Added a tappable profile picture editor to the student Profile tab.
- Added image selection for JPEG, PNG, and WebP files through the existing document picker.
- Uploaded selected images using the existing Cloudinary environment configuration.
- Saved the returned image URL as `profilePhotoUrl` on the existing student user document.
- Added initials fallback, image preview, edit badge, and profile-photo guidance text.

Verification:
- Expo Web export completed successfully.
- Existing authentication, Firestore collections, and student navigation were preserved.

### 2026-09-14 — Functional Student Settings View

Area: Mobile

Implemented:
- Made the dashboard header settings gear open a dedicated Settings view instead of only switching tabs.
- Added account information, notification preferences, appearance, help, privacy, and sign-out sections.
- Added a Profile link from Settings and native Android back handling to return from Settings to Profile.
- Made the Profile settings card clickable as an additional entry point.

Verification:
- Expo Web export completed successfully.
- No backend, Firebase schema, or dependency changes were made.

### 2026-09-14 — Simplified Student Header

Area: Mobile

Implemented:
- Removed the redundant burger panel from the approved student dashboard.
- Centered the PATHWAY logo in the header.
- Kept settings and logout inside the Profile tab to avoid duplicate account navigation.

Verification:
- The student dashboard now uses the four-tab navigation and a simplified header.
- No backend, Firebase schema, or dependency changes were made.

### 2026-09-14 — Student Header Settings Control

Area: Mobile

Implemented:
- Replaced the student initials/profile control beside the notification button with a settings gear icon.
- The settings control opens the Profile tab, where account preferences and logout remain available.
- Preserved the notification button and existing notification route.

Verification:
- Header controls now distinguish notifications from settings without duplicating the profile tab.
- No backend, Firebase schema, or dependency changes were made.

---

### 2026-09-14 — Inbox and Messages UI

Area: Mobile — `screens/NotificationsScreen.js`, `screens/StudentDashboard.js`

Implemented:
- Converted the existing Notifications route into an Inbox-style screen with Notifications and Messages tabs.
- Preserved the existing notification query, refresh behavior, unread state, and mark-as-read Firestore update.
- Added search for notifications and conversations.
- Added a conversation list and read-only chat detail view using existing message-like notification records (`senderId`, `senderName`, or `type: message/chat`) without introducing a new collection or schema.
- Updated the dashboard message floating action to open the Messages tab directly; the header bell continues to open Notifications.
- Added native back handling so Android back gestures close an open conversation before leaving the Inbox.
- Kept the current PATHWAY navy, sky-blue, white-card visual system and reusable icon components.

Limitations:
- Direct message sending is intentionally deferred because the current project has no direct-message collection or write workflow. The UI shows a clear read-only connection notice until that backend capability is approved.

Verification:
- Existing notification reads and writes remain unchanged.
- No backend, Firebase schema, authentication, or dependency changes were made.

Follow-up:
- Swapped the Inbox tab order to Messages first and Notifications second, matching the requested layout.
- Search remains client-side over the currently loaded Firestore records: notification title/message fields for Notifications, and conversation name/latest message fields for Messages.
- Enlarged the global Messages and Add Logbook floating action buttons, increased their spacing, and raised their position to keep them clear of the bottom navigation.
- Refined the conversation detail view with a native Bubble-style message surface: content-sized 80%-maximum bubbles, sender alignment, grouped corners, sender labels, timestamps, read indicators, and PATHWAY tinted/unread variants.
- Added the surrounding native Message-style layout with sender avatars, header labels, aligned content, and footer metadata around each bubble.

### 2026-09-14 — PATHWAY Logo Asset

Area: Mobile student and pre-deployment screens

Implemented:
- Replaced the letter-based brand placeholders with `PATHWAY-master/assets/pathway-logo1.png` in Login, Student Dashboard, Requirements, Company, Review, and Approval headers.
- Kept the existing PATHWAY wordmark text beside the logo where the header layout uses a combined mark.
- Added responsive logo sizing for login, narrow phones, and standard mobile headers.

Verification:
- No backend, Firebase schema, authentication, or navigation behavior was changed.

Follow-up:
- Removed the orange accent fill from the dashboard logo container so the supplied logo renders cleanly without an orange border.
- Enlarged the dashboard logo and applied a larger rounded container/image radius for a clearer branded mark.

---

### 2026-09-14 — Logbook Screen UI Redesign

Area: Mobile — `screens/LogbookScreen.js`

Implemented:
- Redesigned the Weekly Logbook screen to match the Daily Logs & Attendance UI inspiration (Figure 43 of the PATHWAY manuscript).
- Replaced the plain entry list with **left-accent entry cards**: each card has a colored left bar matching the entry's review status (orange = Under Review, green = Good, red = Needs Revision), a status dot badge, and a metadata row showing relative time and hours rendered.
- Added a **Stats Summary Bar** at the top of the scroll area displaying total entries, total hours logged, and approved entry count.
- Added an **AI Insights Card** that generates contextual feedback text based on the student's current logbook state (approval rate, average weekly hours, or onboarding prompt for empty state).
- Added a **Manual DTR Upload Card** at the bottom of the list with a dashed upload tap area, accepted file type labels (JPEG, PDF, PNG), and an AI Verification badge — matching the manuscript mockup.
- Upgraded the New Entry Modal to a **bottom sheet** style with a drag handle, a pill-style week indicator in the subtitle, a clock-icon hours field with "hrs" unit label, and inline AI refine button showing "Optional" label.
- Added an **empty state** with a primary-colored icon circle and a direct "Add First Entry" shortcut button.
- Added `ArrowRightIcon` and `InfoIcon` to the existing SVG icon imports used in the modal submit row.
- Preserved all existing Firebase Firestore read (`getDocs`, `orderBy`) and write (`addDoc`) operations, AI backend refinement call, week number calculation, `getWeekRange` helper, and status configuration map exactly as before.

Verification:
- All existing logbook data structures (`weekNum`, `weekRange`, `rawNotes`, `refined`, `aiRefined`, `hours`, `status`, `createdAt`) are read and written identically.
- No Firebase schema, backend API endpoint, navigation route, or authentication logic was changed.
- The screen correctly imports all new icons from the existing `components/Icons.js` SVG library.

---

### 2026-09-14 — Logs Tab (Training Logs Panel) UI Fix

Area: Mobile — `screens/StudentDashboard.js` → `LogsPanel` component

Problem:
- Raw ISO-8601 timestamps (e.g. `2026-08-31T05:56:14.161Z`) were rendered directly in the Current Shift and Recent Attendance sections, causing them to appear concatenated and unreadable.
- Decimal hours (e.g. `0.02h`, `0.05h`) were displayed with no unit formatting.
- The shift card showed three inline values with no visual separation between columns.
- Logbook status was shown as a raw string ("pending") with no badge styling.

Implemented:
- Added `formatTime(value)` helper that converts any ISO timestamp or time string to a human-readable 12-hour format (e.g. `8:45 AM`) using `toLocaleTimeString`.
- Added `formatHours(h)` helper that converts decimal hours to a readable duration (e.g. `2h 30m`, `45m`) with `Math.floor` and `Math.round` for minutes.
- Rewrote the **OJT Hours hero card** with a large primary number display, a percentage pill badge (green when complete, navy when in progress), and a cleaner progress track.
- Rewrote the **Current Shift card** as a centered three-column layout (TIME IN · TIME OUT · DURATION) separated by thin vertical dividers, with muted dashes for empty values and a contextual warning banner for open or missing shifts.
- Rewrote **Recent Attendance rows** to use `formatTime()` for time-in and time-out, `formatHours()` for duration, and a colored dot (green = verified, amber = pending) beside each date.
- Rewrote **Recent Logbook Entry rows** with colored status dots and pill badges ("Good", "Review", "Revision") replacing the raw status string.
- No Firebase schema, Firestore queries, navigation routes, or authentication logic was changed.

---

### 2026-09-14 — Notification Card UI Refinement

Area: Mobile — `PATHWAY-master/screens/NotificationsScreen.js`

Implemented:
- Restyled notification rows into compact stacked cards inspired by the supplied reference.
- Added a leading circular icon surface, stronger notification title hierarchy, two-line message preview, muted timestamp, and clear unread marker.
- Added a subtle PATHWAY sky-blue left accent for unread notifications while preserving the light mobile theme.
- Preserved the existing Firestore notification query, tap-to-mark-as-read behavior, empty states, search, and Messages tab.

Verification:
- Notification content and read state remain data-driven from the existing notification records.
- No Firebase schema, backend endpoint, navigation route, or authentication logic was changed.

---

### 2026-09-14 — Placement Ownership and Coordinator-Controlled Changes

Area: Mobile and Coordinator Web — company placement workflow

Implemented:
- Kept the student Step 2 flow for selecting an existing company or proposing a new company.
- Added a read-only placement explanation and `Request placement change` action to the student Profile dashboard.
- Added a separate student change-proposal path for approved placements. The existing official placement remains visible while the new proposal is reviewed.
- Coordinator approval now copies the approved company, supervisor, internship, schedule, and placement metadata into the student's official user record.
- Removed direct student permission to update the official `company` field in Firestore rules.
- Preserved coordinator review reasons and placement notifications.

Ownership rules:
- Students submit proposals and change requests.
- Coordinators validate, assign, approve, reject, or request changes.
- The Profile dashboard displays official placement data as read-only.
- Administrators retain company directory management responsibilities.

---

### 2026-09-14 — Dedicated Student Coordinator Messaging

Area: Mobile `NotificationsScreen.js`, Coordinator Web `MessagesTab.js`, and `firestore.rules`

Implemented:
- Added a dedicated `messages` Firestore collection for student–coordinator direct conversations.
- Added participant-based conversation loading, search, conversation detail, message composer, send state, and unread/read state on mobile.
- Added a Messages workspace to the Coordinator Web dashboard for assigned-section conversations and replies.
- New messages create an existing notification preview while the dedicated message record remains the conversation source of truth.
- Kept the existing Notifications tab and legacy notification-derived message fallback available for older records.
- Added empty, loading, and failed-send handling without changing the existing notification workflow.

Message fields:
- `conversationId`, `participantIds`, `studentId`, `coordinatorId`
- `senderId`, `senderRole`, `senderName`
- `recipientId`, `recipientRole`, `recipientName`
- `body`, `message`, `read`, `readAt`, `createdAt`, and `type`

Security behavior:
- Students may create messages only to the coordinator assigned through their section.
- Coordinators may create messages only to students in their assigned sections.
- Participants may read their own conversation messages.
- Only the recipient may update read metadata.
- Clients cannot change sender identity through message updates.
- Supervisor email/MFA communication remains deferred to a later phase.

Verification procedure:
- Use one student account and its assigned coordinator account.
- Send a coordinator message, confirm it appears in the student Messages tab, search it, open it, and reply.
- Confirm the coordinator receives the reply, read state changes, notifications are created, and conversations persist after refresh.
- Confirm a student cannot read or message an unrelated coordinator or student.

---

### 2026-09-14 — Logs Calendar Strip

Area: Mobile — `PATHWAY-master/screens/StudentDashboard.js` → `LogsPanel`

Implemented:
- Added a responsive weekly calendar strip below the OJT Accumulation card and before the selected-day shift card.
- Added month/year context, previous/next week controls, selected-date highlighting, today highlighting, and record dots for dates with attendance or logbook activity.
- Selecting a date filters the shift summary, attendance history, and logbook entries to that day.
- Added a clear `No logs recorded for this day.` state for dates without activity.
- Preserved Punch Time In, Log Time Out, and the Weekly Logbook navigation; punch actions remain available for the current day only.
- Added local date-key helpers to avoid UTC date shifts on mobile devices.

Verification:
- Expo Web export completed successfully with the calendar implementation.
- Existing Firestore attendance and logbook collections, fields, write operations, and navigation routes remain unchanged.

### 2026-09-14 — Logs Calendar Spacing Adjustment

- Reduced the vertical gap between the OJT Accumulation card and the calendar card for a tighter, more consistent Logs layout.
- Kept the shared scroll spacing and all calendar interactions unchanged.

---

### 2026-09-14 — Unread Notification Highlight Refinement

Area: Mobile — `PATHWAY-master/screens/NotificationsScreen.js`

Implemented:
- Replaced the unread notification's colored left border with a full-card pale-blue highlight inspired by the supplied reference.
- Moved the unread indicator to the right side of the card as a distinct blue dot.
- Kept the notification title, message preview, timestamp, icon, search behavior, and tap-to-mark-as-read flow unchanged.

Verification:
- Read and unread notifications continue using the existing Firestore data and state handling.
- No Firebase schema, backend endpoint, navigation route, or authentication logic was changed.

---

### 2026-09-15 — Web Alert Dialog Confirmation Component

Area: Web admin and coordinator portals (`PATHWAY-web`)

Implemented:

- Added a reusable native React `AlertDialog` component with an accessible alert-dialog role, modal overlay, Escape-key cancellation, cancel/confirm actions, busy state, and danger/warning visual tones.
- Added a matching warning icon to the existing SVG icon set without adding Radix, shadcn, or another web dependency.
- Replaced the previous browser confirmation/custom confirmation behavior for consequential actions including:
  - Removing an authorized student ID from the coordinator roster.
  - Deleting a section requirement from the checklist.
  - Rejecting a student registration.
  - Rejecting a logbook entry.
  - Approving, requesting changes, or rejecting company placement and final-review submissions.
  - Deleting an administrator profile.
- Existing validation, Firestore writes, notifications, audit calls, and reason requirements remain unchanged. The dialog is a confirmation layer, not a replacement for authorization rules.

Files affected:

- `PATHWAY-web/src/components/AlertDialog.js`
- `PATHWAY-web/src/components/Icons.js`
- Coordinator and administrator action tabs in `PATHWAY-web/src/pages/`

Verification:

- `npm run build` completed successfully in `PATHWAY-web`.
- Confirmed the component is rendered only when an action is pending and disables duplicate confirmation while saving.

Known limitations:

- Firestore security rules and role-based authorization remain the final protection for destructive and review actions.
- Manual browser acceptance testing is still required for focus behavior, Escape handling, mobile-width layouts, and every coordinator/admin action.

---

### 2026-09-15 — Coordinator Firestore Scope and Runtime Error Fix

Area: Web coordinator portal and Firestore rules

Implemented:

- Scoped coordinator company-placement and final-review reads/writes by the coordinator-owned `sectionId`, using the section's `coordinatorId` as the authorization source.
- Updated the coordinator placement portal to query the selected section directly instead of relying only on department equality.
- Added readable in-app permission and connection error states for Company Placements and Messages instead of leaving the user with an uncaught runtime error overlay.
- Updated Analytics to fall back to Firestore-derived cohort metrics when the optional backend analytics service is unavailable.

Required deployment step:

- Deploy the updated root `firestore.rules` to the Firebase project before testing the coordinator portal. The local source change alone cannot change the rules currently enforced by Firestore.

Verification:

- Web production build completed successfully after the rule/query and fallback changes.

Known limitations:

- Firestore rule deployment and authenticated cross-section acceptance testing still need to be performed against the live `pathway-57400` project.

---

### 2026-09-28 — Security-First Completion Phase (Local Changes)

Scope: security foundations for student registration, requirements, attendance, coordinator assignment, final review, messaging, and Firestore authorization.

Implemented locally:

- Removed the backend's in-project service-account dependency. Firebase Admin now uses Application Default Credentials through `PATHWAY-backend/firebaseAdmin.js`; the bundled `PATHWAY-backend/serviceAccountKey.json` was removed and ignore patterns were added.
- Added deployment guidance in `PATHWAY-backend/SECURITY.md`. Local development must use credentials stored outside this project; hosted deployment should use workload identity or an attached runtime service account.
- Restricted backend CORS to configured origins (with localhost development defaults), capped JSON request bodies, added in-process rate limits, and protected logbook refinement with Firebase ID-token authentication, student-only authorization, and input bounds.
- Moved student registration to an authenticated server operation that checks department roster eligibility, prevents duplicate student-ID claims, claims the roster record, and creates the student profile atomically.
- Moved requirement submission/removal and attendance punches behind authenticated server endpoints. Students no longer directly update their requirement map, attendance records, or rendered-hours field.
- Moved section assignment to a server operation that verifies coordinator ownership, student department, and unassigned state.
- Moved coordinator registration approval/rejection and requirement review decisions to authenticated, rate-limited server transactions. These operations now create their notifications and authoritative audit records server-side; the coordinator web UI no longer writes those protected student fields directly.
- Moved Step 4 final-review decisions to a server transaction. It validates the assigned student and required document statuses, records the coordinator/reason/time, sets `preDeploymentStatus` on approval, and writes the student notification atomically.
- Aligned the coordinator's default pre-OJT checklist IDs with the five default documents used by the student requirements screen. Final approval now requires every configured/default required document to be `approved`.
- Updated student routing/dashboard guards so attendance and dashboard features remain unavailable until `preDeploymentStatus` is approved.
- Tightened Firestore rules for student profile reads/updates, roster privacy/claims, section ownership, logbook review, attendance writes, notification recipients, message participants and length, company proposals, final-review resubmission, and protected approval/hour fields.
- Aligned coordinator registration queries and student assignment UI with the department/section restrictions; removed direct coordinator profile writes for registration and requirement decisions.

Files and areas changed:

- Root `firestore.rules` and `.gitignore`.
- Backend credential setup, API routes, helper scripts, and new `PATHWAY-backend/SECURITY.md`.
- Mobile registration, requirements, attendance, dashboard, and backend API helper.
- Web coordinator registration, section assignment, notifications, and final-review decision actions.

Verification status:

- Backend JavaScript syntax check passed (`node --check PATHWAY-backend/server.js`).
- Production web build (`PATHWAY-web`: `npm run build`) completed successfully.
- Expo Web export (`PATHWAY-master`: `npx expo export --platform web`) completed successfully.
- Expo Android JavaScript bundle export (`npx expo export --platform android`) completed successfully; this is not a signed/native Android application build.
- Firebase rules compiled and the local emulator-backed security suite passed; see the updated results below.
- The live Firebase rules have not been changed by local edits. Do not deploy until the checks above pass and the live project configuration is confirmed.
- Firebase project-owner access is required to revoke the removed service-account key. The key may also exist in Git history or other copies; this workspace has no Git metadata, so history could not be checked.

Still pending in the completion order:

1. Have the Firebase project owner review and deploy the tested Firestore rules/backend configuration to the confirmed intended Firebase project, then perform live role-based acceptance checks.
2. Revoke/rotate the exposed service-account credential in Google Cloud IAM and verify no other copy remains.
3. Finish endorsement issuance: adopt the institution's approved letter wording and authorized signatory, migrate or remove any previously uploaded public endorsement assets, verify protected signed-copy access with real accounts, and implement email dispatch plus delivery tracking. New endorsement uploads now use authenticated Cloudinary delivery; placement history, draft preparation, and coordinator approval reconciliation are implemented.
4. Complete durable student–coordinator chat authorization and verification, supervisor OTP/email/MFA, and email announcements.
5. Implement geofence configuration and review, DTR upload/OCR discrepancy handling, attendance trend/risk analytics, and journal competency/sentiment analysis.
6. Complete reports, backups/restore, end-to-end server-generated audit coverage, clearance freezing, and term-specific settings.
7. Decide whether staff mobile workflows are required; current staff portals are web-based.

### 2026-09-28 — Local Emulator Security Test Harness

- Added a Firebase Emulator Suite configuration for Firestore rules and Auth, pinned to the non-production `demo-pathway-security` project ID. No production Firebase project is selected or deployed by this setup.
- Added a backend `npm test` command that starts the emulators, runs the security suite, and shuts the emulators down. Firebase CLI configuration is isolated in a temporary directory for each run.
- Added Firestore rules tests for student profile ownership and protected fields, coordinator section scope, admin limits, attendance write denial, notification ownership, message participants/read state, and final-review submission/decision boundaries.
- Added authenticated backend endpoint tests for unauthenticated and wrong-role denial, cross-section denial, roster-backed registration, coordinator registration/assignment/document decisions, and final-review rejection until requirements are approved followed by approval, audit fields, dashboard status, and student notification.
- Backend JavaScript syntax checks passed for `server.js`, `firebaseAdmin.js`, and `security-tests/security.test.js`.
- Java 21 was found at the installed Microsoft JDK path and added to the test process PATH. The runner downloads/caches emulator binaries inside the workspace and uses only the `demo-pathway-security` project.
- `npm test` from `PATHWAY-backend` passed all 11 emulator-backed tests (11 passed, 0 failed). Covered student ownership/protected fields, coordinator section boundaries, admin limits, attendance write denial, notification/message permissions, final-review submission boundaries and decision reasons, health endpoint behavior, unauthenticated/wrong-role/cross-section backend denials, roster-backed registration, assignment, requirement decisions, final approval/status/notification behavior, and supervisor evaluation-link scope/validation/single-use behavior.
- The test run exposed and fixed a Firestore rules evaluation issue around optional email claims, emulator Admin SDK initialization without ADC, test data incorrectly marking a new applicant as approved, and test helper snapshot handling.
- Regression checks passed: `PATHWAY-web` production build, web Jest test (1 passed; existing React `act(...)` warning remains), Expo Web export, and Expo Android JavaScript bundle export. The Android export is not a signed/native Android application build.
- All validation was local. No Firestore rules or backend configuration were deployed to the live Firebase project.
- Installing Firebase test tooling reported 12 dependency audit findings overall (10 moderate, 2 high); `npm audit --omit=dev` separately reports 9 production-tree findings (7 moderate, 2 high). npm reports available fixes, but they were not auto-applied because a broad dependency-tree update needs its own compatibility verification before shipping.

Important deployment notes:

- Set `CORS_ALLOWED_ORIGINS`, Firebase project/ADC, and `ANTHROPIC_API_KEY` in deployment secrets. Do not set privileged secrets in Expo/React client environment variables.
- Requirement-document and profile-photo uploads now use backend-issued, one-hour, single-use Cloudinary signatures. The backend verifies Cloudinary's response signature and retrieves authoritative asset metadata (resource type, format, byte count, version, and URL) before persisting the file reference. Client-supplied URLs and sizes are not trusted, and students cannot directly update `profilePhotoUrl` in Firestore.
- Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in backend deployment secrets before enabling these flows. The existing account-level unsigned preset is not disabled by this code change; an owner should disable it after checking that no other client still uses it. Emulator security tests use fake Cloudinary credentials and never contact Cloudinary.
- Attendance time is server-recorded but still lacks geofence/DTR evidence and an implemented coordinator attendance-review queue; those remain separate manuscript features.

Next security actions:

1. Firebase project owner to verify the target Firebase project and deploy reviewed rules/backend configuration after reviewing the local changes.
2. Perform live student/coordinator/admin acceptance tests, including explicit cross-section denials.
3. Revoke and rotate the previously exposed service-account credential in Google Cloud IAM and verify no other copies remain.

### 2026-09-28 — Cloud Run Backend Preparation

- Added a Node.js 22 container definition for the Express API and a Docker ignore list that excludes `.env` files, service-account keys, local emulator caches, and test files.
- Added a minimal `/healthz` endpoint for service smoke checks and configured Express to trust one forwarded proxy hop only when running on Cloud Run, so request-IP throttling can use the client address.
- Documented Cloud Run identity permissions, runtime configuration, CORS origins, Secret Manager use, client URL updates, pricing/budget review, and the requirement to validate the live backend before deploying stricter Firestore rules.
- Added an emulator-backed health endpoint test.
- Evaluation-link tests now confirm only assigned coordinators can create links, raw tokens are not stored, only the creating coordinator sees the link in their list, ratings/comments are validated, submissions are single-use, and successful submission notifies the student. Final-review tests confirm revision/rejection reasons are required and coordinators cannot act across assigned sections.
- Evaluation submissions now validate the exact five form criteria and bounded comments, rate-limit public token endpoints, and atomically mark a link used with its student notification to prevent replay/race double submissions.
- Updated emulator result: all 11 tests pass. Cloud Run itself has not been created or deployed; the owner must configure Google Cloud billing/APIs and the runtime service identity, then provide/use the resulting HTTPS service URL. Docker is not installed in the development environment, so the container image was not locally built.

### 2026-09-28 — Secure Cloudinary Uploads

- Replaced unsigned direct Cloudinary uploads for requirement documents and student profile photos with short-lived backend-issued upload signatures and unique, student-scoped public IDs.
- The backend stores one-use upload intents, verifies Cloudinary response signatures, then queries the authenticated Cloudinary Admin API and checks actual resource type, permitted format, secure URL, version, and byte count (maximum 5 MB) before updating Firestore.
- Requirement/profile-photo upload intents are inaccessible to clients through Firestore rules; student profile photo URLs can now only be written through the authenticated backend. Requirement approval state cannot be overwritten through the upload endpoint.
- Added emulator coverage using fake Cloudinary credentials and a local mock Admin API. It verifies authorization role checks, successful metadata validation and persistence, rejection of URL/size spoofing and forged signatures, and replay denial.
- Validation passed: backend syntax checks, Expo Web export, Expo Android JavaScript bundle export, web app test (1 passed), and web production build. The existing React `act(...)` test warning remains. No actual Cloudinary account or upload was contacted.
- Deployment follow-up: set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` as backend-only secrets. Disable the old unsigned Cloudinary preset in the Cloudinary console only after confirming no other app depends on it. Live Firebase/Cloudinary configuration and deployment were not changed.

### 2026-09-28 — Student Workflow Emulator Verification

- Extended the isolated Auth/Firestore emulator suite with student-owned logbook create/read restrictions, coordinator-only logbook review, company proposal draft/submission and section-scoped coordinator review, and read-only company directory checks.
- Added backend attendance time-in/time-out checks for pre-deployment eligibility, duplicate punch rejection, server-calculated hours, and user-hour aggregation. These tests use emulated identities and do not write to the live Firebase project.
- Latest result: all 14 emulator-backed tests pass. This verifies backend/rules authorization behavior, not a full mobile UI flow or live production project configuration.
- The project owner confirmed deletion of the active Firebase Admin service-account key from IAM. The application uses ADC locally; no replacement JSON key was created. Copies outside the current workspace and unavailable Git history remain unverified.

### 2026-09-28 — Admin Boundary Emulator Verification

- Added Firestore emulator checks for system settings and academic-term reads (coordinator/admin only), server-only writes, and admin-only audit-log reads with all client writes denied.
- Added backend tests for admin-only settings updates and academic-term management, validation of impossible calendar dates and non-boolean `isActive`, server-generated settings audit records, and admin-only coordinator provisioning.
- Disabled the client-authored `/audit-log` operation. Audit records must be created by the authorized server operation; the web `recordAudit` helper is temporarily a no-op for legacy direct-client actions. This prevents client-forged administrative events, but means those legacy actions are not yet audited until migrated to authenticated backend operations.
- Fixed academic-term date validation to reject dates that JavaScript would otherwise normalize (for example, February 31).
- `PATHWAY-backend`: `npm test` passed all 17 emulator-backed tests (17 passed, 0 failed). The suite uses only the `demo-pathway-security` Auth/Firestore emulators; no live Firebase services were used or deployed.
- At the time of this entry, account activation, clearance, and section/requirement mutations were still pending migration; these were subsequently moved to audited backend operations in the entry below.

### 2026-09-28 — Server-Owned Admin and Coordinator Mutations

- Replaced direct Firestore writes in the web UI for admin student-account activation, coordinator clearance approval, section creation, and section requirement seeding/creation/deadline changes/deletion with authenticated backend operations.
- Account activation is admin-only and student-only. Clearance is coordinator-section-scoped and rechecks account, requirement, and rendered-hour eligibility on the server; clearance status, student notification, and audit event are written in one Firestore transaction.
- Section mutations are coordinator-only and bound to the coordinator's profile department/owned section. Section creation derives the active academic term on the server. Requirement mutations and their audit events commit together.
- Tightened Firestore rules so clients can no longer create/update/delete sections or mutate section requirement definitions directly. Existing reads remain available to admins, assigned coordinators, and enrolled students as specified by the rules.
- Added emulator assertions for denied direct section/checklist writes, wrong-role/cross-section denials, readiness checks, successful mutation persistence, and audit/notification records.
- Latest `PATHWAY-backend` emulator result: 20 tests passed, 0 failed. Backend and browser remain unconnected to a live deployment; no rules were deployed.
- Subsequent entries record the remaining client-write audit and the additional server-owned messaging and announcement paths.

### 2026-09-28 — Server-Owned Logbook, Placement, and Roster Decisions

- Migrated coordinator logbook approval/rejection, company-placement review, and authorized-roster activation/deactivation from direct web Firestore writes to authenticated backend endpoints.
- Each endpoint rechecks the coordinator's role and current section/department ownership on the server. Placement decisions additionally verify the proposal still belongs to the student's current section and is pending; logbook review rejects stale/non-pending entries.
- Each decision and its notification/audit record now commit together in a Firestore transaction. Placement approval updates the student's official placement fields only as part of the same transaction. Roster removal deactivates the row instead of deleting it, preserving claimed registration history; attempts to overwrite a claimed ID or another department's roster are rejected.
- Tightened Firestore rules to deny direct coordinator writes to logbook decisions, company-proposal decisions, and roster records. Student draft/submission operations and existing scoped reads remain available; admin roster management remains an admin-only rules path.
- Updated registration validation to support existing hyphenated student ID formats (for example `21-00123`) as well as alphanumeric IDs, while requiring IDs to match the roster before account creation.
- Added emulator tests for authentication/role/section boundaries, invalid/stale decisions, placement approval persistence, notification/audit atomicity, roster batch input, claimed IDs, department-scoped deactivation, and hyphenated-ID registration.
- Validation: backend syntax checks passed; `PATHWAY-backend` emulator suite passed all 23 tests (23 passed, 0 failed); `PATHWAY-web` production build completed successfully.
- These changes are local only. Firestore rules and backend have not been deployed to the live Firebase project; production deployment and live role-based acceptance remain owner-level actions.

### 2026-09-28 — Remaining Client-Write Security Audit

- Restricted `/users/{userId}` updates so administrators can edit only their own basic profile fields; an administrator can no longer mutate another user's profile through the client. Disabled direct user-profile deletion for every role because deleting only the Firestore profile would orphan its Firebase Authentication identity and related data.
- Removed the administrator self-delete control, replacing it with a notice that account removal needs coordinated deprovisioning. There is intentionally no account-deletion endpoint yet.
- Added authenticated `POST /messages` for both student-to-coordinator and coordinator-to-student messages. The backend derives sender identity/role/name, checks the current section coordinator and department, enforces a 4,000-character limit and per-user rate limit, and transactionally creates the message and recipient notification. Web and mobile chat composers now use this endpoint; direct client message creation is denied by Firestore rules. Recipient read-state updates remain allowed.
- Moved coordinator announcement broadcasts to authenticated `POST /coordinator/announcements`. The endpoint validates ownership of the selected section, limits title/body and rate, caps a single atomic broadcast at 450 recipients, and writes recipients' notifications plus an audit event in one transaction. Direct client notification creation by coordinators and admins is disabled.
- Tightened student-created placement/final-review notices: a student may notify only the coordinator assigned to their own section, with bounded text and only the `placement` or `review` notice types. Student-owned proposal/final-review submissions and recipient-owned notification/message read-state updates remain client writes protected by Firestore rules.
- Added emulator tests for administrator profile update/delete boundaries, client message/notification write denial, assigned-pair chat, cross-section denial, atomic message notifications, and section-bound announcement fan-out/audit. `PATHWAY-backend` emulator suite: 25 passed, 0 failed.
- Validation passed: backend syntax checks; PATHWAY Web production build; PATHWAY Web test (1 passed; the existing React `act(...)` warning remains); Expo Web export; Expo Android JavaScript bundle export. Expo exports are JavaScript bundles, not signed/native Android builds.
- Remaining limitation: placement and final-review submission documents are still written directly by the owning student under restrictive rules; their companion notices are bounded and section-targeted but are not yet rate-limited by a dedicated submission endpoint. This remains a reasonable next local hardening task.
- All changes and tests are local against the `demo-pathway-security` emulators. No Firebase rules or backend deployment occurred.

### 2026-09-29 — Server-Owned Student Placement and Final-Review Submissions

- Replaced direct student Firestore writes for company-placement proposals and final-review submissions/resubmissions with authenticated `POST /student/company-proposals` and `POST /student/final-reviews` operations.
- The backend derives student identity, display name, department, section, and assigned coordinator from authenticated/server records. It validates account and section status, accepted proposal states, date/email/string bounds, required submission fields, and active directory-company selections; directory company details are copied from the canonical company record rather than trusted from the client.
- Final-review submission now checks approved official placement and required section documents, derives the requirement/company snapshots from current server records, verifies any linked approved placement proposal, and blocks duplicate pending requests. Revision and rejection states can be resubmitted without allowing the student to choose the reviewer or alter the official placement snapshot.
- Submission, coordinator notification, and audit entry are written atomically. Student endpoints are rate-limited (30 placement saves and 12 final-review submissions per user per hour); notification and audit content is generated server-side.
- Updated mobile Company and Final Review screens to call the authenticated backend API. Final Review now displays the student's official approved placement rather than a newer pending change proposal, and supports resubmitting a rejected request.
- Tightened Firestore rules: clients retain scoped reads for placement/final-review records and recipient-owned notification read-state updates, but can no longer create/update/delete company proposals or final-review requests, or create notifications. Existing coordinator decision routes remain the only path for placement and final-review decisions.
- Expanded emulator coverage for unauthenticated/wrong-role and unapproved-account denials, cross-student proposal access, malformed dates, spoofed ownership/coordinator fields, canonical directory values, duplicate pending final reviews, approved placement snapshots, coordinator revision/resubmission, and atomic notification/audit creation. Direct Firestore writes are explicitly tested as denied.
- Validation: `PATHWAY-backend` `npm test` passed all 27 Auth/Firestore-emulator tests (27 passed, 0 failed); PATHWAY Web tests passed (1 test; the pre-existing React `act(...)` warning remains); PATHWAY Web production build passed; Expo Web and Android bundle exports passed. Expo exports produce JS bundles, not a signed native Android build. The emulator suite uses the `demo-pathway-security` project only; no live Firebase data was read or changed and no rules/backend were deployed.
- This supersedes the 2026-09-28 note that student placement/final-review submissions were still direct client writes. Cloud Run deployment and live role-based acceptance remain separate owner-level steps.

### 2026-09-29 — Local Student Workflow Integration Environment

- Added an opt-in Expo development-only Firebase emulator connection. When enabled, the mobile client uses only the `demo-pathway-security` Auth and Firestore emulators with a non-production API key; normal app builds continue using the configured Firebase project.
- Added `PATHWAY-backend` `npm run dev:emulator`, which checks that its local ports are free, starts Auth/Firestore emulators on loopback, seeds a disposable student/coordinator pair and pre-deployment workflow fixtures, starts the backend on `127.0.0.1:3100`, exports the app in Expo development mode with emulator settings, and serves it at `127.0.0.1:8083`. A static export is used because Expo Metro's development server was observed binding to all interfaces even with `--localhost`; this avoids exposing that server on a phone hotspot. The static test build does not hot-reload. Export disables `.env` loading, removes inherited production Firebase values, and verifies the demo emulator project ID is present in the bundle before serving. The launcher does not edit app `.env` files, deploy rules, or connect to live Firebase.
- Added a demo-only `HOST` binding to the backend listener so the launcher can enforce loopback access without changing the default all-interface binding expected by deployed services.
- The seeded student can use the existing Company and Final Review UI to exercise a placement-change proposal, final-review submission, and the post-approval dashboard gate. The companion `npm run emulator:decision -- <placement|final-review> <approved|needs_revision|rejected> [reason]` command authenticates as the seeded coordinator against the Auth emulator and invokes the existing authorized backend decision endpoint.
- Added `npm run emulator:workflow-smoke` to verify both Firebase client identities, student-scoped reads, placement revision/resubmission/approval, final-review submission/approval, notifications, and the resulting `preDeploymentStatus: approved` dashboard gate. Run it while `npm run dev:emulator` is active. Latest result: all four workflow checks passed against the local demo emulators.
- Local workflow test: start the launcher from `PATHWAY-backend`, log in as `student.emulator@pathway.test` with password `PathwayLocal!2026`, open Approval Status → Company, submit a placement change, use the coordinator decision command from a second terminal (try `needs_revision`, then edit/resubmit and `approved`), open the Review step, submit final review, approve it from the second terminal, then sign back in and verify the dashboard unlocks. The seeded coordinator is `coordinator.emulator@pathway.test` with the same emulator-only password.
- This workflow runs the browser app on the same computer so `localhost` is stable even when the computer uses a phone hotspot. The Auth emulator, Firestore emulator, backend, and static web server are intended to bind only to loopback; physical-device access is not enabled. Stop all services with Ctrl+C in the launcher terminal. No live Firebase records are used by the seeded workflow.
- Latest verification: Expo's development-mode web export completed successfully. The backend Auth/Firestore suite was not rerun in this turn because its required ports were already occupied by an active PATHWAY local stack; those processes were left untouched. The dedicated workflow smoke suite had previously passed all four checks against the demo emulators.

### 2026-09-29 — Emulator Cleanup and External-Service Isolation

- A Command Prompt `Terminate batch job` shutdown left the Firestore emulator process listening on loopback port 8080 after the other local services stopped. When this happens, verify the listener is the PATHWAY Firestore emulator before stopping that exact process; do not terminate unrelated PIDs. This can prevent a subsequent `npm test` run from starting its own emulator.
- The local emulator backend and Firebase Admin initialization now skip `.env` loading when `PATHWAY_LOCAL_WORKFLOW=1`. The launcher also removes `ANTHROPIC_API_KEY` and `GOOGLE_APPLICATION_CREDENTIALS` from the backend process environment.
- The `/refine-logbook` endpoint now fails closed with HTTP 503 in local emulator mode (and when no Anthropic key is configured), preventing student notes from being sent to the external Anthropic API during local workflow testing. The workflow smoke test checks this behavior.
- The stale Firestore emulator was confirmed on loopback port 8080 and stopped by PID; `npm test` then passed all 27 Auth/Firestore emulator tests (27 passed, 0 failed). The Firestore permission-denied messages in the output are expected results from negative authorization tests.
- JavaScript syntax checks passed for the backend and updated emulator workflow scripts. After restarting the local workflow, `npm run emulator:workflow-smoke` passed: student/coordinator emulator sign-in and scoped reads, placement revision/resubmission/approval, final-review approval/dashboard eligibility, notifications, and the AI-refinement HTTP 503 guard. This confirms the local backend did not call Anthropic for the test request.

### 2026-09-29 — Company Directory, Capacity, and Placement History

- Added an admin-only Company Directory view in the web portal to create and edit directory entries, maintain contact details and a positive whole-number placement capacity, and deactivate companies without deleting records. Company names are normalized for duplicate checks. Every create/update is audited in the same Firestore transaction.
- Added authenticated admin API operations for the directory and a coordinator-only read endpoint used by placement review. Coordinators must map every approved proposal—including a proposal for a new company—to an active directory record. Proposal/student-provided company text is not used as the official assignment; the selected directory record supplies the canonical company fields.
- Added a section-authorized coordinator endpoint and a visible placement-history timeline on the Company Placements screen, showing the assigned student, old/new company, role, supervisor, dates, and approval time.
- Enforced capacity when students submit proposals and again when coordinators approve them. Approval counts currently approved student assignments transactionally, rejects inactive/unconfigured/full companies, updates the student's official company assignment, decrements the prior directory's occupancy when moving, updates the target slot counters, sends the notification, writes the audit event, and creates an immutable before/after `placementHistory` entry in one transaction. Re-approval to the student's current company does not consume a second slot.
- Capacity shown in directory/coordinator views is calculated from approved student profiles; the company document also stores `capacity`, `occupiedSlots`, and `availableSlots` for mobile directory display. Company records are no longer client-writable through Firestore, including for admins; privileged changes must pass through audited backend operations. Placement history is readable only by its student, an admin, or the coordinator assigned to its section; clients cannot create/edit/delete it.
- Added emulator coverage for company-directory endpoint role checks, validation, normalized duplicate detection, deactivation, audit records, direct Firestore write denial, section-scoped immutable history reads, coordinator assignment mapping, canonical company fields, capacity exhaustion, and slot accounting.
- Configured the automated security-test runner to use separate local ports by default (Auth 9199, Firestore 8180, hub 4490, logging 4590), so `npm test` can run without stopping the interactive student workflow emulator on 9099/8080. It writes a temporary Firebase CLI config and still loads the root `firestore.rules`; optional `PATHWAY_AUTH_PORT` and `PATHWAY_FIRESTORE_PORT` values can override the Auth/Firestore test ports.
- Updated the local workflow company fixture with capacity values. Validation passed: all 28 backend Auth/Firestore emulator tests; web component/app tests (3 passed); and the PATHWAY Web production build. The existing `App.test.js` emits its known React `act(...)` warning. A hands-on browser acceptance check is still pending because the interactive demo is a static build and was intentionally left running unchanged.
- These changes remain local; Firestore rules and backend have not been deployed, and the live project was not accessed or modified.

### 2026-09-29 — Hands-on Placement Acceptance and Endorsement Preparation

- Added explicit, demo-project-only Firebase emulator wiring to the staff web portal and launched the admin/coordinator portal alongside the student emulator app. The launcher now checks port 3001, seeds an emulator-only admin account, and binds the portal to loopback. It does not use the live Firebase project or deploy anything.
- Exercised the browser workflow with isolated admin, student, and coordinator accounts: admin edited host capacity, created/deactivated/reactivated a directory company; student proposed a placement change; coordinator returned it with a reason; student saw the revision and resubmitted with a corrected supervisor email; coordinator approved it. The student's read-only official placement remained on the old host until approval, then changed. The approval created the before/after history entry and transferred occupied slots between the two companies.
- Fixed two issues found during that check: coordinator list queries now include both assigned section and department, matching the Firestore rules; and the demo's previously hard-coded future proposal timestamp no longer hides a newer student change request. The local running demo rules and fixture were updated only for the isolated acceptance check.
- Coordinator placement approval now creates `endorsements/{proposalId}` in the same transaction as the official placement, history, student notification, slot counters, and audit entry. The record captures the student, assigned section/coordinator, canonical company, supervisor, role, dates, `status: awaiting_document`, and `deliveryStatus: not_sent`. A later approval supersedes the preceding pending endorsement record. The coordinator Company Placements screen displays these pending records as a paperwork queue; students receive a notification that the placement is approved but the letter is still pending.
- This is **not** a generated, signed, issued, uploaded, or emailed endorsement letter. The `endorsement_letter` student requirement remains a separate document submission. Official letter generation/signature, controlled issuance, company-contact email delivery, and reconciliation with existing document submissions still need a dedicated implementation; the UI does not claim they happened.
- A new official placement now supersedes prior pending/approved final-review requests tied to the earlier placement, changes the student's pre-deployment state to `needs_revision`, and marks the company-specific Endorsement Letter and Signed MOA requirements `needs_revision`. The mobile requirements screen labels those documents “Update for New Placement” and offers replacement upload. A new final-review submission is required; stale coordinator approvals are rejected server-side if the review's placement snapshot no longer matches the official assignment. Historic review status is retained in `priorStatus` and `supersededAt` fields.
- Firestore rules permit endorsement-record reads only to its student, an admin, or the coordinator assigned to that section; all client writes are denied. The emulator suite covers allowed/denied reads, direct write denial, atomic approval, supersession, stale-review rejection, blocked final review while company-specific documents are outdated, and successful fresh submission after document reapproval.
- Validation: `PATHWAY-backend` `npm test` passed 31/31 emulator-backed tests; web tests passed 3/3 and its final production build passed; fresh Expo Web and Android JS-bundle exports passed after all mobile changes. The existing React `act(...)` test warning remains. The interactive student app at port 8083 is a static export and must be restarted to include the newest mobile UI; the coordinator web portal hot-reloads. Expo Android export is a JavaScript bundle check, not a signed/native Android build.
- No live rules, backend, or web/mobile build was deployed. The active production project, signed-letter delivery, external upload/email services, and real two-account production acceptance remain outside this local phase.

### 2026-09-29 — Coordinator Endorsement Draft Preview

- Added a coordinator-only backend operation to prepare an endorsement-letter draft from the approved placement record. It confirms the coordinator currently owns the section, the student still has that approved placement, and all required letter fields are present. The operation is rate-limited, increments a draft version, stores the template version and placement snapshot, records the preparing coordinator and time, and writes an audit entry in the same transaction.
- Added a PATHWAY-branded letter preview in the coordinator Company Placements queue. Coordinators can reopen the latest saved draft snapshot, prepare a new version, print the draft, or use the browser's Save as PDF option. Both the preview and printed page prominently state that the draft is unsigned, unissued, and unsent, with an authorized-signature placeholder.
- The Firestore endorsement record remains `awaiting_document` with `deliveryStatus: not_sent`. Printing does not attach a file to PATHWAY, satisfy the student's Endorsement Letter requirement, issue the letter, or send email. The generated document is a draft layout, not an institution-approved template.
- The manuscript use case specifies generating endorsement paperwork and dispatching an email alert to the student and company contact, but does not prescribe the final letter template or signatory in the reviewed workflow text. Official wording, signature authority, secure signed-file storage/reconciliation, and email delivery remain follow-up work.
- No automated tests or builds were run for this change. No production Firebase services were accessed and nothing was deployed.

### 2026-09-29 — Endorsement Signed-Copy Requirement Reconciliation

- New student uploads of the `endorsement_letter` requirement are tagged with the ID of the student's current approved placement. This lets the coordinator distinguish a signed copy for the current company assignment from an older placement's document.
- When a coordinator approves that requirement, the existing authenticated, section-scoped review transaction verifies the student/section/department and current endorsement record. If a current endorsement is awaiting its signed copy, the submitted requirement must be linked to the current placement and contain an uploaded file before it can be approved. Unlinked or stale submissions are returned as a conflict and must be uploaded again; unrelated historical endorsement submissions continue through the normal requirement-review path without changing an endorsement record.
- Successful approval updates the student requirement and the matching `endorsements/{proposalId}` record atomically. The endorsement becomes `signed_copy_verified`, records the reviewing coordinator and verification/submission timestamps, and receives an audit entry in the same transaction. Its `deliveryStatus` remains `not_sent`; verification is not issuance or email delivery.
- The coordinator Company Placements screen now separates endorsements awaiting a signed copy from copies verified by the coordinator, and explicitly shows company delivery as not sent. It does not expose another signed-file link or copy the document URL into the endorsement record.
- Privacy limitation recorded at the time: the existing student requirement upload path stored Cloudinary secure URLs, which may be publicly deliverable. The following 2026-09-30 change resolves this for **new** signed endorsement uploads using authenticated delivery and protected downloads; previously stored public assets still need account-owner-reviewed migration/removal. Approved template/signatory, email dispatch, delivery status, and a transaction confirmation remain outstanding.
- No automated tests or builds were run for this change. No production Firebase services were accessed and nothing was deployed.

### 2026-09-30 — Protected Endorsement File Delivery

- New `endorsement_letter` upload intents now sign Cloudinary's `authenticated` delivery type. The backend verifies the asset's type, ID, size, format, and upload response before saving it. The student requirement stores the immutable Cloudinary asset ID and delivery type, but not a directly usable delivery URL; uploads for other requirement types retain their existing behavior.
- Endorsement upload authorization is tied to the student's current approved placement and its matching `awaiting_document` record. The backend checks that binding both when issuing the upload intent and again in the transaction that saves the uploaded file; coordinator approval also accepts the authenticated asset metadata without requiring a public URL.
- Added protected student-owner and coordinator download endpoints. They rate-limit access; the coordinator endpoint verifies current section ownership. Both retrieve the file through Cloudinary's signed asset-download API, stream it with `private, no-store` response headers, and record a `requirement.downloaded` audit event. The coordinator dashboard and student app use these authenticated endpoints; the student web and native save actions are documented in the 2026-09-30 follow-up below.
- The REST upload and asset-ID download calls follow Cloudinary's documented authenticated-delivery and signed-download API: [Upload API reference](https://cloudinary.com/documentation/image_upload_api_reference) and [media access control](https://cloudinary.com/documentation/control_access_to_media).
- Firebase Storage was not introduced. Cloud Storage for Firebase currently requires the Blaze plan for bucket access, which would require linking billing; this project phase keeps using the existing Cloudinary integration instead. Reference: [Firebase Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).
- This change protects **new** endorsement uploads only. Previously stored `upload`-type assets were not modified or deleted and may remain publicly deliverable from their existing URLs. They need an explicit, account-owner-reviewed migration/removal, including consideration of cached copies. Cloudinary authenticated delivery guidance: [Cloudinary media access control](https://cloudinary.com/documentation/control_access_to_media).
- Manual acceptance once configured: upload a new endorsement copy; confirm its Firestore `fileUrl` is null and `cloudinaryDeliveryType` is `authenticated`; confirm the unsigned `secure_url` is denied by Cloudinary; confirm the student-owner endpoint works; confirm the assigned coordinator can download from the dashboard and a coordinator from another section receives 403. These checks still need to be run with real Cloudinary credentials.
- The account's authenticated upload/download behavior still needs acceptance testing with real Cloudinary credentials and student/coordinator accounts. No tests/builds were run, no external Cloudinary assets were uploaded or changed, and nothing was deployed.

### 2026-09-30 — Protected Download Emulator Coverage Prepared

- Extended the isolated Cloudinary mock with a signed asset-download response and added an emulator test for the student-owned and coordinator-section-scoped protected endorsement download endpoints.
- The test checks unauthenticated and wrong-role denial, another student's inability to retrieve the signed asset, cross-section coordinator denial, expected PDF bytes, `private, no-store` and `nosniff` response headers, and audit records for successful student/coordinator downloads.
- The test uses only fake credentials and local emulator/mock services. It was added but not run in this change; real Cloudinary signed-download acceptance remains a separate owner-account check. No production services were contacted or changed.

### 2026-09-30 — Native Protected Endorsement Save

- Reused the already-installed Expo FileSystem legacy API to save authenticated endorsement downloads without adding a dependency. Android asks the student to choose a destination folder through the Storage Access Framework; iOS saves to the app's `PATHWAY` Documents subfolder.
- Enabled iOS document sharing/open-in-place so saved documents can be found from the Files app. Native downloads use the same student-authenticated backend endpoint, disable HTTP cache, and clean up temporary cache files after save or failure. Web download behavior remains unchanged.
- No native device test or build was run in this change. Confirm Android folder selection/save and iOS Files visibility in a native build; the iOS Info.plist change takes effect only after rebuilding the app. No live services were contacted and no deployment occurred.

### 2026-09-30 — Attendance and Requirement Audit Coverage

- Added server-generated audit events for student attendance time-in/time-out and requirement document submission/removal. Each event is committed atomically with the corresponding Firestore mutation and records actor, target, section, and minimal status metadata; file contents, signed URLs, and Cloudinary asset IDs are not copied into audit logs.
- Requirement changes now share a per-student rate limit. Removing a document clears its stored file reference and delivery metadata so the protected-download endpoint can no longer serve the removed file. This unlinks the file from PATHWAY; it does not delete the Cloudinary asset, and previously public assets may remain retrievable through a known old URL.
- Extended the emulator suite to assert attendance audits, requirement submission/removal audits, removal of protected-download metadata, and denial of a stale download after removal. The suite had not yet been rerun at the time of this change; see the validation entry below. No production services or assets were accessed or changed.

### 2026-09-30 — Protected Download Emulator Validation

- The project owner ran `npm test` from `PATHWAY-backend` after adding the protected-download coverage. All 32 Auth/Firestore emulator-backed tests passed (32 passed, 0 failed), including student-owner download, assigned-coordinator download, cross-section denial, private response headers, and audit records.
- The Firestore `PERMISSION_DENIED` log entries in the run are expected outputs from negative authorization tests; the test runner completed successfully and shut down its emulators.
- This confirms the mocked local authorization and download flow, not access to the real Cloudinary account or native device file saving. No production Firebase/Cloudinary service was accessed or changed.

### 2026-09-30 — Latest Emulator Suite Rerun

- The first rerun exposed a test-fixture ordering issue: the upload/removal test intentionally unlinked `studentA`'s application form, while a later test assumed that same requirement was still awaiting review. The backend correctly returned `409` because the removed document was no longer submitted.
- Updated the review test to restore a realistic submitted-document fixture before testing coordinator approval. No production authorization behavior was loosened.
- Reran `npm test` from `PATHWAY-backend`: all 32 emulator tests passed (32 passed, 0 failed). Expected `PERMISSION_DENIED` logs are emitted by negative authorization cases.
- This validates the local emulator suite only. Real Firebase deployment/role acceptance, Cloudinary account acceptance, and native-device checks remain outstanding; no production services were accessed or changed.

### 2026-09-30 — Student/Coordinator UI Acceptance in Emulators

- Started the isolated `demo-pathway-security` workflow and signed in with the seeded student and coordinator accounts.
- The student opened the final-review summary, saw all five required documents and the approved placement, and submitted the package. The page changed to “Submitted for coordinator review.”
- The assigned coordinator saw the request in the correct emulator section. After using the confirmation dialog to approve it, the request displayed “Approved.”
- Reloading the student app returned to Login; signing in again routed the now-approved student to the dashboard, where Recent Activity showed “Final review approved.” This confirms the end-to-end workflow and persisted emulator decision, but automatic session restoration after reload is not present in the observed flow and should be reviewed.
- UI finding: the coordinator final-review card displayed the student's Firebase UID instead of “Taylor Student,” although the placement card displayed the name. Review-name presentation should be corrected before calling that screen polished.
- Interaction note: the student app's Sign In control did not respond to the initial browser mouse-click attempts in this run, while keyboard Enter did activate it. This may be specific to the automation path; verify with a physical mouse/touch before treating it as a confirmed UI defect.
- This was local emulator-only acceptance. No production Firebase or Cloudinary data was used or changed. The browser/portal build emitted existing development-server deprecation warnings but compiled successfully.

### 2026-09-30 — Session Restoration and Final-Review Name Display

- The student app now waits for Firebase's initial auth state and reads the saved account profile before choosing its first screen. Approved students reopen the dashboard; students still in pre-deployment reopen their appropriate workflow screen. Invalid/missing profiles are signed out, while a transient profile-load failure shows Retry and Sign out actions.
- Added Expo SDK 54's recommended AsyncStorage dependency and native Firebase Auth persistence so Android/iOS sessions can survive app restarts. Browser Auth continues using its existing browser persistence.
- Login and logout now reset the navigation stack, preventing back navigation to the previous account's screen after signing out. Successful registration signs out its temporary Firebase session before returning to Login.
- New final-review records store the student's display name from the authoritative student profile. The coordinator page displays the current section student's name where available, with the saved request/proposal name as a fallback for older records.
- Verification passed locally: `PATHWAY-backend` emulator security tests 32/32; `PATHWAY-web` tests 3/3 and production build; Expo Web and Android JavaScript exports. The Android export is not a native device build. The existing web React `act(...)` warning remains.
- Hands-on UI recheck is pending. The Windows computer-use tool stopped before browser interaction because it could not verify the current browser URL. The isolated emulator launcher was stopped; no production Firebase project was used. The Sign In mouse/touch concern remains unconfirmed.

### 2026-09-30 — Endorsement Email Dispatch and UI Recheck

- Rechecked the manuscript's **Assign Placement** use case: the coordinator assigns the company, prepares endorsement paperwork, and dispatches an email alert containing the document to the student and corporate contact. The manuscript does not establish official letter wording or an authorized signatory. The existing preview remains explicitly an unsigned draft; it is never emailed by this new operation.
- Unlike automatic dispatch at assignment in the manuscript use case, the current implementation requires a later, explicit coordinator send after a signed copy has been uploaded and verified. This avoids treating the unsigned preview as an official letter; it is a deliberate incomplete portion of that use case until the institution approves the issuance process.
- Added a coordinator-only `POST /coordinator/endorsements/:proposalId/send` backend operation and a confirmation action in the Company Placements screen. It requires the student's *current* approved placement, the assigned section coordinator, a coordinator-verified `endorsement_letter` for that exact proposal, and its private Cloudinary `authenticated` asset ID. The backend downloads the original signed bytes and attaches them to two separate emails. Recipients come from the student's Firebase Auth address and the official company-directory email captured at approval; the browser cannot override either address. Missing configuration or a public/legacy endorsement asset blocks sending.
- Added authenticated SMTP transport configured solely with backend `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD`. Production requires authentication and TLS. The isolated demo test can use a no-auth loopback SMTP server. No credentials were added to source control, and no real email was sent in this work.
- The endorsement record now tracks `deliveryStatus` (`not_sent`, `sending`, `failed`, `partial_failed`, `sent`), each recipient's status, timestamps, SMTP message ID, and an attempt ID. `emailAcceptedAt` means both emails were accepted by the SMTP server; it does not prove inbox delivery. The server reserves an attempt transactionally and audits accepted/failed outcomes; a retry only sends to recipients previously marked failed. It rejects address-list syntax in company data so a single official contact field cannot silently add recipients. A student notification is created only after the student email is accepted. UI language says **accepted by email server**, not delivered to an inbox. A `sending` attempt cannot be automatically retried, because SMTP may have accepted an email just before a server crash; an administrator must reconcile that attempt against the provider first. Official placement changes are blocked while such an attempt is in progress, and a resolved old verified endorsement is marked superseded when placement changes.
- The local Auth/Firestore emulator suite passed **33/33** tests, including wrong-role/cross-section/recipient-override denial, address-list rejection, no send before signed-copy verification, private attachment bytes, a local SMTP rejection for one recipient, failed-recipient-only retry, duplicate-send rejection, notification, and audit records. The web tests passed **3/3** and the production build compiled. The existing React `act(...)` warning and development-server deprecation warnings remain. `npm install` reported 12 dependency audit findings (10 moderate, 2 high); no blanket dependency upgrade was applied.
- Re-ran the isolated student UI with mouse-click Sign In: the pending-approval screen reopened after refresh; Sign Out returned to Login and reopening the app remained signed out. After the local workflow's final approval, Sign In opened the full dashboard, and refresh restored that approved dashboard. The coordinator portal visibly showed **Taylor Student** on its final-review card. This resolves the two earlier UI findings for this emulator browser path; native-device touch and persistence still need device acceptance.
- Updated the local workflow smoke script because approving a new placement correctly invalidates the Endorsement Letter and Signed MOA. The script now checks that invalidation and uses an **emulator-only synthetic document-review fixture** before submitting Step 4. Its placement-revision/resubmission/final-approval path passes. This fixture does **not** validate a real upload, coordinator document review, or official signature.
- Remaining external checks: configure institution-approved SMTP and Cloudinary credentials on a hosted backend, verify a real signed upload and student/coordinator protected access, send only to approved test recipients, reconcile provider acceptance against inbox/bounce results, obtain institution-approved letter wording/signatory, review old publicly deliverable assets, and deploy rules/backend/clients only after owner approval. None of the live Firebase, Cloudinary, or email services was modified here.
- Dependency security remains open: `npm audit --omit=dev --audit-level=high` reports 9 findings in the backend dependency tree (7 moderate, 2 high). A dry-run fix proposed broad Firebase/Google transitive upgrades, so no automatic or `--force` upgrade was applied without a separate compatibility review and emulator regression pass. Resolve these before any production deployment.

### 2026-09-30 — Backend Dependency Security Follow-Up

- Updated the backend lockfile within existing semver ranges: `firebase-admin` 14.0.0 → 14.5.0, bringing `@google-cloud/firestore` 9.3.0, `@google-cloud/storage` 8.2.0, and `fast-xml-parser` 5.11.2. Updated compatible transitive `brace-expansion` to 2.1.7 and `protobufjs` to 7.6.6. The backend's direct dependency ranges in `package.json` did not change.
- Current npm audit results: **0 high/critical**; **2 moderate** with `--omit=dev` (`gaxios` and its `uuid` dependency); **5 moderate** for the full development tree (also including `@opentelemetry/core`, `@google-cloud/pubsub`, and `firebase-tools`). npm's suggested `--force` remediation changes the Firebase CLI major line and was not applied. These remaining advisories need a compatible upstream dependency path and review before production release; zero high findings is not a claim that the system is fully secure.
- Regression after the update: isolated Auth/Firestore emulator security suite **33/33 passed**; web Jest tests **3/3 passed**; optimized web build and backend `node --check server.js` passed. Firestore `PERMISSION_DENIED` messages in negative authorization tests were expected. The existing React `act(...)` test warning and Node `fs.F_OK` deprecation warning remain.
- Apart from this documentation, only local npm dependencies and the lockfile were changed. No rules, backend, or client were deployed; no live Firebase, Cloudinary, or SMTP resource was accessed. Real-account and native-device acceptance, approved endorsement paperwork, credential configuration, and the broader manuscript feature gaps remain separate work.

### 2026-09-30 — Student App Brand and Motion Refresh

- Added the supplied PATHWAY mark as `PATHWAY-master/assets/pathway-logo-2026.png` and applied it to the app icon, splash, web favicon, session-restoration screen, sign-in, and student workflow headers. The previous logo asset remains in place but is no longer referenced by those screens.
- Established shared palette tokens in `PATHWAY-master/theme.js`: logo navy `#062E71`, blue `#0152BD`, sky `#10B8FE`, gold `#F8AA04`, and yellow `#FED02A`. Darker action/text shades were chosen for legibility; checked foreground/background pairs include primary blue on white (8.77:1), secondary blue on white (5.87:1), dark gold on white (6.66:1), and bright gold on navy (8.29:1). Emerald, amber, and red remain distinct status colors. Shared surface, border, radius, and shadow tokens were also refined to reduce the heavy, generic-card appearance.
- Added `PATHWAY-master/components/Motion.js` for short screen entrances and subtle press feedback using the installed React Native Animated API. Motion follows the OS reduced-motion preference; no animation dependency or framework migration was introduced. The existing navigation, backend/data model, and workflow handlers were left unchanged.
- Applied the shared treatment across student sign-in and registration, pre-deployment requirements and placement/review/approval, Home, Logs/calendar, attendance, Progress, Profile/settings, Messages, and Notifications. Notifications now appears before Messages in the inbox tab row, while direct dashboard links can still open Messages. Key calendar, inbox, profile, form, and attendance actions receive the same restrained press response.
- Validation: Expo web static export and Android JavaScript/Hermes export both completed successfully to unique temporary folders. These are bundle/export checks, not a native Android build or hands-on device acceptance. Narrow/typical-device visual review, keyboard/safe-area checks, reduced-motion setting verification, and end-to-end student workflow acceptance still need to be completed on a local emulator/device. No production Firebase, backend, Cloudinary, or email service was accessed; nothing was deployed.

### 2026-09-30 — Student Onboarding, Animated Startup, and Skeleton Loading

Area: Mobile

Implemented:
- Added a three-page, first-launch student introduction covering OJT progress, attendance/logbook records, and coordinator communications. Skip and Get started persist a versioned completion flag locally; Firebase-authenticated users bypass onboarding and retain their existing role-based entry route.
- Replaced the text-and-spinner startup view with a symbol-only PATHWAY mark animation: blue mark reveal, gold/white route draw, then graduation-cap reveal. Firebase auth/profile restoration continues at the same time; the complete mark holds if restoration takes longer. A restore error appears with retry/sign-in actions only after the startup mark finishes.
- Honors the system reduced-motion setting before beginning the logo animation and onboarding transitions. Added a small fallback timeout only for a delayed accessibility preference response, and skeleton placeholders become static under reduced motion.
- Added reusable student skeleton states for dashboard, inbox, progress, requirements, company placement, attendance, review, and logbook initial data loads. Action-specific upload/send/save progress indicators remain unchanged.
- Kept the existing Android adaptive icon, app icon, and web favicon configured to use `assets/pathway-logo-2026.png`. Native launch is now a clean white brand-color surface so it transitions into the animated mark without showing a second static logo. New onboarding pictograms use the existing SVG icon set; no emoji or animation-library dependency was added.

Files or systems affected:
- `PATHWAY-master/App.js`, `app.json`, `screens/OnboardingScreen.js`
- `PATHWAY-master/components/AnimatedSplash.js`, `PathwayMark.js`, `StudentScreenSkeleton.js`, `Motion.js`
- Student data-loading gates in dashboard, inbox, progress, requirements, placement, attendance, review, approval, and logbook screens

Verification:
- Expo app configuration validated successfully with Expo SDK 54.
- Expo Web static export passed; Android JavaScript/Hermes export passed. Both exports used unique temporary output directories and made no Firebase/backend requests.
- Source review confirmed the first-run flag is read only after Firebase Auth finishes restoring its local state; authenticated users continue to use the existing role/profile route. A scan of student screen/component JS found no emoji pictograms.
- Automated export does not simulate the navigation taps, persistent AsyncStorage across reinstall, or an OS reduced-motion change. No native app was installed for hands-on acceptance in this run.

Known limitations:
- This creates a JavaScript animated startup after the operating system launch surface; it does not add a separate native animation dependency. The animated mark is an SVG recreation of the supplied symbol, while app/adaptive icons continue to use the supplied raster logo.
- Expo static exports validate JS bundling but cannot confirm the native Android adaptive-icon crop or launch-screen timing on-device. First-run persistence, OS reduced-motion behavior, safe areas, and phone/tablet layout still require hands-on device verification.

Next step:
- Visually verify first-run/returning-session, native launch timing and adaptive-icon safe-zone crop, and reduced-motion behavior in a native preview build.

### 2026-09-30 — Approved Student Dashboard Preview Account

- Added a separate, emulator-only student account, `student.approved@pathway.test`, with `preDeploymentStatus: approved`, approved requirements, and an approved company placement so the full student dashboard can be previewed immediately.
- Kept `student.emulator@pathway.test` in its existing pending-final-review state so the registration/final-review acceptance workflow remains available. The approved preview account is associated with the same isolated emulator section and company.
- `npm run dev:emulator` prints both student sign-in accounts. The approved preview password is the existing emulator-only fixture password `PathwayLocal!2026`.
- This account and its approval state are seeded only into the pinned `demo-pathway-security` Auth/Firestore emulators. It is not a live/production account and no production user, placement, or data was created or changed.

### 2026-10-02 — Student UI/UX Hierarchy and Responsive Polish

- Applied cross-category interaction principles from familiar social, messaging, navigation, productivity, finance, and media apps: predictable navigation, scannable lists, focused task areas, clear state feedback, and restrained motion. PATHWAY's branding and OJT workflows remain distinct; no unrelated social features or product copy were introduced. The rationale and implementation guardrails are also in `PATHWAY-master/design.md`.
- Refined the student Home and Progress tabs into a clearer hierarchy: one primary hours-progress surface, compact supporting metrics, a read-only coordinator-approved placement summary, and grouped recent activity / workflow links. Existing data, navigation, approvals, and actions are preserved.
- Replaced the dashboard's floating circles with persistent labeled **Messages** and **New log** actions, still available on Home, Logs, Progress, and Profile. Their position now respects the device bottom safe area so they remain clear of the bottom navigation.
- Refined the Inbox presentation with a responsive centered content measure, a search field shared by Notifications and Messages, keyboard-aware fixed chat composer, and flatter scannable conversation/notification rows. Unread items retain the requested light-blue highlight and right-side blue dot (without a colored left border). Existing messaging and notification data operations are unchanged.
- Centered the major attendance, logbook, progress, and requirements content on wider tablet/web layouts while retaining phone-first padding. Auth forms remain a focused column at desktop width. Matched the operating-system launch background to the in-app dark startup animation to avoid a white-to-navy flash.
- The shared palette is defined in `PATHWAY-master/theme.js`: navy for structure, blue for interactive states, gold as a restrained accent, white/cool neutral surfaces, and distinct semantic success/warning/error colors. Shared spacing/type/radius tokens reduce visual drift. Existing motion remains brief and purposeful, uses the installed React Native animation API, and honors reduced-motion preferences; SVG icons are used instead of emoji pictograms.
- Verification: Expo web static export and Android JavaScript/Hermes export both completed successfully. Browser review covered onboarding and sign-in at 360px and 390px phone widths, and registration at 1240px desktop width. No authenticated dashboard or messaging workflow was exercised in this turn; emulator/device checks for keyboard, reduced motion, safe-area rendering, and approval-state flows remain necessary. No production Firebase/backend/Cloudinary/email service was accessed or changed, and nothing was deployed.

### 2026-10-02 — Student Typography and PATHWAY Watermarks

- Added shared student text and text-input wrappers using Avenir Next on iOS, Android's system sans-serif, and Segoe UI/system UI on web. Existing 800/900 student text weights are rendered at a maximum of 700 for a calmer, more consistent hierarchy; no external font or dependency was introduced.
- Added a decorative SVG PATHWAY mark, clipped and kept low-contrast within logo-bearing branded surfaces: auth hero, onboarding header, dashboard header/gate, requirements, placement, review, approval, and a restrained splash backdrop. The main logo remains in the foreground, and decorative marks are excluded from accessibility and pointer interaction.
- Applied the shared typography to student screen text and text inputs without changing validation, navigation, data access, or workflow logic. iOS, Android, and browser font rendering still require device/browser visual acceptance; static exports only confirm bundle compatibility.

### 2026-10-02 — Approved PATHWAY Cutout Logo Rollout

- Replaced the hand-drawn student SVG logo with the approved transparent 2026 artwork at `PATHWAY-master/assets/pathway-logo-2026-cutout.png`, rendered through the shared `PathwayMark` component. It now covers the student splash/hold, sign-in and registration hero, onboarding, workflow headers, dashboard gate, and clipped watermarks. Dark surfaces use a light logo backing so the navy parts remain legible; the outer startup animation and workflow logic are unchanged.
- Added the reusable accessible web `PathwayLogo` component and applied it to Admin, Coordinator, login, Supervisor Evaluation, and endorsement draft/print surfaces. The endorsed image is the same transparent artwork.
- Generated platform-ready versions from that master: opaque 1024px iOS icon, safe-zone-scaled transparent Android adaptive foreground on `#F5F8FF`, rounded-tile native splash artwork over the existing navy launch color, Expo web favicon, and light-backed web PWA/Apple touch icons. Updated the web manifest and theme color to PATHWAY branding. The legacy public `pathway-logo1.png` URL now contains the approved mark to avoid serving the old image through that path.
- Updated `PATHWAY-master/design.md` to make the cutout asset the brand source of truth and prohibit hand-redrawing the logo. Existing blue/gold/white palette and reduced-motion principles remain in effect.
- Verification: Expo SDK 54 config validation passed; Expo Web static export and Android JavaScript/Hermes export passed; the PATHWAY web production build passed; web Jest tests passed (2 suites, 3 tests). The test run logged the existing React `act(...)` warning, and CRA emitted the existing Node `fs.F_OK` deprecation warning. Source/config scans found no old logo references in the selected student or web surfaces.
- Native device review of the Android adaptive-icon mask crop, iOS launch screen, and physical-device logo appearance remains outstanding; bundle/config success is not a substitute for that visual acceptance. No backend, Firebase data, or production service was changed.
