# Requirement Auto-Check — Implementation (2026-11-12)

Branch: `codex/requirement-auto-check` (based on `codex/notifications-ui-fix`). Design: `REQUIREMENT-AUTO-CHECK-DESIGN-2026-11-12.md`.

## What the coordinator gets
- **Sections → Requirements & deadlines**: each requirement now has a chip — *Set up auto-check* / *Auto-check on* / *Auto-check + approve*.
- Button text: "📄 Add reference file" → after upload "✓ Reference: <file>". A tip banner on the page points to it.
- Button opens a dialog: 3-step guide, big drag-and-drop box (uploading turns auto-check on), name-match toggle, and collapsed "Advanced options" (phrases, notes, auto-approve). Contents:
  - On/off toggle for auto-check
  - **Reference / standard file** upload (PDF/PNG/JPEG, ≤ 700 KB) — a correct sample of the document
  - "Name on the document must match the student's profile" (default on)
  - Required words/phrases (one per line, up to 20)
  - Notes for the checker
  - **Auto-approve when Green** (optional)
- **Student review view**: result shows a **Green / Yellow / Red** badge plus the name-check result. Auto-approved items show **"Auto-approved · Undo"**.

## How a check is decided
1. Student uploads (with AI consent) → existing job queue (`requirementCheckJobs`, runs every 60 s).
2. Claude (`claude-haiku-5-5`) gets the reference file + the student file, returns checklist results and the name as printed (`nameOnDocument`).
   - Extra checks when configured: `reference_match`, `required_phrases`.
3. **Name match is done in code, not by AI** (`nameMatch.js`): handles case, accents/ñ, "LAST, FIRST M.", middle initials, "Ma." = Maria, Jr./III; one-letter typo → partial.
4. Tier:
   - **Green** = all checks passed and name matches
   - **Red** = name mismatch, wrong document type, or doesn't match reference
   - **Yellow** = everything else (partial name, unreadable, AI unavailable…)
5. Green + auto-approve on → status `approved`, `reviewedBy: 'system'`, `autoApproved: true`, audit log `automatic_approval`.
6. **Red is never auto-rejected** — it stays `submitted` for the coordinator.

## Files changed
| File | Change |
|---|---|
| `PATHWAY-backend/nameMatch.js` | New deterministic name comparison |
| `PATHWAY-backend/requirementCheckPolicy.js` | `withAutoCheck()` adds reference/phrase checks; lets custom requirements be checked when auto-check is on |
| `PATHWAY-backend/anthropicAnalysis.js` | Sends reference + submission; asks for `nameOnDocument`; prompt for new checks |
| `PATHWAY-backend/requirementChecks.js` | Loads reference, name check, tier, optional auto-approve, audit |
| `PATHWAY-backend/server.js` | `GET/PUT /coordinator/sections/:sectionId/requirements/:requirementId/auto-check`; `POST /coordinator/students/:studentId/requirements/:requirementId/undo-auto-approval`; `getReference` wiring |
| `PATHWAY-web/src/components/RequirementAutoCheckDialog.js/.css` | New settings dialog |
| `PATHWAY-web/src/pages/SectionsTab.js` | Auto-check chip per requirement |
| `PATHWAY-web/src/components/RequirementCheckResult.js/.css` | Tier + name badges, labels for new checks |
| `PATHWAY-web/src/pages/CoordinatorDashboard.js` | Undo auto-approval button |
| `security-tests/name-match.test.js`, `requirement-checks.test.js` | New tests |

## Data
- `sections/{sectionId}/requirements/{reqId}.autoCheck = {enabled, autoApprove, nameMustMatch, requiredPhrases, notes, referenceVersion, referenceName, updatedAt, updatedBy}`
- `requirementReferences/{sectionId}_{reqId} = {data(base64), fileName, uploadedAt, uploadedBy}` — server-only (Admin SDK).
- `users/{id}.requirements.{reqId}.autoReview` gains `tier`, `nameCheck`; requirement may gain `autoApproved`, `autoApprovalUndoneBy/At`.

## Known limits / follow-ups
- Reference stored in Firestore (≤ 700 KB). Move to Cloudinary later if bigger files are needed.
- Auto-approval updates the requirement only; it does not recompute `requirementsStatus` the way the manual decision route does. Coordinator dashboard still shows it approved; recompute on next manual action. **Fix before relying on auto-approve for Pre-OJT gating.**
- Still needs `ANTHROPIC_ENABLED=1` and `REQUIREMENT_AI_ENABLED≠0` on Render, and student AI consent per upload.
- Manuscript wording: call it "AI-assisted pre-screening with optional coordinator-enabled auto-approval", not "legitimacy verification".

## Testing
- `name-match.test.js`: 5/5 pass.
- Web: `npm run build` passes; component tests 76/76.
- Emulator tests (`requirement-checks.test.js`, incl. new auto-approve/red test) **not run here** (needs Java 21). Run: `npm run test:security` in `PATHWAY-backend`.
