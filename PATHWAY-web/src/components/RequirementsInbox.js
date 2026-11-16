import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import personName from '../personName';
import Icon from './Icons';
import { submissionTime } from './SubmissionNotifications';
import './RequirementsInbox.css';

const DAY = 86400000;
function ago(ms) {
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
function bucket(ms) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (ms >= start.getTime()) return 'Today';
  if (ms >= start.getTime() - DAY) return 'Yesterday';
  return 'Earlier';
}
const TONE_TEXT = { green: 'Looks good', yellow: 'Check closely', red: 'Looks wrong' };

/* Bell + dropdown: who sent requirement documents, grouped by student, newest first.
   Reports the ids of students with unseen uploads so the list can filter by "New". */
export default function RequirementsInbox({ coordinatorId, section, requirements, toneFor, stageFor, onOpen, onNewChange }) {
  const [students, setStudents] = useState([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('new');
  const [seen, setSeen] = useState({});
  const root = useRef(null);
  const storageKey = `pathway.reqinbox.${coordinatorId}.${section?.id}`;

  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch (_) { setSeen({}); } }, [storageKey]);
  useEffect(() => {
    setStudents([]); setError('');
    if (!coordinatorId || !section?.id || section.coordinatorId !== coordinatorId) return undefined;
    return onSnapshot(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)),
      snapshot => setStudents(snapshot.docs.map(item => ({ ...item.data(), id: item.id }))),
      () => setError('Could not load uploads. Try again in a moment.'));
  }, [coordinatorId, section?.id, section?.coordinatorId]);

  const labels = useMemo(() => Object.fromEntries((requirements || []).map(r => [r.id, r.label])), [requirements]);
  const groups = useMemo(() => students.map(student => {
    const docs = Object.entries(student.requirements || {})
      .filter(([id, item]) => labels[id] && item?.submittedAt && item.status && item.status !== 'not_submitted')
      .map(([id, item]) => {
        const time = submissionTime(item.submittedAt);
        return { id, key: `${student.id}/${id}`, label: labels[id], time, status: item.status, tone: toneFor?.(student.id, id, item), isNew: (seen[`${student.id}/${id}`] || 0) < time };
      })
      .sort((a, b) => b.time - a.time);
    return { student, docs, latest: docs[0]?.time || 0, fresh: docs.filter(d => d.isNew) };
  }).filter(group => group.docs.length).sort((a, b) => b.latest - a.latest), [students, labels, seen, toneFor]);

  const newGroups = groups.filter(g => g.fresh.length);
  const newCount = newGroups.reduce((sum, g) => sum + g.fresh.length, 0);
  const newIdsKey = newGroups.map(g => g.student.id).join(',');
  useEffect(() => { onNewChange?.(new Set(newIdsKey ? newIdsKey.split(',') : [])); }, [newIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const esc = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const save = next => { setSeen(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) { /* stays for this session */ } };
  const markSeen = docs => { const next = { ...seen }; docs.forEach(d => { next[d.key] = d.time; }); save(next); };
  const openGroup = group => {
    const first = group.fresh[0] || group.docs[0];
    markSeen(group.docs);
    setOpen(false);
    onOpen?.(group.student, first ? stageFor?.(first.id) : undefined);
  };

  const shown = view === 'new' ? newGroups : groups;
  let lastBucket = '';
  return <div className="rqi" ref={root}>
    <button type="button" className="rqi-bell messages-alert-trigger" aria-haspopup="dialog" aria-expanded={open}
      aria-label={newCount ? `${newCount} new uploads` : 'Uploads'} title={newCount ? `${newCount} new uploads` : 'Uploads'} onClick={() => setOpen(v => !v)}>
      <Icon name="bell" size={19} />{newCount > 0 && <span className="rqi-badge" aria-hidden="true">{newCount > 99 ? '99+' : newCount}</span>}
    </button>
    {open && <div className="rqi-pop" role="dialog" aria-label="New uploads">
      <header className="rqi-head">
        <div><strong>Uploads</strong><span>{section?.name}{newCount ? ` · ${newCount} new` : ''}</span></div>
        {newCount > 0 && <button type="button" className="rqi-link" onClick={() => markSeen(groups.flatMap(g => g.docs))}>Mark all seen</button>}
      </header>
      <div className="rqi-tabs" role="tablist">
        {[['new', 'New'], ['all', 'All']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}>{label}</button>)}
      </div>
      <div className="rqi-list">
        {error && <p className="rqi-empty">{error}</p>}
        {!error && !shown.length && <p className="rqi-empty">{view === 'new' ? 'You’re all caught up.' : 'No uploads yet.'}</p>}
        {shown.map(group => {
          const b = bucket(group.latest); const label = b !== lastBucket ? b : ''; lastBucket = b;
          const docs = view === 'new' ? group.fresh : group.docs;
          return <div key={group.student.id}>
            {label && <h4 className="rqi-bucket">{label}</h4>}
            <button type="button" className="rqi-item" onClick={() => openGroup(group)}>
              <span className="rqi-avatar" aria-hidden="true">{((group.student.firstName || '?')[0] + (group.student.lastName || '')[0]).toUpperCase()}</span>
              <span className="rqi-body">
                <span className="rqi-top"><strong>{personName(group.student)}</strong><small>{ago(group.latest)}</small></span>
                <span className="rqi-docs">
                  {docs.slice(0, 3).map(doc => <span key={doc.id} className="rqi-doc">
                    <i data-tone={doc.status === 'approved' ? 'green' : doc.status === 'rejected' ? 'red' : doc.tone === 'yellow' ? 'amber' : doc.tone || 'blue'} aria-hidden="true" />
                    <span>{doc.label}</span>
                    <em>{doc.status === 'approved' ? 'Approved' : doc.status === 'rejected' ? 'Sent back' : TONE_TEXT[doc.tone] || 'To check'}</em>
                  </span>)}
                  {docs.length > 3 && <span className="rqi-more">+{docs.length - 3} more</span>}
                </span>
              </span>
              {group.fresh.length > 0 && <span className="rqi-count">{group.fresh.length} new</span>}
            </button>
          </div>;
        })}
      </div>
    </div>}
  </div>;
}
