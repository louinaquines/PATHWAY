// Sends Expo push for every new notice addressed to a student who registered a device.
// Uses a Firestore listener so every existing place that writes a notice gets push for free.
const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

function installPushNotifications({ app, db, requireUser, allowRate, FieldValue }) {
  app.put('/student/push-token', requireUser, async (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Student access required.' });
    if (!allowRate(req, res, { limit: 20, windowMs: 60 * 60_000, key: r => `push-token:${r.user.uid}` })) return;
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!TOKEN_RE.test(token)) return res.status(400).json({ error: 'Invalid push token.' });
    await db.collection('users').doc(req.user.uid).set({ expoPushTokens: FieldValue.arrayUnion(token), pushUpdatedAt: new Date().toISOString() }, { merge: true });
    return res.json({ success: true });
  });

  app.delete('/student/push-token', requireUser, async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token) await db.collection('users').doc(req.user.uid).set({ expoPushTokens: FieldValue.arrayRemove(token) }, { merge: true });
    return res.json({ success: true });
  });

  const startedAt = new Date().toISOString();
  const seen = new Set();
  const send = async (noticeId, notice) => {
    if (seen.has(noticeId) || notice.pushedAt || !notice.recipientId) return;
    seen.add(noticeId);
    const user = (await db.collection('users').doc(notice.recipientId).get()).data();
    const tokens = (user?.role === 'student' && Array.isArray(user.expoPushTokens) ? user.expoPushTokens : []).filter(t => TOKEN_RE.test(t));
    if (!tokens.length || user.pushEnabled === false) return;
    // Keep the lock screen short; details (like rejection reasons) stay inside the app.
    const sensitive = /reject|revision|fix|return|sent back/i.test(`${notice.type || ''} ${notice.title || ''}`);
    const body = String(notice.pushBody || (sensitive ? 'Open PATHWAY to see what to change.' : notice.message) || '').slice(0, 160);
    const messages = tokens.map(to => ({ to, title: String(notice.title || 'PATHWAY').slice(0, 80), body, sound: 'default', channelId: 'pathway', priority: 'high', data: { type: notice.type || '', id: noticeId } }));
    try {
      const response = await fetch(EXPO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages) });
      const result = await response.json().catch(() => ({}));
      const dead = (result.data || []).map((r, i) => (r?.details?.error === 'DeviceNotRegistered' ? tokens[i] : null)).filter(Boolean);
      if (dead.length) await db.collection('users').doc(notice.recipientId).set({ expoPushTokens: FieldValue.arrayRemove(...dead) }, { merge: true });
      await db.collection('notifications').doc(noticeId).set({ pushedAt: new Date().toISOString() }, { merge: true });
    } catch (error) { console.warn('Push send failed:', error.message); }
  };

  let stop = () => {};
  const listen = () => {
    try {
      stop = db.collection('notifications').where('createdAt', '>', startedAt).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => { if (change.type === 'added') send(change.doc.id, change.doc.data()).catch(() => {}); });
      }, error => { console.warn('Push listener stopped:', error.message); setTimeout(listen, 30_000); });
    } catch (error) { console.warn('Push listener unavailable:', error.message); }
  };
  if (process.env.PUSH_NOTIFICATIONS !== 'off') listen();
  return () => stop();
}

module.exports = { installPushNotifications };
