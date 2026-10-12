# Firestore index checkpoint — October 12, 2026

Read-only production inventory: `output/release/indexes-2026-10-11T16-58-14-428Z/index-inventory.json`.
All seven configured composite indexes match deployed READY indexes. Zero production writes occurred.
The inventory binds the local specification SHA256 and includes field configuration evidence.

## Source query review

- `studentInbox.js`: recipient/date, recipient/read, recipient/sender/date, recipient/sender/read notification queries and participant/date, participant/conversation/date, participant/conversation/recipient/read message queries correspond to the seven configured composites.
- Student attendance uses date ranges and date ordering; logbook and DTR review pages order by createdAt within a user subcollection. These are single-field shapes, not additional composite declarations.
- Web section/student/roster queries and backend assignment/analytics queries use equality filters. No additional mixed-field range-plus-order query was identified in the reviewed source. Their deployed execution and any single-field exemptions still require acceptance checks; static inspection is not proof of query success.
- No production query execution or authenticated client smoke test was performed by this inventory helper. It lists index metadata only, not student records.

## Remaining gates

Isolated query acceptance follow-up: all 38 security tests passed. The added release-query test executes student notification/message pages (including conversation filtering), attendance date-range pagination, logbook ordering, own placement proposals and final-review requests, plus coordinator owned-section and department/section student lists. Wrong-section coordinators and unauthenticated clients are denied for the tested student queries; broad coordinator student lists are denied. This checks query authorization, not production index enforcement, returned-data completeness or every query variant.

Before approving the full rules rollout, run the exact coordinator/student query flows under the proposed rules in isolated tests, then approved production smoke tests after deployment. Confirm that any permission denial is not confused with a missing-index failure. Do not infer that all queries work merely from seven READY indexes or from emulator tests (which do not establish production composite-index enforcement).

No index creation/deletion, rules deployment, provider configuration change or billing action is authorized by this checkpoint.
