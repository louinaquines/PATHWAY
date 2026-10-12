# Anthropic in-app acceptance checkpoint

Date: October 12, 2026 (Asia/Manila).

## Completed without paid requests

- Backend focused regression: 35/35 passed using mocked provider and database fixtures.
- Web regression: 38 suites, 121/121 tests passed. These are component/integration fixtures, not hosted authenticated acceptance.
- Coverage includes consent, discard, stale-result handling, sanitized failures, ownership/role gates, output validation, disabled mode and bounded provider requests.
- Parser revision 70111b2 was previously verified live; production AI remains disabled at the last verified checkpoint.
- No production settings, student records, credentials, billing or manuscript were changed in this checkpoint.

## Next controlled acceptance gate

Requires explicit owner approval to temporarily enable production AI and consume paid requests. Do not silently enable it.

1. Use only an authorized fictional test student and coordinator. Identify the exact test entries before submitting requests; never send unrelated personal records.
2. Confirm model, daily quota and disabled flag without displaying the API key. The process-local daily quota is not a durable billing cap; keep the provider workspace spend cap in place.
3. With owner authorization, temporarily enable AI. Test at most one request per feature: student refinement, coordinator journal review, attendance explanation and document assistance. Do not automatically retry failed requests.
4. Verify opt-in consent, final-text-only display, source evidence, unchanged attendance values, human-review labeling and discard behavior through the actual authenticated UI.
5. Do not save refinements, change approvals, upload documents or modify source records as part of this acceptance run.
6. Disable AI again after the run, verify the disabled flag and backend health, and record each actual result separately from mocked/provider-only evidence.

Hosted authenticated acceptance is still pending. Mobile device acceptance and full production readiness are separate gates.

## Owner authorization and session prerequisite

- Owner approved temporary enablement and at most four paid fictional-data requests, followed by disablement.
- Browser inventory contained Render, Firebase recovery console and an isolated mocked visual fixture; no authenticated PATHWAY app session was available.
- Opened the hosted staff portal at https://pathway-57400.web.app/; it redirected to /login and requires coordinator or administrator sign-in. Coordinator role is required for these analysis routes.
- Paused before enablement pending owner sign-in to the assigned test coordinator. No paid requests or environment changes occurred. Do not substitute the isolated visual fixture for live acceptance.

## Authenticated prerequisite follow-up

- Owner signed into the assigned coordinator; BSIT 4G and Dexter were observed through the actual hosted UI.
- Dexter's weekly-journal view reports no entries after loading. A journal-analysis test cannot run without an existing entry; creating one requires a separately authorized record write.
- Found hosted analytics using malformed `http://localhost:3000;` from the local web .env. Rebuilt with process-scoped REACT_APP_BACKEND_URL=https://pathway-backend-49a9.onrender.com and REACT_APP_LOCAL_EMULATOR=0; local .env was not edited.
- Vite build passed (760 modules; existing PDF/chunk warnings). Firebase Hosting-only deployment succeeded, asset index-BkZgYTT8.js. Checked build contains the Render URL and not the malformed URL.
- Fresh hosted navigation confirmed analytics now loads two interns, including Dexter, and exposes Explain with AI. Schedule-dependent metrics remain Unavailable, not fabricated.
- AI was not enabled and no paid calls were made in this follow-up. No source records or approvals changed. Student refinement still requires a student session; journal review requires a test journal fixture.

## Hosted coordinator acceptance — October 12, 2026

- Owner authorized up to four paid requests on fictional accounts. Actual controllable student tab remained CoordinatorDashboard; the screenshot of Janeil's student Logbook was from a separate browser session unavailable to the automation surface. Student refinement remains pending, not passed.
- Temporarily set only ANTHROPIC_ENABLED=1 and applied via Render Save and deploy (dep-db5uvmu7bikc73e5hiag). No API key revealed.
- Exactly three request-button activations, one per coordinator feature; no retries.
- Journal: Janeil Week 4, original `test logbook entry`. Returned supported missing-content finding, no invented competencies or tone. Advisory/human-review limitation shown. Discard findings removed the output.
- Attendance: Janeil snapshot 2026-10-12. Preserved creditedHours=120.02 and completionPercentage=22; missing schedule-dependent metrics stayed Unavailable. No risk guarantees or fabricated values. Discard explanation removed output.
- Document: Dexter's fictional test endorsement. Visually reviewed source portion and limited excerpt to TEST ONLY disclaimer and no-institutional-authorization statements. No file bytes sent by this workflow. Returned no supported findings with explicit warning that this does not prove completeness/authenticity. Discard findings removed output.
- Screenshots: anthropic-journal-hosted.png, anthropic-attendance-hosted.png, anthropic-document-hosted.png.
- No approve/reject/save-draft/upload controls activated; no student records or approvals intentionally changed. UI behavior is not an independent database before/after audit.
- Set ANTHROPIC_ENABLED=0 and submitted Save and deploy immediately after tests. Shutdown deployment dep-db5v30flk1mc73bbcnb0 verified Deploy succeeded | Live for 70111b2. Environment flag readback confirmed 0.

## Phone refinement acceptance — awaiting owner result

- Owner opened an unsaved fictional TEST ONLY draft in Expo Go. One authorized paid acceptance request remains.
- Temporarily changed only ANTHROPIC_ENABLED to 1; value verified before Save and deploy. Deployment dep-db5v9pajnfac73bruljg verified Deploy succeeded | Live.
- Awaiting owner tap of Refine with AI then Send notes once. No request issued by the agent; refinement acceptance is not yet passed. Do not submit the draft or retry errors.
- AI is temporarily enabled pending phone result; must disable and verify shutdown after result.

- Owner supplied 1000653947.jpg confirming Expo Go displayed an AI suggestion for the unsaved fictional draft. Original notes remained visible; suggestion retained login testing, two validation errors, and no production changes. Refinement in-app acceptance passed based on owner screenshot; no journal submission shown.
- Final authorized request consumed. AI shutdown submitted immediately afterward; deployment verification pending.
- Shutdown completed: ANTHROPIC_ENABLED=0 verified before submission; dep-db5vb6ajnfac73bs3d3g verified Deploy succeeded | Live. Backend health returned HTTP 200 (202 ms), evidence health-2026-10-11T20-47-06-603Z. All four features have successful in-app evidence; AI remains disabled after acceptance, not generally enabled for users.
