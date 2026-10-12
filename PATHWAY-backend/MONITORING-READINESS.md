# Monitoring checkpoint — October 12, 2026

Status: partial. One-shot liveness checks are implemented; scheduled monitoring and delivered failure alerts are not verified.

Hourly pilot watch configured: Codex thread heartbeat pathway-health-watch is ACTIVE. It runs the read-only probe, retries one failure, and reports confirmed failure/recovery transitions in this chat without routine healthy updates. Recurring email alerts are NOT configured. Local scheduling depends on the computer and desktop app remaining available; network permissions and account usage limits can interrupt checks. The first scheduled run and actual incident/recovery notification remain unverified. This is not an independent always-on production monitor. Earlier disabled-state notes below describe prior checkpoints.

Recipient acceptance: the owner supplied a Gmail screenshot showing the exact synthetic monitoring alert in the Inbox of pathwaysystem4@gmail.com. One-time alert delivery is now verified. This does not establish an automatic failure detector, recurring scheduler, incident response or recovery-alert delivery; no automatic monitoring was enabled.

Approved alert test follow-up: Gmail accepted exactly one synthetic message to pathwaysystem4@gmail.com, subject "PATHWAY TEST ONLY — monitoring alert delivery check". Receipt is recorded locally to prevent accidental replay. The existing company sender validates send-only mail plus identity scopes; no mailbox read permission was used. Recipient Inbox/Spam receipt remains unconfirmed. No recurring monitor was enabled and no real outage was induced.

## Evidence

- Five health-probe unit tests pass: valid response, HTTP failure, malformed/unexpected payload, network/timeout sanitization, bounded request and rejected redirect.
- Production /healthz first request timed out after 15004 ms. Immediate retry returned HTTP 200 with status ok in 284 ms. Evidence is in output/release/health-2026-10-11T17-10-51-726Z and health-2026-10-11T17-11-05-738Z.
- Cause of the first timeout is not established. These observations do not establish sustained availability.
- Existing /healthz explicitly tests process liveness, not Firebase, mail, Cloudinary or authenticated workflow readiness.
- Source includes console error logging, but no verified alert-delivery integration was identified in this review. Raw exception logging still needs a secret/PII redaction review.
- No production settings, scheduled tasks, mailbox messages or provider records were changed. No test outage was induced.

## Operator checks still required

1. Confirm the deployed Render health-check path is /healthz and identify its failure notification recipient. Do not assume a successful endpoint response means Render monitoring is configured.
2. Select the intended alert recipient and free monitoring mechanism before configuring recurring requests or sending test alerts. Use retries/consecutive failures to avoid alerting on one transient timeout; record recovery notifications separately.
3. Exercise a synthetic failure locally and a clearly labelled test alert to the approved recipient, without stopping production. Verify receipt and document acknowledgement/escalation responsibility.
4. Review deployment failure logs and sanitized application error logs; ensure alerts contain no tokens, passwords, document URLs or student content.
5. Keep production recovery, mobile dependency and device acceptance gates open.

Manual one-shot check: node security-tests/production-health-readonly.js. A nonzero exit reports probe failure, not a diagnosis. This command does not start monitoring or send an alert.
