import { useState } from 'react';
import { createPortal } from 'react-dom';
import { adminRequest } from '../adminApi';
import AlertDialog from './AlertDialog';

const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const blank = { name: '', startDate: '', endDate: '', isCurrent: false };

/** Dropdown to filter sections by term + a dialog to add/edit/delete terms. */
export function TermPicker({ terms, value, onChange, onManage }) {
  const [open, setOpen] = useState(false);
  const label = value === 'all' ? 'All terms' : value === 'none' ? 'No term' : (terms.find(t => t.id === value)?.name || 'All terms');
  return <div className="rq-section-pick tm-pick" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button type="button" className="rq-section-face" aria-haspopup="listbox" aria-expanded={open} aria-label="Term" onClick={() => setOpen(o => !o)}>
      {label}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
    {open && <ul className="rq-section-menu tm-menu" role="listbox" aria-label="Terms" onMouseDown={e => e.preventDefault()}>
      {[{ id: 'all', name: 'All terms' }, ...terms, { id: 'none', name: 'No term' }].map(t => <li key={t.id}><button type="button" role="option" aria-selected={t.id === value} onClick={() => { setOpen(false); onChange(t.id); }}>{t.name}{t.isCurrent ? ' · Current' : ''}</button></li>)}
      <li className="tm-manage"><button type="button" onClick={() => { setOpen(false); onManage(); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>Manage terms</button></li>
    </ul>}
  </div>;
}

export function TermDialog({ terms, onClose, onChanged }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [delTerm, setDelTerm] = useState(null);
  const [error, setError] = useState('');
  const run = async (fn) => { setBusy(true); setError(''); try { await fn(); await onChanged(); setDraft(null); } catch (e) { setError(e.message || 'Something went wrong.'); } finally { setBusy(false); } };
  const save = () => run(() => draft.id
    ? adminRequest(`/coordinator/terms/${encodeURIComponent(draft.id)}`, { method: 'PATCH', body: JSON.stringify({ name: draft.name, startDate: draft.startDate, endDate: draft.endDate, isCurrent: draft.isCurrent }) })
    : adminRequest('/coordinator/terms', { method: 'POST', body: JSON.stringify(draft) }));
  return createPortal(<div className="sx-overlay tm-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div className="tm" role="dialog" aria-modal="true" aria-label="Manage terms">
      <header className="tm-head"><div><h2>Academic terms</h2><p>Shared with coordinators in your department. New sections use the current term.</p></div>
        <button type="button" className="plt-x" aria-label="Close" disabled={busy} onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></header>
      <div className="tm-body">
        {draft ? <div className="tm-form">
          <label><span>Term name</span><input autoFocus maxLength={80} placeholder="e.g. 1st Semester A.Y. 2026–2027" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <div className="tm-dates">
            <label><span>Start date</span><input type="date" value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} /></label>
            <label><span>End date</span><input type="date" value={draft.endDate} onChange={e => setDraft({ ...draft, endDate: e.target.value })} /></label>
          </div>
          <label className="tm-check"><input type="checkbox" checked={draft.isCurrent} onChange={e => setDraft({ ...draft, isCurrent: e.target.checked })} /> Current term (used for new sections)</label>
        </div> : terms.length ? <ul className="tm-list">{terms.map(t => <li key={t.id}>
            <div><strong>{t.name}{t.isCurrent && <b className="lb-chip" data-tone="green">Current</b>}</strong><small>{[fmt(t.startDate), fmt(t.endDate)].filter(Boolean).join(' – ') || 'No dates'}</small></div>
            <div className="tm-acts">
              {!t.isCurrent && <button type="button" className="rq-link" disabled={busy} onClick={() => run(() => adminRequest(`/coordinator/terms/${encodeURIComponent(t.id)}`, { method: 'PATCH', body: JSON.stringify({ isCurrent: true }) }))}>Make current</button>}
              <button type="button" className="rq-link" disabled={busy} onClick={() => setDraft({ ...t })}>Edit</button>
              <button type="button" className="rq-link tm-del" disabled={busy} onClick={() => setDelTerm(t)}>Delete</button>
            </div></li>)}</ul>
          : <p className="tm-empty">No terms yet. Add your first one, like “1st Semester A.Y. 2026–2027”.</p>}
        {error && <p role="alert" className="tm-err">{error}</p>}
        <AlertDialog open={Boolean(delTerm)} title="Delete this term?" description={delTerm ? `“${delTerm.name}” will be deleted. Sections that use it will show no term. This can’t be undone.` : ''}
          confirmLabel="Delete term" busy={busy} onCancel={() => setDelTerm(null)}
          onConfirm={() => { const t = delTerm; setDelTerm(null); run(() => adminRequest(`/coordinator/terms/${encodeURIComponent(t.id)}`, { method: 'DELETE' })); }} />
      </div>
      <footer className="tm-foot">
        {draft ? <><button type="button" className="rq-btn" disabled={busy} onClick={() => setDraft(null)}>Back</button>
          <button type="button" className="rq-btn rq-primary" disabled={busy || !draft.name.trim()} onClick={save}>{busy ? 'Saving…' : draft.id ? 'Save term' : 'Add term'}</button></>
          : <><button type="button" className="rq-btn" onClick={onClose}>Done</button><button type="button" className="rq-btn rq-primary" onClick={() => setDraft({ ...blank, isCurrent: !terms.length })}>+ Add term</button></>}
      </footer>
    </div>
  </div>, document.body);
}
