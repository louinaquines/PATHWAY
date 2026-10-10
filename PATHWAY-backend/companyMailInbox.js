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
      rfcMessageId: header('message-id'), inReplyTo: header('in-reply-to'), references: header('references'),
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
    async findPlacementConversations(contact) {
      if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(contact || '')) throw fail();
      const token = await boundedJson(await fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: env.COMPANY_INBOX_CLIENT_ID, client_secret: env.COMPANY_INBOX_CLIENT_SECRET,
          refresh_token: env.COMPANY_INBOX_REFRESH_TOKEN, grant_type: 'refresh_token' }),
      }), 16000);
      if (token.scope !== READ_SCOPE || !token.access_token) throw fail();
      const get = async endpoint => boundedJson(await fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${endpoint}`, {
        redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token.access_token}` },
      }), 16000);
      const profile = await get('profile');
      if (profile.emailAddress?.toLowerCase() !== env.COMPANY_INBOX_MAILBOX.toLowerCase()) throw fail();
      const query = new URLSearchParams({ q: `from:${contact} to:${env.COMPANY_INBOX_MAILBOX} newer_than:90d`, maxResults: '10' });
      const result = await get(`messages?${query}`);
      if (result.messages && (!Array.isArray(result.messages) || result.messages.length > 10)) throw fail();
      return (result.messages || []).map(item => {
        if (!ID.test(item.id || '') || !ID.test(item.threadId || '')) throw fail();
        return { messageId: item.id, threadId: item.threadId };
      });
    },
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

