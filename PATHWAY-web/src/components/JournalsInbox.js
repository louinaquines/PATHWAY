import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import personName from '../personName';
import Icon from './Icons';
import { submissionTime } from './SubmissionNotifications';
import { adminRequest } from '../adminApi';
import './RequirementsInbox.css';

const DAY = 86400000;
const ago = ms => { const d = Date.now() - ms; if (d < 60000) return 'just now'; if (d < 3600000) return `${Math.floor(d / 60000)}m ago`; if (d < DAY) return `${Math.floor(d / 3600000)}h ago`; if (d < 7 * DAY) return `${Math.floor(d / DAY)}d ago`; return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); };
const bucket = ms => { const s = new Date(); s.setHours(0, 0, 0, 0); return ms >= s.getTime() ? 'Today' : ms >= s.getTime() - DAY ? 'Yesterday' : 'Earlier'; };
const dayLabel = entry => { if (entry.frequency === 'weekly' || !entry.periodStart) return entry.weekNum ? `Week ${entry.weekNum} journal` : 'Weekly journal'; const d = new Date(`${entry.periodStart}T00:00:00Z`); return Number.isNaN(d.getTime()) ? 'Journal' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };

/* Bell + dropdown listing journals waiting to be read, grouped by student.
   Badge uses counts the page already has; the list loads only when opened. */
