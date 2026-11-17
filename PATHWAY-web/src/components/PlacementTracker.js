import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import { PortalFormDialog } from './PortalStates';
import CoordinatorSearch from './CoordinatorSearch';

const STEPS = [
  ['approved', 'Approved', false],
  ['final', 'Final check', true],
  ['draft', 'Letter draft', true],
  ['signed', 'Signed copy', true],
  ['emailed', 'Emailed', false],
];
const DAY = 86400000;
const initials = n => String(n || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const fmt = v => { const t = Date.parse(v); return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''; };

/* Where a student sits after their company is approved. Pending requests are handled above, so they are skipped. */
export function stepOf(row) {
  const ts = row.tasks || [];
  const open = ts.filter(t => t.needsAction);
  if (open.some(t => t.stage === 'placement' && t.record?.status === 'pending_review') && open.length === 1) return null;
  const v = ts.find(t => t.stage === 'verified');
  if (v && v.record?.deliveryStatus === 'sent' && !open.length) return { step: 'emailed', task: v, label: 'View', chip: `Sent ${fmt(v.record.deliverySentAt || v.record.updatedAt) || ''}`.trim() };
  if (open.some(t => t.stage === 'final')) return { step: 'final', task: open.find(t => t.stage === 'final'), label: 'Review' };
  const e = open.find(t => t.stage === 'endorsement');
  if (e) return e.record?.draftVersion > 0 ? { step: 'signed', task: e, label: 'View letter' } : { step: 'draft', task: e, label: 'Prepare draft' };
  if (open.some(t => t.stage === 'verified')) return { step: 'signed', task: open.find(t => t.stage === 'verified'), label: 'Email letter' };
  const p = open.find(t => t.stage === 'placement');
  if (p) return { step: 'approved', task: p, label: 'View', chip: p.record?.status === 'needs_revision' ? 'Changes requested' : '' };
  if (v) return { step: 'emailed', task: v, label: 'View', chip: 'Sent' };
  return { step: 'approved', task: ts[0], label: 'View' };
}

export default function PlacementTracker({ section, refreshKey, onOpen, bell }) {
  const [rows, setRows] = useState(null);
  const [step, setStep] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const base = '/coordinator/placement-workspace?sectionId=' + encodeURIComponent(section.id);
  const read = useCallback(async () => {
    const all = [];
    for (const queue of ['action', 'completed']) {
      let cursor = null;
      for (let i = 0; i < 6; i += 1) {
        const page = await adminRequest(base + '&view=students&queue=' + queue + '&stage=all' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')).catch(() => ({ students: [] }));
        (page.students || []).forEach(s => all.push({ ...s.queue, id: s.id, idNumber: s.idNumber, name: [s.firstName, s.lastName].filter(Boolean).join(' ') || s.queue?.name }));
        cursor = page.nextCursor; if (!cursor) break;
      }
    }
    setRows(all.map(r => ({ ...r, where: stepOf(r) })).filter(r => r.where));
  }, [base]);
  useEffect(() => { read(); }, [read, refreshKey]);

  const list = rows || [];
  const count = key => list.filter(r => r.where.step === key).length;
  const needsYou = STEPS.filter(([, , n]) => n).reduce((a, [k]) => a + count(k), 0);
  const active = step || (STEPS.find(([k, , n]) => n && count(k)) || STEPS.find(([k]) => count(k)) || STEPS[0])[0];
  const shown = list.filter(r => r.where.step === active).sort((a, b) => (Date.parse(a.where.task?.record?.updatedAt || a.where.task?.record?.createdAt) || 0) - (Date.parse(b.where.task?.record?.updatedAt || b.where.task?.record?.createdAt) || 0));
  const max = Math.max(1, ...STEPS.map(([k]) => count(k)));

  return <section className="plt">
    <div className="plt-head">
      <h3>After placement</h3>
      <span className="plt-grow" />
      <button type="button" className="plt-histbtn" onClick={() => setHistoryOpen(true)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>History</button>
      {bell}
    </div>
    {rows && needsYou === 0 && <p className="plt-clear">✓ Nothing waiting on you. {count('emailed')} student{count('emailed') === 1 ? ' is' : 's are'} fully placed.</p>}
    <div className="plt-steps" role="tablist" aria-label="Placement steps">
      {STEPS.map(([key, label, needs], i) => { const n = count(key);
        return <button key={key} type="button" role="tab" className="plt-step" aria-selected={active === key} data-zero={!n || undefined} data-needs={(needs && n > 0) || undefined} onClick={() => setStep(key)}>
          <span className="plt-num">{rows ? n : '–'}</span>
          <span className="plt-label">{label}</span>
          <span className="plt-sub">{needs && n > 0 ? 'needs you' : i === STEPS.length - 1 ? 'done' : ' '}</span>
          <i className="plt-bar"><b style={{ width: `${(n / max) * 100}%` }} /></i>
        </button>; })}
    </div>
    <div className="plt-list">
      {!rows && <p className="plt-empty">Loading…</p>}
      {rows && !shown.length && <p className="plt-empty">No students at this step.</p>}
      {shown.map(r => { const rec = r.where.task?.record || {}; const since = Date.parse(rec.updatedAt || rec.createdAt); const days = since ? Math.floor((Date.now() - since) / DAY) : null; const stuck = STEPS.find(([k]) => k === active)[2] && days > 5;
        return <div key={r.id} className="plt-row">
          <i className="plo-av">{initials(r.name)}</i>
          <span className="plo-body"><strong>{r.name}</strong><small>{[r.company && r.company !== '—' ? r.company : rec.companyName, r.idNumber].filter(Boolean).join(' · ')}</small></span>
          {r.where.chip ? <b className="lb-chip" data-tone={active === 'emailed' ? 'green' : 'amber'}>{r.where.chip}</b>
            : days != null && active !== 'emailed' && <span className="plt-wait" data-stuck={stuck || undefined}>{days <= 0 ? 'today' : `waiting ${days} day${days === 1 ? '' : 's'}`}</span>}
          <button type="button" className={STEPS.find(([k]) => k === active)[2] ? 'rq-btn' : 'plt-link'} onClick={() => onOpen(r)}>{r.where.label}<span className="sr-only"> for {r.name}</span></button>
        </div>; })}
    </div>
    {historyOpen && <HistoryPanel section={section} onClose={() => setHistoryOpen(false)} />}
  </section>;
}

function HistoryPanel({ section, onClose }) {
  const [term, setTerm] = useState('');
  const [items, setItems] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const fetchPage = useCallback(async (after, search) => {
    setBusy(true);
    try {
      const d = await adminRequest('/coordinator/placement-history?sectionId=' + encodeURIComponent(section.id) + '&page=true' + (after ? '&cursor=' + encodeURIComponent(after) : '') + (search ? '&search=' + encodeURIComponent(search) : ''));
      setItems(prev => after ? [...(prev || []), ...(d.history || [])] : (d.history || [])); setCursor(d.nextCursor || null);
    } catch (e) { setItems(prev => prev || []); } finally { setBusy(false); }
  }, [section.id]);
  useEffect(() => { const t = setTimeout(() => fetchPage(null, term.trim()), 300); return () => clearTimeout(t); }, [term, fetchPage]);
  return <PortalFormDialog className="plt-history" label="Placement history" closeOnBackdrop onCancel={onClose}>
    <header className="plt-h-head"><h2>Placement history</h2><button type="button" className="plt-x" aria-label="Close history" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
    <div className="plt-h-search"><CoordinatorSearch value={term} onChange={setTerm} label="Search placement history" placeholder="Find a student or company" /></div>
    <ol className="plt-timeline">
      {items === null && <li className="plt-empty">Loading…</li>}
      {items && !items.length && <li className="plt-empty">No decisions yet.</li>}
      {(items || []).map(it => <li key={it.id}>
        <span className="plt-date">{fmt(it.createdAt) || '—'}</span>
        <span className="plt-dot" aria-hidden="true" />
        <span className="plt-what"><strong>{it.studentName || it.studentId}</strong>
          <small>{it.before?.companyName ? <>{it.before.companyName} → </> : 'Approved at '}<b>{it.after?.companyName || 'company not recorded'}</b></small>
          {(it.after?.internshipRole || it.after?.supervisorName) && <small>{[it.after.internshipRole, it.after.supervisorName && `Supervisor: ${it.after.supervisorName}`].filter(Boolean).join(' · ')}</small>}</span>
      </li>)}
    </ol>
    {cursor && <button type="button" className="plt-link plt-more" disabled={busy} onClick={() => fetchPage(cursor, term.trim())}>{busy ? 'Loading…' : 'Show older'}</button>}
  </PortalFormDialog>;
}
