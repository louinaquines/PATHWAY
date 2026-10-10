import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './CompanyConversations.css';

export default function CompanyConversations({ sectionId }) {
  const [list, setList] = useState(null);
  const [selected, setSelected] = useState('');
  const [thread, setThread] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState(false);
  const [draft, setDraft] = useState('');
  const [studentId, setStudentId] = useState('');
  async function discover(event) {
    event.preventDefault();
    if (!studentId || linking) return;
    const generation = linkGeneration.current;
    setLinking(true); setError('');
    try {
      const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations/discover`,
        { method: 'POST', body: JSON.stringify({ studentId }) });
      const updated = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations`);
      if (generation !== linkGeneration.current) return;
      setList(updated); setSelected(result.conversations?.[0]?.id || '');
      if (!result.conversations?.length) setError('No matching company emails found in the last 90 days.');
    } catch (failure) { if (generation === linkGeneration.current) setError(failure.message || 'Could not find company conversations.'); }
    finally { if (generation === linkGeneration.current) setLinking(false); }
  }
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const sendLock = useRef(false);
  const request = useRef(null);
  const pendingKey = `pathway-company-reply:${sectionId}:${selected}`;
  const sendGeneration = useRef(0);
  const linkGeneration = useRef(0);
  useEffect(() => { sendGeneration.current++; setDraft(''); setSending(false); setSendStatus(''); request.current = null; sendLock.current = false;
    try { const pending = sessionStorage.getItem(pendingKey); if (pending) {
      request.current = { requestId: pending }; setSendStatus('A previous send needs a status check before another reply.');
    } } catch { /* storage unavailable; current-page lock still applies */ }
    return () => { sendGeneration.current++; }; }, [sectionId, selected]);
  async function checkDelivery() {
    if (!request.current || sending) return;
    const generation = sendGeneration.current; setSending(true);
    try {
      const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations/${encodeURIComponent(selected)}/replies/${encodeURIComponent(request.current.requestId)}`);
      if (generation !== sendGeneration.current) return;
      if (result.status === 'provider_accepted') {
        try { sessionStorage.removeItem(pendingKey); } catch {}
        request.current = null; setDraft(''); setSendStatus('Reply accepted by Gmail. Inbox delivery is not confirmed.'); setRevision(value => value + 1);
      } else setSendStatus('Delivery requires review in the mailbox. No second email was sent.');
    } catch { if (generation === sendGeneration.current) setSendStatus('Could not check delivery. Sending remains locked.'); }
    finally { if (generation === sendGeneration.current) setSending(false); }
  }
  async function sendReply(event) {
    event.preventDefault();
    if (sendLock.current || !thread?.canReply || !draft.trim()) return;
    const generation = sendGeneration.current;
    const conversation = selected;
    sendLock.current = true; setSending(true); setSendStatus('');
    // Keep the request ID after a failed response. Never generate a new attempt for
    // uncertain delivery; backend returns the existing reservation instead.
    if (!request.current) request.current = { requestId: window.crypto.randomUUID(), text: draft };
    try { sessionStorage.setItem(pendingKey, request.current.requestId); } catch {
      setSendStatus('Could not save the send guard. No email was sent.'); request.current = null; sendLock.current = false; setSending(false); return;
    }
    try {
      const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations/${encodeURIComponent(conversation)}/replies`,
        { method: 'POST', body: JSON.stringify(request.current) });
      if (generation !== sendGeneration.current) return;
      if (result.status !== 'provider_accepted') throw new Error('Delivery is not confirmed. Check status before retrying.');
      setDraft(''); setSendStatus('Reply accepted by Gmail. Inbox delivery is not confirmed.');
      try { sessionStorage.removeItem(pendingKey); } catch {}
      request.current = null; setRevision(value => value + 1);
    } catch (failure) {
      if (generation === sendGeneration.current) setSendStatus(failure.message || 'Delivery is not confirmed. Check status before retrying.');
    } finally {
      if (generation === sendGeneration.current) { sendLock.current = false; setSending(false); }
    }
  }
  useEffect(() => { linkGeneration.current++; setLinking(false); return () => { linkGeneration.current++; }; }, [sectionId]);
  async function linkTestReply(prepareReply = false) {
    if (linking || !sectionId) return;
    const generation = linkGeneration.current;
    setLinking(true); setError('');
    try {
      const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations/link-test-reply`, { method: 'POST', body: prepareReply === true ? '{"prepareReply":true}' : '{}' });
      const updated = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations`);
      if (generation === linkGeneration.current) { setList(updated); setSelected(result.conversationId); setRevision(value => value + 1); }
    } catch (failure) { if (generation === linkGeneration.current) setError(failure.message || 'Could not link the test reply.'); }
    finally { if (generation === linkGeneration.current) setLinking(false); }
  }
  useEffect(() => {
    let active = true;
    setList(null); setThread(null); setSelected(''); setError('');
    if (sectionId) adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations`)
      .then(result => { if (active) setList(result); })
      .catch(failure => { if (active) setError(failure.message || 'Could not load conversations.'); });
    return () => { active = false; };
  }, [sectionId]);
  useEffect(() => {
    let active = true;
    setThread(null); setError(''); setBusy(false);
    if (selected && sectionId) {
      setBusy(true);
      adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/company-conversations/${encodeURIComponent(selected)}`)
        .then(result => { if (active) setThread(result); })
        .catch(failure => { if (active) setError(failure.message || 'Could not refresh conversation.'); })
        .finally(() => { if (active) setBusy(false); });
    }
    return () => { active = false; };
  }, [selected, sectionId, revision]);
  return <section className="company-conversations" aria-label="Company email conversations">
    <header><div><h3>Company email</h3><p>Company replies for this section. Refresh to check for new messages.</p></div>
      <button type="button" disabled={!selected || busy} onClick={() => setRevision(value => value + 1)}>{busy ? 'Refreshing…' : 'Refresh replies'}</button></header>
    {error && <p role="alert">{error}</p>}
    {!sectionId ? <p>Select a section to view company conversations.</p> : !list && !error ? <p role="status">Loading conversations…</p> : list?.connected === false ?
      <p className="company-mail-empty">Inbox not connected. A coordinator must authorize a separate read-only mailbox connection. In-app messages and announcements remain available.</p> : list?.connected && <>
      {list.discoveryEnabled && <form className="company-mail-discovery" onSubmit={discover}>
        <label>Student<select value={studentId} onChange={event => setStudentId(event.target.value)} disabled={linking}>
          <option value="">Select a student with an approved placement</option>
          {(list.eligibleStudents || []).map(student => <option value={student.id} key={student.id}>{student.name}</option>)}
        </select></label>
        <button type="submit" disabled={!studentId || linking}>{linking ? 'Finding conversations…' : 'Find company emails'}</button>
        <small>Uses the approved placement contact. Does not send an email.</small>
      </form>}
      <label>Conversation<select value={selected} onChange={event => setSelected(event.target.value)}><option value="">Select a conversation</option>
        {(list.conversations || []).map(item => <option key={item.id} value={item.id}>{item.companyName} — {item.studentName || item.studentId}</option>)}</select></label>
      {!list.conversations?.length && <p>No company email conversations linked to this section.</p>}
      {list?.connected && !list.conversations?.length && <button type="button" disabled={linking} onClick={linkTestReply}>{linking ? 'Linking test reply…' : 'Link exact test reply'}</button>}
      {list.truncated && <p>Showing the first 100 conversations.</p>}
      {thread && <><p className="company-mail-updated">Last refreshed: {new Date(thread.refreshedAt).toLocaleString()}</p>
        {!thread.messages?.length && <p>No messages in this conversation.</p>}
        {(thread.messages || []).map(message => <article key={message.id}><div className="company-mail-meta"><strong>{message.from || 'Sender unavailable'}</strong><time>{message.time ? new Date(message.time).toLocaleString() : 'Time unavailable'}</time></div>
          <h4>{message.subject || 'No subject'}</h4><p className="company-mail-body">{message.text}</p>
          {message.direction === 'outbound' && <small>Accepted by provider — inbox delivery is not confirmed.</small>}
          {(message.attachments || []).map((file, index) => <p className="company-mail-attachment" key={index}>{file.name} · Attachment blocked. Review in the authorized mailbox.</p>)}
        </article>)}
        {thread.canReply && <form className="company-mail-composer" onSubmit={sendReply}>
          <div className="company-mail-compose-header"><strong>Reply</strong><span>To: {thread.replyTo}</span></div>
          <label htmlFor="company-mail-reply">Message</label>
          <textarea id="company-mail-reply" value={draft} maxLength={10000} rows={4} disabled={sending || !!request.current}
            placeholder="Write a reply…" onChange={event => setDraft(event.target.value)} />
          <div className="company-mail-compose-footer"><small>No attachments. Replies stay in this email conversation.</small>
            <button type="submit" disabled={sending || !draft.trim() || !!request.current}>{sending ? 'Sending…' : 'Send reply'}</button></div>
        </form>}
        {sendStatus && <p role="status" className="company-mail-send-status">{sendStatus}</p>}
        {request.current && <button type="button" disabled={sending} onClick={checkDelivery}>Check delivery status</button>}
        {!thread.canReply && <><p>Replies are unavailable until this conversation has a verified recipient and sender connection.</p>
          <button type="button" disabled={linking} onClick={() => linkTestReply(true)}>{linking ? 'Verifying recipient…' : 'Prepare exact test conversation for replies'}</button></>}
      </>}
    </>}
  </section>;
}
