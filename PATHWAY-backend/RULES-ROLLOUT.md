# Full-rules rollout gate

Target: pathway-57400. Rules-only deployment approved by the owner and completed October 12, 2026 (local date).

## Executed rollout

- Fresh prior source/release: output/release/2026-10-11T17-01-51-658Z.
- Command: deploy --only firestore:rules --project pathway-57400 --config firebase.json --non-interactive.
- Compilation and deployment succeeded. No index, Hosting or backend deployment was requested.
- Post-deployment evidence: output/release/2026-10-11T17-02-40-133Z. Active ruleset: projects/pathway-57400/rulesets/16b7a0ba-1906-4574-af28-3bc0a909dc19. Deployed firestore.rules SHA256 matches the local approved file exactly.
- Live read-only test coordinator smoke passed: own profile, assigned sections and scoped student queries allowed; unscoped student query and signed-out profile read denied. Zero Firestore writes, no student approvals changed. No password or tokens saved by the smoke helper.
- Live student acceptance passed per owner-provided terminal output: own profile, assigned section, seven student query checks, other-profile denial, unscoped student-list denial and signed-out profile denial. Zero Firestore writes and no student approval changes were reported. No rollback was performed. Remaining Phase 9 gates still apply.

1. Preserve current deployed release and checksum-verified source using security-tests/capture-production-rules.js. Existing evidence: output/release/2026-10-11T16-41-25-847Z. Refresh immediately before any approved rollout.
2. Run the complete isolated security suite and web regression. Full firestore.rules must deny direct server-owned review/mail collection access, protect role/section ownership and preserve password-change gates.
3. Verify index readiness for actual app/backend queries; emulator tests alone do not prove production composite-index availability.
4. Obtain explicit owner approval to deploy only the full rules to pathway-57400. Do not deploy Hosting/backend/index changes implicitly.
5. After deployment, recapture release identity and compare rule checksums with the approved local file. Smoke-test authorized coordinator/student reads and outsider denial; do not approve test students as part of rollout.
6. On regression, stop writes and obtain owner approval before restoring the captured prior ruleset. The old messages-only ruleset is rollback evidence, NOT a secure long-term production baseline. Rollback does not recover database contents.
7. Record deployed release identity, approved source hash, checks performed, rollback decision and known remaining gates. Never include credentials.

Runtime/mobile dependency advisories, production-wide backup gaps, alert-delivery evidence and localhost-origin removal remain separate release gates. A passing rules deployment does not make the system production-ready.
