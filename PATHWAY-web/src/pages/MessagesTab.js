import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';
import './MessagesTab.css';

const formatDate = value => value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

export default function MessagesTab({ selectedSection, sections = [], onSectionChange }) {
  const coordinatorId = auth.currentUser?.uid;
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [sectionSearch, setSectionSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    if (!coordinatorId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    setStudents([]);
    setError('');
    try {
      const messageSnap = await getDocs(query(collection(db, 'messages'), where('participantIds', 'array-contains', coordinatorId)));
      if (version !== loadVersion.current) return;
      setItems(messageSnap.docs.map(item => ({ id: item.id, ...item.data(), body: item.data().body || item.data().message || '' })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
      if (selectedSection?.id) {
        const studentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', selectedSection.id)));
        if (version !== loadVersion.current) return;
        setStudents(studentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      } else setStudents([]);
    } catch (loadError) {
      if (version !== loadVersion.current) return;
      console.error('Messages load error:', loadError);
      setItems([]);
      setError(loadError.code === 'permission-denied'
        ? 'Messages are unavailable because the deployed Firestore rules do not yet allow this coordinator conversation scope.'
        : 'Could not load messages. Check your connection and try again.');
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [coordinatorId, selectedSection]);

  useEffect(() => { load(); return () => { loadVersion.current += 1; }; }, [load]);

  useEffect(() => {
    setSelected(null);
    setDraft('');
  }, [selectedSection?.id, coordinatorId]);

  useEffect(() => { setDraft(''); }, [selected?.id]);

  const allowedStudentIds = useMemo(() => new Set(students.map(student => student.id)), [students]);
  const conversations = useMemo(() => {
    const grouped = new Map();
    items.filter(item => !selectedSection?.id || allowedStudentIds.has(item.studentId)).forEach(item => {
      const key = item.conversationId || item.studentId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(item);
    });
    return Array.from(grouped.entries()).map(([id, messages]) => {
      const studentId = messages[0].studentId;
      const student = students.find(item => item.id === studentId);
      return { id, studentId, name: student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.idNumber || student.id : messages[0].senderRole === 'student' ? messages[0].senderName || studentId : 'Student', messages };
    });
  }, [items, students, allowedStudentIds, selectedSection]);

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
    } catch (error) { window.alert(error.message || 'Unable to send message.'); }
    finally { setSending(false); }
  };

  const messageAlerts = items.filter(item => item.recipientId === coordinatorId && !item.read && allowedStudentIds.has(item.studentId));

  return <div className="messages-workspace">
    <aside className="messages-alerts" aria-label="Message notifications">
      <div><strong>Message alerts</strong><p>{error ? 'Message alerts are unavailable until messages can load.' : loading ? 'Checking messages…' : messageAlerts.length ? `${messageAlerts.length} unread message(s) in ${selectedSection?.name || 'this section'}` : 'No unread messages in this section.'}</p></div>
      <div className="messages-alert-actions">
        {messageAlerts.slice(-3).reverse().map(message => {
          const thread = conversations.find(item => item.studentId === message.studentId);
          return <button type="button" key={message.id} onClick={() => thread && openConversation(thread)}>
            <strong>{thread?.name || 'Student'}</strong><span>{message.body}</span>
          </button>;
        })}
        <button type="button" onClick={load} disabled={loading}>Refresh messages</button>
      </div>
    </aside>
    <section className="messages-sections">
      <header><h2>Sections</h2><p>Your assigned classes</p></header>
      <input type="search" aria-label="Search sections" placeholder="Search sections..." value={sectionSearch} onChange={event => setSectionSearch(event.target.value)} />
      <div className="messages-panel-list">
        {sections.filter(section => `${section.name} ${section.department || ''}`.toLowerCase().includes(sectionSearch.toLowerCase())).map(section =>
          <button type="button" className="messages-choice" aria-pressed={selectedSection?.id === section.id} key={section.id} onClick={() => onSectionChange?.(section)}>
            <strong>{section.name}</strong><span>{section.department}</span>
          </button>)}
        {!sections.length && <p className="messages-empty-copy">No assigned sections.</p>}
      </div>
    </section>
    <section className="messages-students">
      <header><h2>Students</h2><p>{selectedSection?.name || 'Choose a section first'}</p></header>
      <input type="search" aria-label="Search students and conversations" placeholder="Search name, ID, or message..." value={search} onChange={event => setSearch(event.target.value)} />
      {error && <div className="messages-error" role="alert">{error}<button type="button" onClick={load}>Try again</button></div>}
      <div className="messages-panel-list" aria-busy={loading}>
        {loading ? <p className="messages-empty-copy">Loading students and messages...</p> : !selectedSection ? <p className="messages-empty-copy">Select a section to see its students.</p> : <>
          {students.filter(student => {
            const thread = conversations.find(item => item.studentId === student.id);
            return `${student.firstName || ''} ${student.lastName || ''} ${student.idNumber || ''} ${thread?.messages.at(-1)?.body || ''}`.toLowerCase().includes(search.toLowerCase());
          }).map(student => {
            const thread = conversations.find(item => item.studentId === student.id);
            const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.idNumber || student.id;
            const unread = thread?.messages.filter(message => message.recipientId === coordinatorId && !message.read).length || 0;
            return <button key={student.id} type="button" aria-label={name} aria-pressed={selected?.studentId === student.id} className="messages-choice" onClick={() => openConversation(thread || { id: [coordinatorId, student.id].sort().join('__'), studentId: student.id, name, messages: [] })}>
              <div className="messages-student-title"><strong>{name}</strong>{unread > 0 && <span className="messages-unread">{unread} unread</span>}</div>
              <span>ID {student.idNumber || 'not provided'}</span>
              <span className="messages-preview">{thread?.messages.at(-1)?.body || 'Start a conversation'}</span>
            </button>;
          })}
          {!students.length && !error && <p className="messages-empty-copy">No students in this section.</p>}
          {students.length > 0 && search && !students.some(student => `${student.firstName || ''} ${student.lastName || ''} ${student.idNumber || ''} ${conversations.find(item => item.studentId === student.id)?.messages.at(-1)?.body || ''}`.toLowerCase().includes(search.toLowerCase())) && <p className="messages-empty-copy">No matching students or messages.</p>}
        </>}
      </div>
    </section>
    <section className="messages-conversation">
      {selected ? <>
        <header><div><h2>{selected.name}</h2><p>{selectedSection?.name}</p></div><button className="messages-close" type="button" onClick={() => setSelected(null)}>Close</button></header>
        <div className="messages-thread" role="log" aria-label="Conversation">
          {!selected.messages.length && <div className="messages-welcome"><h3>Start the conversation</h3><p>Send a message to {selected.name} about their OJT progress.</p></div>}
          {selected.messages.map(message => <div key={message.id} className={`messages-bubble-row${message.senderId === coordinatorId ? ' is-outgoing' : ''}`}><div className="messages-bubble"><div>{message.body}</div><small>{formatDate(message.createdAt)}</small></div></div>)}
        </div>
        <div className="messages-composer"><textarea aria-label="Message reply" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a reply..." rows={2} /><button type="button" onClick={send} disabled={!draft.trim() || sending}>{sending ? 'Sending...' : 'Send'}</button></div>
      </> : <div className="messages-welcome"><h2>Your conversations</h2><p>Choose a section, then a student to read or send messages.</p></div>}
    </section>
  </div>;
}
