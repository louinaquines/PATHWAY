// Admin-only structural fixes: move a coordinator's sections, remove empty sections,
// and tag legacy companies that were created before companies became per department.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const err = (status, message) => Object.assign(new Error(message), { status });

function installAdminStructure({ app, db, requireAdmin, audit }) {
  app.post('/admin/coordinators/:coordinatorId/reassign-sections', requireAdmin, async (req, res) => {
    const from = req.params.coordinatorId, to = req.body?.targetCoordinatorId;
    if (!ID.test(from) || typeof to !== 'string' || !ID.test(to) || from === to) return res.status(400).json({ error: 'Choose another coordinator to take over the sections.' });
    try {
      const [fromSnap, toSnap] = await Promise.all([db.collection('users').doc(from).get(), db.collection('users').doc(to).get()]);
      if (!fromSnap.exists || !['coordinator', 'inactive_coordinator'].includes(fromSnap.data().role)) throw err(404, 'Coordinator not found.');
      if (!toSnap.exists || toSnap.data().role !== 'coordinator' || toSnap.data().accountApproved === false) throw err(409, 'The new coordinator must have an active account.');
      if (!fromSnap.data().department || toSnap.data().department !== fromSnap.data().department) throw err(409, 'Sections can only move to a coordinator in the same department.');
      const sections = await db.collection('sections').where('coordinatorId', '==', from).get();
      if (sections.empty) return res.json({ success: true, moved: 0, students: 0 });
      const writes = [];
      let studentCount = 0;
      for (const section of sections.docs) {
        writes.push([section.ref, { coordinatorId: to }]);
        const [students, proposals, finals] = await Promise.all([
          db.collection('users').where('sectionId', '==', section.id).get(),
          db.collection('companyProposals').where('sectionId', '==', section.id).where('status', '==', 'pending_review').get(),
          db.collection('finalReviewRequests').where('sectionId', '==', section.id).where('status', '==', 'pending').get(),
        ]);
        students.docs.filter(d => d.data().role === 'student').forEach(d => { studentCount++; writes.push([d.ref, { coordinatorId: to }]); });
        [...proposals.docs, ...finals.docs].forEach(d => writes.push([d.ref, { coordinatorId: to }]));
      }
      for (let i = 0; i < writes.length; i += 400) {
        const batch = db.batch();
        writes.slice(i, i + 400).forEach(([ref, data]) => batch.update(ref, data));
        await batch.commit();
      }
      await db.runTransaction(async tx => audit(tx, { actorId: req.staff.uid, actorRole: 'admin', action: 'section.reassigned', targetType: 'users', targetId: from,
        details: { to, sections: sections.size, students: studentCount } }));
      return res.json({ success: true, moved: sections.size, students: studentCount });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error('Section reassignment failed:', e.code || e.message);
      return res.status(500).json({ error: 'Sections could not be reassigned. Refresh and try again.' });
    }
  });

  app.delete('/admin/sections/:sectionId', requireAdmin, async (req, res) => {
    const id = req.params.sectionId;
    if (!ID.test(id)) return res.status(400).json({ error: 'Invalid section.' });
    try {
      const ref = db.collection('sections').doc(id);
      const [snap, students] = await Promise.all([ref.get(), db.collection('users').where('sectionId', '==', id).limit(1).get()]);
      if (!snap.exists) throw err(404, 'Section not found.');
      if (!students.empty || (snap.data().studentIds || []).length) throw err(409, 'Only empty sections can be deleted. Move or remove the students first.');
      await db.recursiveDelete(ref);
      await db.runTransaction(async tx => audit(tx, { actorId: req.staff.uid, actorRole: 'admin', action: 'section.deleted', targetType: 'sections', targetId: id,
        details: { name: snap.data().name || '', coordinatorId: snap.data().coordinatorId || '' } }));
      return res.json({ success: true });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error('Section delete failed:', e.code || e.message);
      return res.status(500).json({ error: 'The section could not be deleted.' });
    }
  });

  app.patch('/admin/companies/:companyId/department', requireAdmin, async (req, res) => {
    const id = req.params.companyId, department = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
    if (!ID.test(id) || !department || department.length > 200 || department.includes('/')) return res.status(400).json({ error: 'Choose a department.' });
    try {
      const ref = db.collection('companies').doc(id);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw err(404, 'Company not found.');
        if (snap.data().department) throw err(409, 'This company already belongs to a department.');
        tx.update(ref, { department, updatedBy: req.staff.uid, updatedAt: new Date().toISOString() });
        audit(tx, { actorId: req.staff.uid, actorRole: 'admin', action: 'company.department_set', targetType: 'companies', targetId: id, details: { department } });
      });
      return res.json({ success: true, department });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ error: e.message });
      console.error('Company department update failed:', e.code || e.message);
      return res.status(500).json({ error: 'The department could not be saved.' });
    }
  });
}

module.exports = { installAdminStructure };
