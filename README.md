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
