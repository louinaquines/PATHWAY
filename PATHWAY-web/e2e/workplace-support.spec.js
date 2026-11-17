// Emulator integration entry point, NOT browser E2E. Run from PATHWAY-backend:
// node security-tests/run-emulator-tests.js --journey
// Reuses the real mobile controller/backend/provider-stub fixture and its security
// regressions. Browser/visual acceptance is separate, controller-owned evidence.
require('../../PATHWAY-backend/security-tests/workplace-support-attachments.test.js');
