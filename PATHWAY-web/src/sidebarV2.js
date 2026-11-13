import { useEffect, useLayoutEffect, useState } from 'react';
import Icon from './components/Icons';

// Sidebar look preferences, saved per browser. "Classic" restores the previous sidebar.
const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value == null ? fallback : JSON.parse(value); } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

export function useSidebarPrefs(portal) {
  const [modern, setModern] = useState(() => read(`pathway.sidebar.${portal}.modern`, true));
  const [collapsed, setCollapsed] = useState(() => read(`pathway.sidebar.${portal}.collapsed`, false));
  const [folded, setFolded] = useState(() => read(`pathway.sidebar.${portal}.folded`, []));
  useEffect(() => write(`pathway.sidebar.${portal}.modern`, modern), [portal, modern]);
  useEffect(() => write(`pathway.sidebar.${portal}.collapsed`, collapsed), [portal, collapsed]);
  useEffect(() => write(`pathway.sidebar.${portal}.folded`, folded), [portal, folded]);
  return {
    modern, setModern, collapsed: modern && collapsed, setCollapsed,
    isFolded: title => modern && !collapsed && folded.includes(title),
    toggleFold: title => setFolded(list => list.includes(title) ? list.filter(item => item !== title) : [...list, title]),
    rootClass: modern ? ` sidebar-v2${collapsed ? ' sidebar-collapsed' : ''}` : '',
  };
}

// A highlight that slides to the active item.
export function SidebarIndicator({ navRef, activeKey, deps = [] }) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const update = () => {
      const active = nav?.querySelector('.sidebar-nav-btn-active');
      setBox(active ? { top: active.offsetTop, height: active.offsetHeight, left: active.offsetLeft, width: active.offsetWidth } : null);
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    if (nav && observer) observer.observe(nav);
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRef, activeKey, ...deps]);
  if (!box) return null;
  return <span className="sidebar-indicator" aria-hidden="true" style={{ transform: `translateY(${box.top}px)`, height: box.height, left: box.left, width: box.width }} />;
}

export function GroupTitle({ prefs, title }) {
  if (!title) return null;
  if (!prefs.modern) return <div className="sidebar-group-title">{title}</div>;
  const folded = prefs.isFolded(title);
  return <button type="button" className="sidebar-group-title sidebar-group-toggle" aria-expanded={!folded} onClick={() => prefs.toggleFold(title)}>
    <span>{title}</span><Icon name="chevronRight" size={12} className="sidebar-group-chevron" />
  </button>;
}

export function SidebarTools({ prefs }) {
  return <div className="sidebar-tools">
    {prefs.modern && <button type="button" className="sidebar-tool" onClick={() => prefs.setCollapsed(value => !value)}
      aria-label={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={prefs.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
      <Icon name={prefs.collapsed ? 'chevronRight' : 'chevronLeft'} size={15} /><span>Collapse</span></button>}
    <button type="button" className="sidebar-tool" onClick={() => prefs.setModern(value => !value)}
      title={prefs.modern ? 'Switch back to the classic sidebar' : 'Try the new sidebar'}>
      <Icon name="settings" size={14} /><span>{prefs.modern ? 'Classic look' : 'New look'}</span></button>
  </div>;
}
