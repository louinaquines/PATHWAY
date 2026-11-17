import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import Icon from './Icons';

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
  const [showAll, setShowAll] = useState(false);
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
  const shownWaiting = showAll ? waiting : waiting.slice(0, 6);
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
          {note && <p className="plo-note" role="status">{note} {/missing/.test(note) && <button type="button" className="rq-link" onClick={onOpenAssign}>Assign placement</button>}</p>}
          {shownWaiting.map(s => { const n = nameOf(s); const on = picked.includes(s.id);
            return <div key={s.id} className="plo-stu" data-on={on || undefined} onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={on} aria-label={`Pick ${n}`} onClick={e => e.stopPropagation()} onChange={() => toggle(s.id)} />
              <i className="plo-av">{initials(n)}</i>
              <span className="plo-body"><strong>{n}</strong><small>{s.idNumber || 'No ID'}{s.status ? ` · ${s.status.replace(/_/g, ' ')}` : ''}</small></span>
              <button type="button" className="rq-link" onClick={e => { e.stopPropagation(); setPicked([s.id]); document.querySelector('.plo-place select')?.focus(); }}>Choose company</button>
            </div>; })}
          {waiting.length > 6 && <button type="button" className="rq-link plo-more" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show ${waiting.length - 6} more students`}</button>}
        </div>}
      </section>
    </div>
    <aside className="plo-side">
      <h3>Companies and open slots</h3>
      <div className="plo-card plo-companies">
        {!companies.length && <p className="plo-empty">No active companies yet. Add them in Companies.</p>}
        {companies.map(c => { const cap = c.capacity; const used = Number(c.occupiedSlots || 0); const o = open(c);
          return <div key={c.id} className="plo-co">
            <div><strong>{c.name}</strong><em data-full={o === 0 || undefined}>{o == null ? 'No limit' : o === 0 ? 'Full' : `${o} open`}</em></div>
            {cap != null && cap > 0 && <span className="plo-slots" aria-hidden="true">{Array.from({ length: Math.min(cap, 12) }, (_, i) => <i key={i} data-on={i < used || undefined} />)}</span>}
            <small>{cap != null ? `${used} of ${cap} slots filled` : `${used} placed`}</small>
          </div>; })}
      </div>
      {total > 0 && <p className="plo-foot">{placed} of {total} students are placed.</p>}
    </aside>
  </div>;
}
