// Read-only acceptance against the saved local demo; never writes or seeds records.
const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, collection, query, orderBy, limit, where,
  getDocsFromServer, getCountFromServer, getAggregateFromServer, sum, terminate } = require('firebase/firestore');

async function main() {
  const app = initializeApp({ apiKey: 'emulator-only-api-key', projectId: 'demo-pathway-security' }, 'student-readonly-qa');
  const auth = getAuth(app);
  const db = getFirestore(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  try {
    await signInWithEmailAndPassword(auth, 'student.approved@pathway.test', 'PathwayLocal!2026');
    const records = collection(db, 'users', auth.currentUser.uid, 'logbook');
    const page = await getDocsFromServer(query(records, orderBy('createdAt', 'desc'), limit(5)));
    const total = await getCountFromServer(records);
    const hours = await getAggregateFromServer(records, { hours: sum('hours') });
    const counts = await Promise.all(['pending', 'approved', 'rejected'].map(status =>
      getCountFromServer(query(records, where('status', '==', status)))));
    assert.ok(page.size <= 5);
    assert.ok(page.size <= total.data().count);
    assert.ok(Number.isFinite(hours.data().hours));
    assert.ok(counts.reduce((count, item) => count + item.data().count, 0) <= total.data().count);
    console.log(`PASS: six server-backed logbook queries; page=${page.size}, total=${total.data().count}`);
    await signOut(auth);
    await assert.rejects(getDocsFromServer(query(records, limit(1))), error => error.code === 'permission-denied');
    const response = await fetch('http://127.0.0.1:3100/student/assigned-coordinator', {
      method: 'POST', headers: { Authorization: 'Bearer invalid-qa-token', 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 401);
    console.log('PASS: signed-out logbook access denied; invalid backend token rejected with 401');
  } finally {
    await terminate(db);
    await deleteApp(app);
  }
}
main().catch(error => { console.error('Read-only student QA failed:', error.code || error.message); process.exitCode = 1; });
