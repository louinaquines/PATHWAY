# Claude Documentation — Session 2026-11-12

Everything Claude did with the team in this session, in order. Latest state is at the bottom.

## 0. Setup / configuration used
- Repo on PC: `C:\Users\Lenovo\PATHWAY-main` (GitHub: louinaquines/PATHWAY). Claude worked in a cloud copy and pushed commits into this local repo; pushes to GitHub were done from Windows.
- Git commit author used: `Loui <louinaquines@gmail.com>` (+ Claude co-author trailer).
- Live services:
  - Coordinator portal: Firebase Hosting site `pathway-portal` (project `pathway-57400`), config `firebase.portal-hosting.json`, build output `PATHWAY-web/build-vite`.
  - Backend: Render `PATHWAY-backend` (srv-db4iq96i0phs73cr7au0), Docker build from `PATHWAY-backend/Dockerfile`.
  - AI: Anthropic Claude (`claude-haiku-5-5`) via env `ANTHROPIC_API_KEY`, `ANTHROPIC_ENABLED`, `ANTHROPIC_MODEL`, `ANTHROPIC_DAILY_REQUEST_LIMIT`, `REQUIREMENT_AI_ENABLED`.
- Firebase CLI isn't on PATH; use `PATHWAY-backend\node_modules\.bin\firebase.cmd`.
- Build worktree: `C:\Users\Lenovo\PATHWAY-main\%TEMP%\pathway-autocheck` (literal folder name — PowerShell didn't expand `%TEMP%`). Remove later with `git worktree remove --force "%TEMP%\pathway-autocheck"`.
- **Portal build needs BOTH** `PATHWAY-web/.env` (Firebase keys) **and** `.env.production` (backend URL) copied into the build folder.

## 1. Analysis (no code changes)
- Read the repo, the manuscript (PATHWAY-OJT-Management-System-with-AI-Analytics-1) and all .md files.
- `PATHWAY-DOCUMENTATION.md` is out of date; many features are only in `project-notes/*.md`.
- The live portal had been built from `codex/placement-workspace` (f535242), which is **not on main**.

## 2. Announcements & Alerts UI fix (coordinator)
- Branch `codex/notifications-ui-fix`, commit `4adeedd` (based on f535242).
- `PATHWAY-web/src/pages/NotificationsTab.js` / `.css`: full-width panel, header divider, restyled filter dropdown, count pill, empty state with icon and hint.
- Tests 12/12 focused; build passes.

## 3. Requirement auto-check feature
- Design: `project-notes/REQUIREMENT-AUTO-CHECK-DESIGN-2026-11-12.md`
- Implementation: `project-notes/REQUIREMENT-AUTO-CHECK-IMPLEMENTATION-2026-11-12.md`
- Branch `codex/requirement-auto-check` commits:
  - `2b3ea8f` backend + first UI: reference file per requirement, deterministic name match (`nameMatch.js`), Green/Yellow/Red tiers, optional auto-approve, undo, audit logs.
  - `ee311f8` simpler UI: "📄 Add reference file", drag-and-drop, 3-step guide, advanced options collapsed.
  - `43b34f6`, `51e55c1` experiments placing the button on Student Requirements (later removed).
  - `dcbe182` **final:** reference files set only in **Sections & Students → Requirements & deadlines** (one per requirement, for the whole section). Student Requirements shows only badges + Undo.
  - `d14983a` Dockerfile: add `nameMatch.js` (Render failed with `Cannot find module './nameMatch'`).
  - `7c43058`, `7efcde1` this documentation.
- Tests: name-match 5/5; web build passes; component tests 76/76. Emulator tests not run (need Java 21).

## 4. Deploy incidents and fixes
- 7:34 PM deploy (release 8a0382) → **blank portal**. Rolled back to **4e13fb (4:53 PM)**.
- 8:22 PM deploy from the branch → **blank again**. Console: `auth/invalid-api-key`.
- **Root cause of both:** the build had no Firebase keys — only `.env.production` was copied, not `.env`. (An interrupted build was also involved earlier.)
- Fixed by copying both env files and adding a check that the key (`AIza…`) is in the bundle before deploying. Portal then loaded correctly.
- Render backend: branch temporarily switched to `codex/requirement-auto-check` for testing; first deploy failed (missing `nameMatch.js` in Dockerfile), fixed in `d14983a`.

## 5. Anthropic account hold
- Nov 12, 2026: account pathwaysystem4@gmail.com put **on hold** ("unusual activity"). $5.54 of $5.60 credits refunded (≈ $0.06 used). Review ref `TS-01a1cf3d-fd13-75d0-975a-007858d3bb67`, ~10 days, decisions final.
- Decision: submit review + contact support; **do not** open another account or try to hide the project (would count as getting around the hold).
- Option offered: Gemini fallback provider with Claude as default (needs adviser approval; small manuscript note).
- Handout: https://claude.ai/artifact/Jp91KoCYanr9UCzmX9sAjZ

## 6. Current state (end of session)
- GitHub `codex/requirement-auto-check`: code up to `d14983a`; docs commit `7efcde1` waiting to be pushed (`tmp\a-push.cmd`).
- Portal: deployed from the branch (with Announcements fix + reference-file UI) — check it matches `dcbe182`; redeploy if it still shows the button on Student Requirements.
- Render: may still be on branch `codex/requirement-auto-check` — **switch back to `main`** after Loui merges.
- AI: off in practice (account on hold). Uploads go to coordinator review.

## 7. To do
- Loui reviews and merges `codex/requirement-auto-check` → `main`; Render back to `main`.
- Fix: auto-approve doesn't recompute `requirementsStatus` (keep auto-approve off for Pre-OJT).
- Reference file limit 700 KB (Firestore) — move to Cloudinary if needed.
- Run backend emulator tests (`npm run test:security`, Java 21).
- Update `PATHWAY-DOCUMENTATION.md` to point to these notes.
- Clean up `.git/stale/` and the `%TEMP%` worktree folder.
