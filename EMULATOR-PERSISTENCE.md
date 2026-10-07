# Local QA data persistence

`npm run dev:emulator` restores the newest complete snapshot from `PATHWAY-backend/.emulator-data`. Restored sessions skip fixture seeding so passwords, approvals and existing records are not reset. First-time sessions still create the demo fixtures.

Auth and Firestore snapshots are saved at startup, every five minutes, and on graceful Firebase shutdown. `npm run emulator:backup` saves an additional snapshot without stopping the running apps. Snapshots use unique directories; older snapshots are retained and ignored by Git. They contain sensitive account data: do not share or commit them.

If saved directories exist but none are complete, startup stops rather than silently creating an empty database. The Windows Firebase CLI may exit abnormally after reporting export completion; the backup helper verifies the Auth JSON and Firestore metadata before accepting that result.

Sudden power loss or forced termination can lose changes since the last successful snapshot. This is local QA persistence, not production backup. Cloudinary file bytes remain with Cloudinary; snapshots preserve their database references, not the files themselves. Expo device storage is separate.

Run `node security-tests/emulator-restore-qa.js` from PATHWAY-backend for an isolated import rehearsal on ports 9199/8180, leaving the live phone workflow on 9099/8080 unchanged. Snapshot retention is currently manual; monitor disk usage.
