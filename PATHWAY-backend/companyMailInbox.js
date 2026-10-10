// Separate read-only authorization: never reuse the existing send-only token.
const READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const fail = () => new Error('Company inbox is unavailable. Check mailbox authorization and try refreshing.');

function normalizeThread(thread) {
  if (!thread || !ID.test(thread.id || '') || !Array.isArray(thread.messages) || thread.messages.length > 100) throw fail();
  const seen = new Set();
  const messages = [];
  for (const message of thread.messages) {
    if (!ID.test(message.id || '') || message.threadId !== thread.id) throw fail();
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    const headers = message.payload?.headers || [];
    const header = name => String(headers.find(item => item.name?.toLowerCase() === name)?.value || '').slice(0, 500);
    let text = '', partsSeen = 0;
    const attachments = [];
    function visit(part, depth = 0) {
      if (!part) return;
      if (++partsSeen > 100 || depth > 10) throw fail();
      if (part.filename) {
        attachments.push({ name: String(part.filename).replace(/[\r\n\\/]/g, '_').slice(0, 180),
          size: Number.isSafeInteger(part.body?.size) && part.body.size >= 0 ? part.body.size : null,
          status: 'blocked', reason: 'Attachments are not opened automatically. Use the authorized mailbox to review them.' });
        return;
      }
      if (part.mimeType === 'text/plain' && part.body?.data) {
        if (typeof part.body.data !== 'string' || part.body.data.length > 90000) throw fail();
        text += Buffer.from(part.body.data, 'base64url').toString('utf8');
        if (text.length > 64000) throw fail();
      }
      if (part.parts && !Array.isArray(part.parts)) throw fail();
      for (const child of part.parts || []) visit(child, depth + 1);
    }
    visit(message.payload);
    const timestamp = Number(message.internalDate);
    messages.push({ id: message.id, from: header('from'), to: header('to'), subject: header('subject'),
      time: Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= 8640000000000000 ? new Date(timestamp).toISOString() : null,
      text: text || 'No plain-text body available. Open this message in the authorized mailbox.', attachments,
      // HTML is never returned or rendered; remote images and links cannot execute.
      direction: message.labelIds?.includes('SENT') ? 'outbound' : 'inbound',
      delivery: message.labelIds?.includes('SENT') ? 'provider_accepted' : 'received' });
  }
  messages.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  return { id: thread.id, messages };
}

async function boundedJson(response, maxBytes) {
  if (!response.ok) throw fail();
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw fail();
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createCompanyInbox(env, fetcher = fetch) {
  if (env.COMPANY_INBOX_ENABLED !== '1' || !env.COMPANY_INBOX_OWNER_UID || !env.COMPANY_INBOX_MAILBOX
    || !env.COMPANY_INBOX_CLIENT_ID || !env.COMPANY_INBOX_CLIENT_SECRET || !env.COMPANY_INBOX_REFRESH_TOKEN) return null;
  return { ownerId: env.COMPANY_INBOX_OWNER_UID, mailbox: env.COMPANY_INBOX_MAILBOX,
    async findTestConversation() {
      if (env.COMPANY_INBOX_MAILBOX !== 'pathwaysystem4@gmail.com') throw fail();
      try {
        const token = await boundedJson(await fetcher('https://oauth2.googleapis.com/token', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.COMPANY_INBOX_CLIENT_ID, client_secret: env.COMPANY_INBOX_CLIENT_SECRET,
            refresh_token: env.COMPANY_INBOX_REFRESH_TOKEN, grant_type: 'refresh_token' }),
        }), 16000);
        if (token.scope !== READ_SCOPE || typeof token.access_token !== 'string' || !token.access_token) throw fail();
        const get = async (endpoint, limit = 16000) => boundedJson(await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
          redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}` },
        }), limit);
        const profile = await get('profile');
        if (profile.emailAddress?.toLowerCase() !== env.COMPANY_INBOX_MAILBOX) throw fail();
        const params = new URLSearchParams({ q: 'from:louinaquines@gmail.com to:pathwaysystem4@gmail.com subject:"PATHWAY TEST - company reply" newer_than:7d', maxResults: '5' });
        const result = await get(`messages?${params}`);
        if (result.messages && (!Array.isArray(result.messages) || result.messages.length > 5)) throw fail();
        for (const candidate of result.messages || []) {
          if (!ID.test(candidate.id || '')) throw fail();
          const raw = await get(`messages/${candidate.id}?format=full`, 1024 * 1024);
          const thread = normalizeThread({ id: raw.threadId, messages: [raw] });
          const message = thread.messages[0];
          if (message.subject === 'PATHWAY TEST - company reply'
            && /(?:^|<)louinaquines@gmail\.com(?:>|$)/i.test(message.from)
            && /(?:^|<)pathwaysystem4@gmail\.com(?:>|$)/i.test(message.to)
            && message.text.trim().replace(/\.$/, '') === 'This is a test company reply') {
            const rfcMessageId = raw.payload?.headers?.find(h => h.name?.toLowerCase() === 'message-id')?.value;
            return { threadId: thread.id, messageId: message.id,
              replyMetadata: /^<[A-Za-z0-9._+=-]+@[A-Za-z0-9.-]+>$/.test(rfcMessageId || '') ? {
                replyTo: 'louinaquines@gmail.com', replySubject: 'Re: PATHWAY TEST - company reply', replyMessageId: rfcMessageId,
              } : null };
          }
        }
        throw fail();
      } catch { throw fail(); }
    },
    async readThread(id) {
      if (!ID.test(id || '')) throw fail();
      try {
        const tokenResponse = await fetcher('https://oauth2.googleapis.com/token', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: env.COMPANY_INBOX_CLIENT_ID, client_secret: env.COMPANY_INBOX_CLIENT_SECRET,
            refresh_token: env.COMPANY_INBOX_REFRESH_TOKEN, grant_type: 'refresh_token' }),
        });
        const token = await boundedJson(tokenResponse, 16000);
        // Fail closed on excessive scopes; this adapter cannot send or modify mail.
        if (token.scope !== READ_SCOPE || typeof token.access_token !== 'string' || !token.access_token) throw fail();
        const profile = await boundedJson(await fetcher('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token.access_token}` },
        }), 16000);
        if (String(profile.emailAddress || '').toLowerCase() !== env.COMPANY_INBOX_MAILBOX.toLowerCase()) throw fail();
        const thread = await boundedJson(await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(id)}?format=full`, {
          redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}` },
        }), 1024 * 1024);
        if (thread.id !== id) throw fail();
        return normalizeThread(thread);
      } catch { throw fail(); }
    },
  };
}

