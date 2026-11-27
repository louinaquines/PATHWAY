// PATHWAY-backend/scripts/check-project.js
// Read-only health check of a Firebase project for the demo (small, bounded reads).
//   node scripts/check-project.js <service-account.json>
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const key = process.argv[2];
if (!key) { console.error('Usage: node scripts/check-project.js <service-account.json>'); process.exit(1); }
const sa = require(path.resolve(key));
initializeApp({ credential: cert(sa) });
const db = getFirestore(); const auth = getAuth();
const ok = (good, text) => console.log(`${good ? 'OK  ' : 'FIX '} ${text}`);
(async () => {
  console.log(`Project: ${sa.project_id}\n`);
  const count = async q => (await q.count().get()).data().count;
  const admins = await db.collection('users').where('role', '==', 'admin').limit(5).get();
  ok(!admins.empty, `Admin accounts: ${admins.docs.map(d => d.data().email || d.id).join(', ') || 'none'}`);
  const coords = await db.collection('users').where('role', '==', 'coordinator').limit(20).get();
  ok(!coords.empty, `Coordinators: ${coords.size}`);
  coords.docs.forEach(d => console.log(`       ${d.data().email} | ${d.data().department || 'no department'} | uid ${d.id}`));
  const students = await count(db.collection('users').where('role', '==', 'student'));
  ok(students > 0, `Students: ${students}`);
  const terms = (await db.collection('academicTerms').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  ok(terms.length > 0, `Academic terms: ${terms.map(t => `${t.name} (${t.department || 'all'}${t.isCurrent ? ', current' : ''})`).join('; ') || 'none'}`);
  const sections = await db.collection('sections').get();
  const ids = new Set(terms.map(t => t.id));
  const loose = sections.docs.filter(d => !ids.has(d.data().termId));
  ok(sections.size > 0 && !loose.length, `Sections: ${sections.size}, without a term: ${loose.length}${loose.length ? ' -> run scripts/fix-section-terms.js --create-missing --apply' : ''}`);
  const companies = await count(db.collection('companies'));
  ok(companies > 0, `Companies: ${companies}`);
  const maria = await auth.getUserByEmail('coordinator.demo@pathway-demo.app').catch(() => null);
  ok(!!maria, `Maria Santos sign-in: ${maria ? `exists, uid ${maria.uid}  (put this in Render COMPANY_INBOX_OWNER_UID and COMPANY_SEND_OWNER_UID)` : 'missing -> run RESET DEMO'}`);
  process.exit(0);
})().catch(err => { console.error('Check failed:', err.message || err); process.exit(1); });
