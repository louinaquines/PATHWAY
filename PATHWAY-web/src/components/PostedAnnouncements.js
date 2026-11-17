import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import Icon from './Icons';
import Pager from './Pager';

const when = v => { if (!v) return ''; const d = new Date(v); const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }); };
const full = v => v ? new Date(v).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const initials = n => String(n || '?').split(/[ ,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const badge = name => String(name || '').replace(/^.*?-\s*/, '').slice(0, 3).toUpperCase() || 'SEC';

export default function PostedAnnouncements({ section, switcher, refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [seen, setSeen] = useState(null);
  const [reminding, setReminding] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!section?.id) { setRows([]); return undefined; }
    let live = true; setRows(null); setError('');
    adminRequest(`/coordinator/sections/${encodeURIComponent(section.id)}/announcements`)
      .then(d => { if (live) { setRows(d.announcements || []); setOpenId(id => id || d.announcements?.[0]?.id || null); } })
      .catch(e => { if (live) { setRows([]); setError(e.message || 'Could not load announcements.'); } });
    return () => { live = false; };
  }, [section?.id, refreshKey]);
  useEffect(() => {
    if (!openId) { setSeen(null); return undefined; }
    let live = true; setSeen(null); setNote('');
    adminRequest(`/coordinator/announcements/${encodeURIComponent(openId)}/seen`)
      .then(d => { if (live) setSeen(d); }).catch(() => { if (live) setSeen({ failed: true }); });
    return () => { live = false; };
  }, [openId]);
  const list = (rows || []).filter(r => `${r.title} ${r.message}`.toLowerCase().includes(q.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(list.length / 8)); const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * 8, cur * 8);
  const open = (rows || []).find(r => r.id === openId);
  const remind = async () => {
    if (!open || reminding) return; setReminding(true); setNote('');
    try { const r = await adminRequest(`/coordinator/announcements/${encodeURIComponent(open.id)}/remind`, { method: 'POST' }); setNote(`Reminder sent to ${r.reminded} student${r.reminded === 1 ? '' : 's'}.`); }
    catch (e) { setNote(e.message || 'Could not send reminders.'); } finally { setReminding(false); }
  };
  const total = seen?.total || open?.recipients || 0;
  return <div className="ann-card pa">
    <section className="pa-list">
      {switcher}
      <div className="pa-search coordinator-search"><Icon name="search" size={15} /><input type="search" aria-label="Find an announcement" placeholder="Find an announcement" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
      <div className="pa-rows">
        {rows === null ? <p className="pa-empty">Loading announcements…</p>
          : error ? <p className="pa-empty">{error}</p>
          : !list.length ? <p className="pa-empty">{q ? 'No matching announcements.' : 'No announcements yet. Use New announcement to post one.'}</p>
          : shown.map(r => <button type="button" key={r.id} className="pa-row" aria-pressed={r.id === openId} onClick={() => setOpenId(r.id)}>
            <span className="pa-badge">{badge(section?.name)}</span>
            <span className="pa-main"><span className="pa-top"><strong>{r.title}</strong><time>{when(r.createdAt)}</time></span>
              <small>{section?.name} · {r.recipients} student{r.recipients === 1 ? '' : 's'}</small></span>
          </button>)}
      </div>
      {pages > 1 && <div className="pa-foot"><span>{(cur - 1) * 8 + 1}–{Math.min(cur * 8, list.length)} of {list.length}</span><Pager page={cur} pages={pages} onGo={setPage} label="Announcements" /></div>}
    </section>
    <section className="pa-detail">
      {open ? <>
        <header className="pa-head"><h3>{open.title}</h3><p>To {section?.name} · posted {full(open.createdAt)}{open.emailed ? ' · also sent by email' : ''}</p></header>
        <div className="pa-body">
          <p className="pa-msg">{open.message}</p>
          <div className="pa-seen">
            {!seen ? <p className="pa-note">Checking who has seen it…</p> : seen.failed ? <p className="pa-note">Couldn’t load who has seen it.</p> : <>
              <div className="pa-seen-top"><span><Icon name="eye" size={15} /> Seen by {seen.seen} of {total}</span>
                {seen.unseen.length > 0 && <button type="button" className="rq-link" onClick={remind} disabled={reminding}>{reminding ? 'Sending…' : `Remind the ${seen.unseen.length} who haven’t seen it`}</button>}</div>
              <i className="pa-bar"><em style={{ width: `${total ? (seen.seen / total) * 100 : 0}%` }} /></i>
              {seen.unseen.length > 0 && <div className="pa-chips">{seen.unseen.slice(0, 30).map(s => <span key={s.id}><b>{initials(s.name)}</b>{s.name}</span>)}{seen.unseen.length > 30 && <span>+{seen.unseen.length - 30} more</span>}</div>}
              {note && <p className="pa-note" role="status">{note}</p>}
            </>}
          </div>
        </div>
      </> : <div className="ann-pick"><Icon name="megaphone" size={30} /><strong>Pick an announcement</strong><span>See its message and who has read it.</span></div>}
    </section>
  </div>;
}
