# Automatic requirement checks: manual test

Use fictional students and documents marked SAMPLE. Do not upload real medical information for testing.

## Before testing

- Backend must run this release, with its existing Anthropic model and daily request limit configured. REQUIREMENT_AI_ENABLED=0 explicitly disables uploaded-file checks. Never put keys in the app or Git.
- Use the updated student app. The previous APK has no per-file sharing prompt and cannot opt in. Old uploads are not processed automatically.
- Open a separate coordinator session and select the student's section.

## Numbered test

1. As student, select a readable fictional PDF, PNG or JPEG matching the requirement and profile.
2. Choose Allow AI checks in the sharing prompt. Upload must succeed and show AI checking; approval status remains Submitted.
3. Leave the coordinator Requirements page open. Results must appear through silent background updates, without reloading the page.
4. Open View checklist results. Check labels and reasons must be readable. Successful checks say Checks passed - approval pending, never Authentic or Approved.
5. Upload a fictional file with missing fields or a mismatched name. Expect Coordinator review needed, a saved file, and notifications for student and assigned coordinator.
6. Upload another sample and choose Without AI. Expect a normal upload, no file sent to Anthropic, and a visible permission-required reason for coordinator review.
7. Upload a Word file. Expect coordinator review without an external AI call for an unsupported file type.
8. As coordinator, reject a file with a correction reason. The student can resubmit through the existing action; the new upload has its own sharing choice and checking result.
9. Approve a document as coordinator. Ordinary approval must work and a late AI result must not overwrite it. All other final-review requirements still apply.
10. Check from another section/coordinator session. It must not access this student's files, checking details or server job records.

## Failure behavior

Disabled AI, quota exhaustion, unsupported files and unreadable responses must leave the file saved for coordinator review. Nothing is approved by default. Worker restarts, replaced files and late human decisions are covered by emulator tests.

## Release limitation

This adds automatic advisory checking, not automatic approval or dashboard unlocking. Existing installed apps need one update to collect permission and show statuses. A backend/portal deployment cannot add a consent prompt to an old APK.
