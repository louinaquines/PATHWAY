// createUser.js
//
// ONE-OFF SCRIPT — run this from the terminal to create real PATHWAY accounts.
// Uses the Firebase ADMIN SDK, which bypasses Firestore security rules
// entirely (that's expected and correct — only trusted backend code should
// use this file, never the mobile app).
//
// Usage:
//   node createUser.js
//
// Edit the values in the `newUser` object below before each run, then run
// the script again to create another account (e.g. one admin, one
// coordinator, one student, one supervisor for testing).

require('dotenv').config();
const app = require('./firebaseAdmin');
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const db = getFirestore(app);
const auth = getAuth(app);

// Supply test account details through environment variables; never store
// reusable credentials in this source file.
const newUser = {
  email: process.env.PATHWAY_USER_EMAIL,
  password: process.env.PATHWAY_USER_PASSWORD,
  role: process.env.PATHWAY_USER_ROLE,
  fullName: process.env.PATHWAY_USER_FULL_NAME,
  schoolId: process.env.PATHWAY_USER_SCHOOL_ID,
};

async function createUser() {
  if (!newUser.email || !newUser.password || !['admin', 'coordinator', 'student'].includes(newUser.role) || !newUser.fullName) {
    throw new Error('Set PATHWAY_USER_EMAIL, PATHWAY_USER_PASSWORD, PATHWAY_USER_ROLE, and PATHWAY_USER_FULL_NAME.');
  }
  try {
    // 1. Create the Auth account (this is what makes login actually work)
    const userRecord = await auth.createUser({
      email: newUser.email,
      password: newUser.password,
      displayName: newUser.fullName,
    });

    console.log("✅ Auth account created. UID:", userRecord.uid);

    // 2. Create the matching Firestore /users/{uid} doc
    // The UID here MUST match the Auth UID — this is how our security rules
    // know who has which role.
    await db.collection("users").doc(userRecord.uid).set({
      email: newUser.email,
      role: newUser.role,
      fullName: newUser.fullName,
      schoolId: newUser.schoolId,
      createdAt: FieldValue.serverTimestamp(),
      active: true,
    });

    console.log("✅ Firestore user document created.");
    console.log("\n--- DONE ---");
    console.log("Email:", newUser.email);
    console.log("Role:", newUser.role);
    console.log("UID:", userRecord.uid);
  } catch (error) {
    console.error("❌ Error creating user:", error.message);
  }

}

createUser();
