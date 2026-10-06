# Coordinator QA — 2026-10-05

## Verified

- Isolated backend integration suite: 33/33 passed using Auth 9199 and Firestore 8180, separate from the running demo on 9099/8080.
- Coverage includes document decisions, placement changes, final review and dashboard unlock, messages and notifications, logbook review, evaluation token validation/single use, clearance eligibility, ownership boundaries, and atomic audit writes.
- External Cloudinary and SMTP operations in these tests use local mock services, not production providers.
- Live browser: local coordinator sign-in, Clearance, Evaluations, Logbook, Messages, sign-out, and signed-out coordinator URL protection checked.
- After the query fix, Clearance displays four local students; Evaluations offers all four students; Logbook and Messages load their student lists.
- No existing demo student approvals, hours, messages, or evaluations were changed during this browser pass.

## Fixed during this pass

The four pages queried section members without restricting role to student. Firestore correctly refused the unbounded queries. Added `where('role', '==', 'student')` to each student query. Security rules remain unchanged.

## Remaining before full sign-off

- Complete the entire workflow through the browser with a dedicated disposable fixture (the automated API integration coverage is not equivalent to browser end-to-end coverage).
- Verify phone/desktop layouts and supervisor evaluation submission UI.
- Verify actual configured Cloudinary and email delivery in a controlled staging environment.
- Finish administrator live QA and deployment/backup readiness.

The passing tests do not establish 100% system readiness.

## Follow-up live verification

- Administrator demo sign-in succeeded. Company directory loaded three local records with capacity counts; Academic Terms loaded its empty state; System Settings loaded defaults; Audit Logs displayed 12 local workflow events.
- Administrator sign-out returned to Login; direct navigation to `/admin` while signed out redirected to Login. No administrative settings or existing student account states were changed.
- Generated one supervisor evaluation for isolated fixture `qa-student-1791205471072`, using the local-only supervisor address `supervisor.qa@pathway.test`. This generation does not send email.
- Submitted all five ratings with clearly marked local QA feedback through the actual supervisor browser form. The form showed Evaluation Submitted. Refreshing the coordinator records displayed Submitted, five 4/5 scores, and the QA feedback.
- Reloading the consumed link displayed "Evaluation link is expired or already submitted"; no second submission form was available.
- Coordinator browser error capture returned no errors during this pass. Signed out afterward.
- Saved visual evidence: `coordinator-evaluation-qa.jpg`.
- Phone viewport verification is NOT established: requesting 390x844 still returned an effective 1280px viewport. The viewport override was reset. Desktop-sized rendering was inspected, but phone responsiveness remains an open verification item.

This closes the supervisor submission and basic admin read/logout checks above; full browser mutation coverage, staging delivery, and deployment readiness remain open.
