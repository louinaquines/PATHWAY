const { FieldPath } = require('firebase-admin/firestore');

async function auditRosterNames(db) {
  let cursor;
  const result = { sections: 0, students: 0, missingNameFields: 0, affectedSections: 0 };
  do {
    const sections = db.collection('sections').orderBy(FieldPath.documentId());
    const page = await (cursor ? sections.startAfter(cursor) : sections).limit(100).get();
    for (const section of page.docs) {
      const roster = db.collection('users').where('role', '==', 'student').where('sectionId', '==', section.id);
      const [all, sortable] = await Promise.all([
        roster.count().get(),
        roster.orderBy('firstName').orderBy('lastName').count().get(),
      ]);
      const missing = Math.max(0, all.data().count - sortable.data().count);
      result.sections++;
      result.students += all.data().count;
      result.missingNameFields += missing;
      if (missing) result.affectedSections++;
    }
    cursor = page.size === 100 ? page.docs.at(-1) : null;
  } while (cursor);
  return result;
}

if (require.main === module) {
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  const projectId = process.argv[2] || '';
  const isEmulator = /^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '');
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
    || (isEmulator ? !projectId.startsWith('demo-') : process.argv[3] !== '--read-only')) {
    console.error('Specify a demo project on the local emulator, or a project with --read-only.');
    process.exitCode = 2;
  } else {
    const app = initializeApp({ projectId });
    const db = getFirestore(app);
    auditRosterNames(db).then(result => {
      console.log(JSON.stringify(result));
      if (result.missingNameFields) process.exitCode = 1;
    }).catch(error => {
      console.error('Roster audit could not run (' + (error.code || 'unknown') + ').');
      process.exitCode = 2;
    }).finally(async () => { await db.terminate(); await deleteApp(app); });
  }
}

module.exports = { auditRosterNames };
