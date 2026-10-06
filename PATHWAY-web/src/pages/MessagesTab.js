import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, updateDoc, doc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';

const formatDate = value => value ? new Date(value).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';

export default function MessagesTab({ selectedSection }) {
  const coordinatorId = auth.currentUser?.uid;
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    setError('');
    try {
      const messageSnap = await getDocs(query(collection(db, 'messages'), where('participantIds', 'array-contains', coordinatorId)));
      setItems(messageSnap.docs.map(item => ({ id: item.id, ...item.data(), body: item.data().body || item.data().message || '' })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))));
      if (selectedSection?.id) {
        const studentSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', selectedSection.id)));
        setStudents(studentSnap.docs.map(item => ({ id: item.id, ...item.data() })));
      } else setStudents([]);
    } catch (loadError) {
      console.error('Messages load error:', loadError);
      setItems([]);
      setError(loadError.code === 'permission-denied'
        ? 'Messages are unavailable because the deployed Firestore rules do not yet allow this coordinator conversation scope.'
        : 'Could not load messages. Check your connection and try again.');
    } finally { setLoading(false); }
  }, [coordinatorId, selectedSection]);

  useEffect(() => { load(); }, [load]);

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
    }).filter(item => `${item.name} ${item.messages[item.messages.length - 1]?.body || ''}`.toLowerCase().includes(search.toLowerCase()));
  }, [items, students, allowedStudentIds, search, selectedSection]);

  const openConversation = async item => {
    setSelected(item);
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

  if (loading) return <div style={{ padding: 28 }}>Loading messages...</div>;
  return <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(230px, 0.8fr) minmax(0, 1.5fr)' : '1fr', gap: 18, padding: 28, overflowY: 'auto', flex: 1 }}>
    <section style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#FFF', padding: 18 }}>
      <h2 style={{ margin: 0 }}>Messages</h2>
      <p style={{ color: '#64748B', marginTop: 6 }}>Student–coordinator conversations for {selectedSection ? selectedSection.name : 'your assigned sections'}.</p>
      {error && <div role="alert" style={{ padding: 12, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginBottom: 12 }}>{error}</div>}
      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations..." style={{ width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #CBD5E1', borderRadius: 9 }} />
      {!conversations.length && <p style={{ color: '#64748B' }}>No conversations found.</p>}
      {conversations.map(item => <button key={item.id} type="button" onClick={() => openConversation(item)} style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #E2E8F0', borderRadius: 10, background: selected?.id === item.id ? '#EFF6FF' : '#FFF', padding: 12, marginTop: 10, cursor: 'pointer' }}><strong>{item.name}</strong><div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{item.messages[item.messages.length - 1]?.body}</div></button>)}
      {!!selectedSection?.id && <div style={{ marginTop: 20 }}><strong>Start a conversation</strong>{students.map(student => { const conversationId = [coordinatorId, student.id].sort().join('__'); const existing = conversations.find(item => item.id === conversationId); const name = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.idNumber || student.id; return <button key={student.id} type="button" onClick={() => setSelected(existing || { id: conversationId, studentId: student.id, name, messages: [] })} style={{ display: 'block', width: '100%', textAlign: 'left', border: '0', background: 'transparent', color: '#0284C7', padding: '10px 0', cursor: 'pointer' }}>{name}</button>; })}</div>}
    </section>
    {selected && <section style={{ border: '1px solid #E2E8F0', borderRadius: 14, background: '#F8FAFC', padding: 18, display: 'flex', flexDirection: 'column', minHeight: 480 }}><h2 style={{ margin: 0 }}>{selected.name}</h2><div style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}>{selected.messages.map(message => <div key={message.id} style={{ display: 'flex', justifyContent: message.senderId === coordinatorId ? 'flex-end' : 'flex-start', marginBottom: 10 }}><div style={{ maxWidth: '75%', background: message.senderId === coordinatorId ? '#004B87' : '#FFF', color: message.senderId === coordinatorId ? '#FFF' : '#0F172A', borderRadius: 14, padding: '10px 13px' }}><div>{message.body}</div><small style={{ opacity: 0.7 }}>{formatDate(message.createdAt)}</small></div></div>)}</div><div style={{ display: 'flex', gap: 8 }}><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a reply..." rows={2} style={{ flex: 1, resize: 'vertical', padding: 10, border: '1px solid #CBD5E1', borderRadius: 9 }} /><button type="button" onClick={send} disabled={!draft.trim() || sending} style={{ alignSelf: 'stretch', padding: '0 18px', border: 0, borderRadius: 9, background: '#0284C7', color: '#FFF', fontWeight: 700 }}>{sending ? 'Sending...' : 'Send'}</button></div></section>}
  </div>;
}
