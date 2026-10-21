function attendanceFixture({ student = {}, section = {}, onAttendance = () => {}, count = 0 } = {}) {
  const profiles = {
    'users/staff': { role: 'coordinator', department: 'IT', accountApproved: true },
    'users/student': { role: 'student', department: 'IT', sectionId: 'section', accountApproved: true, hoursRendered: 120, hoursRequired: 540, ...student },
    'sections/section': { name: 'BSIT 4G', department: 'IT', coordinatorId: 'staff', ...section },
  };
  let reads = 0;
  const db = { collection(name) {
    const query = { where() { return this; }, limit() { return this; }, async get() {
      if (name.endsWith('/attendance')) { reads++; await onAttendance(profiles); return { size: count, docs: [] }; }
      const snap = await db.collection('users').doc('student').get();
      return { size: 1, docs: [snap] };
    }, doc(id) {
      const key = `${name}/${id}`;
      const ref = { id, firestore: db, collection: child => db.collection(`${key}/${child}`), async get() { return { id, ref, exists: !!profiles[key], data: () => structuredClone(profiles[key]) }; } };
      return ref;
    } }; return query;
  } };
  return { db, profiles, get reads() { return reads; } };
}
module.exports = { attendanceFixture };