function installCompanyInbox({ app, db, requireStaff, coordinatorSection, allowRate, inbox = null, sender = null }) {
  app.get('/coordinator/sections/:sectionId/company-conversations', requireStaff, async (req, res) => {
    try {
      if (!ID.test(req.params.sectionId || '')) return res.status(400).json({ error: 'Invalid section.' });
      await coordinatorSection(req, req.params.sectionId);
      if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `company-inbox-list:${r.staff.uid}` })) return;
      res.set('Cache-Control', 'private, no-store');
      if (!inbox || inbox.ownerId !== req.staff.uid) return res.json({ connected: false, conversations: [] });
      const records = await db.collection('sections').doc(req.params.sectionId).collection('companyConversations').limit(101).get();
      return res.json({ connected: true, truncated: records.size > 100, conversations: records.docs.slice(0, 100)
        .filter(doc => doc.data().coordinatorId === req.staff.uid && doc.data().sectionId === req.params.sectionId)
        .map(doc => ({ id: doc.id, companyName: doc.data().companyName || 'Company', studentId: doc.data().studentId })) });
    } catch (error) { return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not load company conversations.' }); }
  });
  app.get('/coordinator/sections/:sectionId/company-conversations/:conversationId', requireStaff, async (req, res) => {
    try {
      if (!ID.test(req.params.sectionId || '') || !ID.test(req.params.conversationId || '')) return res.status(400).json({ error: 'Invalid conversation.' });
      await coordinatorSection(req, req.params.sectionId);
      if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `company-inbox:${r.staff.uid}` })) return;
      if (!inbox || inbox.ownerId !== req.staff.uid) return res.status(503).json({ error: 'Company inbox is not connected for this coordinator.' });
      // Browser cannot supply arbitrary Gmail IDs. Only server-owned mappings qualify.
      const snapshot = await db.collection('sections').doc(req.params.sectionId).collection('companyConversations').doc(req.params.conversationId).get();
      const record = snapshot.data();
      if (!snapshot.exists || record.coordinatorId !== req.staff.uid || record.sectionId !== req.params.sectionId || !ID.test(record.studentId || '')) return res.status(404).json({ error: 'Conversation not found.' });
      const student = await db.collection('users').doc(record.studentId).get();
      if (!student.exists || student.data().sectionId !== req.params.sectionId || student.data().department !== req.staff.data.department) return res.status(403).json({ error: 'Assigned students only.' });
      const thread = await inbox.readThread(record.providerThreadId);
      // A test mapping authorizes only the exact matched test email, not unrelated
      // messages Gmail may group into the same provider thread.
      if (record.testOnly === true) {
        if (!ID.test(record.testMessageId || '')) return res.status(403).json({ error: 'Test message mapping is incomplete.' });
        thread.messages = thread.messages.filter(message => message.id === record.testMessageId);
        if (!thread.messages.length) return res.status(404).json({ error: 'Test message not found.' });
      }
      // Recheck assignment after the network request; never return a thread after reassignment.
      await coordinatorSection(req, req.params.sectionId);
      const currentStudent = await db.collection('users').doc(record.studentId).get();
      if (!currentStudent.exists || currentStudent.data().sectionId !== req.params.sectionId || currentStudent.data().department !== req.staff.data.department) return res.status(403).json({ error: 'Assigned students only.' });
      res.set('Cache-Control', 'private, no-store');
      const canReply = !!sender && sender.ownerId === req.staff.uid && record.sendEnabled === true
        && record.sourceMailbox === inbox.mailbox && !!record.replyTo && !!record.replyMessageId && !!record.replySubject;
      return res.json({ ...thread, studentId: record.studentId, canReply, replyTo: canReply ? record.replyTo : null, refreshedAt: new Date().toISOString() });
    } catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Could not refresh the company conversation.' }); }
  });
}
module.exports = { normalizeThread, boundedJson, createCompanyInbox, installCompanyInbox, READ_SCOPE };
