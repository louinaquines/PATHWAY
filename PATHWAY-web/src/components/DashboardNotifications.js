// src/components/DashboardNotifications.js
// Bell on the coordinator dashboard: unread count + the latest activity for this section.
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import Icon from './Icons';
import './DashboardNotifications.css';

const when = value => {
  if (!value) return '';
  const d = new Date(value), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

export default function DashboardNotifications({ section, onOpenAll, onOpenItem }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [state, setState] = useState('idle');
  const box = useRef(null);
  const load = useCallback(async () => {
    if (!section?.id) return;
    setState('loading');
    try {
      const params = new URLSearchParams({ sectionId: section.id, search: '', unread: '0' });
      const [page, counts] = await Promise.all([
        adminRequest(`/coordinator/inbox/activity?${params}`),
        adminRequest(`/coordinator/inbox/activity/counts?sectionId=${encodeURIComponent(section.id)}`).catch(() => ({ unread: 0 })),
      ]);
      setItems((page.records || []).slice(0, 6)); setUnread(counts.unread || 0); setState('ready');
    } catch { setState('error'); }
  }, [section?.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (event.key === 'Escape' || (event.type === 'mousedown' && !box.current?.contains(event.target))) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return <div className="dnotif" ref={box}>
    <button type="button" className="dnotif-bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={() => { setOpen(v => !v); if (!open) load(); }}>
      <Icon name="bell" size={18} />{unread > 0 && <span className="dnotif-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="dnotif-pop" role="dialog" aria-label="Notifications">
      <header><h3>Notifications</h3>{unread > 0 && <span>{unread} unread</span>}</header>
      <div className="dnotif-list">
        {state === 'loading' && !items.length && <p className="dnotif-empty">Loading…</p>}
        {state === 'error' && <p className="dnotif-empty">Could not load notifications.</p>}
        {state === 'ready' && !items.length && <p className="dnotif-empty">No notifications yet.</p>}
        {items.map(item => <button key={item.id} type="button" className="dnotif-row" data-unread={!item.read || undefined} data-report={item.type === 'workplace_support' || undefined}
          onClick={() => { setOpen(false); onOpenItem(item); }}>
          <span className="dnotif-row-main"><strong>{item.title}</strong><span>{item.message}</span></span>
          <time>{when(item.createdAt)}</time>
        </button>)}
      </div>
      <footer><button type="button" onClick={() => { setOpen(false); onOpenAll(); }}>View all notifications</button></footer>
    </div>}
  </div>;
}
