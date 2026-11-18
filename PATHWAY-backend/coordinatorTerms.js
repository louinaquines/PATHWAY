// Academic terms managed by coordinators, shared within their department.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function installCoordinatorTerms({ app, db, requireStaff, coordinatorSection, recordAudit }) {
  const coord = (req, res) => { if (req.staff.role !== 'coordinator' || !req.staff.data.department) { res.status(403).json({ error: 'Coordinator access required.' }); return false; } return true; };
  const clean = body => {
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const startDate = typeof body?.startDate === 'string' ? body.startDate : '';
    const endDate = typeof body?.endDate === 'string' ? body.endDate : '';
    if (!name || name.length > 80) throw Object.assign(new Error('Enter a term name (up to 80 characters).'), { status: 400 });
    if ((startDate && !DATE.test(startDate)) || (endDate && !DATE.test(endDate)) || (startDate && endDate && endDate < startDate)) throw Object.assign(new Error('Check the start and end dates.'), { status: 400 });
    return { name, startDate, endDate };
  };
  const owned = async (req) => {
    if (!ID.test(req.params.termId || '')) throw Object.assign(new Error('Invalid term.'), { status: 400 });
    const ref = db.collection('academicTerms').doc(req.params.termId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().department !== req.staff.data.department) throw Object.assign(new Error('Term not found.'), { status: 404 });
    return { ref, data: snap.data() };
  };
  const clearCurrent = async (tx, dept, except) => {
    const cur = await tx.get(db.collection('academicTerms').where('department', '==', dept).where('isCurrent', '==', true));
    cur.docs.filter(d => d.id !== except).forEach(d => tx.update(d.ref, { isCurrent: false }));
  };
  const fail = (res, error, msg) => { if (!error.status) console.error(error); return res.status(error.status || 500).json({ error: error.status ? error.message : msg }); };

  app.get('/coordinator/terms', requireStaff, async (req, res) => {
    if (!coord(req, res)) return;
    try {
      res.set('Cache-Control', 'private, no-store');
      const snap = await db.collection('academicTerms').where('department', '==', req.staff.data.department).limit(200).get();
      const terms = snap.docs.map(d => ({ id: d.id, name: d.data().name, startDate: d.data().startDate || '', endDate: d.data().endDate || '', isCurrent: d.data().isCurrent === true }))
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)) || a.name.localeCompare(b.name));
      return res.json({ terms });
    } catch (error) { return fail(res, error, 'Could not load terms.'); }
  });
  app.post('/coordinator/terms', requireStaff, async (req, res) => {
    if (!coord(req, res)) return;
    try {
      const term = clean(req.body); const dept = req.staff.data.department; const isCurrent = req.body?.isCurrent === true;
      const ref = db.collection('academicTerms').doc();
      await db.runTransaction(async tx => { if (isCurrent) await clearCurrent(tx, dept, ref.id); tx.create(ref, { ...term, department: dept, isCurrent, createdBy: req.staff.uid, createdAt: new Date().toISOString() }); });
      await recordAudit({ actorId: req.staff.uid, actorRole: 'coordinator', action: 'academic_term.created', targetType: 'academicTerms', targetId: ref.id, details: { name: term.name } }).catch(() => {});
      return res.json({ term: { id: ref.id, ...term, isCurrent } });
    } catch (error) { return fail(res, error, 'Could not create the term.'); }
  });
  app.patch('/coordinator/terms/:termId', requireStaff, async (req, res) => {
    if (!coord(req, res)) return;
    try {
      const { ref, data } = await owned(req);
      const update = req.body?.name !== undefined ? clean({ ...data, ...req.body }) : {};
      const isCurrent = typeof req.body?.isCurrent === 'boolean' ? req.body.isCurrent : undefined;
      await db.runTransaction(async tx => { if (isCurrent) await clearCurrent(tx, req.staff.data.department, ref.id); tx.update(ref, { ...update, ...(isCurrent !== undefined ? { isCurrent } : {}), updatedAt: new Date().toISOString() }); });
      if (update.name && update.name !== data.name) {
        const secs = await db.collection('sections').where('termId', '==', ref.id).get();
        const batch = db.batch(); secs.docs.forEach(d => batch.update(d.ref, { termName: update.name })); if (secs.size) await batch.commit();
      }
      return res.json({ success: true });
    } catch (error) { return fail(res, error, 'Could not update the term.'); }
  });
  app.delete('/coordinator/terms/:termId', requireStaff, async (req, res) => {
    if (!coord(req, res)) return;
    try {
      const { ref } = await owned(req);
      const used = await db.collection('sections').where('termId', '==', ref.id).limit(1).get();
      if (!used.empty) return res.status(409).json({ error: 'Move its sections to another term first.' });
      await ref.delete();
      return res.json({ success: true });
    } catch (error) { return fail(res, error, 'Could not delete the term.'); }
  });
  app.patch('/coordinator/sections/:sectionId/term', requireStaff, async (req, res) => {
    if (!coord(req, res)) return;
    try {
      await coordinatorSection(req, req.params.sectionId);
      const termId = req.body?.termId || '';
      let termName = '';
      if (termId) { req.params.termId = termId; termName = (await owned(req)).data.name; }
      await db.collection('sections').doc(req.params.sectionId).update(termId ? { termId, termName } : { termId: null, termName: null });
      return res.json({ termId: termId || null, termName: termName || null });
    } catch (error) { return fail(res, error, 'Could not change the term.'); }
  });
}
module.exports = { installCoordinatorTerms };
