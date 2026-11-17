// Inbound company email: one shared PATHWAY mailbox, routed to the right coordinators.
// Read-only Gmail access. Each email is matched by sender address to a company, then to
// the students placed there, their sections and those sections' coordinators.
const { normalizeThread, boundedJson, READ_SCOPE } = require('./companyMailInbox');

const indexedNotice = data => ({ ...data, ...require('./coordinatorInbox').inboxFields(data) });
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const emailOf = value => (String(value || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0].toLowerCase();
const nameOf = value => String(value || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim();

function inboxConfig(source) {
  // Reuse the sending Gmail client when no separate inbox client is set.
  const env = { ...source,
    COMPANY_INBOX_MAILBOX: source.COMPANY_INBOX_MAILBOX || source.GMAIL_FROM,
    COMPANY_INBOX_CLIENT_ID: source.COMPANY_INBOX_CLIENT_ID || source.GMAIL_CLIENT_ID,
    COMPANY_INBOX_CLIENT_SECRET: source.COMPANY_INBOX_CLIENT_SECRET || source.GMAIL_CLIENT_SECRET };
  if (env.COMPANY_INBOX_ENABLED !== '1' || !env.COMPANY_INBOX_MAILBOX || !env.COMPANY_INBOX_CLIENT_ID
    || !env.COMPANY_INBOX_CLIENT_SECRET || !env.COMPANY_INBOX_REFRESH_TOKEN) return null;
  return env;
}

async function gmailClient(env, fetcher) {
  const token = await boundedJson(await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.COMPANY_INBOX_CLIENT_ID, client_secret: env.COMPANY_INBOX_CLIENT_SECRET,
      refresh_token: env.COMPANY_INBOX_REFRESH_TOKEN, grant_type: 'refresh_token' }),
  }), 16000);
  if (!String(token.scope || '').split(' ').includes(READ_SCOPE) || !token.access_token) throw new Error('Inbox authorization is missing read-only access.');
  return async (endpoint, limit = 16000) => boundedJson(await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
    redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}` },
  }), limit);
}

async function routeSender(db, sender) {
  const [byEmail, bySupervisor] = await Promise.all([
    db.collection('companies').where('email', '==', sender).limit(20).get(),
    db.collection('companies').where('placementDefaults.supervisorEmail', '==', sender).limit(20).get(),
  ]);
  const companies = new Map([...byEmail.docs, ...bySupervisor.docs].map(doc => [doc.id, doc.data()]));
  const students = [];
  for (const companyId of companies.keys()) {
    const placed = await db.collection('users').where('companyId', '==', companyId).limit(100).get();
    placed.docs.filter(doc => doc.data().role === 'student').forEach(doc => students.push({ id: doc.id, ...doc.data() }));
  }
  const sectionIds = [...new Set(students.map(student => student.sectionId).filter(id => ID.test(id || '')))];
  const coordinatorIds = new Set();
  for (const sectionId of sectionIds) {
    const section = await db.collection('sections').doc(sectionId).get();
    if (ID.test(section.data()?.coordinatorId || '')) coordinatorIds.add(section.data().coordinatorId);
  }
  return {
    companyIds: [...companies.keys()],
    companyName: [...companies.values()][0]?.name || '',
    studentIds: students.map(student => student.id).slice(0, 50),
    studentNames: students.map(student => [student.lastName, student.firstName].filter(Boolean).join(', ')).filter(Boolean).slice(0, 50),
    sectionIds,
    coordinatorIds: [...coordinatorIds],
  };
}

function installCompanyEmailRouter({ app, db, requireStaff, allowRate, ai, env = process.env, fetcher = fetch, intervalMs = 3 * 60_000 }) {
  const config = inboxConfig(env);
  let running = false;
  let lastRun = { at: null, ok: null, error: null, added: 0 };

  async function poll() {
    if (!config || running) return lastRun;
    running = true;
    try {
      const get = await gmailClient(config, fetcher);
      const params = new URLSearchParams({ q: `in:inbox newer_than:14d -from:${config.COMPANY_INBOX_MAILBOX}`, maxResults: '25' });
      const list = await get(`messages?${params}`);
      let added = 0;
      for (const item of (list.messages || []).slice(0, 25)) {
        if (!ID.test(item.id || '')) continue;
        const ref = db.collection('companyEmails').doc(item.id);
        if ((await ref.get()).exists) continue;
        const raw = await get(`messages/${item.id}?format=full`, 1024 * 1024);
        const message = normalizeThread({ id: raw.threadId, messages: [raw] }).messages[0];
        const sender = emailOf(message.from);
        if (!sender) continue;
        const route = await routeSender(db, sender);
        let ai_ = { summary: '', action: '' };
        if (ai?.summarizeEmail) {
          try { ai_ = await ai.summarizeEmail({ from: message.from, subject: message.subject, text: message.text }); }
          catch { /* summary is optional */ }
        }
        const now = new Date().toISOString();
        const batch = db.batch();
        batch.set(ref, {
          gmailId: item.id, threadId: raw.threadId, from: nameOf(message.from) || sender, fromEmail: sender,
          subject: message.subject.slice(0, 300), text: message.text.slice(0, 8000), receivedAt: message.time || now,
          attachments: message.attachments.map(file => file.name).slice(0, 10),
          ...route, matched: route.coordinatorIds.length > 0, summary: ai_.summary, action: ai_.action,
          readBy: [], createdAt: now,
        });
        for (const coordinatorId of route.coordinatorIds) {
          batch.set(db.collection('notifications').doc(`company_email_${item.id}_${coordinatorId}`), indexedNotice({
            recipientId: coordinatorId, type: 'company_email', read: false, createdAt: now,
            title: `New email from ${route.companyName || nameOf(message.from) || sender}`,
            message: (ai_.summary || message.subject || 'Open Messages to read it.').slice(0, 300),
          }));
        }
        await batch.commit();
        added++;
      }
      lastRun = { at: new Date().toISOString(), ok: true, error: null, added };
    } catch (error) {
      lastRun = { at: new Date().toISOString(), ok: false, error: 'Could not read the PATHWAY mailbox.', added: 0 };
      console.warn('Company email poll failed:', error.message);
    } finally { running = false; }
    return lastRun;
  }

  if (config && intervalMs > 0) {
    setTimeout(poll, 15_000).unref?.();
    setInterval(poll, intervalMs).unref?.();
  }

  const coordinatorOnly = (req, res) => {
    if (req.staff.role !== 'coordinator' && req.staff.role !== 'admin') { res.status(403).json({ error: 'Coordinator access required.' }); return false; }
    return true;
  };

  app.get('/coordinator/company-emails', requireStaff, async (req, res) => {
    if (!coordinatorOnly(req, res)) return;
    if (!allowRate(req, res, { limit: 30, windowMs: 60000, key: r => `company-emails:${r.staff.uid}` })) return;
    res.set('Cache-Control', 'private, no-store');
    if (!config) return res.json({ connected: false, emails: [] });
    try {
      const base = db.collection('companyEmails');
      const query = req.staff.role === 'admin' && req.query.view === 'unmatched'
        ? base.where('matched', '==', false) : base.where('coordinatorIds', 'array-contains', req.staff.uid);
      const snap = await query.limit(100).get();
      const emails = snap.docs.map(doc => {
        const v = doc.data();
        return { id: doc.id, from: v.from, fromEmail: v.fromEmail, subject: v.subject, text: v.text, receivedAt: v.receivedAt,
          companyName: v.companyName, studentNames: v.studentNames || [], summary: v.summary, action: v.action,
          attachments: v.attachments || [], read: (v.readBy || []).includes(req.staff.uid) };
      }).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
      return res.json({ connected: true, mailbox: config.COMPANY_INBOX_MAILBOX, lastCheck: lastRun, emails });
    } catch (error) {
      console.error('Company email list failed:', error.message);
      return res.status(500).json({ error: 'Could not load company emails.' });
    }
  });

  app.post('/coordinator/company-emails/check', requireStaff, async (req, res) => {
    if (!coordinatorOnly(req, res)) return;
    if (!allowRate(req, res, { limit: 4, windowMs: 60000, key: r => `company-emails-check:${r.staff.uid}` })) return;
    if (!config) return res.json({ connected: false });
    return res.json({ connected: true, lastCheck: await poll() });
  });

  app.post('/coordinator/company-emails/:id/read', requireStaff, async (req, res) => {
    if (!coordinatorOnly(req, res) || !ID.test(req.params.id || '')) return res.headersSent ? undefined : res.status(400).json({ error: 'Invalid email.' });
    try {
      const ref = db.collection('companyEmails').doc(req.params.id);
      const doc = await ref.get();
      if (!doc.exists || !(doc.data().coordinatorIds || []).includes(req.staff.uid)) return res.status(404).json({ error: 'Email not found.' });
      await ref.update({ readBy: require('firebase-admin').firestore.FieldValue.arrayUnion(req.staff.uid) });
      return res.json({ ok: true });
    } catch { return res.status(500).json({ error: 'Could not update this email.' }); }
  });

  return { poll };
}

module.exports = { installCompanyEmailRouter, routeSender, emailOf };
