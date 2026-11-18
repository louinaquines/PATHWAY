import personName from '../personName';
import { compareStudents } from '../coordinatorStudentSort';
import { readPortalPage, mergePortalRecords } from '../portalRecordPages';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, updateDoc, doc, where, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';
import './MessagesTab.css';
import './MessagesRedesign.css';
import { createPortal } from 'react-dom';
import Pager from '../components/Pager';
import SectionPicker from '../components/SectionPicker';
import { RowsSkeleton } from '../components/CoordSkeletons';
import { showNotice } from '../successFx';

const shortTime = value => { if (!value) return ''; const d = new Date(value); const now = new Date(); const days = Math.floor((now - d) / 86400000);
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  if (days < 2) return 'Yesterday'; if (days < 7) return d.toLocaleDateString('en-PH', { weekday: 'short' }); return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); };
const initialsOf = name => String(name || '?').split(/[ ,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const formatDate = value => value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

export default function MessagesTab({ selectedSection, sections = [], onSectionChange, onAnnouncements, onNewAnnouncement }) {
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('msg-top-actions')); }, []);
  const coordinatorId = auth.currentUser?.uid;
  const historyCursor = useRef(null);
  const historyBusy = useRef(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const alertsDialog = useRef(null);
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!alertsOpen) return undefined;
    const key = e => { if (e.key === 'Escape') setAlertsOpen(false); };
    const down = e => { if (alertsDialog.current && !alertsDialog.current.contains(e.target) && !e.target.closest?.('.msg-bell')) setAlertsOpen(false); };
    window.addEventListener('keydown', key); document.addEventListener('mousedown', down);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [alertsOpen]);

  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    if (!coordinatorId) return;
    const version = ++loadVersion.current;
    if (!silent) setLoading(true);
    if (!silent) setStudents([]);

    setError('');
    if (!selectedSection?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const messagePage = await readPortalPage(query(collection(db, 'messages'), where('participantIds', 'array-contains', coordinatorId), orderBy('createdAt', 'desc')));
      if (!isRefreshCurrent()) return;
      if (version !== loadVersion.current) return;
      if (!silent || !historyCursor.current) { historyCursor.current = messagePage.cursor; setHasOlder(messagePage.hasMore); }
      const normalized = messagePage.records.map(item=>({...item,body:item.body || item.message || ''}));
      setItems(previous=>(silent ? mergePortalRecords(previous,normalized) : normalized).sort((a,b)=>String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
      if (selectedSection?.id) {
        const studentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', selectedSection.id)));
      if (!isRefreshCurrent()) return;
        if (version !== loadVersion.current) return;
        setStudents(studentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      } else setStudents([]);
    } catch (loadError) {
      if (!isRefreshCurrent()) return;
      if (version !== loadVersion.current) return;
      console.error('Messages load error:', loadError);
      if (!silent) setItems([]);
      setError(loadError.code === 'permission-denied'
        ? 'Messages are unavailable because the deployed Firestore rules do not yet allow this coordinator conversation scope.'
        : 'No conversations yet. Messages will appear here once students join this section.');
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [coordinatorId, selectedSection]);

  usePortalAutoRefresh(load, { enabled: !loading && !sending, scope: selectedSection?.id || '', protectInputs: false });

  useEffect(() => { load(); return () => { loadVersion.current += 1; }; }, [load]);

  useEffect(() => {
    setSelected(null);
    setDraft('');
  }, [selectedSection?.id, coordinatorId]);

  useEffect(() => { setDraft(''); }, [selected?.id]);

  const allowedStudentIds = useMemo(() => new Set(students.map(student => student.id)), [students]);
  const conversations = useMemo(() => {
    const grouped = new Map();
    items.filter(item => selectedSection?.id && allowedStudentIds.has(item.studentId)).forEach(item => {
      const key = item.conversationId || item.studentId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return Array.from(grouped.entries()).map(([id, messages]) => {
      const studentId = messages[0].studentId;
      const student = students.find(item => item.id === studentId);
      return { id, studentId, name: student ? personName(student) || student.idNumber || student.id : messages[0].senderRole === 'student' ? messages[0].senderName || studentId : 'Student', messages };
    });
  }, [items, students, allowedStudentIds, selectedSection]);

  useEffect(() => {
    setSelected(previous => {
      if (!previous) return previous;
      const current = conversations.find(item => item.studentId === previous.studentId);
      return current ? { ...current, id: previous.id } : previous;
    });
  }, [conversations]);

  const openConversation = async item => {
    setSelected(item);
    if (!item.messages.some(message => message.recipientId === coordinatorId && !message.read)) return;
    await Promise.all(item.messages.filter(message => message.recipientId === coordinatorId && !message.read).map(message => updateDoc(doc(db, 'messages', message.id), { read: true, readAt: new Date().toISOString() }).catch(() => null)));
    setItems(previous => previous.map(message => item.messages.some(current => current.id === message.id) ? { ...message, read: true } : message));
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      const result = await adminRequest('/messages', {
        method: 'POST', body: JSON.stringify({ recipientId: selected.studentId, body }),
      });
      const payload = { conversationId: result.conversationId, participantIds: [coordinatorId, selected.studentId], studentId: selected.studentId, coordinatorId, senderId: coordinatorId, senderRole: 'coordinator', senderName: 'OJT Coordinator', recipientId: selected.studentId, recipientRole: 'student', recipientName: selected.name, body, message: body, read: false, createdAt: result.createdAt, type: 'direct_message' };
      const created = { id: result.messageId, ...payload };
      setItems(previous => [...previous, created]);
      setSelected(previous => previous?.id === selected.id ? { ...previous, messages: [...previous.messages, created] } : previous);
      setDraft(previous => previous === draft ? '' : previous);
    } catch (error) { showNotice(error.message || 'Unable to send message.'); }
    finally { setSending(false); }
  };

  const threadsByStudent = new Map(conversations.map(thread => [thread.studentId, thread]));
  const sortedStudents = [...students].sort(compareStudents);
  const visibleStudents = sortedStudents.filter(student => {
            const thread = threadsByStudent.get(student.id);
            return `${student.firstName || ''} ${student.lastName || ''} ${student.idNumber || ''} ${thread?.messages.at(-1)?.body || ''}`.toLowerCase().includes(search.toLowerCase());
          });
  const studentsPage = useRecordPage(visibleStudents, (selectedSection?.id || '') + ':' + search, 10);
  const messageAlerts = items.filter(item => item.recipientId === coordinatorId && !item.read && allowedStudentIds.has(item.studentId));

  const loadOlder = async () => {
    if (historyBusy.current || !hasOlder) return;
    const version=loadVersion.current; historyBusy.current=true;setOlderBusy(true);
    try { const page=await readPortalPage(query(collection(db,'messages'),where('participantIds','array-contains',coordinatorId),orderBy('createdAt','desc')),historyCursor.current);
      if(version!==loadVersion.current)return;
      historyCursor.current=page.cursor;setHasOlder(page.hasMore);
      setItems(previous=>mergePortalRecords(previous,page.records.map(item=>({...item,body:item.body || item.message || ''}))).sort((a,b)=>String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
    } catch { if(version===loadVersion.current)setError('Could not load older messages. Try again.'); }
    finally {historyBusy.current=false;setOlderBusy(false);}
  };
  const alertsPage = useRecordPage([...messageAlerts].sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))), selectedSection?.id, 6);
  const [markingAll, setMarkingAll] = useState(false);
  const markAllRead = async () => { if (markingAll || !messageAlerts.length) return; setMarkingAll(true); const ids = new Set(messageAlerts.map(m => m.id));
    await Promise.all(messageAlerts.map(m => updateDoc(doc(db, 'messages', m.id), { read: true, readAt: new Date().toISOString() }).catch(() => null)));
    setItems(prev => prev.map(m => ids.has(m.id) ? { ...m, read: true } : m)); setMarkingAll(false); };
  const threadPage = useRecordPage([...(selected?.messages || [])].reverse(), selected?.id, 50);
  return <div className="msg messages-workspace">
    {(acts => topHost ? createPortal(acts, topHost) : <div className="msg-inline-actions">{acts}</div>)(<>
      {onNewAnnouncement && <button type="button" className="rq-btn rq-primary msg-new" onClick={onNewAnnouncement}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8" /></svg>New announcement</button>}
      {sections.length > 0 && <SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />}
    </>)}
    <div className="msg-card">
    <section className="msg-list">
      <header className="msg-list-head">
        <h2 className="sr-only">Students</h2>
        <div className="msg-search-row msg-pop-anchor"><div className="coordinator-search msg-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" aria-label="Search students and conversations" placeholder="Find a student" value={search} onChange={event => setSearch(event.target.value)} /></div>
      <button className="rq-btn msg-bell messages-alert-trigger" type="button" aria-label="Unread messages" aria-haspopup="dialog" aria-expanded={alertsOpen} onClick={() => setAlertsOpen(true)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
        {messageAlerts.length > 0 && <span className="msg-count">{messageAlerts.length}</span>}
      </button>
        {alertsOpen && <div ref={alertsDialog} className="msg-pop" role="dialog" aria-label="Unread messages">
          <header className="msg-pop-head"><h3>Unread messages {messageAlerts.length > 0 && <b>{messageAlerts.length}</b>}</h3>
            <div className="msg-pop-acts">
              <button type="button" className="msg-pop-icon messages-alert-refresh" aria-label="Refresh messages" title="Refresh" onClick={load} disabled={loading}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1" /></svg></button>
              {messageAlerts.length > 0 && <button type="button" className="rq-link" onClick={markAllRead} disabled={markingAll}>{markingAll ? 'Marking…' : 'Mark all read'}</button>}
              <button type="button" className="msg-pop-icon" aria-label="Close message notifications" onClick={() => setAlertsOpen(false)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
            </div></header>
          {error ? <p className="msg-pop-empty">Message alerts are unavailable until messages can load.</p>
            : loading ? <p className="msg-pop-empty">Checking messages…</p>
            : !messageAlerts.length ? <div className="msg-pop-empty"><span aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg></span><strong>You’re all caught up</strong><p>No unread messages in this section.</p></div>
            : <div className="msg-pop-list">{alertsPage.items.map(message => {
              const thread = conversations.find(item => item.studentId === message.studentId);
              const name = thread?.name || message.senderName || 'Student';
              return <button type="button" key={message.id} className="msg-pop-row" onClick={() => { if (thread) { openConversation(thread); setAlertsOpen(false); } }}>
                <span className="msg-av" aria-hidden="true">{initialsOf(name)}</span>
                <span className="msg-row-main"><span className="msg-row-top"><strong>{name}</strong><time>{shortTime(message.createdAt)}</time></span><span className="msg-row-prev">{message.body}</span></span>
                <i className="msg-dot" aria-label="Unread" />
              </button>; })}</div>}
          {alertsPage.pageCount > 1 && <div className="msg-pop-foot"><span>{alertsPage.start + 1}–{alertsPage.start + alertsPage.items.length} of {alertsPage.total}</span><Pager page={alertsPage.page} pages={alertsPage.pageCount} onGo={alertsPage.onPageChange} label="Unread messages" /></div>}
        </div>}
        </div>
      </header>
      {error && <div className="msg-error" role="status">{error}<button type="button" className="rq-link" onClick={load}>Check again</button></div>}
      <div className="msg-rows" aria-busy={loading}>
        {loading ? <RowsSkeleton label="Loading students and messages" rows={7} action={false} /> : !selectedSection ? <p className="msg-empty">Select a section to see its students.</p> : <>
          {studentsPage.items.map(student => {
            const thread = conversations.find(item => item.studentId === student.id);
            const name = personName(student) || student.idNumber || student.id;
            const last = thread?.messages.at(-1);
            const unread = thread?.messages.filter(message => message.recipientId === coordinatorId && !message.read).length || 0;
            return <button key={student.id} type="button" aria-label={name} aria-pressed={selected?.studentId === student.id} className="msg-row" data-unread={unread > 0 || undefined} onClick={() => openConversation(thread || { id: [coordinatorId, student.id].sort().join('__'), studentId: student.id, name, messages: [] })}>
              <span className="msg-av" aria-hidden="true">{initialsOf(name)}</span>
              <span className="msg-row-main"><span className="msg-row-top"><strong>{name}</strong><time>{last ? shortTime(last.createdAt) : ''}</time></span>
                <span className="msg-row-prev">{last ? (last.senderId === coordinatorId ? 'You: ' : '') + last.body : 'Start a conversation'}</span></span>
              {unread > 0 && <i className="msg-dot" aria-label={`${unread} unread`} />}
            </button>;
          })}
          {!students.length && !error && <p className="msg-empty">No students in this section.</p>}
          {students.length > 0 && search && !visibleStudents.length && <p className="msg-empty">No matching students or messages.</p>}
        </>}
      </div>
      {(studentsPage.pageCount > 1 || hasOlder) && <div className="msg-foot">
        {hasOlder ? <button type="button" className="rq-link" onClick={loadOlder} disabled={olderBusy}>{olderBusy ? 'Loading…' : 'Load older messages'}</button> : <span>{studentsPage.start + 1}–{studentsPage.start + studentsPage.items.length} of {studentsPage.total}</span>}
        {studentsPage.pageCount > 1 && <Pager page={studentsPage.page} pages={studentsPage.pageCount} onGo={studentsPage.onPageChange} label="Conversations" />}
      </div>}
    </section>
    <section className="msg-chat">
      {selected ? <>
        <header className="msg-chat-head"><span className="msg-av" aria-hidden="true">{initialsOf(selected.name)}</span><div><h2>{selected.name}</h2><p>{selectedSection?.name}</p></div>
          <button className="plt-x" type="button" aria-label="Close conversation" onClick={() => setSelected(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></header>
        <div className="msg-thread" role="log" aria-label="Conversation">
          {!selected.messages.length && <div className="msg-hello"><h3>Start the conversation</h3><p>Send a message to {selected.name} about their OJT progress.</p></div>}
          {threadPage.pageCount > 1 && <div className="msg-older"><Pager page={threadPage.page} pages={threadPage.pageCount} onGo={threadPage.onPageChange} label="Message history (newest page first)" /></div>}
          {[...threadPage.items].reverse().map((message, i, arr) => { const mine = message.senderId === coordinatorId; const day = new Date(message.createdAt).toDateString(); const showDay = i === 0 || new Date(arr[i - 1].createdAt).toDateString() !== day;
            return <div key={message.id}>{showDay && <p className="msg-day">{day === new Date().toDateString() ? 'Today' : new Date(message.createdAt).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</p>}
              <div className={`msg-b-row${mine ? ' is-out' : ''}`}><div className="msg-b">{message.body}</div><small>{new Date(message.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}{mine && message.read ? ' · Seen' : ''}</small></div></div>; })}
        </div>
        <div className="msg-compose"><textarea aria-label="Message reply" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!event.repeat) send(); } }} placeholder="Write a message" rows={1} />
          <button type="button" className="rq-btn rq-primary" onClick={send} disabled={!draft.trim() || sending}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>{sending ? 'Sending...' : 'Send'}</button></div>
      </> : <div className="msg-hello msg-pick"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" /></svg><h2>Your conversations</h2><p>Pick a student on the left to read or send messages.</p></div>}
    </section>
    </div>
  </div>;
}
