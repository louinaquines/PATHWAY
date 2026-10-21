# Attendance integration — 2026-10-21

Integrated the reviewed attendance-risk work through146688f into the primary checkout. Existing placement UI edits, top-level Markdown moves, health evidence and parked workplace-support work are preserved. The two pre-existing planning/checklist documents were backed up to output/release/attendance-integration-backup-20261021 before merging their reviewed versions.

Dockerfile now copies attendanceExcusedDates.js and attendanceRiskAlerts.js. A direct assertion failed before the change and passed afterward. The existing production packaging validation and focused attendance Node tests passed66/66. Docker is not installed on this machine: actual image build/startup remains unverified.

Primary-checkout portal integration verification passed165/165 tests across41 suites, including the preserved placement UI edits. Initial sandbox invocation could not write Jest's transform cache (zero tests ran); authorized retry passed. Logs: output/release/attendance-integration-node.log and attendance-integration-web-retry.log. Backend source matches the already-reviewed/tested candidate except the Docker COPY fix; the prior85-test emulator verification remains recorded separately, not presented as a new run.

The worker remains explicitly local-only and default-off. No production flag was loosened and no scheduler resource, account, billing, deployment, email or APK was changed.

## Daily execution decision needed

The approved due time is00:15 Philippine time, but the bounded worker must continue scanning and retrying beyond one batch. A single daily invocation would miss students beyond that batch. A sleeping web host's in-process timer does not guarantee execution.

Before production implementation, choose an execution host: an always-running worker, or an external scheduled job that continues bounded processing with durable progress. Selection may require a paid resource or service credentials; neither is authorized by this integration. Keep the existing fail-closed production guard until that design is approved and tested. Production index deployment and container startup verification remain separate gates.

No deployment or preview APK is part of this integration.
