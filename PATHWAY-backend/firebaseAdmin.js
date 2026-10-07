if (process.env.NODE_ENV !== 'production' && process.env.PATHWAY_LOCAL_WORKFLOW !== '1') require('dotenv').config();
const { applicationDefault, getApp, getApps, initializeApp } = require('firebase-admin/app');

// Uses Application Default Credentials. For local development, set
// GOOGLE_APPLICATION_CREDENTIALS to a credential file stored outside this
// project; deployed workloads should use their attached service identity.
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
const adminApp = getApps().length
  ? getApp()
  : initializeApp(usingEmulators
    ? { projectId: process.env.GOOGLE_CLOUD_PROJECT || 'demo-pathway-security' }
    : { credential: applicationDefault() });

module.exports = adminApp;
