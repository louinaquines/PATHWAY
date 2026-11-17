import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { adminRequest, adminDocumentBlob } from '../adminApi';
import CoordinatorSearch, { matchesCoordinatorSearch } from './CoordinatorSearch';
import AlertDialog from './AlertDialog';
import { COLORS, THEME } from '../theme';

const root = '/coordinator/workplace-support';
const noticesRoot = '/coordinator/workplace-support-notices';
const page = { records: [], hasMore: false, cursor: null };
const initial = () => ({ reports: page, notices: page, detail: null, history: page, loading: false, pending: false, error: '', draft: null, retry: null });
const morePath = (path, cursor) => cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path;
const append = (previous, next) => ({ ...next, records: [...previous.records, ...(next.records || [])] });
const labels = { acknowledge: 'Review', contact: 'Contact', record_action: 'Act', resolve: 'Resolve' };

export default function WorkplaceSupportPanel({ userId }) {
  // A keyed child also removes private content synchronously on account changes.
  return <SupportWorkspace key={userId} userId={userId} />;
}

function SupportWorkspace({ userId }) {
  const [state, setState] = useState(initial);
  const [search, setSearch] = useState('');
  const generation = useRef(0);
  const busy = useRef(false);
  const account = useRef(auth.currentUser);
  const patch = values => setState(previous => ({ ...previous, ...values }));
  const current = token => generation.current === token && auth.currentUser === account.current;
  const clear = message => {
    generation.current += 1; busy.current = false;
    setState({ ...initial(), error: message }); setSearch('');
  };
  async function request(path, options, token) {
    try {
      const result = await adminRequest(path, { ...options, timeoutMs: 30000 });
      if (!current(token)) throw Object.assign(Error('Session changed.'), { obsolete: true });
      return result;
    } catch (error) {
      if (current(token) && ([401, 403, 404].includes(error.status) || auth.currentUser !== account.current || /sign in|session/i.test(error.message))) {
        clear('Support access is unavailable. Sign in or refresh your assignment.');
        throw Object.assign(Error('Access unavailable.'), { obsolete: true });
      }
      throw error;
    }
  }
  async function run(work) {
    if (busy.current || !userId) return;
    if (auth.currentUser !== account.current || account.current?.uid !== userId) {
      clear('Your account changed. Reopen workplace support.'); return;
    }
    busy.current = true;
    const token = generation.current;
    patch({ pending: true, error: '' });
    try { await work(token); }
    catch (error) { if (current(token) && !error.obsolete) patch({ error: 'Could not load workplace support. Please try again.' }); }
    finally { if (current(token)) { busy.current = false; patch({ pending: false, loading: false }); } }
  }
  const refresh = () => run(async token => {
    patch({ ...initial(), loading: true, pending: true });
    const reports = await request(root, undefined, token);
    const notices = await request(noticesRoot, undefined, token);
    patch({ reports, notices });
  });
  useEffect(() => {
    refresh();
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user !== account.current || (user && user.uid !== userId)) clear('Your account changed. Reopen workplace support.');
    });
    return () => { generation.current += 1; busy.current = false; unsubscribe(); };
    // This workspace is remounted for each userId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = id => run(async token => {
    patch({ detail: null, history: page, draft: null, retry: null, loading: true });
    const detail = await request(`${root}/${encodeURIComponent(id)}`, undefined, token);
    const history = await request(`${root}/${encodeURIComponent(id)}/events`, undefined, token);
    patch({ detail, history });
  });
  const loadMore = (kind, path) => run(async token => {
    const next = await request(morePath(path, state[kind].cursor), undefined, token);
    patch({ [kind]: append(state[kind], next) });
  });
  async function save() {
    if (busy.current) return;
    const payload = state.retry || {
      requestId: crypto.randomUUID(), expectedVersion: state.detail.version, action: state.draft.action,
      ...(state.draft.note.trim() ? { note: state.draft.note.trim() } : {}),
      ...(state.draft.action === 'contact' ? { contactOutcome: state.draft.contactOutcome } : {}),
      ...(state.draft.action === 'resolve' ? { reason: state.draft.reason.trim() } : {}),
    };
    await run(async token => {
      try {
        const result = await request(`${root}/${encodeURIComponent(state.detail.id)}/events`, { method: 'POST', body: JSON.stringify(payload) }, token);
        patch({ draft: null, retry: null, detail: null, history: page,
          reports: { ...state.reports, records: state.reports.records.map(r => r.id === result.id ? { ...r, ...result } : r) } });
      } catch (error) {
        if (!current(token) || error.obsolete) return;
        if (error.status === 409) patch({ detail: null, history: page, draft: null, retry: null, error: 'Report changed. Open the report again before taking action.' });
        else if (error.status && error.status < 500) patch({ retry: null, error: 'Event rejected. Check the fields and refresh the report.' });
        else patch({ retry: payload, error: 'Response unavailable. Retry the same event to confirm its outcome.' });
      }
    });
  }
  const markRead = notice => run(async token => {
    await request(`${noticesRoot}/${encodeURIComponent(notice.id)}/read`, { method: 'POST', body: '{}' }, token);
    patch({ notices: { ...state.notices, records: state.notices.records.map(n => n.id === notice.id ? { ...n, read: true } : n) } });
  });
  const download = () => run(async token => {
    // Reauthorize before reading protected bytes; never use an attachment provider URL.
    await request(`${root}/${encodeURIComponent(state.detail.id)}`, undefined, token);
    try {
      const blob = await adminDocumentBlob(`${root}/${encodeURIComponent(state.detail.id)}/attachment`, { timeoutMs: 30000 });
      if (!current(token)) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'workplace-support-attachment';
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch {
      if (current(token)) clear('Attachment unavailable. Reopen the report to check access.');
    }
  });
  const events = state.history.records;
  const contacts = events.filter(e => e.action === 'contact');
  const complete = !state.history.hasMore && !state.pending;
  const allowed = action => {
    if (!state.detail || !complete || state.retry || state.detail.status === 'Resolved') return false;
    if (action === 'acknowledge') return state.detail.status === 'Submitted';
    if (state.detail.status === 'Submitted') return false;
    if (action === 'record_action') return contacts.length > 0;
    if (action === 'resolve') return contacts.at(-1)?.contactOutcome === 'successful' && events.some(e => e.action === 'record_action');
    return true;
  };
  const sorted = [...state.reports.records].sort((a, b) => Number(b.priority === 'high') - Number(a.priority === 'high') || String(b.createdAt).localeCompare(String(a.createdAt)));
  const visible = sorted.filter(r => matchesCoordinatorSearch(search, r.studentName, r.companyName, r.idNumber));
  return <section className="workplace-support" style={{ background: COLORS.white, border: `1px solid ${COLORS.slate300}`, borderRadius: THEME.radius.lg, padding: 24 }} aria-label="Workplace Support" aria-busy={state.pending}>
    <header><h2>Workplace Support</h2><p>Review reports and unresolved follow-ups. Company contact must be made manually.</p>
      <CoordinatorSearch value={search} onChange={setSearch} label="Search loaded reports by student or company" placeholder="Search loaded reports…" />
      {state.reports.hasMore && <p>Search covers loaded reports only. Load more reports to include additional records.</p>}
      <button type="button" disabled={state.pending || !!state.retry} onClick={refresh}>Refresh support</button>
    </header>
    {state.error && <p role="alert">{state.error}</p>}
    {state.loading && <p role="status">Loading workplace support…</p>}
    <div className="support-notices" aria-label="Support notices">
      {state.notices.records.map(n => <article key={n.id}><p>Workplace support update · {n.read ? 'Read' : 'Unread'}</p>
        <button type="button" disabled={state.pending || !!state.retry} onClick={() => open(n.reportId)}>Open support report</button>
        {!n.read && <button type="button" disabled={state.pending} onClick={() => markRead(n)}>Mark support notice read</button>}
      </article>)}
      {state.notices.hasMore && <button type="button" disabled={state.pending} onClick={() => loadMore('notices', noticesRoot)}>Load more support notices</button>}
    </div>
    {!state.loading && !visible.length && <p>{search ? (state.reports.hasMore ? 'No loaded reports match your search. Load more reports to continue searching.' : 'No reports match your search.') : 'No workplace support reports on this page.'}</p>}
    <div className="support-report-list">{visible.map(r => <article key={r.id}>
      <h3>{r.studentName || 'Student'} · {r.companyName || 'Company unavailable'}</h3><p>{r.idNumber} · {r.priority === 'high' ? 'High priority' : 'Normal priority'} · {r.status}</p>
      {r.status !== 'Resolved' && <p>Follow-up outstanding</p>}
      <button type="button" disabled={state.pending || !!state.retry} onClick={() => open(r.id)} aria-label={`Open report for ${r.studentName || 'student'} at ${r.companyName || 'company'}`}>Open report</button>
    </article>)}</div>
    {state.reports.hasMore && <button type="button" disabled={state.pending} onClick={() => loadMore('reports', root)}>Load more reports</button>}
    {state.detail && <section className="support-detail" aria-label="Report details"><h3>{state.detail.studentName} · {state.detail.status}</h3>
      <p>{state.detail.description}</p><p>Incident date: {state.detail.incidentDate || 'Not supplied'}</p>
      {state.detail.immediateSafety && <p>Immediate safety concern · High priority</p>}
      {state.detail.attachment && <button type="button" disabled={state.pending} onClick={download}>Download protected attachment</button>}
      <button type="button" disabled={state.pending || !!state.retry} onClick={() => open(state.detail.id)}>Refresh report</button>
      <button type="button" disabled={state.pending || !!state.retry} onClick={() => patch({ detail: null, history: page, draft: null })}>Close report</button>
      <h4>Private coordinator history</h4>
      {events.map(e => <article key={e.version}><p>{labels[e.action]} · {e.createdAt} · {e.contactOutcome}</p>{e.note && <p>{e.note}</p>}{e.reason && <p>{e.reason}</p>}</article>)}
      {!events.length && <p>No private events recorded.</p>}
      {state.history.hasMore && <button type="button" disabled={state.pending} onClick={() => loadMore('history', `${root}/${encodeURIComponent(state.detail.id)}/events`)}>Load more private history</button>}
      <div className="support-actions">{Object.entries(labels).map(([action, label]) => <button type="button" key={action} disabled={!allowed(action)} onClick={() => patch({ draft: { action, note: '', reason: '', contactOutcome: 'unreachable' } })}>{label}</button>)}</div>
      {state.history.hasMore && <p>Load the complete history before taking action.</p>}
    </section>}
    <AlertDialog open={!!state.draft} title={labels[state.draft?.action] || 'Support event'} description="Notes and resolution reasons are private to authorized coordinators. Contact is recorded manually." tone="warning"
      busy={state.pending} confirmLabel={state.retry ? 'Retry same event' : 'Save event'}
      confirmDisabled={!state.retry && state.draft?.action === 'resolve' && !state.draft.reason.trim()}
      onCancel={() => { if (!state.retry) patch({ draft: null }); }} onConfirm={save}>
      {state.draft && <fieldset disabled={state.pending || !!state.retry}><label>Private note<textarea maxLength={8000} value={state.draft.note} onChange={e => patch({ draft: { ...state.draft, note: e.target.value } })} /></label>
        {state.draft.action === 'contact' && <label>Contact outcome<select value={state.draft.contactOutcome} onChange={e => patch({ draft: { ...state.draft, contactOutcome: e.target.value } })}><option value="unreachable">Unreachable</option><option value="successful">Successful</option></select></label>}
        {state.draft.action === 'resolve' && <label>Resolution reason<textarea required maxLength={8000} value={state.draft.reason} onChange={e => patch({ draft: { ...state.draft, reason: e.target.value } })} /></label>}
      </fieldset>}
      {state.error && <p role="status">{state.error}</p>}
    </AlertDialog>
  </section>;
}
