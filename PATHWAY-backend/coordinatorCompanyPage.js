async function readCoordinatorCompanyPage(db, req, res) {
  const { cursor, search = '', availability = 'all' } = req.query;
  if ((cursor !== undefined && (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(cursor)))
    || typeof search !== 'string' || search.length > 150 || !['all', 'active', 'slots'].includes(availability)) {
    return res.status(400).json({ error: 'Invalid company directory search or cursor.' });
  }
  try {
    const companies = db.collection('companies');
    let pageQuery = companies.orderBy('name');
    if (cursor) {
      const anchor = await companies.doc(cursor).get();
      if (!anchor.exists || typeof anchor.data().name !== 'string') {
        return res.status(400).json({ error: 'Invalid company directory cursor.' });
      }
      pageQuery = pageQuery.startAfter(anchor);
    }
    const term = search.trim().toLowerCase();
    const scanSize = term || availability !== 'all' ? 50 : 25;
    const page = await pageQuery.limit(scanSize + 1).get();
    const records = [];
    let scanned = 0;
    for (const document of page.docs.slice(0, scanSize)) {
      scanned++;
      const company = document.data();
      const active = company.active !== false && company.status !== 'inactive';
      if ((availability !== 'all' && !active) || (term && ![company.name, company.industry, company.address]
        .some(value => String(value || '').toLowerCase().includes(term)))) continue;
      const capacity = Number.isSafeInteger(company.capacity) ? company.capacity : null;
      if (availability === 'slots' && capacity === null) continue;
      const count = await db.collection('users')
        .where('role', '==', 'student').where('placementStatus', '==', 'approved')
        .where('companyId', '==', document.id).count().get();
      const occupiedSlots = count.data().count;
      const availableSlots = capacity === null ? null : Math.max(0, capacity - occupiedSlots);
      if (availability === 'slots' && availableSlots <= 0) continue;
      records.push({ ...company, id: document.id, active, capacity, occupiedSlots, availableSlots });
      if (records.length === 25) break;
    }
    return res.json({ companies: records, nextCursor: page.size > scanned ? page.docs[scanned - 1].id : null });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Could not load the company directory.' });
  }
}

module.exports = { readCoordinatorCompanyPage };
