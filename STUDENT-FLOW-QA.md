# Student journey QA — 2026-10-05

## Result

The local backend journey passed from incomplete requirements through final approval. Eight frontend helper regression checks and the Expo web export passed. The visual pass is partial: browser approval review became unavailable before the changes could be verified in the running UI.

## Findings fixed

- Browser uploads previously appended a React Native URI descriptor to browser FormData. Web uploads now send the selected File or Blob bytes; device uploads retain their URI descriptor.
- React Native Alert supplied no browser submission feedback or navigation callback. The student form alert adapter now shows feedback, executes the next-screen callback, and honors canceled removal confirmations.
- Company, Review, and Approval used separate placeholder notification panels; the shared panel contained invented updates. All pre-deployment pages now use the same panel, reading the signed-in student's actual Firestore notifications, with loading, empty, error, and mark-as-read states.
- Approval was read only at mount. It now subscribes to coordinator decisions. The dashboard also watches profile changes, and student pages refresh data when focused again.
- A profile marked pending could display an under-review summary even when no final-review request existed. An available request query is now authoritative, and dashboard guidance directs the student to the actual unfinished step.
- The interactive step indicator was exposed as a progressbar, hiding its child controls from the browser accessibility tree. Its buttons now remain individually accessible. Form actions and fields gained labels/roles, and the drawer can scroll on short screens.
- Expanded document metadata no longer invents a file size or claims every upload happened today.

## Verification

| Check | Evidence |
| --- | --- |
| Phone pending dashboard, Requirements, approved Company, ready Review | Screens observed at 390 × 844 before the changes; no errors/warnings captured in the document check |
| Continue to company selection | Clicked in the running browser and reached Company |
| Continue to final review | Clicked in the running browser and reached Review |
| Desktop Review | 1365 × 900 requested; screenshot capture was clipped, so desktop visual correctness is not established |
| Upload multipart payload, Blob fallback, device descriptor, error handling | Four passing tests against the actual upload helper using a mocked transport |
| Web submission callback and canceled removal | Two passing tests against the actual alert adapter |
| Dashboard next-step selection | Two passing tests against the actual status helper |
| Student and coordinator backend workflow | Fresh dedicated QA student: blocked incomplete review → placement draft → submission → revision → resubmission → approval → placement change → endorsement/MOA invalidation → reviewed-document fixture → final review → requested changes → resubmission → final approval |
| Notifications and final eligibility | Five student notification records produced; official company, approved requirements, and approved pre-deployment status asserted |
| Final source build | Expo SDK 54 web export succeeded, 592 modules |
| Whitespace check | Passed for changed tracked student files |

## Local fixtures and repeatability

All fixture utilities are pinned to demo-pathway-security, Auth 127.0.0.1:9099, Firestore 127.0.0.1:8080, and backend 127.0.0.1:3100. Existing Taylor/Avery demo records were preserved. Two dedicated QA student/company pairs were created: qa-student-1791205186965 (placement approved) and qa-student-1791205471072 (complete final approval). They exist only in the local emulator.

From PATHWAY-backend:

```powershell
npm run test:student-web
npm run qa:student-journey -- seed
# Use the uid returned by seed; workflow requires a fresh fixture.
npm run qa:student-journey -- workflow <returned-qa-uid>
```

The journey utility also supports documents-reviewed, placement-revise, placement-approve, review-revise, review-approve, and verify with a fixture uid for staged browser testing.

## Remaining verification

- Actual Cloudinary delivery was not exercised: the local demo has no Cloudinary configuration. The journey uses explicitly simulated reviewed-document metadata; byte serialization was tested independently with a mocked upload transport.
- Live checking of the new notification panel, short-screen drawer, approval refresh, final approved dashboard transition, and each subpage's logout remains outstanding.
- Automatic browser approval review repeatedly failed with “Selected model is at capacity.” This was a review-service failure, not a safety rejection. It also prevented resetting the temporary desktop viewport and saving a post-change screenshot.
- Coordinator/admin visual QA and production deployment readiness are separate subsequent work.
