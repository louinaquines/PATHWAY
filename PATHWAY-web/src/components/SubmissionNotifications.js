import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import Icon from './Icons';
import '../pages/MessagesTab.css';
import './SubmissionNotifications.css';

export const submissionTime = value => value?.toMillis ? value.toMillis() : new Date(value || 0).getTime() || 0;
export function receivedRequirements(student) {
  return Object.entries(student.requirements || {}).filter(([, item]) => item.submittedAt && item.status !== 'not_submitted').map(([id, item]) => ({
    id: `${student.id}/${id}/${submissionTime(item.submittedAt)}`,
    student, title: item.fileName || id.replace(/_/g, ' '), createdAt: item.submittedAt,
  }));
}

export default function SubmissionNotifications({ kind, coordinatorId, section, onOpen, suppliedItems, onRefresh }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [seen, setSeen] = useState([]);
  const dialog = useRef(null);
  const storageKey = `pathway.received.${coordinatorId}.${section?.id}.${kind}`;
  const title = kind === 'placements' ? 'Placement review notifications' : kind === 'requirements' ? 'Requirement notifications' : 'Logbook notifications';
  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(storageKey) || '[]')); } catch (_) { setSeen([]); }
  }, [storageKey]);
  useEffect(() => {
    if (suppliedItems !== undefined) { setItems(suppliedItems); setError(''); setLoading(false); return; }
    setItems([]); setError(''); setLoading(Boolean(section?.id));
    if (!coordinatorId || !section?.id || section.coordinatorId !== coordinatorId) { setLoading(false); return; }
    let active = true;
    let children = [];
    const stop = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)), snapshot => {
      children.forEach(unsubscribe => unsubscribe()); children = [];
      const students = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      if (kind === 'requirements') { setItems(students.flatMap(receivedRequirements)); setLoading(false); return; }
      const received = new Map();
      setItems([]);
      if (!students.length) setLoading(false);
      children = students.map(student => onSnapshot(collection(db, 'users', student.id, 'logbook'), journals => {
        if (!active) return;
        received.set(student.id, journals.docs.filter(item => item.data().status !== 'draft').map(item => {
          const entry = item.data();
          return { id: `${student.id}/${item.id}/${submissionTime(entry.updatedAt || entry.createdAt)}`, student, title: `Week ${entry.weekNum || '—'} journal`, createdAt: entry.updatedAt || entry.createdAt };
        }));
        setItems([...received.values()].flat());
        setLoading(received.size < students.length);
      }, () => { if (active) { setError('Could not load submissions. Please refresh.'); setLoading(false); } }));
    }, () => { if (active) { setError('Could not load submissions. Please refresh.'); setLoading(false); } });
    return () => { active = false; stop(); children.forEach(unsubscribe => unsubscribe()); };
  }, [coordinatorId, section?.id, section?.coordinatorId, kind, refresh, suppliedItems]);
  useEffect(() => { if (open) dialog.current?.showModal?.(); else dialog.current?.close?.(); }, [open]);
  const unread = items.filter(item => !seen.includes(item.id)).length;
  const openItem = item => {
    const next = [...new Set([...seen, item.id])];
    setSeen(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) { /* Badge still updates in this session. */ }
    if (kind === 'placements') onOpen(item.student, item);
    else onOpen(item.student);
    setOpen(false);
  };
  return <div className="submission-notifications messages-workspace">
    <div className="messages-alert-toolbar"><button type="button" className="messages-alert-trigger" aria-label={title} title={title} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="bell" size={20} />{unread > 0 && <span className="submission-unread-dot" aria-label={`${unread} new submissions`} />}</button></div>
    <dialog ref={dialog} className="messages-alert-dialog" aria-label={title} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <header className="messages-alert-dialog-header"><div className="notification-hero"><span className="notification-hero-icon"><Icon name={kind === 'requirements' ? 'clipboard' : 'book'} size={24} /></span><div><h2>{title}</h2><p>{section?.name || 'Select a section'}</p></div></div><button type="button" className="messages-close" aria-label={`Close ${title.toLowerCase()}`} onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></header>
      <div className="messages-alert-dialog-body"><div className="messages-alert-summary"><strong>{unread} new submissions</strong><button type="button" className="messages-alert-refresh" aria-label="Refresh submissions" onClick={() => { if (onRefresh) onRefresh(); else setRefresh(value => value + 1); }} disabled={loading}><Icon name="refresh" size={18} /></button></div>
        <p role={error ? 'alert' : undefined}>{error || (loading ? 'Loading submissions…' : 'Received submissions, newest first. Select one to review.')}</p>
        <div className="notification-column-labels" aria-hidden="true"><span>Submission</span><span>From</span><span>Section</span><span>Time</span></div>
        <div className="messages-alert-actions notification-columns">{!error && [...items].sort((a, b) => submissionTime(b.createdAt) - submissionTime(a.createdAt)).map(item => <button type="button" key={item.id} onClick={() => openItem(item)}><span className="notification-message">{item.title}</span><span className="notification-from"><strong>{`${item.student.firstName || ''} ${item.student.lastName || ''}`.trim() || item.student.idNumber}</strong>{!seen.includes(item.id) && <i className="messages-alert-dot" aria-label="New submission" />}</span><span className="notification-section">{section?.name}</span><time className="notification-time">{new Date(submissionTime(item.createdAt)).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></button>)}</div>
        {!loading && !error && !items.length && <p>No received submissions in this section.</p>}
      </div>
    </dialog>
  </div>;
}
