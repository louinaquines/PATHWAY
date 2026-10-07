# Deployment readiness — 2026-10-05

## Confirmed packaging fix

Backend Dockerfile now includes `cloudinaryUploads.js` and `endorsementMail.js`, required by `server.js`. Previously the image omitted those runtime modules. Container build/start has not yet been verified.

## Release gates still open

- Validate phone layouts in a browser that actually honors the requested viewport.
- Complete remaining administrator and coordinator mutation flows with dedicated QA fixtures.
- Build and start the backend image; verify authenticated endpoints and health.
- Choose/confirm staging and production hosting destinations before deployment.
- Validate staging Cloudinary uploads/private downloads and real email delivery with explicitly approved test recipients.
- Confirm production environment variables, allowed origins, Firebase credentials and emulator flags without exposing secrets.
- Deploy and verify Firestore rules and required indexes for actual application queries.
- Establish database backups, perform a restore rehearsal, and document rollback.
- Configure monitoring, error alerts, and health checks.

No production deployment or external email was performed. Passing local tests is not full release sign-off.

## Read-only production preflight

From `PATHWAY-backend`, run `npm run test:production` for validator regression tests, then `npm run check:production` with the intended deployment environment variables supplied by the deployment platform or shell.

The preflight deliberately does not load local `.env` files, initialize Firebase, contact services, or print configuration values. It flags demo projects/emulators, local Cloudinary overrides, missing SMTP/Cloudinary settings, unsafe CORS origins, and missing Docker runtime dependencies. Local development is expected to fail this production-only check.

A passing result validates configuration structure only. It does not prove credentials work, SMTP delivers, uploads succeed, or a restore/rollback is possible. Keep actual secrets in the deployment platform's secret manager; never commit them.

## October 8 packaging and production guards

The Docker runtime file list now also includes `studentInbox.js`, `geofence.js`, `localCloudinaryQa.js`, and `productionPreflight.js`; port 8080 is explicitly configured. Environment-file variants, emulator snapshots, and credential keys are excluded from the build context.

Production startup enforces configuration checks before Firebase initialization, skips local dotenv loading, rejects emulator/QA activation, and validates the HTTPS `EVALUATION_WEB_URL` origin. Local development remains supported. Seven production-preflight tests and 35 isolated backend security tests passed, and the live local health endpoint returned HTTP 200.

Container build/start remains unverified because Docker is unavailable. Dependency advisories remain open; see `RELEASE-SAFETY-AUDIT-2026-10-08.md`. No production release or real email delivery is implied by these checks.