export default function JournalsInbox({ section, coordinatorId, pendingCounts = {}, onOpen, onChanged }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState('');
  const root = useRef(null);
  const storageKey = `pathway.journalbell.${coordinatorId}.${section?.id}`;
  const [seen, setSeen] = useState({});
  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch (_) { setSeen({}); } }, [storageKey]);
  const waiting = Object.values(pendingCounts).reduce((sum, n) => sum + (n || 0), 0);
  const total = Object.entries(pendingCounts).reduce((sum, [id, n]) => sum + Math.max(0, (n || 0) - (seen[id] || 0)), 0);
  const markAllRead = () => { const next = { ...pendingCounts }; setSeen(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch (_) { /* this session only */ } };
  const countsKey = Object.entries(pendingCounts).filter(([, n]) => n > 0).map(([id, n]) => id + ':' + n).sort().join(',');

  useEffect(() => { setGroups(null); }, [section?.id, countsKey]);
  useEffect(() => {
    if (!open || groups || !section?.id) return undefined;
    let active = true; setError('');
    (async () => {
      try {
        const ids = Object.keys(pendingCounts).filter(id => pendingCounts[id] > 0);
        if (!ids.length) { if (active) setGroups([]); return; }
        const students = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)));
        const byId = Object.fromEntries(students.docs.map(item => [item.id, { ...item.data(), id: item.id }]));
        const result = [];
        for (let i = 0; i < ids.length && active; i += 5) {
          await Promise.all(ids.slice(i, i + 5).map(async id => {
            const snap = await getDocs(query(collection(db, 'users', id, 'logbook'), where('status', '==', 'pending')));
            const entries = snap.docs.map(item => ({ ...item.data(), id: item.id, time: submissionTime(item.data().submittedAt || item.data().updatedAt || item.data().createdAt) })).sort((a, b) => b.time - a.time);
            if (entries.length && byId[id]) result.push({ student: byId[id], entries, latest: entries[0].time });
          }));
        }
        if (active) setGroups(result.sort((a, b) => b.latest - a.latest));
      } catch (_) { if (active) setError('Could not load journals. Try again in a moment.'); }
    })();
    return () => { active = false; };
  }, [open, groups, section?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const esc = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const [confirmAll, setConfirmAll] = useState(false);
  const [progress, setProgress] = useState(null);
  const allEntries = (groups || []).flatMap(group => group.entries.map(entry => ({ studentId: group.student.id, entryId: entry.id })));
  const approveAll = async () => {
    const items = allEntries; let done = 0; let failed = 0;
    setProgress({ done, total: items.length });
    for (const item of items) {
      try {
        await adminRequest(`/coordinator/students/${encodeURIComponent(item.studentId)}/logbook/${encodeURIComponent(item.entryId)}/decision`, { method: 'POST', body: JSON.stringify({ status: 'approved' }) });
      } catch (_) { failed += 1; }
      done += 1; setProgress({ done, total: items.length });
    }
    setProgress(null); setConfirmAll(false); setGroups(null);
    if (failed) setError(`${failed} journal${failed === 1 ? '' : 's'} could not be approved. Try again.`);
    onChanged?.();
  };
  let lastBucket = '';
  return <div className="rqi" ref={root}>
    <button type="button" className="rqi-bell messages-alert-trigger" aria-haspopup="dialog" aria-expanded={open}
      aria-label={total ? `${total} journals to read` : 'Journals'} title={total ? `${total} journals to read` : 'Journals'} onClick={() => setOpen(v => !v)}>
      <Icon name="bell" size={19} />{total > 0 && <span className="rqi-badge" aria-hidden="true">{total > 99 ? '99+' : total}</span>}
    </button>
    {open && <div className="rqi-pop" role="dialog" aria-label="Journals to read">
      <header className="rqi-head">
        <div><strong>Journals to read</strong><span>{section?.name}{waiting ? ` · ${waiting} waiting` : ''}{total ? ` · ${total} new` : ''}</span></div>
        <span className="rqi-head-actions">
          {total > 0 && <button type="button" className="rqi-link" onClick={markAllRead}>Mark all as read</button>}
          {allEntries.length > 0 && !confirmAll && <button type="button" className="rqi-link" onClick={() => setConfirmAll(true)}>Approve all</button>}
          <button type="button" className="rqi-link rqi-quiet" onClick={() => setGroups(null)}>Refresh</button>
        </span>
      </header>
      {confirmAll && <div className="rqi-confirm" role="alertdialog" aria-label="Approve all journals">
        <p><strong>Approve {allEntries.length} journal{allEntries.length === 1 ? '' : 's'} from {groups.length} student{groups.length === 1 ? '' : 's'}?</strong>
          They will all be marked as read. You can’t undo this in one step.</p>
        {progress ? <div className="rqi-progress" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><i style={{ width: `${Math.round(100 * progress.done / progress.total)}%` }} /><span>Approving {progress.done} of {progress.total}…</span></div>
          : <div className="rqi-confirm-actions"><button type="button" className="rq-btn" onClick={() => setConfirmAll(false)}>Cancel</button><button type="button" className="rq-btn rq-primary" onClick={approveAll}>Approve all</button></div>}
      </div>}
      <div className="rqi-list">
        {error && <p className="rqi-empty">{error}</p>}
        {!error && !groups && <p className="rqi-empty">Loading…</p>}
        {!error && groups && !groups.length && <p className="rqi-empty">You’re all caught up.</p>}
        {groups?.map(group => {
          const b = bucket(group.latest); const label = b !== lastBucket ? b : ''; lastBucket = b;
          return <div key={group.student.id}>
            {label && <h4 className="rqi-bucket">{label}</h4>}
            <button type="button" className="rqi-item" onClick={() => { setOpen(false); onOpen?.(group.student); }}>
              <span className="rqi-avatar" aria-hidden="true">{((group.student.firstName || '?')[0] + (group.student.lastName || '')[0]).toUpperCase()}</span>
              <span className="rqi-body">
                <span className="rqi-top"><strong>{personName(group.student)}</strong><small>{ago(group.latest)}</small></span>
                <span className="rqi-docs">
                  {group.entries.slice(0, 3).map(entry => <span key={entry.id} className="rqi-doc"><i data-tone="amber" aria-hidden="true" /><span>{dayLabel(entry)}</span><em>{entry.hours ? `${entry.hours} hrs` : 'Waiting'}</em></span>)}
                  {group.entries.length > 3 && <span className="rqi-more">+{group.entries.length - 3} more</span>}
                </span>
              </span>
              <span className="rqi-count">{group.entries.length} to read</span>
            </button>
          </div>;
        })}
      </div>
    </div>}
  </div>;
}
