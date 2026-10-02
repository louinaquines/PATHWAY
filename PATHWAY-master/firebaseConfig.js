// firebaseConfig.js
// Initializes Firebase for the PATHWAY mobile app (Expo / React Native)
//
// NOTE: These values are safe to keep in client code — Firebase config keys
// are not secrets. Real security comes from Firestore Security Rules and
// Firebase Auth, not from hiding this file.

import { initializeApp, getApps, getApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from "firebase/firestore";

// Emulator mode is opt-in and is only honored in a development bundle. The
// dedicated demo project ID prevents test traffic from reaching live Firebase.
const emulatorHost = __DEV__
  ? process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim()
  : '';
if (emulatorHost && !['127.0.0.1', 'localhost'].includes(emulatorHost)) {
  throw new Error('PATHWAY local emulator mode only supports localhost.');
}

const firebaseConfig = {
  apiKey: emulatorHost ? 'emulator-only-api-key' : process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: emulatorHost ? 'demo-pathway-security.firebaseapp.com' : process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: emulatorHost ? 'demo-pathway-security' : process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: emulatorHost ? undefined : process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: emulatorHost ? undefined : process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: emulatorHost ? undefined : process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Prevent re-initializing Firebase if this file is imported more than once
// (common in React Native due to hot-reloading during development)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth — handles login for Student / Coordinator / Supervisor / Admin
const auth = getAuth(app);
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
}

// Firestore — using initializeFirestore with long-polling forced ON.
// This avoids a common "Could not reach Clous Firestore backend" connectivity
// issue that shows up specifically in React Native / Expo environments.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});
if (emulatorHost) {
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

export { app, auth, db };
