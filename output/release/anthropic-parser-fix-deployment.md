# Anthropic parser fix — October 12, 2026 (Asia/Manila)

- Commit: 70111b235c928a258ffafd2a88e76372574ba671; pushed to main.
- Only the provider parser and its regression test were committed. Manuscript and unrelated work excluded.
- 35 focused mocked backend tests passed.
- User-supplied private smoke results confirm refinement, journal, attendance and document assistance passed synthetic provider tests. Five paid requests total, including the initial failed refinement; conservative cumulative reservation USD 0.0656 is not actual billing.
- Parser accepts thinking blocks but returns only final text; malformed or thinking-only output remains rejected.
- ANTHROPIC_ENABLED readback was 0 before deployment. Correct ANTHROPIC_DAILY_REQUEST_LIMIT key is present. No API key was revealed.
- Render deployment: dep-db5uj02jnfac73bpj9t0; source 70111b2. Verified Deploy succeeded | Live (46.2 seconds).
- Public backend health returned HTTP 200 in 223 ms; evidence: health-2026-10-11T19-55-32-807Z. Liveness only, no alerts or production writes.
- Screenshot: anthropic-parser-fix-deployment.png.
- No additional paid requests, database writes, AI enablement or manuscript edits performed during this deployment.
- Synthetic provider success does not establish authenticated in-app acceptance or full production readiness.
