# PATHWAY Student App Design

## Product character

PATHWAY should feel dependable, calm, and quick to understand. Students use it to complete school and workplace responsibilities, so the interface favors clear status, low-friction actions, and readable records over decoration. Borrow proven interaction patterns from familiar consumer apps—predictable navigation, scannable lists, strong page hierarchy, useful feedback, and focused task surfaces—without copying their branding or importing unrelated social features.

## Brand and color

- Light, low-chroma neutrals anchor the workspace; avoid large navy surfaces.
- Use the logo's clear cobalt blue for actions, links, and selected states, with gold as a restrained accent.
- Gold is a restrained brand accent for progress and emphasis; do not use it for small text on white.
- White and cool, low-chroma neutrals form the everyday workspace.
- Semantic success, warning, and danger colors communicate state independently of brand color.
- Verify text and icon contrast for every surface; never rely on color alone to express status.

## Typography and branded surfaces

- Use the locally bundled **Newsreader** for editorial screen titles and the primary OJT-hours figure; use **IBM Plex Sans** for body copy, labels, controls, forms, and dense data. The local font files are loaded once through Expo Font; do not fetch fonts remotely.
- Prefer regular and medium weights for reading. Use semibold/bold faces for hierarchy, not heavy weights or wide tracking on ordinary copy. On Android, select the matching bundled face per weight; if font loading fails, retain the platform's native family and declared weights.
- Apply the shared student `AppText` and `AppTextInput` wrappers so headings, screen copy, placeholders, and entered text use consistent type rules.
- Use the approved 2026 cutout at `assets/pathway-logo-2026-cutout.png` through the shared `PathwayMark` component. Do not redraw or approximate the PATHWAY mark with SVG. Keep the artwork transparent on app screens and watermarks—do not place it on an opaque rounded tile. Maintain contrast by choosing a suitable surrounding surface; platform icons may use an intentional background required by their format.

### Student Home pilot

- Home is the first layout pilot; other student screens keep their workflows and information architecture while adopting the shared type and brand rules.
- Establish one focal point: the OJT progress hero with rendered/required hours, percentage, remaining hours, and a direct progress link.
- Keep the greeting, two supporting metrics, official placement, and recent activity quieter than the hero. Use whitespace, dividers, and compact rows instead of giving every item an equal-weight card.
- Keep quick actions for Messages and New Log available, preserve the existing bottom navigation, and leave coordinator-approved placement read-only.
- Match the loading skeleton to the final page silhouette. Error states should explain the failure, offer a retry, and preserve already-loaded content when possible.

## Layout and hierarchy

- Keep the student experience phone-first and responsive to wider layouts.
- Give each screen one clear title, a concise explanation when useful, and an obvious next action.
- Prioritize the current task or status, then supporting detail, then history.
- Use cards only when they group related information or an action. Prefer rows, dividers, whitespace, and section labels for lists and secondary details.
- Keep persistent navigation and global actions in predictable positions, clear of scrollable content and device safe areas.
- Use consistent spacing and type tokens from `theme.js`; allow content to wrap and scale with accessibility settings.

## Components and interaction

- Use the existing SVG icon set; do not use emoji as interface icons.
- Inputs keep visible labels, clear focus and error states, and helpful validation copy.
- Statuses use both a concise label and a semantic visual treatment.
- Loading states should resemble the content they replace; empty and error states should explain what happened and offer an appropriate next step.
- Motion is brief and purposeful: it may show continuity, selection, or completion. Respect reduced-motion preferences and never gate access on an animation.
- Touch targets should be comfortable on phones, and controls must expose meaningful accessibility labels and selected/disabled states.

## Inspiration boundaries

Patterns may be informed by social, communication, productivity, navigation, finance, and media apps. Apply only transferable principles such as familiar navigation, content scanning, strong hierarchy, contextual actions, and trustworthy feedback. Do not copy a product's visual identity or add feeds, reactions, follows, or other features outside PATHWAY's student OJT workflows.
