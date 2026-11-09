function createPlacementHistoryHandler({ adminDb, allowRate }) {
  async function placementHistory(req, res) {
    if (req.staff.role !== 'coordinator') return res.status(403).json({ error: 'Coordinator access required.' });
    if (!allowRate(req, res, { limit: 60, windowMs: req.query.page === 'true' ? 60_000 : 60 * 60_000, key: request => `placement-history:${request.staff.uid}` })) return;
    const sectionId = req.query.sectionId;
    if (typeof sectionId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(sectionId)) {
      return res.status(400).json({ error: 'Choose a valid section.' });
    }
    try {
      const [coordinatorSnapshot, sectionSnapshot] = await Promise.all([
        adminDb.collection('users').doc(req.staff.uid).get(),
        adminDb.collection('sections').doc(sectionId).get(),
      ]);
      if (!coordinatorSnapshot.exists || coordinatorSnapshot.data().role !== 'coordinator'
        || !sectionSnapshot.exists || sectionSnapshot.data().coordinatorId !== req.staff.uid
        || sectionSnapshot.data().department !== coordinatorSnapshot.data().department) {
        return res.status(403).json({ error: 'You can only view placement history for your assigned sections.' });
      }
      const base = adminDb.collection('placementHistory')
        .where('sectionId', '==', sectionId)
        .where('department', '==', coordinatorSnapshot.data().department);
      if (req.query.page === 'true') {
        const rawSearch = req.query.search ?? '';
        if (typeof rawSearch !== 'string' || rawSearch.length > 150) {
          return res.status(400).json({ error: 'Invalid placement history search.' });
        }
        const search = rawSearch.trim().toLowerCase();
        let studentId;
        let historyQuery = base;
        if (/^\d{5,24}$/.test(search)) {
          const student = await adminDb.collection('users')
            .where('role', '==', 'student').where('sectionId', '==', sectionId)
            .where('idNumber', '==', search).limit(2).get();
          if (student.size === 1) {
            studentId = student.docs[0].id;
            historyQuery = historyQuery.where('studentId', '==', studentId);
          }
        }
        const cursor = req.query.cursor;
        let pageQuery = historyQuery.orderBy('createdAt', 'desc');
        if (cursor !== undefined) {
          if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(cursor)) {
            return res.status(400).json({ error: 'Invalid placement history cursor.' });
          }
          const anchor = await adminDb.collection('placementHistory').doc(cursor).get();
          const record = anchor.data();
          if (!record || record.sectionId !== sectionId || record.department !== coordinatorSnapshot.data().department || (studentId && record.studentId !== studentId)) {
            return res.status(400).json({ error: 'Invalid placement history cursor.' });
          }
          pageQuery = pageQuery.startAfter(anchor);
        }
        const scanSize = search && !studentId ? 100 : 25;
        const page = await pageQuery.limit(scanSize + 1).get();
        const records = [];
        let scanned = 0;
        for (const document of page.docs.slice(0, scanSize)) {
          scanned++;
          const item = document.data();
          if (studentId || !search || [item.studentName, item.studentId, item.before?.companyName, item.after?.companyName]
            .some(value => String(value || '').toLowerCase().includes(search))) {
            records.push({ ...item, id: document.id });
          }
          if (records.length === 25) break;
        }
        return res.json({
          history: records,
          nextCursor: page.size > scanned ? page.docs[scanned - 1].id : null,
        });
      }
      const snapshot = await base.get();
      const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return res.json({ history: items });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Could not load placement history.' });
    }
  }
  return placementHistory;
}

module.exports = { createPlacementHistoryHandler };
