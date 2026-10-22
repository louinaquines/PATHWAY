# SDD ledger — plan: project-notes/2026-10-22-WORKPLACE-LOCAL-UI-PLAN.md

User approved local implementation; baseline 5eb1b3e. Use existing checkout per user preference, preserve unrelated edits and parked direct-support work. No paid calls, deployment or APK.

Pre-flight: launcher supplies three UI/submission flags; backend registration and frontend demo/local guard must match. Student LogbookScreen already consumes its migration flag and consent component; reuse rather than duplicate. Coordinator review consumes AttendanceAccess and private POST APIs; server remains the authorization authority.

Tasks 1/2 in progress: write full-server route and actual dashboard integration regressions first. Task 3 pending: focused/full suites, one independent review and scoped local commit.

Final completion: Tasks 1–3 complete locally. Post-fix full backend 187/187, zero skips, and full web 201/201 across 46 suites passed. Bundler 5/5 passed. Evidence: workplace-ui-backend-final.log and workplace-ui-web-final.log. One independent review; transfer privacy finding fixed RED→GREEN, audit mutation gap fixed RED→GREEN. No deferred review minors. No browser/device walkthrough, deployment, paid request, worker enablement or APK. Acceptance and remaining release gates: WORKPLACE-LOCAL-UI-ACCEPTANCE.md.

Task 1: local list/auth RED (404 instead of 401) then GREEN; backend registration and launcher flags added. Student screen reused unchanged. Extended real-server mutation test exposed missing audit actions (503); fixed with explicit allowed event names, not a wildcard.

Task 2: actual dashboard navigation/denial RED then focused 21/21 GREEN. Vite/real esbuild regression exposed missing public flag and a browser process-shim assumption; fixed individual-key definitions and explicit default environment fields, bundler 5/5 GREEN. Initial full web 200/200 passed before the final privacy fix.

Independent review: one Important privacy finding, student transfers did not invalidate already displayed details when section documents stayed unchanged. Actual dashboard RED retained a private quote after transfer. Added profile invalidation for represented students; strengthened test also clears notices/draft and ignores a late action response. Focused review/dashboard tests 15/15 GREEN. No second review requested; full post-fix suites pending.

Ruling: extend the existing Vite public-key adapter to support the new nonsecret local flag; component tests alone missed its browser environment mismatch. Cost if wrong: local screen would fail to enable; real esbuild test now covers it.

Ruling: a student section/department change conservatively invalidates the private view even if the coordinator could still be authorized in the new section. Fresh navigation rechecks current authorization. Cost if wrong: an extra refresh rather than stale evidence exposure.

Ruling: keep the existing project-notes ledger and primary checkout as requested rather than create another worktree. Cost if wrong: unrelated changes must remain explicitly unstaged; no broad merge/staging is permitted.
