# Free-tier release checks and rollback

## Verified October 11, 2026 (Philippine time)

- Production /healthz responded with status ok.
- Render live deployment: dep-db587q8473hc73a7mr9g, commit dc1a174066ccfe95fa7557f4f85aa30b999299f5.
- Previous successful deployment with a rollback link: dep-db586hl9fdbs73buriq0, commit e4b60fc88610798982267d803aa9acec46f7b142. No rollback was executed.
- Render service notifications inherit workspace default: Only failure notifications. Actual delivery of an alert is not verified.
- Render Health Check Path was set to /healthz at the owner's request and persisted after reload. The endpoint returned status ok afterward. Screenshot: render-health-check-qa.png. Actual failed-health alert receipt remains unverified; no production outage was induced.
- Free instance can spin down; the dashboard warns requests can be delayed by 50 seconds or more. Account for cold starts in any external monitoring threshold.

## Rules recovery

Actual deployed rules and release identity are preserved in output/release/2026-10-10T18-50-43-497Z. Verify the saved file SHA-256 against release.json before use. This rules backup does not back up Firestore documents or Auth accounts.

If a future rules deployment breaks authorized access, use a dedicated Firebase config referencing the captured deployed-0.rules source and deploy only firestore:rules to pathway-57400. Do not deploy Hosting, indexes, or unrelated changes during recovery. Obtain explicit incident rollback authorization first, then verify owner, assigned coordinator, admin, and denied outsider queries.

## Backend recovery

Use Render's previous successful deployment rollback link only during an authorized incident. A code rollback is not a database restore. Confirm environment compatibility separately; do not assume older code restores environment settings or data. Rolling back from dc1a174 to e4b60fc removes the localhost test-origin code and can break local web testing.

After rollback, verify health, authentication, scoped reads, private downloads, and email readiness. Do not resend an uncertain email merely because deployment restarted.

## Remaining limits

- No production database backups, PITR, or production restore rehearsal; owner elected to stay free.
- HTTP health-check configuration is verified; failure-alert receipt remains unverified.
- Firebase Hosting release identity and Hosting rollback rehearsal remain outstanding.
- Local saved-data restore passed previously. Local rules rehearsal is separate from production deployment.
- Final approval success is backend/fixture verified, not a newly completed full UI run.

No paid services, production rollback, rules deployment, data reset, or notification changes were performed by these checks. The HTTP health-check path was the only production setting changed.
