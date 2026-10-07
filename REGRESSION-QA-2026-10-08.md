# Automated regression QA — October 8, 2026

## Results

- Backend Auth/Firestore security integration suite: 35/35 passed on isolated ports 9199/8180.
- Staff web suite: 16 suites, 44/44 tests passed using the workspace-local Jest cache.
- Student helpers, success feedback, pagination, and geofencing: 23/23 passed.

Account provisioning coverage confirms authorized coordinator provisioning, generated initial credentials, mandatory first-login password replacement, blocked protected access before replacement, incorrect-current-password rejection, old-password rejection, preserved changed passwords on reimport, section-scoped identity-verified recovery, random temporary recovery passwords, stale Firestore session rejection, and restored password-change gating.

The integration suite also checks role/section isolation, attendance, documents, messaging, placement/final-review approval, evaluation links, clearance, company ownership, and audited coordinator/admin mutations. Staff component tests include requirements and student-record exports. External SMTP/Cloudinary integration cases use local mocks, not actual delivery acceptance.

## Limits

This is automated API/rules/component acceptance, not a fresh browser CSV-upload or phone visual walkthrough. Production Firebase deployment, real email delivery, staging uploads/downloads, load testing, and release sign-off remain separate. The manuscript was not modified, and existing live demo fixtures were not intentionally changed.

The initial web test attempt failed before executing assertions because its sandbox temporary transform cache could not be written. Rerunning with `.jest-cache` succeeded. `App.test.js` retains a React `act(...)` warning despite passing; test synchronization should be cleaned up separately.
