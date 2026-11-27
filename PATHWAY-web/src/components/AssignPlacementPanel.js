import { useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../adminApi';
import CoordinatorSearch from './CoordinatorSearch';

const nameOf = s => [s.lastName, s.firstName].filter(Boolean).join(', ') || s.queue?.name || 'Student';
const initials = n => String(n || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const fmt = v => { const t = Date.parse(v); return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; };

export default function AssignPlacementPanel({ section, initialIds = [], onClose, onDone, onEditCompanies, onAddCompany }) {
  const [companies, setCompanies] = useState(null);
  const [students, setStudents] = useState(null);
  const [companyId, setCompanyId] = useState('');
  const [picked, setPicked] = useState(initialIds);
  const [term, setTerm] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState([]);
  const base = '/coordinator/placement-workspace?sectionId=' + encodeURIComponent(section.id);
  useEffect(() => {
    let on = true;
    Promise.all([adminRequest(base + '&view=companies&availability=active').catch(() => ({ companies: [] })), adminRequest(base + '&view=students&queue=waiting').catch(() => ({ students: [] }))])
      .then(([c, s]) => { if (!on) return; setCompanies(c.companies || []); setStudents(s.students || []); });
    return () => { on = false; };
  }, [base]);
  const open = c => c.availableSlots == null ? null : c.availableSlots;
  const sorted = useMemo(() => [...(companies || [])].sort((a, b) => (open(b) ?? 1e6) - (open(a) ?? 1e6) || String(a.name).localeCompare(String(b.name))), [companies]);
  const company = sorted.find(c => c.id === companyId);
  const d = company?.placementDefaults || {};
  useEffect(() => { setStart(d.startDate || ''); setEnd(d.endDate || ''); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = company ? [['supervisorName', 'supervisor'], ['supervisorEmail', 'supervisor email'], ['internshipRole', 'role'], ['workArrangement', 'work arrangement']].filter(([k]) => !d[k]).map(([, l]) => l) : [];
  const list = (students || []).filter(s => !term || [nameOf(s), s.idNumber].some(v => String(v || '').toLowerCase().includes(term.toLowerCase())));
  const slots = company ? open(company) : null;
  const over = slots != null && picked.length > slots;
  const weeks = start && end && Date.parse(end) > Date.parse(start) ? Math.round((Date.parse(end) - Date.parse(start)) / (7 * 86400000)) : null;
  const ready = company && !missing.length && picked.length > 0 && !over && start && end && Date.parse(end) > Date.parse(start);
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const done = [!!company && !missing.length, picked.length > 0 && !over, !!(start && end && weeks != null)];

  const submit = async () => {
    if (!ready) return;
    const fields = { companyId: company.id, supervisorName: d.supervisorName, supervisorEmail: d.supervisorEmail, internshipRole: d.internshipRole, workArrangement: d.workArrangement, startDate: start, endDate: end };
    const failed = [];
    for (let i = 0; i < picked.length; i += 1) {
      setBusy(`Placing ${i + 1} of ${picked.length}…`);
      try { await adminRequest('/coordinator/sections/' + encodeURIComponent(section.id) + '/placements/' + encodeURIComponent(picked[i]) + '/assign', { method: 'POST', body: JSON.stringify(fields) }); }
      catch (e) { const s = (students || []).find(x => x.id === picked[i]); failed.push(`${s ? nameOf(s) : picked[i]}: ${e.message || 'could not place'}`); }
    }
    setBusy('');
    onDone?.();
    if (failed.length) { setErrors(failed); setPicked(p => p.filter(id => failed.some(f => f.startsWith(nameOf((students || []).find(x => x.id === id) || {}))))); return; }
    onClose();
  };

  return <div className="apl">
    <header className="apl-head">
      <div className="apl-title"><div><h2>Assign placement</h2><p>{section.name}</p></div>
        <button type="button" className="plt-x" aria-label="Close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
      <ol className="apl-steps">{['Company', 'Students', 'Dates'].map((l, i) => <li key={l} data-done={done[i] || undefined}><i>{done[i] ? '✓' : i + 1}</i>{l}</li>)}</ol>
    </header>
    <div className="apl-body">
      <section className="apl-card">
        <div className="apl-row"><h3>Company</h3>{onAddCompany && <button type="button" className="rq-btn apl-add-company" onClick={onAddCompany}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add company</button>}</div>
        <select aria-label="Company" value={companyId} onChange={e => setCompanyId(e.target.value)} disabled={!companies}>
          <option value="">{companies ? 'Choose a company' : 'Loading companies…'}</option>
          {sorted.map(c => <option key={c.id} value={c.id} disabled={open(c) === 0}>{c.name}{open(c) == null ? '' : open(c) === 0 ? ' · Full' : ` · ${open(c)} open`}</option>)}
        </select>
        {company && <dl className="pld-facts">
          <div><dt>Supervisor</dt><dd>{d.supervisorName || '—'}</dd></div>
          <div><dt>Email</dt><dd>{d.supervisorEmail || '—'}</dd></div>
          <div><dt>Role</dt><dd>{d.internshipRole || '—'}</dd></div>
          <div><dt>Arrangement</dt><dd>{d.workArrangement || '—'}</dd></div>
        </dl>}
        {missing.length > 0 && <p className="apl-warn">No {missing.join(', ')} yet. {onEditCompanies && <button type="button" className="plt-link" onClick={onEditCompanies}>Edit in Companies</button>}</p>}
      </section>
      <section className="apl-card">
        <h3>Students</h3>
        <div className="apl-search-row">
          {(students?.length || 0) > 6 && <CoordinatorSearch value={term} onChange={setTerm} label="Find a student" placeholder="Find a student" />}
          <span className="apl-count"><b>{picked.length} picked</b>{slots != null ? ` · ${slots} slot${slots === 1 ? '' : 's'} open` : ''}</span>
        </div>
        {over && <p className="apl-warn">Only {slots} slot{slots === 1 ? '' : 's'} open at {company.name}.</p>}
        <div className="apl-list">
          {!students && <p className="apl-empty">Loading students…</p>}
          {students && !students.length && <p className="apl-empty">Every student already has a company.</p>}
          {list.map(s => { const n = nameOf(s); const on = picked.includes(s.id);
            return <div key={s.id} className="plo-stu" data-on={on || undefined} onClick={() => toggle(s.id)}>
              <input type="checkbox" checked={on} aria-label={`Pick ${n}`} onClick={e => e.stopPropagation()} onChange={() => toggle(s.id)} />
              <i className="plo-av">{initials(n)}</i>
              <span className="plo-body"><strong>{n}</strong><small>{s.idNumber || 'No ID'}</small></span>
            </div>; })}
        </div>
      </section>
      <section className="apl-card">
        <h3>Dates</h3>
        <div className="apl-dates">
          <label>Start date<input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label>End date<input type="date" value={end} min={start || undefined} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        {weeks != null ? <p className="apl-note"><b>{weeks} week{weeks === 1 ? '' : 's'}</b> · {fmt(start)} – {fmt(end)}</p> : start && end ? <p className="apl-warn">The end date must be after the start date.</p> : null}
      </section>
      {errors.length > 0 && <div className="apl-errors" role="alert"><strong>Some students weren’t placed</strong><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
    </div>
    <footer className="apl-foot">
      <span>{company && picked.length ? <>Place <b>{picked.length} student{picked.length === 1 ? '' : 's'}</b> at <b>{company.name}</b></> : 'Pick a company and students'}</span>
      <button type="button" className="edd-btn" disabled={!!busy} onClick={onClose}>Cancel</button>
      <button type="button" className="edd-btn edd-primary" disabled={!ready || !!busy} onClick={submit}>{busy || `Place ${picked.length || ''} student${picked.length === 1 ? '' : 's'}`.replace('  ', ' ')}</button>
    </footer>
  </div>;
}
