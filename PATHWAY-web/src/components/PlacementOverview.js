import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import Icon from './Icons';
import Pager from './Pager';

const nameOf = s => [s.lastName, s.firstName].filter(Boolean).join(', ') || s.queue?.name || 'Student';
const initials = n => String(n || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const ago = value => { const t = Date.parse(value); if (!t) return ''; const d = Math.floor((Date.now() - t) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

/* Top of the Placements screen: requests, unplaced students (bulk place) and company slots. */
export default function PlacementOverview({ section, summary, refreshKey, onApprove, onOpenStudent, onAssigned, onOpenAssign }) {
  const [requests, setRequests] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [picked, setPicked] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [wPage, setWPage] = useState(1);
  const [cPage, setCPage] = useState(1);
  const [hideFull, setHideFull] = useState(null);
  const base = '/coordinator/placement-workspace?sectionId=' + encodeURIComponent(section.id);
  const read = useCallback(async () => {
    const [r, w, c] = await Promise.all([
      adminRequest(base + '&view=students&queue=action&stage=placement').catch(() => ({ students: [] })),
      adminRequest(base + '&view=students&queue=waiting').catch(() => ({ students: [] })),
      adminRequest(base + '&view=companies&availability=active').catch(() => ({ companies: [] })),
    ]);
    setRequests((r.students || []).map(s => ({ student: s, task: (s.queue?.tasks || []).find(t => t.stage === 'placement' && t.record?.status === 'pending_review') })).filter(x => x.task));
    setWaiting(w.students || []);
    setCompanies(c.companies || []);
  }, [base]);
  useEffect(() => { read(); }, [read, refreshKey]);
  useEffect(() => { setPicked([]); setNote(''); }, [section.id]);

  const company = companies.find(c => c.id === companyId);
  const open = c => c.availableSlots == null ? null : c.availableSlots;
  const placeable = companies.filter(c => open(c) !== 0);
  const place = async () => {
    if (!company || !picked.length) return;
    const d = company.placementDefaults || {};
    if (!d.supervisorName || !d.supervisorEmail || !d.internshipRole || !d.workArrangement || !d.startDate || !d.endDate) {
      setNote(`${company.name} is missing its supervisor, role or dates. Add them in Companies, or use Assign placement.`); return;
    }
    if (open(company) != null && picked.length > open(company)) { setNote(`${company.name} only has ${open(company)} open slot${open(company) === 1 ? '' : 's'}.`); return; }
    setBusy(true); setNote('');
    const fields = { companyId: company.id, supervisorName: d.supervisorName, supervisorEmail: d.supervisorEmail, internshipRole: d.internshipRole, workArrangement: d.workArrangement, startDate: d.startDate, endDate: d.endDate };
    const failed = [];
    for (const id of picked) {
      try { await adminRequest('/coordinator/sections/' + encodeURIComponent(section.id) + '/placements/' + encodeURIComponent(id) + '/assign', { method: 'POST', body: JSON.stringify(fields) }); }
      catch (e) { failed.push(e.message || 'Could not place'); }
    }
    setBusy(false);
    setNote(failed.length ? `${picked.length - failed.length} placed, ${failed.length} failed: ${failed[0]}` : `${picked.length} student${picked.length === 1 ? '' : 's'} placed at ${company.name}.`);
    setPicked([]); await read(); onAssigned?.();
  };
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const wPages = Math.max(1, Math.ceil(waiting.length / 5)); const wCur = Math.min(wPage, wPages);
  const shownWaiting = waiting.slice((wCur - 1) * 5, wCur * 5);
  const placed = Number(summary?.assigned || 0); const total = placed + Number(summary?.waiting || 0) + Number(summary?.needsReview || 0);

  return <div className="plo">
    <div className="plo-main">
      {requests.length > 0 && <section>
        <h3>{requests.length} student{requests.length === 1 ? '' : 's'} asked for a company</h3>
        <div className="plo-card">
          {requests.map(({ student, task }) => { const n = nameOf(student); const rec = task.record;
            return <div key={student.id} className="plo-req">
              <i className="plo-av">{initials(n)}</i>
              <span className="plo-body"><strong>{n} wants to train at {rec.companyName || 'a company'}</strong>
                <small>{rec.companyId ? (() => { const c = companies.find(x => x.id === rec.companyId); return c && open(c) != null ? `The company has ${open(c)} open slot${open(c) === 1 ? '' : 's'} · ` : ''; })() : 'Not in your company list yet · '}asked {ago(rec.submittedAt || rec.createdAt) || 'recently'}</small></span>
              <button type="button" className="rq-btn" onClick={() => onOpenStudent(student.id)}>Say no</button>
              <button type="button" className="rq-btn rq-primary" onClick={() => onApprove(rec, student.id)}><Icon name="check" size={14} /> Approve</button>
            </div>; })}
        </div>
      </section>}
      <section>
        <h3>{waiting.length ? `${waiting.length}${waiting.length >= 25 ? '+' : ''} student${waiting.length === 1 ? '' : 's'} have no company yet` : 'Every student has a company'}</h3>
        {waiting.length > 0 && <div className="plo-card">
          <div className="plo-bulk" data-on={picked.length > 0 || undefined}>
            <span>{picked.length ? `${picked.length} student${picked.length === 1 ? '' : 's'} picked` : 'Pick students to place them together'}</span>
            <span className="plo-grow" />
            <label className="plo-place">Place them at
              <select value={companyId} onChange={e => { setCompanyId(e.target.value); setNote(''); }} aria-label="Company to place students at">
                <option value="">Choose a company</option>
                {placeable.map(c => <option key={c.id} value={c.id}>{c.name}{open(c) != null ? ` · ${open(c)} open` : ''}</option>)}
              </select></label>
            <button type="button" className="rq-btn rq-primary" disabled={busy || !picked.length || !company} onClick={place}>{busy ? 'Placing…' : `Place ${picked.length || ''} student${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')}</button>
          </div>
          {note && <p className="plo-note" role="status">{note} {/missing/.test(note) && <button type="button" className="rq-link" onClick={() => onOpenAssign(picked)}>Assign placement</button>}</p>}
          {shownWaiting.map(s => { const n = nameOf(s); const on = picked.includes(s.id);
            return <div key={s.id} className="plo-stu" data-on={on || undefined} onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={on} aria-label={`Pick ${n}`} onClick={e => e.stopPropagation()} onChange={() => toggle(s.id)} />
              <i className="plo-av">{initials(n)}</i>
              <span className="plo-body"><strong>{n}</strong><small>{s.idNumber || 'No ID'}{s.status ? ` · ${s.status.replace(/_/g, ' ')}` : ''}</small></span>
              <button type="button" className="rq-link" onClick={e => { e.stopPropagation(); setPicked([s.id]); document.querySelector('.plo-place select')?.focus(); }}>Choose company</button>
            </div>; })}
          {waiting.length > 5 && <div className="plo-pager"><span>{(wCur - 1) * 5 + 1}–{Math.min(wCur * 5, waiting.length)} of {waiting.length}</span><Pager page={wCur} pages={wPages} onGo={setWPage} label="Students without a company" /></div>}
        </div>}
      </section>
    </div>
    <aside className="plo-side">
      {(() => {
        const hf = hideFull ?? companies.length > 5;
        const sorted = [...companies].sort((x, y) => { const ox = open(x) == null ? 1e6 : open(x); const oy = open(y) == null ? 1e6 : open(y); return oy - ox || String(x.name).localeCompare(String(y.name)); });
        const list = hf ? sorted.filter(c => open(c) !== 0) : sorted;
        const pages = Math.max(1, Math.ceil(list.length / 5)); const cur = Math.min(cPage, pages);
        const rows = list.slice((cur - 1) * 5, cur * 5);
        const totalOpen = companies.reduce((a, c) => a + (open(c) || 0), 0);
        const fullCount = companies.filter(c => open(c) === 0).length;
        return <>
          <div className="plo-side-head"><h3>Companies and open slots</h3>
            {fullCount > 0 && <label className="plo-toggle"><input type="checkbox" checked={hf} onChange={e => { setHideFull(e.target.checked); setCPage(1); }} /><i aria-hidden="true" />Hide full</label>}</div>
          <div className="plo-card plo-companies">
            {!companies.length && <p className="plo-empty">No active companies yet. Add them in Companies.</p>}
            {companies.length > 0 && !list.length && <p className="plo-empty">Every company is full.</p>}
            {rows.map(c => { const cap = c.capacity; const used = Number(c.occupiedSlots || 0); const o = open(c);
              return <div key={c.id} className="plo-co" data-full={o === 0 || undefined}>
                <div><strong title={c.name}>{c.name}</strong><em data-full={o === 0 || undefined}>{o == null ? 'No limit' : o === 0 ? 'Full' : `${o} open`}</em></div>
                {cap != null && cap > 0 && (cap <= 12
                  ? <span className="plo-slots" aria-hidden="true">{Array.from({ length: cap }, (_, i) => <i key={i} data-on={i < used || undefined} />)}</span>
                  : <span className="plo-bar" aria-hidden="true"><b style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} /></span>)}
                <small>{cap != null ? `${used} of ${cap} slots filled` : `${used} placed`}</small>
              </div>; })}
            {list.length > 5 && <div className="plo-pager plo-cpager"><Pager page={cur} pages={pages} onGo={setCPage} label="Companies" /></div>}
          </div>
          <p className="plo-foot">{companies.length} compan{companies.length === 1 ? 'y' : 'ies'} · {totalOpen} open slot{totalOpen === 1 ? '' : 's'}{total > 0 ? ` · ${placed} of ${total} students placed` : ''}</p>
        </>;
      })()}
    </aside>
  </div>;
}
