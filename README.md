# PATHWAY

PATHWAY is a university OJT management system for student submissions and attendance, coordinator review, and administrative oversight. The project includes a student mobile app, staff web portal, and Node.js backend backed by Firebase.

## Project structure

- `PATHWAY-master/` — Expo / React Native student application.
- `PATHWAY-web/` — React admin and coordinator portal, plus supervisor evaluation screens.
- `PATHWAY-backend/` — Node.js API and Firebase-backed operations.
- `firestore.rules` and `firebase.json` — Firestore access rules and Firebase Emulator configuration.
- `PATHWAY-DOCUMENTATION.md` — system workflows and implementation notes.

## Run locally

Install dependencies in each app directory with `npm install`, then run each app in its own terminal:

```powershell
cd PATHWAY-master
npm start
```

```powershell
cd PATHWAY-web
npm start
```

```powershell
cd PATHWAY-backend
npm start
```

The backend requires its runtime configuration to be provided locally or by the deployment environment. Local `.env` files and service-account keys are intentionally excluded from this repository; do not commit credentials.

## Security tests

The backend security suite uses the Firebase Auth and Firestore Emulators. From `PATHWAY-backend/`, run `npm test`. A Java runtime is required. These tests are designed for local emulators and do not deploy rules or write to production Firebase.

Review `PATHWAY-DOCUMENTATION.md` and `PATHWAY-backend/SECURITY.md` before configuring or deploying the system.

### Try company batch matching locally

Use Node.js 22 (22.12 or later) and Java 21. From the repository root on the matching branch:

```powershell
npm --prefix PATHWAY-backend ci
npm --prefix PATHWAY-web ci
npm --prefix PATHWAY-master ci
npm --prefix PATHWAY-backend run dev:emulator
```

The launcher starts the local API, staff portal, student web preview, and Firebase emulators with synthetic data. It prints the demo sign-in details. No production credentials or AI key are needed.

1. Open the staff portal at `http://127.0.0.1:3001` and sign in as the demo coordinator.
2. Select **Emulator Test Section** and open **Company Placements → Match students to companies**.
3. Select **Morgan Matching Demo**, generate suggestions, and verify that **Matching Demo Host** appears. Enter the internship dates and confirm to see the new placement and endorsement queue entry.
4. To test student preferences before confirmation, sign in as the matching demo student in the local student web preview and open the Company screen.

If the launcher restored an older emulator snapshot and the matching fixtures are missing, run `npm --prefix PATHWAY-backend run emulator:seed` in a second terminal while the local workflow is running. That command refreshes the standard demo fixtures too.

For a live release, merge the matching branch and deploy the backend before the coordinator web build. Release updated student app code to expose the optional preference screen. Existing companies must be configured in **Company Directory → Batch matching settings** with confirmed slots, eligible course codes, location, supervisor contact, and internship role. For student profiles without a course code, matching uses the section's course code or name.
