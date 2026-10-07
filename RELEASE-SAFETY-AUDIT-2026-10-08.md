# Read-only release-safety audit — October 8, 2026

DTR/OCR is deferred until an actual template and hour-accounting rules are available. This audit did not deploy services, install packages, change credentials, or edit the manuscript.

## Confirmed blockers

Latest exposure follow-up: see `DEPENDENCY-EXPOSURE-2026-10-08.md`. A scoped jsonpath/Underscore patch reduced staff findings to 103 (64 high, 36 moderate, three low, zero critical). All 44 staff tests and the production rebuild passed. Most reviewed advisory source paths are absent from staff bundles; React Router and ExcelJS's embedded UUID do ship, but their reported vulnerable usage was not found in the inspected current application paths. This is exposure triage, not removal of those remaining dependency findings.

- Production-preflight tests: 3/4 passed. Packaging assertion fails because Dockerfile omits `studentInbox.js` and `geofence.js`. It also flags the conditional local-only `localCloudinaryQa.js` import; production should explicitly exclude that path or package the module without its credentials. The repeated geofence message is a validator duplicate, not two missing files.
- Docker is not available on PATH, so container build/start has not been verified.
- Backend runtime dependency audit: 5 findings (1 critical, 2 high, 2 moderate). Affected packages include proxy-addr, @grpc/grpc-js, @fastify/busboy, gaxios and uuid. npm indicates fixes exist; compatibility and actual runtime exposure must be reviewed before applying changes.
- Student runtime dependency audit: 52 findings (2 critical, 36 high, 14 moderate). These are dependency-tree counts, not proof of reachable exploits. Expo-compatible remediation and regression testing are required.
- Production preflight is not automatically invoked by `npm start`. It does not validate EVALUATION_WEB_URL, although the actual email endpoint requires one. Add explicit production startup enforcement and URL validation before release.

## Positive checks and limitations

- Selected Git-tracked filename checks found no environment files, service-account files, or emulator Auth snapshots. This is not a complete content/history secret scan.
- Backend uses Application Default Credentials rather than a bundled service account. Real service-identity permissions still require staging verification.
- Existing local automated regression passed 35 backend security tests, 44 staff web tests, and 23 student helper tests. These do not override the packaging/advisory blockers above.
- Staff dependency audit: 119 findings (2 critical, 77 high, 37 moderate, 3 low). Build tooling such as react-scripts is declared under dependencies, so `--omit=dev` includes tooling as well as application dependencies. Triage shipped browser code separately from build-time exposure; this is not 119 confirmed exploitable application vulnerabilities.

## Next implementation order

1. Correct container packaging and strengthen production startup/configuration guards.
2. Triage advisories and apply compatible fixes with repeat regression checks; avoid blanket forced upgrades.
3. Verify the backend image in an environment with Docker available.
4. Select hosting, configure staging HTTPS/SMTP/evaluation URL, and verify real uploads/downloads/email with approved recipients.
5. Verify production rules/indexes, backup/restore, monitoring and rollback before release.

## Compatible backend dependency remediation — October 8, 2026

## Compatible student and staff dependency remediation — October 8, 2026

Applied non-forced `npm audit fix --ignore-scripts` in both frontend projects, preserving their existing dependency ranges except explicitly aligning student react-native-svg to Expo's expected 15.12.1. Student Expo resolved to 54.0.37; React 19.1.0 and React Native 0.81.5 remain unchanged. Staff react-router-dom resolved to 6.30.6; react-scripts remains 5.0.1. No forced Expo/Firebase downgrade or react-scripts 0.0.0 replacement was applied.

Fresh audit counts: student 40 findings (28 high, 12 moderate, zero critical), down from 52; staff 106 findings (67 high, 36 moderate, three low, zero critical), down from 119. The student installer initially reported 39 findings; the subsequent fresh registry audit reported 40, which is the retained final count. These totals include toolchain/transitive packages and are not counts of confirmed reachable application exploits. Remaining findings still require dependency-chain and shipped-code exposure review.

Verification: 23 student helper/geofence/pagination/feedback tests and all 44 staff tests across 16 suites passed. Staff production build compiled successfully. Android Hermes export passed (1051 modules) after retrying outside the sandbox, which initially denied writing its temporary bytecode file. Expo's offline compatibility check reports dependencies up to date, but explicitly warns that offline validation is less reliable. The existing App.test.js act warning remains. Physical-phone runtime and browser journey acceptance after these updates remain separate; no production deployment or manuscript changes occurred.

## Backend dependency update details

Applied `npm audit fix --ignore-scripts` without force or major-version overrides. The lockfile updates proxy-addr 2.0.7 → 2.0.8, @grpc/grpc-js 1.14.4 → 1.14.5, @fastify/busboy 3.2.0 → 3.2.2, firebase-tools 15.31.0 → 15.32.1, and its MCP SDK 1.30.1 → 1.32.1. Direct dependency ranges were preserved.

The production-only audit fell from five findings (one critical, two high, two moderate) to two moderate findings: gaxios 6.7.1 and uuid 9.0.1 in the Google Cloud Storage chain. gaxios declares uuid ^9.0.1; forcing uuid 11 would cross its declared compatibility range. These remain open pending an upstream-compatible solution. The full backend tree still reports 16 findings (12 high, four moderate), including development tooling; no forced Firebase downgrade was applied.

Verification after installation: all seven production-preflight tests and all 35 isolated emulator security tests passed. Lockfile diff check passed. A separate check of the existing local demo health URL on port 3100 was connection-refused, so this pass does not claim that the phone demo server is running. The isolated test backend health test passed. Student/staff dependency trees were not modified. Docker and staging verification remain pending.

## Packaging and startup remediation — October 8, 2026

The original findings above are retained as the audit record. Container packaging now includes the missing runtime modules, explicitly sets port 8080, and excludes environment variants, emulator snapshots, and credential-key files from its build context. The local QA module is packaged without credentials and its activation flags are rejected in production.

Production startup now runs configuration validation before Firebase initialization and does not load local dotenv files. It rejects local workflow/emulator overrides and requires a structurally valid HTTPS evaluation origin without credentials, paths, query strings, fragments, or literal IP/local hosts. This does not prove DNS reachability or email delivery.

Verification: 7/7 production-preflight tests and 35/35 isolated backend security tests passed; modified backend JavaScript syntax and diff checks passed. The running local backend remained healthy (HTTP 200). Docker remains unavailable, so the image has not been built or started. No dependency upgrades, production deployment, secret changes, or manuscript edits were performed. Dependency advisory remediation is next.
