const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createPlacementHistoryHandler } = require('../coordinatorPlacementHistory');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
(async () => {
  const app = initializeApp({ projectId: 'demo-pathway-history-load' });
  const db = getFirestore(app);
  const route = createPlacementHistoryHandler({ adminDb: db, allowRate: () => true });
  async function request(query, uid = 'coordinator') {
    let status = 200;
    let data;
    const res = { status(code) { status = code; return this; }, json(value) { data = value; return this; } };
    await route({ staff: { role: 'coordinator', uid }, query }, res);
    return { status, data };
  }
  try {
    await db.doc('users/coordinator').set({ role: 'coordinator', department: 'IT' });
    await db.doc('users/other').set({ role: 'coordinator', department: 'IT' });
    await db.doc('placementHistory/foreign').set({ sectionId: 'other', department: 'IT' });
    for (const size of [1000, 10000]) {
      const sectionId = 'section-' + size;
      await db.doc('sections/' + sectionId).set({ coordinatorId: 'coordinator', department: 'IT' });
      for (let start = 0; start < size; start += 500) {
        const batch = db.batch();
        for (let index = start; index < Math.min(start + 500, size); index++) {
          batch.set(db.doc('placementHistory/' + sectionId + '-' + index), {
            studentName: index === 0 ? 'Distant match' : 'Other student', studentId: 'student-' + index,
            sectionId, department: 'IT', createdAt: new Date(1700000000000 + index).toISOString(),
          });
        }
        await batch.commit();
      }
      await db.doc('users/student-0').set({ role: 'student', sectionId, idNumber: '26000001' });
      const query = { sectionId, page: 'true' };
      const exact = await request({ ...query, search: '26000001' });
      assert.equal(exact.status, 200);
      assert.deepEqual(exact.data.history.map(item => item.studentId), ['student-0']);
      assert.equal(exact.data.nextCursor, null);
      const first = await request(query);
      assert.equal(first.status, 200);
      assert.equal(first.data.history.length, 25);
      const second = await request({ ...query, cursor: first.data.nextCursor });
      assert.equal(second.data.history[0].studentId, 'student-' + (size - 26));
      assert.equal((await request(query, 'other')).status, 403);
      assert.equal((await request({ ...query, cursor: 'foreign' })).status, 400);
      let cursor, calls = 0, match;
      do {
        const result = await request({ ...query, search: 'distant match', cursor });
        assert.equal(result.status, 200);
        calls++;
        assert.ok(calls <= Math.ceil(size / 100));
        match = result.data.history[0] || match;
        cursor = result.data.nextCursor;
      } while (cursor);
      assert.equal(match.studentId, 'student-0');
      console.log(JSON.stringify({ records: size, returnedPerNormalPage: first.data.history.length, boundedSearchRequests: calls, rejectedCrossSectionCursor: true }));
    }
  } finally { await db.terminate(); await deleteApp(app); }
})().catch(error => { console.error(error); process.exitCode = 1; });
