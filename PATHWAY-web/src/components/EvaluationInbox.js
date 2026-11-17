import { useEffect, useRef, useState } from 'react';
import Icon from './Icons';
import './EvaluationInbox.css';

const KEY = 'pathway.evalInbox.read';
const loadRead = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (_) { return new Set(); } };
const saveRead = set => { try { localStorage.setItem(KEY, JSON.stringify([...set].slice(-500))); } catch (_) { /* storage off */ } };
const initials = name => name.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
const DAY = 86400000;
const ago = (t, now) => {
  if (!t) return '';
  const diff = now - t;
  if (diff < 0) { const d = Math.ceil(-diff / DAY); return d <= 1 ? 'tomorrow' : `in ${d} days`; }
  const m = Math.floor(diff / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : `${d}d ago`;
};

/* items: [{ id, kind: 'answered'|'expiring'|'expired'|'none', name, text, time, student }] */
export default function EvaluationInbox({ items, onOpen }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [read, setRead] = useState(loadRead);
  const [showAll, setShowAll] = useState(false);
  const box = useRef(null);
  const now = Date.now();
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const unread = items.filter(i => !read.has(i.id));
  const mark = ids => { const next = new Set(read); ids.forEach(id => next.add(id)); setRead(next); saveRead(next); };
  const tabs = [['all', 'All'], ['answered', 'Answered'], ['expiring', 'Expiring'], ['none', 'Not asked']];
  const shown = items.filter(i => tab === 'all' || i.kind === tab || (tab === 'expiring' && i.kind === 'expired'))
    .sort((a, b) => (b.time || 0) - (a.time || 0));
  const list = showAll ? shown : shown.slice(0, 8);
  const group = i => { if (!i.time) return 'Needs action'; const d = now - i.time; return d < DAY && d > -DAY ? 'Today' : d < 7 * DAY ? 'Earlier this week' : 'Older'; };
  const groups = [];
  list.forEach(i => { const g = group(i); const last = groups[groups.length - 1]; if (last && last.name === g) last.items.push(i); else groups.push({ name: g, items: [i] }); });
  return <div className="evn" ref={box}>
    <button type="button" className="evn-bell" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="bell" size={18} />{unread.length > 0 && <span className="evn-badge">{unread.length > 99 ? '99+' : unread.length}</span>}
    </button>
    {open && <div className="evn-pop" role="dialog" aria-label="Notifications">
      <div className="evn-head"><strong>Notifications</strong>
        {unread.length > 0 && <button type="button" className="evn-link" onClick={() => mark(items.map(i => i.id))}>Mark all as read</button>}</div>
      <div className="evn-tabs" role="tablist">{tabs.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => { setTab(v); setShowAll(false); }}>{l}</button>)}</div>
      <div className="evn-list">
        {!list.length && <div className="evn-empty"><span><Icon name="bell" size={20} /></span><strong>You’re all caught up</strong><p>New answers and expiring links show up here.</p></div>}
        {groups.map(g => <section key={g.name}><h4>{g.name}</h4>
          {g.items.map(i => <button key={i.id} type="button" className="evn-item" data-unread={!read.has(i.id) || undefined} data-kind={i.kind}
            onClick={() => { mark([i.id]); setOpen(false); onOpen(i); }}>
            <span className="evn-av">{initials(i.name)}</span>
            <span className="evn-body"><span className="evn-text">{i.text}</span><small>{i.kind === 'expiring' ? `Expires ${ago(i.time, now)}` : ago(i.time, now) || 'Ask their supervisor'}</small></span>
            {!read.has(i.id) && <i className="evn-dot" aria-label="unread" />}
          </button>)}
        </section>)}
      </div>
      {shown.length > 8 && <div className="evn-foot"><button type="button" className="evn-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show less' : `Show all ${shown.length}`}</button></div>}
    </div>}
  </div>;
}
