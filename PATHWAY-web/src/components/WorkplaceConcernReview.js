import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import '../pages/NotificationsTab.css';
const root = '/coordinator/workplace-concerns';
const newIdentity = () => globalThis.crypto.randomUUID ? globalThis.crypto.randomUUID() : Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).join('-');
export default function WorkplaceConcernReview({ access, request = adminRequest }) {
  const [records,setRecords] = useState([]), [notices,setNotices] = useState([]), [selected,setSelected] = useState(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [note,setNote] = useState('');
  const [priority,setPriority] = useState('normal'), [cursor,setCursor] = useState(null), [hasMore,setHasMore] = useState(false);
  const [noticeCursor,setNoticeCursor] = useState(null), [moreNotices,setMoreNotices] = useState(false);
  const alive = useRef(false), pending = useRef(false), generation = useRef(0), identity = useRef(null);
  const current = () => alive.current && access?.isCurrent();
  const accepted = run => current() && generation.current === run;
  const post = (path,body = {}) => request(`${root}${path}`,{ method: 'POST', body: JSON.stringify(body), deadlineMs: 15000 });
  function failure(err,run) {
    if (!accepted(run)) return;
    if ([401,403].includes(err.status)) { setSelected(null); setRecords([]); setNotices([]); setNote(''); access.onDenied(); }
    setError(err.message || 'Concern unavailable.');
  }
  async function load(token = null) {
    if (pending.current || !current()) return;
    const run = ++generation.current; pending.current = true; setBusy(true); setError('');
    if (!token) { setRecords([]); setNotices([]); setSelected(null); }
    try {
      const page = await post('/list',token ? { cursor: token } : {});
      const alerts = await post('/notices/list');
      if (!accepted(run)) return;
      setRecords(old => [...(token ? old : []),...page.records]); setCursor(page.cursor); setHasMore(page.hasMore);
      setNotices(alerts.records);
      setNoticeCursor(alerts.cursor); setMoreNotices(alerts.hasMore);
    } catch (err) { failure(err,run); }
    finally { if (accepted(run)) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true; pending.current = false; load();
    return () => { alive.current = false; generation.current++; pending.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function open(id,preserveDraft = false) {
    if (pending.current || !current()) return;
    const run = ++generation.current; pending.current = true; setBusy(true); setError('');
    if (!preserveDraft) { setSelected(null); setNote(''); }
    identity.current = null;
    try { const value = await post(`/${encodeURIComponent(id)}/detail`); if (accepted(run)) { setSelected(value); setPriority(value.priority); } }
    catch (err) { failure(err,run); }
    finally { if (accepted(run)) { pending.current = false; setBusy(false); } }
  }
  async function read(id) {
    if (pending.current || !current()) return;
    const run = ++generation.current; pending.current = true; setBusy(true); setError('');
    try { await post(`/notices/${encodeURIComponent(id)}/read`); if (accepted(run)) setNotices(items => items.map(n => n.id === id ? { ...n, read: true } : n)); }
    catch (err) { failure(err,run); }
    finally { if (accepted(run)) { pending.current = false; setBusy(false); } }
  }
  async function loadNotices() {
    if (pending.current || !current() || !moreNotices) return;
    const run = ++generation.current; pending.current = true; setBusy(true); setError('');
    try {
      const page = await post('/notices/list',{ cursor: noticeCursor });
      if (accepted(run)) { setNotices(items => [...new Map([...items,...page.records].map(item => [item.id,item])).values()]); setNoticeCursor(page.cursor); setMoreNotices(page.hasMore); }
    } catch (err) { failure(err,run); }
    finally { if (accepted(run)) { pending.current = false; setBusy(false); } }
  }
  async function action(type,outcome) {
    if (pending.current || !current() || !selected) return;
    const body = { action: type, expectedVersion: selected.version, ...(type !== 'review' ? { note } : {}),
      ...(outcome ? { outcome } : {}), ...(type === 'change_priority' ? { priority } : {}) };
    const key = JSON.stringify([selected.id,body]);
    if (identity.current?.key !== key) identity.current = { key, requestId: newIdentity() };
    const run = ++generation.current; pending.current = true; setBusy(true); setError('');
    try {
      await post(`/${encodeURIComponent(selected.id)}/action`,{ ...body,requestId: identity.current.requestId });
      const value = await post(`/${encodeURIComponent(selected.id)}/detail`);
      if (accepted(run)) { setSelected(value); setRecords(items => items.map(item => item.id === value.id ? { ...item,state: value.state,priority: value.priority,version: value.version } : item)); setNote(''); identity.current = null; }
    } catch (err) { failure(err,run); }
    finally { if (accepted(run)) { pending.current = false; setBusy(false); } }
  }
  const openCase = selected?.state === 'open' && !selected.evidenceExpired, hasNote = !!note.trim() && note.length <= 1000;
  if (!access?.isCurrent()) return <p role="alert">Coordinator access needs verification.</p>;
  return <section className="attendance-risk-panel" aria-label="Workplace concern review">
    <h3>Private workplace concerns</h3>
    <p>Potential concerns need human review, not automatic sanctions. PATHWAY is not continuously monitored and is not an emergency service.</p>
    <p>Local preview only. No automatic analysis or live delivery is enabled by this component. Empty results do not mean a safe workplace.</p>
    <button type="button" disabled={busy} onClick={() => load()}>Refresh concerns</button>
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Loading concerns…</p>}
    <section aria-label="Private concern notifications"><h4>Notifications</h4>
      {notices.map(item => <article key={item.id}><p>{item.title} · {item.priority}</p><span>{item.read ? 'Read' : 'Unread'}</span>
        {!item.read && <button type="button" disabled={busy} onClick={() => read(item.id)}>Mark concern notice read</button>}</article>)}
      {moreNotices && <button type="button" disabled={busy} onClick={loadNotices}>Load more concern notices</button>}
      <p>Reading a notice does not resolve or dismiss the case. Notices are paged in document-ID order, not chronological order.</p>
    </section>
    <section aria-label="Concern cases"><h4>Cases</h4>
      {records.map(item => <article key={item.id}><h4>{item.title}</h4><p>Student reference: {item.studentId} · Priority: {item.priority} · Status: {item.state}</p>
        {item.deliveryState === 'awaiting_assignment' && <p>Awaiting coordinator delivery.</p>}
        <button type="button" disabled={busy} onClick={() => open(item.id)}>Open concern details</button></article>)}
      {!records.length && !busy && <p>No concern cases loaded. Analysis may be disabled, delayed or unavailable.</p>}
      {hasMore && <button type="button" disabled={busy} onClick={() => load(cursor)}>Load more concern cases</button>}
    </section>
    {selected && <section aria-label="Concern details"><h4>Potential workplace concern—needs review</h4><p>{selected.state}</p>
      <button type="button" disabled={busy} onClick={() => open(selected.id,true)}>Refresh selected case</button>
      {selected.evidenceExpired ? <p>The evidence retention period has ended. Sensitive details are no longer available.</p> : <>
        {(selected.findings || []).map((f,i) => <article key={i}><p>{f.category}</p><blockquote>{f.quote}</blockquote><p>{f.reason}</p></article>)}
        <ol>{(selected.history || []).map((h,i) => <li key={i}>{h.action} · {h.at}{h.note && <p>{h.note}</p>}</li>)}</ol>
      </>}
      {openCase && <>
        <label htmlFor="concern-review-note">Review note or reason</label>
        <textarea id="concern-review-note" value={note} disabled={busy} maxLength={1000} onChange={e => setNote(e.target.value)} rows={4} />
        <button type="button" disabled={busy || selected.reviewed} onClick={() => action('review')}>Record review</button>
        <button type="button" disabled={busy || !selected.reviewed || !hasNote} onClick={() => action('contact','success')}>Record successful contact</button>
        <button type="button" disabled={busy || !selected.reviewed || !hasNote} onClick={() => action('contact','failed')}>Record failed contact—keep open</button>
        <button type="button" disabled={busy || !selected.contacted || !hasNote} onClick={() => action('act')}>Record action taken</button>
        <button type="button" disabled={busy || !selected.reviewed || !selected.contacted || !selected.acted || !hasNote} onClick={() => action('resolve')}>Resolve genuine concern</button>
        <button type="button" disabled={busy || !hasNote} onClick={() => action('dismiss_false_positive')}>Dismiss AI false positive</button>
        <p>False-positive dismissal needs a reason but does not require student contact.</p>
        <label htmlFor="concern-priority">Coordinator priority</label>
        <select id="concern-priority" value={priority} onChange={e => setPriority(e.target.value)}><option value="normal">Normal</option><option value="high">High</option></select>
        <button type="button" disabled={busy || !hasNote || priority === selected.priority} onClick={() => action('change_priority')}>Change priority with reason</button>
      </>}
      <button type="button" disabled={busy} onClick={() => { setSelected(null); setNote(''); }}>Close concern details</button>
    </section>}
  </section>;
}
