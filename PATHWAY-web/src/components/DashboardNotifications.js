// src/components/DashboardNotifications.js
// Bell on the coordinator dashboard. Groups same-type notifications, names the students,
// and every row opens the screen where the coordinator can act on it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import Icon from './Icons';
import './DashboardNotifications.css';

const when = value => {
  if (!value) return '';
  const d = new Date(value), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

// One category per notification: label for 1 / many, where it opens, and its priority.
export function categorize(item) {
  const text = `${item.type || ''} ${item.title || ''} ${item.message || ''}`.toLowerCase();
  if (item.type === 'workplace_support' || /workplace report/.test(text)) return { key: 'workplace', one: item.title || 'Workplace report', many: n => `${n} workplace reports`, tab: 'messages', urgent: true };
  if (/placement|company request|endorsement/.test(text)) return { key: 'placement', one: 'Placement request', many: n => `${n} placement requests`, tab: 'placements', view: 'requests' };
  if (/company_email|company email|email from/.test(text)) return { key: 'email', one: 'Company email', many: n => `${n} company emails`, tab: 'placements' };
  if (/logbook|journal/.test(text)) return { key: 'journal', one: 'Journal submitted', many: n => `${n} journals to read`, tab: 'logbook', view: 'journals' };
  if (/evaluation/.test(text)) return { key: 'evaluation', one: 'Evaluation submitted', many: n => `${n} evaluations submitted`, tab: 'evaluations' };
  if (/clearance/.test(text)) return { key: 'clearance', one: 'Clearance update', many: n => `${n} clearance updates`, tab: 'clearance' };
  if (/message/.test(text)) return { key: 'message', one: 'New message', many: n => `${n} new messages`, tab: 'messages' };
  if (/document|requirement|review|submitted|upload/.test(text)) return { key: 'document', one: 'Document to review', many: n => `${n} documents to review`, tab: 'requirements', view: 'requirements' };
  return { key: 'other:' + item.id, one: item.title || 'Update', many: () => item.title || 'Updates', tab: 'notifications' };
}

const names = (list, max = 3) => {
  const unique = [...new Set(list.filter(Boolean))];
  if (!unique.length) return '';
  return unique.length <= max ? unique.join(' · ') : `${unique.slice(0, max).join(' · ')} and ${unique.length - max} more`;
};

export function groupNotifications(items, nameOf) {
  const groups = new Map();
  for (const item of items) {
    const cat = categorize(item);
    const group = groups.get(cat.key) || { cat, items: [] };
    group.items.push(item); groups.set(cat.key, group);
  }
  return [...groups.values()].map(({ cat, items: list }) => {
    const latest = list.reduce((a, b) => (String(b.createdAt) > String(a.createdAt) ? b : a));
    const who = names(list.map(item => nameOf(item.studentId)));
    return { key: cat.key, cat, items: list, latest, unread: list.some(item => !item.read),
      title: list.length > 1 ? cat.many(list.length) : cat.one,
      detail: who || (list.length === 1 ? latest.message : '') };
  }).sort((a, b) => (Number(!!b.cat.urgent) - Number(!!a.cat.urgent)) || String(b.latest.createdAt).localeCompare(String(a.latest.createdAt)));
}

export default function DashboardNotifications({ section, students = [], onOpen }) {
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
      const first = await adminRequest(`/coordinator/inbox/activity?${params}`);
      let records = first.records || [];
      if (first.cursor) {
        params.set('cursor', first.cursor);
        const second = await adminRequest(`/coordinator/inbox/activity?${params}`).catch(() => ({ records: [] }));
        records = records.concat(second.records || []);
      }
      const counts = await adminRequest(`/coordinator/inbox/activity/counts?sectionId=${encodeURIComponent(section.id)}`).catch(() => ({ unread: records.filter(r => !r.read).length }));
      setItems(records); setUnread(counts.unread || 0); setState('ready');
    } catch { setState('error'); }
  }, [section?.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (event.key === 'Escape' || (event.type === 'mousedown' && !box.current?.contains(event.target))) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const byId = new Map(students.map(s => [s.id, [s.lastName, s.firstName].filter(Boolean).join(', ')]));
  const groups = groupNotifications(items, id => byId.get(id));
  const markRead = list => Promise.all(list.filter(item => !item.read).map(item =>
    adminRequest(`/coordinator/inbox/activity/${encodeURIComponent(item.id)}/read?sectionId=${encodeURIComponent(section.id)}`, { method: 'POST', body: '{}' }).catch(() => {})));
  const openGroup = async group => {
    setOpen(false);
    const ids = new Set(group.items.map(item => item.id));
    const newlyRead = group.items.filter(item => !item.read).length;
    setItems(list => list.map(item => ids.has(item.id) ? { ...item, read: true } : item));
    setUnread(n => Math.max(0, n - newlyRead));
    markRead(group.items);
    const studentId = group.items.length === 1 ? group.latest.studentId : undefined;
    onOpen(group.cat.tab, { view: group.cat.view, studentId });
  };
  const markAll = async () => {
    const pending = items.filter(item => !item.read);
    setItems(list => list.map(item => ({ ...item, read: true }))); setUnread(0);
    await markRead(pending); load();
  };
  return <div className="dnotif" ref={box}>
    <button type="button" className="dnotif-bell" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={() => { setOpen(v => !v); if (!open) load(); }}>
      <Icon name="bell" size={18} />{unread > 0 && <span className="dnotif-count">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <div className="dnotif-pop" role="dialog" aria-label="Notifications">
      <header><h3>Notifications</h3>{unread > 0 && <span>{unread} unread</span>}</header>
      <div className="dnotif-list">
        {state === 'loading' && !items.length && <p className="dnotif-empty">Loading…</p>}
        {state === 'error' && <p className="dnotif-empty">Could not load notifications.</p>}
        {state === 'ready' && !items.length && <p className="dnotif-empty">You’re all caught up.</p>}
        {groups.map(group => <button key={group.key} type="button" className="dnotif-row" data-unread={group.unread || undefined} data-urgent={group.cat.urgent || undefined} onClick={() => openGroup(group)}>
          <i className="dnotif-dot" aria-hidden="true" />
          <span className="dnotif-row-main"><strong>{group.title}</strong>{group.detail && <span>{group.detail}</span>}</span>
          <time>{when(group.latest.createdAt)}</time>
        </button>)}
      </div>
      {unread > 0 && <footer><button type="button" onClick={markAll}>Mark all as read</button></footer>}
    </div>}
  </div>;
}
