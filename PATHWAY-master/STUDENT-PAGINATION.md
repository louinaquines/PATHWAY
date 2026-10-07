# Approved student pagination

## Implemented

- Attendance: database cursor pages of 10 previous shifts; today's shift is fetched separately. History count uses an aggregate query; OJT hours remain from the student profile.
- Logbook: database cursor pages of 5 journals. Total entries, reported hours, and all review-status counts use independent aggregate queries. New journal numbering uses the total, not the loaded page length.
- Home: the five newest activities across attendance, journals, and notifications, sorted by event time. View all activity opens Activity History.
- Activity History: cursor pages per source, merged newest-first. Ten more activities are displayed per action. Each source is read far enough to preserve the merged ordering; duplicate IDs are eliminated.
- Notifications: authenticated database cursor pages of 15 records. Unread counts use separate aggregate queries. Search scans server-side batches across the student's inbox, not just the visible page.
- Conversation: authenticated database cursor pages of 20 messages; loading older messages preserves the scroll anchor. Sending a message keeps the already visible history. Conversation summaries transfer the latest message, with unread/search computed from server-side metadata scans. These scans are not constant-cost summary reads.

## Remaining data-access work

Materialized conversation summaries and indexed full-text search remain future scalability work; current summary/search requests can scan a student's full history on the server. The Home dashboard retains its existing full reads for metrics and Logs-panel data.

## Index and verification

`firestore.indexes.json` declares notification-history and student inbox/message indexes. It is registered in firebase.json but has not been deployed to a live Firebase project.

Verification: 17 pagination/student helper tests pass. Android bundle compilation passes. Read-only emulator inbox checks verify scoped notification pages, conversation summaries/history, invalid cursors, anonymous rejection, and foreign conversation isolation. Large-history visual and scroll-anchor checks on a physical phone remain necessary. Actual email delivery and physical geofencing QA remain separate tasks.
