// pathway-backend/createStudent.js
require('dotenv').config();
const app = require('./firebaseAdmin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const auth = getAuth(app);
const db = getFirestore(app);

async function createStudent() {
  const email = process.env.PATHWAY_STUDENT_EMAIL;
  const password = process.env.PATHWAY_STUDENT_PASSWORD;
  if (!email || !password) throw new Error('Set PATHWAY_STUDENT_EMAIL and PATHWAY_STUDENT_PASSWORD.');

  const userRecord = await auth.createUser({ email, password });
  const uid = userRecord.uid;

  await db.collection('users').doc(uid).set({
    uid,
    email,
    firstName: process.env.PATHWAY_STUDENT_FIRST_NAME || 'Test',
    lastName: process.env.PATHWAY_STUDENT_LAST_NAME || 'Student',
    idNumber: process.env.PATHWAY_STUDENT_ID || '',
    department: process.env.PATHWAY_STUDENT_DEPARTMENT || '',
    role: 'student',
    requirementsStatus: 'not_submitted',
    status: 'pending_registration',
    accountApproved: false,
    hoursRendered: 0,
    hoursRequired: 486,
    company: '',
    sectionId: '',
    createdAt: FieldValue.serverTimestamp(), // Updated to use the correct FieldValue reference
  });

  console.log('✅ Student created!');
  console.log('Email:', email);
}

createStudent().catch(console.error);