function installCompanyInbox({ app, db, requireStaff, coordinatorSection, allowRate, inbox = null, sender = null, discoveryEnabled = false }) {
  const crypto = require('node:crypto');
  async function placement(req, studentId) {
    if (!ID.test(studentId || '')) throw Object.assign(new Error('Invalid student.'), { status: 400 });
    await coordinatorSection(req, req.params.sectionId);
    const student = (await db.collection('users').doc(studentId).get()).data();
    if (!student || student.sectionId !== req.params.sectionId || student.department !== req.staff.data.department
      || student.role !== 'student') throw Object.assign(new Error('Assigned students only.'), { status: 403 });
    if (student.placementStatus !== 'approved' || !ID.test(student.placementProposalId || ''))
      throw Object.assign(new Error('An approved placement is required.'), { status: 409 });
    const proposal = (await db.collection('companyProposals').doc(student.placementProposalId).get()).data();
    if (!proposal || proposal.status !== 'approved' || proposal.studentId !== studentId || proposal.sectionId !== req.params.sectionId
      || proposal.department !== req.staff.data.department) throw Object.assign(new Error('Placement assignment changed.'), { status: 409 });
    const contact = String(proposal.companyEmail || proposal.supervisorEmail || '').trim().toLowerCase();
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(contact))
      throw Object.assign(new Error('The approved placement needs a valid company contact email.'), { status: 409 });
    return { contact, proposalId: student.placementProposalId, companyName: proposal.companyName || 'Company',
      studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student' };
  }
  app.post('/coordinator/sections/:sectionId/company-conversations/discover', requireStaff, async (req, res) => {
    try {
      res.set('Cache-Control', 'private, no-store');
      if (!discoveryEnabled || !inbox || inbox.ownerId !== req.staff.uid) return res.status(503).json({ error: 'Placement conversation discovery is not enabled.' });
      if (!ID.test(req.params.sectionId || '') || Object.keys(req.body || {}).some(key => key !== 'studentId')) return res.status(400).json({ error: 'Provide an assigned student only.' });
      const verified = await placement(req, req.body?.studentId);
      if (!allowRate(req, res, { limit: 3, windowMs: 60000, key: r => `company-discover:${r.staff.uid}` })) return;
      const matches = await inbox.findPlacementConversations(verified.contact);
      const conversations = [];
      for (const match of matches) {
        const thread = await inbox.readThread(match.threadId);
        const anchor = thread.messages.find(message => message.id === match.messageId);
        if (!anchor || !authorizedMessages([anchor], anchor.id, verified.contact, inbox.mailbox).length
          || !/^<[A-Za-z0-9._+=-]+@[A-Za-z0-9.-]+>$/.test(anchor.rfcMessageId || '')) continue;
        // Search results are only hints. Independently verify exact single sender/recipient.
        const extract = value => String(value || '').match(/^(?:[^<>]*<)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})>?$/)?.[1]?.toLowerCase();
        if (extract(anchor.from) !== verified.contact || extract(anchor.to) !== inbox.mailbox.toLowerCase()) continue;
        const fresh = await placement(req, req.body.studentId);
        if (fresh.proposalId !== verified.proposalId || fresh.contact !== verified.contact) throw Object.assign(new Error('Placement changed. Refresh and try again.'), { status: 409 });
        const id = crypto.createHash('sha256').update(`${req.staff.uid}:${req.params.sectionId}:${req.body.studentId}:${match.threadId}:${verified.proposalId}`).digest('hex');
        const ref = db.collection('sections').doc(req.params.sectionId).collection('companyConversations').doc(id);
        await db.runTransaction(async tx => {
          const sectionRef = db.collection('sections').doc(req.params.sectionId);
          const studentRef = db.collection('users').doc(req.body.studentId);
          const proposalRef = db.collection('companyProposals').doc(verified.proposalId);
          const [section, student, proposal, existing] = await Promise.all([tx.get(sectionRef), tx.get(studentRef), tx.get(proposalRef), tx.get(ref)]);
          if (section.data()?.coordinatorId !== req.staff.uid || student.data()?.sectionId !== req.params.sectionId
            || student.data()?.department !== req.staff.data.department || student.data()?.placementProposalId !== verified.proposalId
            || student.data()?.placementStatus !== 'approved' || proposal.data()?.status !== 'approved'
            || proposal.data()?.department !== req.staff.data.department
            || proposal.data()?.studentId !== req.body.studentId || proposal.data()?.sectionId !== req.params.sectionId
            || String(proposal.data()?.companyEmail || proposal.data()?.supervisorEmail || '').trim().toLowerCase() !== verified.contact)
            throw Object.assign(new Error('Placement changed.'), { status: 409 });
          if (!existing.exists) tx.create(ref, { coordinatorId: req.staff.uid, sectionId: req.params.sectionId,
            studentId: req.body.studentId, ...verified, sourceMailbox: inbox.mailbox, providerThreadId: match.threadId,
            anchorMessageId: match.messageId, replyTo: verified.contact, replySubject: `Re: ${anchor.subject.replace(/^Re:\s*/i, '')}`.slice(0, 250),
            replyMessageId: anchor.rfcMessageId, sendEnabled: true, placementBound: true, createdAt: new Date().toISOString() });
        });
        conversations.push({ id, subject: anchor.subject });
      }
      return res.json({ conversations, emailsSent: false });
    } catch (error) { return res.status(error.status || 502).json({ error: error.status ? error.message : 'Could not discover placement conversations.' }); }
  });
  app.get('/coordinator/sections/:sectionId/company-conversations', requireStaff, async (req, res) => {
    try {
      if (!ID.test(req.params.sectionId || '')) return res.status(400).json({ error: 'Invalid section.' });
      await coordinatorSection(req, req.params.sectionId);
      if (!allowRate(req, res, { limit: 10, windowMs: 60000, key: r => `company-inbox-list:${r.staff.uid}` })) return;
      res.set('Cache-Control', 'private, no-store');
      if (!inbox || inbox.ownerId !== req.staff.uid) return res.json({ connected: false, conversations: [] });
      const records = await db.collection('sections').doc(req.params.sectionId).collection('companyConversations').limit(101).get();
      const students = discoveryEnabled ? await db.collection('users').where('sectionId', '==', req.params.sectionId).limit(101).get() : null;
      return res.json({ connected: true, discoveryEnabled, eligibleStudents: (students?.docs || []).filter(doc => doc.data().role === 'student'
        && doc.data().department === req.staff.data.department && doc.data().placementStatus === 'approved').slice(0, 100)
        .map(doc => ({ id: doc.id, name: `${doc.data().firstName || ''} ${doc.data().lastName || ''}`.trim() || 'Student' })),
        truncated: records.size > 100, conversations: records.docs.slice(0, 100)
        .filter(doc => doc.data().coordinatorId === req.staff.uid && doc.data().sectionId === req.params.sectionId)
        .map(doc => ({ id: doc.id, companyName: doc.data().companyName || 'Company', studentId: doc.data().studentId,
          studentName: doc.data().studentName || null })) });
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
      if (record.placementBound === true) {
        const current = await placement(req, record.studentId);
        if (current.proposalId !== record.proposalId || current.contact !== record.replyTo) return res.status(409).json({ error: 'Placement changed. Link a current conversation.' });
        thread.messages = authorizedMessages(thread.messages, record.anchorMessageId, record.replyTo, record.sourceMailbox);
      }
      // Only explicit RFC reply descendants qualify, never unrelated messages
      // that Gmail happens to group into the provider thread.
      if (record.testOnly === true) {
        if (!ID.test(record.testMessageId || '')) return res.status(403).json({ error: 'Test message mapping is incomplete.' });
        thread.messages = authorizedMessages(thread.messages, record.testMessageId, record.replyTo, record.sourceMailbox);
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

function authorizedMessages(messages, anchorId, contact, mailbox) {
  const anchor = messages.find(message => message.id === anchorId);
  if (!anchor) return [];
  const allowed = new Set([anchorId]);
  const references = new Set(anchor.rfcMessageId ? [anchor.rfcMessageId] : []);
  const address = value => String(value || '').trim().toLowerCase();
  const contains = (header, email) => {
    if (!email) return false;
    const escaped = address(email).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[<,\\s])${escaped}(?:$|[>,\\s])`, 'i').test(header || '');
  };
  for (let pass = 0; pass < messages.length; pass++) {
    let changed = false;
    for (const message of messages) {
      if (allowed.has(message.id)) continue;
      const participants = (contains(message.from, contact) && contains(message.to, mailbox))
        || (contains(message.from, mailbox) && contains(message.to, contact));
      const linked = [message.inReplyTo, ...(message.references || '').split(/\s+/)].some(id => references.has(id));
      if (participants && linked) {
        allowed.add(message.id); if (message.rfcMessageId) references.add(message.rfcMessageId); changed = true;
      }
    }
    if (!changed) break;
  }
  return messages.filter(message => allowed.has(message.id));
}
module.exports.authorizedMessages = authorizedMessages;
