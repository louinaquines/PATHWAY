// firebaseConfig.js
// Initializes Firebase for the PATHWAY mobile app (Expo / React Native)
//
// NOTE: These values are safe to keep in client code — Firebase config keys
// are not secrets. Real security comes from Firestore Security Rules and
// Firebase Auth, not from hiding this file.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  initializeFirestore,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};  

// Prevent re-initializing Firebase if this file is imported more than once
// (common in React Native due to hot-reloading during development)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Auth — handles login for Student / Coordinator / Supervisor / Admin
const auth = getAuth(app);

// Firestore — using initializeFirestore with long-polling forced ON.
// This avoids a common "Could not reach Clous Firestore backend" connectivity
// issue that shows up specifically in React Native / Expo environments.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export { app, auth, db };
