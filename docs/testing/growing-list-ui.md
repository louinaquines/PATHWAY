# Growing-list UI verification

The portal now renders pages of 25 loaded records for admin accounts, academic terms, audit events, coordinator requirement queues, section rosters, authorized rosters, registrations, journal students/entries/attendance, analytics, clearance, company directories, placement review stages/history, assigned-company groups, and conversation lists. Admin companies retain the existing 10-row paging. Evaluations retain their existing page size with at most five numeric page buttons.

Search and section/status filters run before pagination. Counts and exports still use the full loaded collection. Filter/scope changes reset the visible page; background refreshes preserve the page where possible and clamp it when results shrink. Small lists have no page controls.

## Manual checks
1. Use an isolated test dataset with more than 25 records in each applicable screen. Confirm the page indicator, Previous/Next, first and final pages, and that no records become unreachable.
2. While on page 2, search for an item outside that page. Confirm the matching item appears and page numbering resets.
3. Change section or status. Confirm only the new scope appears and page numbering resets.
4. While on the last page, remove or update a fictional record through its normal test workflow. Confirm refresh does not leave a blank page or flash the initial skeleton.
5. Export a supported list. Confirm it includes the existing full export scope, not just the visible 25 rows.
6. Use long names, addresses, IDs, filenames, event values, and message text. Check desktop, 390px, and 320px widths. Text must wrap or remain inside a horizontally scrollable table; the whole page must not overflow.
7. In messages, page the student conversations, open one, type a draft, and receive a test reply. Confirm draft and selected conversation remain intact. Conversation message history keeps its existing scrolling behavior.
8. Open row menus, detail disclosures, previews, and confirmation dialogs on first and last rows. Confirm actions apply to the named record.
9. Check notification history's existing load-more controls and the section/student review panels' scroll areas.
10. Confirm import-result lists and assigned-student lists scroll within their containers.

## Evidence and limits
- Automated shared pagination coverage uses 1,003 records and 10,000 evaluation pages.
- Admin integration coverage checks 1,003 loaded student records and full-list search.
- Visual stress check uses 1,003 fictional students and long unbroken names on desktop and a 390px viewport.
- This release changes frontend rendering only. It does not introduce server-side pagination, extend API response limits, or load-test the production backend.
- Audit history currently exposes only the recent events returned by the API. Paging cannot recover records omitted by that API.
- Message-history fetching/rendering and student mobile app behavior are unchanged. Database-scale performance and real-device mobile app testing remain separate work.

## Student placement queue
- Placement reviews starts on Needs action. Each student appears once, including concurrent placement, access-review and endorsement records.
- Search by student or company; change Needs action / Completed / History; check Previous and Next with more than 25 students.
- Open a student and verify all their tasks remain available. Check close/Escape, small-screen scrolling and history.
- Test decisions and retry using fictional records. Live approval and email delivery require separate authorized workflow testing.
- Pagination bounds displayed rows, not database reads. Existing section queries load the whole section; server-side cursor pagination and backend load testing remain necessary before claiming large-scale performance.
