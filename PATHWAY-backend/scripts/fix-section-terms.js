// PATHWAY-backend/scripts/fix-section-terms.js
// Finds sections with no academic term (or a term that no longer exists) and,
// with --apply, puts them in the current term of their department.
//   node scripts/fix-section-terms.js <service-account.json>            report only
//   node scripts/fix-section-terms.js <service-account.json> --apply    write changes
//   add --create-missing to give departments with no term a copy of an existing current term
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const keyPath = process.argv[2];
const apply = process.argv.includes('--apply');
const createMissing = process.argv.includes('--create-missing');
if (!keyPath) { console.error('Usage: node scripts/fix-section-terms.js <service-account.json> [--apply]'); process.exit(1); }
initializeApp({ credential: cert(require(path.resolve(keyPath))) });
const db = getFirestore();

const today = new Date().toISOString().slice(0, 10);
const inRange = t => (!t.startDate || t.startDate <= today) && (!t.endDate || t.endDate >= today);

(async () => {
  const termsSnap = await db.collection('academicTerms').get();
  const terms = termsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`Terms (${terms.length}):`);
  terms.forEach(t => console.log(`  ${t.id} | ${t.name} | dept ${t.department || 'all'} | current ${!!t.isCurrent} | active ${!!t.isActive} | ${t.startDate || '?'} to ${t.endDate || '?'}`));

  // Current term for a department: its isCurrent term, else a shared active term, else one whose dates include today.
  const currentFor = dept => {
    const scoped = terms.filter(t => !t.department || t.department === dept);
    return scoped.find(t => t.department === dept && t.isCurrent)
      || scoped.find(t => t.isCurrent)
      || scoped.find(t => t.isActive)
      || scoped.filter(inRange).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0]
      || null;
  };

  const ids = new Set(terms.map(t => t.id));
  if (createMissing) {
    const template = terms.find(t => t.isCurrent) || terms.find(t => t.isActive) || terms[0];
    const sectionsAll = await db.collection('sections').get();
    const depts = [...new Set(sectionsAll.docs.map(d => d.data().department).filter(Boolean))];
    for (const dept of depts.filter(d => !currentFor(d))) {
      if (!template) { console.log(`  No term to copy for ${dept}.`); continue; }
      const term = { name: template.name, startDate: template.startDate || null, endDate: template.endDate || null, department: dept, isCurrent: true, isActive: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'fix-section-terms' };
      const ref = db.collection('academicTerms').doc();
      console.log(`  ${apply ? 'Creating' : 'Would create'} "${term.name}" for ${dept}`);
      if (apply) await ref.set(term);
      terms.push({ id: ref.id, ...term }); ids.add(ref.id);
    }
  }
  const sections = await db.collection('sections').get();
  const loose = sections.docs.filter(d => !d.data().termId || !ids.has(d.data().termId));
  console.log(`\nSections: ${sections.size} total, ${loose.length} without a valid term.`);
  if (!loose.length) return process.exit(0);

  const batch = db.batch(); let planned = 0; const skipped = [];
  for (const d of loose) {
    const s = d.data(); const term = currentFor(s.department);
    const label = `  ${s.name || d.id} (${s.department || 'no department'}, ${(s.studentIds || []).length} students, was ${s.termId || 'none'})`;
    if (!term) { skipped.push(label); continue; }
    console.log(`${label} -> ${term.name}`);
    batch.update(d.ref, { termId: term.id, termName: term.name, updatedAt: new Date().toISOString() });
    planned++;
  }
  if (skipped.length) console.log(`\nNo current term found for:\n${skipped.join('\n')}\nCreate or mark a current term for that department first.`);
  if (!apply) { console.log(`\nReport only. Re-run with --apply to move ${planned} section(s).`); return process.exit(0); }
  if (planned) await batch.commit();
  console.log(`\nDone. Moved ${planned} section(s).`);
  process.exit(0);
})().catch(err => { console.error(err.message || err); process.exit(1); });
