// Native Firebase setup uses persistent storage so a student stays signed in
// after the Android or iOS app is restarted. Web keeps its browser persistence
// in firebaseConfig.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';

const emulatorHost = __DEV__ ? process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?.trim() : '';
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let auth;
try {
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch (error) {
  if (error.code !== 'auth/already-initialized') throw error;
  auth = getAuth(app);
}
if (emulatorHost) {
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
}

const db = initializeFirestore(app, { experimentalForceLongPolling: true });
if (emulatorHost) {
  connectFirestoreEmulator(db, emulatorHost, 8080);
}

export { app, auth, db };
