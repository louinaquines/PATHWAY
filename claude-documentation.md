# Claude Documentation — Session 2026-11-12

Everything done in this session, in order.

## 1. Analysis (no code changes)
- Read the whole repo, the manuscript (PATHWAY-OJT-Management-System-with-AI-Analytics-1) and all .md files.
- Finding: `PATHWAY-DOCUMENTATION.md` is out of date; many features are only recorded in `project-notes/*.md`.
- Finding: the live portal was built from branch `codex/placement-workspace` (f535242), which is **not on main**.

## 2. Announcements & Alerts UI fix (coordinator)
- Branch `codex/notifications-ui-fix`, commit `4adeedd` (based on f535242). Pushed to GitHub.
- Files: `PATHWAY-web/src/pages/NotificationsTab.js`, `NotificationsTab.css`
  - Panel fills width; header has a divider; filter dropdown restyled with chevron; count shown as a pill.
  - Empty state now has an icon, title and hint instead of plain text.
- Tests: 12/12 focused tests pass; build passes.

## 3. Deploy incident (portal went blank)
- `tmp/deploy-notif-fix.cmd`: the build step was interrupted (`^C` in `tmp/notif-deploy.log`), but
  `tmp/deploy-notif-fix-step2.cmd` (run via `tmp/deploy-all.cmd`) still deployed hosting → **an incomplete build went live at 7:34 PM (release 8a0382) → blank page**.
- Fix: user rolled back to release **4e13fb (4:53 PM)** in Firebase Hosting.
- `tmp/rebuild-deploy.cmd` attempt failed: `'vite' is not recognized` (packages not installed in `%TEMP%\pathway-notif-fix`). Nothing deployed.
- **Current live portal = 4e13fb (before today's changes).**
- Lesson: only deploy after the log shows `✓ built in …`.

## 4. Requirement auto-check (design + implementation)
- Design: `project-notes/REQUIREMENT-AUTO-CHECK-DESIGN-2026-11-12.md`
- Implementation details: `project-notes/REQUIREMENT-AUTO-CHECK-IMPLEMENTATION-2026-11-12.md`
- Branch `codex/requirement-auto-check` (on top of the UI fix):
  - `2b3ea8f` backend + first UI: reference file per requirement, deterministic name match (`nameMatch.js`), Green/Yellow/Red tiers, optional auto-approve with undo, audit logs. Pushed to GitHub.
  - `ee311f8` simpler coordinator UI: "📄 Add reference file" button, drag-and-drop upload, 3-step guide, advanced options collapsed, tip banner on Sections → Requirements.
  - `43b34f6` same button added to **Student Requirements** page on every requirement (works without AI).
  - `ee311f8` and `43b34f6` are in the local repo only — run `git push origin codex/requirement-auto-check`.
- Tests: name-match 5/5; web build passes; component tests 76/76. Emulator tests not run (need Java 21).
- Not deployed. Needs merge to main (Loui), Render backend deploy, then portal deploy.

## 5. Known issues / to do
- Auto-approve does not recompute the student's overall `requirementsStatus` — keep auto-approve off for Pre-OJT until fixed.
- Reference file limit 700 KB (stored in Firestore).
- Green/Yellow/Red badges need `ANTHROPIC_ENABLED=1` on Render and student AI consent.
- Re-deploy the Announcements fix properly (install → build → confirm → deploy).
- Leftover git temp folders moved to `.git/stale/` (safe to delete).
- Update `PATHWAY-DOCUMENTATION.md` to point to these notes.

## 6. Portal deployed from branch (8:22 PM)
- Built and deployed `codex/requirement-auto-check` (7c43058) to pathway-portal.web.app from worktree `PATHWAY-main\%TEMP%\pathway-autocheck` (PowerShell did not expand %TEMP%).
- Live now: Announcements fix + "Add reference file" buttons. Backend NOT updated yet, so saving reference files fails until Render deploys the merged branch.
- If broken: roll back to 4e13fb in Firebase Hosting.

## 7. Blank portal root cause + reference button moved
- Blank page cause: build had no Firebase keys (`auth/invalid-api-key`). Keys are in `PATHWAY-web/.env`; only `.env.production` had been copied. Always copy both before building.
- Reference files now set from one **"📄 Reference files"** button at the top of Student Requirements (per requirement, for the whole section), not per student row.
- Final decision: reference files are set **only** in Sections & Students → Requirements & deadlines (per requirement, whole section). The Student Requirements page has no upload button; it only shows badges and Undo.
- Render deploy failed: `Cannot find module ./nameMatch` — Dockerfile copies files by name. Added nameMatch.js to the Dockerfile COPY list.

## 8. Anthropic account hold (Nov 12, 2026)
- Account pathwaysystem4@gmail.com put on hold ("unusual activity"); $5.54 of $5.60 credits refunded. Review ref TS-01a1cf3d-fd13-75d0-975a-007858d3bb67.
- Decision: request review + ask support; do not open another account. Optional: Gemini fallback with Claude as default (pending adviser approval).
- Summary handout: https://claude.ai/artifact/Jp91KoCYanr9UCzmX9sAjZ
