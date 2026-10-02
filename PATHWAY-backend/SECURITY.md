# PATHWAY backend security and deployment

## Firebase Admin credentials

The backend initializes Firebase Admin through Application Default Credentials; do not add a service-account JSON file to this project.

- Local development: set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file stored outside this workspace, or use `gcloud auth application-default login` with the correct project selected.
- Hosted deployment: use the platform's workload identity / attached service account and set `GOOGLE_CLOUD_PROJECT` when the runtime cannot infer the Firebase project.
- Set `CORS_ALLOWED_ORIGINS` to a comma-separated list of exact deployed web and app-web origins. The local defaults cover the current localhost development ports only.
- Keep `ANTHROPIC_API_KEY`, Firebase credentials, and all deployment secrets in the environment's secret manager, never in source control or client environment variables.
- Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` only in the backend environment/secret manager. Never expose the API secret to Expo or web clients. Disable the legacy unsigned upload preset in Cloudinary after verifying no other app depends on it.
- For endorsement email dispatch, set `SMTP_HOST`, `SMTP_PORT` (usually 465 or 587), `SMTP_FROM` (a plain sender email address), `SMTP_USER`, and `SMTP_PASSWORD` in the backend secret manager. Port 465 uses implicit TLS; other ports require STARTTLS. Production does not allow unauthenticated SMTP. Do not put these values in the web/mobile client or a committed `.env` file. The isolated `demo-pathway-security` workflow is the only mode allowed to use a no-auth loopback SMTP server for tests.

The former in-project `serviceAccountKey.json` was removed, and the project owner confirmed that its active Google Cloud service-account key was deleted from IAM on 2026-09-28. Do not create a replacement JSON key: use Application Default Credentials locally and the host's attached service identity when deployed. Copies on other devices or in unavailable Git history have not been verified.

## Security-relevant endpoints

- `POST /register-student`: verifies and claims the department roster entry, then creates the restricted student profile atomically.
- `POST /requirements/:requirementId/upload-signature` and `PUT /requirements/:requirementId`: issue a short-lived, single-use Cloudinary upload authorization, then verify the response and authenticated Admin API metadata before storing the document.
- `GET /requirements/:requirementId/download`: allows an approved student to download only their own authenticated requirement asset.
- `GET /coordinator/students/:studentId/requirements/:requirementId/download`: allows a coordinator to download an authenticated asset only after the backend confirms the student's current section is assigned to that coordinator.
- `POST /coordinator/endorsements/:proposalId/send`: permits only the assigned coordinator to email the current placement's coordinator-verified private signed copy to the Firebase Auth student's address and the official company-directory email. The client cannot supply recipients. A transaction reserves each attempt; the server tracks student and company acceptance separately, retries only failed recipients, audits outcomes, and creates a student notification after the student email is accepted. A `sending` record must be reconciled against the SMTP provider before retrying because a process can crash after SMTP acceptance but before Firestore records it. SMTP acceptance is not proof of inbox delivery.
- `POST /profile/photo/upload-signature` and `PUT /profile/photo`: use the same server-authorized flow for profile photos; clients cannot write the photo URL directly to Firestore.
- `POST /attendance/time-in` and `/attendance/time-out`: derive the student from the Firebase ID token and maintain the daily record server-side.
- `POST /coordinator/assign-student`: verifies coordinator ownership of the target section and student department before assigning.
- `POST /coordinator/final-reviews/:requestId/decision`: validates the pending decision, assigned student, required document statuses, reviewer/reason, approval flag, and notification in one transaction.
- `POST /create-evaluation-token`: limits creation to staff and restricts coordinators to students in their assigned sections; stores only a hash of the random, expiring supervisor token.
- `GET /evaluation/:token` and `POST /evaluation/:token/submit`: validate token format, rate-limit public access, enforce expiry/single-use, validate the complete five-criterion form, and atomically store the response and student notification.
- `POST /refine-logbook`: authenticated, student-only, bounded input and rate-limited.

## Local security validation

From this directory, run `npm test` to launch the isolated Auth and Firestore emulators and execute the rules and backend authorization suite. The test project is `demo-pathway-security`; it cannot address a live Firebase project. The Firestore emulator requires a Java runtime on `PATH`.

Review and deploy `../firestore.rules` only after testing the role-specific queries against the intended Firebase project. The local rules file does not change the rules currently deployed in Firebase.

## Secure media uploads

The student app requests a server-generated, one-hour, single-use Cloudinary authorization for one user-owned requirement or profile-photo asset. The backend persists the intent, signs a fixed student folder and unique public ID, and returns only the Cloudinary API key and upload signature to the client. On completion, the backend verifies Cloudinary's response signature and queries the authenticated Cloudinary Admin API for the actual resource type, format, byte count, version, and secure URL. Intents are atomically consumed with the Firestore update, preventing cross-user use and replay. Requirement and profile-photo URLs are no longer writable by students directly through Firestore rules.

New `endorsement_letter` assets use Cloudinary's authenticated delivery type (selected in the REST upload endpoint path), and an upload intent is bound to the student's current approved placement and pending endorsement record. The backend rechecks that binding when finalizing the upload. Firestore stores the immutable asset ID and delivery type, not a directly usable URL. Student-owner and assigned-coordinator download endpoints stream the bytes only after authorization, without redirecting to Cloudinary or exposing a signed delivery link. Download responses are marked `private, no-store` and audited. Other requirement uploads keep their existing delivery behavior; previously stored endorsement files may still be public and require account-owner-reviewed migration/removal.

Set all three Cloudinary variables in the backend deployment environment before enabling these flows. This change does not disable an old unsigned upload preset in the Cloudinary account; an owner should disable it manually after confirming no other client still uses it. Admin API rate limits should be considered when load-testing.

## Cloud Run deployment preparation

The backend is prepared as a Node.js 22 container (`Dockerfile`) and exposes `/healthz` for a basic liveness check. This workspace does not contain a deployed Cloud Run service or a public backend URL; deployment must be completed by an owner with access to the `pathway-57400` Google Cloud project and its billing/API configuration.

Before deployment:

1. Create or select a dedicated Cloud Run runtime service account. Grant only the Firebase Auth and Firestore permissions needed by the current endpoints; do not upload a service-account JSON key.
2. Create the Cloud Run service in a region close to the Firebase project. Make the service reachable by the mobile/web clients (typically unauthenticated at the Cloud Run IAM layer) because the Express endpoints enforce Firebase ID-token authorization themselves. Keep `/healthz` free of project or user data.
3. Configure `GOOGLE_CLOUD_PROJECT=pathway-57400`, `CORS_ALLOWED_ORIGINS` with the final exact web origins, and `ANTHROPIC_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` from Secret Manager. Do not deploy a local `.env` file.
4. After deployment, replace the local `EXPO_PUBLIC_BACKEND_URL` and `REACT_APP_BACKEND_URL` values with the HTTPS Cloud Run service URL, rebuild both clients, and verify authenticated role-specific flows against the live service.
5. Only after the backend is healthy and compatible should the project owner deploy the tested Firestore rules. Then run live student/coordinator/admin checks and verify no service-account key copies remain on other devices or in any repository history that becomes available.

The Docker build intentionally excludes environment files, service-account keys, local emulator caches, and tests. Cloud Run is usage-based; review the current [Cloud Run pricing](https://cloud.google.com/run/pricing) and set budget alerts before enabling a billable project.
