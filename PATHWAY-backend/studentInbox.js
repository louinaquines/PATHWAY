// Student-scoped inbox reads. No caller-supplied student ID is accepted.
function installStudentInbox({ app, db, requireUser, allowRate }) {
  const student = (req, res, next) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
    res.set('Cache-Control', 'no-store');
    if (!allowRate(req, res, { limit: 180, windowMs: 60000, key: r => `inbox:${r.user.uid}` })) return;
    next();
  };
  const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
  const searchText = body => {
    if (body.search !== undefined && (typeof body.search !== 'string' || body.search.length > 200)) throw Object.assign(new Error('Invalid search.'), { status: 400 });
    return (body.search || '').trim().toLowerCase();
  };
  const toRecord = snapshot => {
    const data = snapshot.data();
    return { ...data, id: snapshot.id, createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt };
  };
  const guarded = handler => async (req, res) => {
    try { await handler(req, res); }
    catch (error) { if (!error.status) console.error('Student inbox request failed:', error.code || error.message); res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load your inbox. Please try again.' }); }
  };
  async function page(base, { cursor, size, matches = () => true, search = false, owns, collection = 'notifications' }) {
    let position = null;
    if (cursor) {
      if (!validId(cursor)) throw Object.assign(new Error('Invalid cursor.'), { status: 400 });
      position = await db.collection(collection).doc(cursor).get();
      if (!position.exists || !owns(position.data())) throw Object.assign(new Error('Invalid cursor.'), { status: 400 });
    }
    const result = [];
    // Search scans in bounded database batches; it is not limited to the visible page.
    while (result.length <= size) {
      const snapshot = await (position ? base.startAfter(position) : base).limit(search ? 100 : size + 1).get();
      if (snapshot.empty) break;
      for (const item of snapshot.docs) {
        if (matches(item.data())) result.push(item);
        if (result.length > size) break;
      }
      position = snapshot.docs.at(-1);
      if (result.length > size || snapshot.size < (search ? 100 : size + 1)) break;
    }
    const displayed = result.slice(0, size);
    return { records: displayed.map(toRecord), cursor: displayed.at(-1)?.id || cursor || null, hasMore: result.length > size };
  }
  const notices = uid => db.collection('notifications').where('recipientId', '==', uid);
  const messages = uid => db.collection('messages').where('participantIds', 'array-contains', uid);

  app.post('/student/inbox/notifications', requireUser, student, guarded(async (req, res) => {
    const uid = req.user.uid;
    const search = searchText(req.body || {});
    const base = notices(uid);
    const [result, total, read] = await Promise.all([
      page(base.orderBy('createdAt', 'desc'), { cursor: req.body?.cursor, size: 15, search: !!search, owns: item => item.recipientId === uid, matches: item => `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(search) }),
      base.count().get(), base.where('read', '==', true).count().get(),
    ]);
    res.json({ ...result, unread: Math.max(0, total.data().count - read.data().count) });
  }));

  app.post('/student/inbox/conversations', requireUser, student, guarded(async (req, res) => {
    const uid = req.user.uid;
    const search = searchText(req.body || {});
    const exists = await messages(uid).limit(1).get();
    const legacy = exists.empty;
    let base = legacy ? notices(uid) : messages(uid);
    // Project summary metadata rather than transferring every message body to the phone.
    const fields = ['conversationId', 'senderId', 'senderName', 'senderRole', 'senderEmail', 'recipientId', 'recipientName', 'createdAt', 'read', 'type', 'participantIds'];
    if (search) fields.push('body', 'message', 'title');
    base = base.orderBy('createdAt', 'desc').select(...fields);
    const grouped = new Map();
    let cursor = null;
    while (true) {
      const snapshot = await (cursor ? base.startAfter(cursor) : base).limit(100).get();
      for (const item of snapshot.docs) {
        const data = item.data();
        if (legacy && !data.senderId && !['message', 'chat'].includes(data.type)) continue;
        const participantId = data.senderId !== uid ? data.senderId : data.recipientId;
        const id = legacy ? `legacy:${data.senderId || data.senderEmail || data.senderName || data.senderRole || 'coordinator'}` : data.conversationId;
        if (!id) continue;
        if (!grouped.has(id)) grouped.set(id, { id, conversationId: legacy ? null : id, legacy, participantId, name: data.senderId !== uid ? data.senderName || data.senderRole || 'OJT Coordinator' : data.recipientName || 'OJT Coordinator', latestId: item.id, unread: false, matched: false });
        const entry = grouped.get(id);
        entry.unread ||= data.recipientId === uid && !data.read;
        entry.matched ||= !search || `${entry.name} ${data.body || data.message || data.title || ''}`.toLowerCase().includes(search);
      }
      if (snapshot.size < 100) break;
      cursor = snapshot.docs.at(-1);
    }
    const all = [...grouped.values()];
    const conversations = await Promise.all(all.filter(item => item.matched).map(async item => {
      const latest = toRecord(await db.collection(legacy ? 'notifications' : 'messages').doc(item.latestId).get());
      return { id: item.id, conversationId: item.conversationId, legacy, participantId: item.participantId, name: item.name, unread: item.unread, messages: [latest] };
    }));
    res.json({ conversations, unread: all.filter(item => item.unread).length });
  }));

  function conversationQuery(uid, body) {
    const id = body.conversationId;
    if (typeof id !== 'string' || !id || id.length > 300 || id.includes('/')) throw Object.assign(new Error('Invalid conversation.'), { status: 400 });
    if (body.legacy) {
      const senderId = id.replace(/^legacy:/, '');
      if (!id.startsWith('legacy:') || !validId(senderId)) throw Object.assign(new Error('This older conversation cannot be opened.'), { status: 400 });
      return { base: notices(uid).where('senderId', '==', senderId), owns: item => item.recipientId === uid && item.senderId === senderId, collection: 'notifications' };
    }
    return { base: messages(uid).where('conversationId', '==', id), owns: item => item.participantIds?.includes(uid) && item.conversationId === id, collection: 'messages' };
  }
  app.post('/student/inbox/conversation', requireUser, student, guarded(async (req, res) => {
    const scope = conversationQuery(req.user.uid, req.body || {});
    const result = await page(scope.base.orderBy('createdAt', 'desc'), { cursor: req.body?.cursor, size: 20, owns: scope.owns, collection: scope.collection });
    res.json({ ...result, records: result.records.reverse() });
  }));
  app.post('/student/inbox/read', requireUser, student, guarded(async (req, res) => {
    const scope = conversationQuery(req.user.uid, req.body || {});
    let count = 0;
    // Only incoming messages for this authenticated student can be marked read.
    while (true) {
      const snapshot = await scope.base.where('recipientId', '==', req.user.uid).where('read', '==', false).limit(200).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach(item => batch.update(item.ref, { read: true, readAt: new Date().toISOString() }));
      await batch.commit(); count += snapshot.size;
    }
    res.json({ success: true, marked: count });
  }));
}
module.exports = { installStudentInbox };
