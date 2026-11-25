import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import personName from '../personName';
import { adminRequest } from '../adminApi';
import { showToast } from '../successFx';
import Icon from './Icons';
import Pager from './Pager';
import AlertDialog from './AlertDialog';
import { PortalEmpty } from './PortalStates';
import './AdminStudentsDirectory.css';

const PAGE = 10;
const isActive = c => c.role === 'coordinator' && c.accountApproved !== false;

export default function AdminCoordinatorsDirectory({ coordinators, sections, students, saving, onToggle, onCreate, onChanged }) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [params, setParams] = useSearchParams();
  const ownSections = c => sections.filter(s => s.coordinatorId === c.id);
  const studentCount = c => { const ids = new Set(ownSections(c).map(s => s.id)); return students.filter(s => ids.has(s.sectionId)).length; };
  const departments = [...new Set(coordinators.map(c => c.department).filter(Boolean))].sort();
  const orphan = sections.filter(s => !coordinators.some(c => c.id === s.coordinatorId && isActive(c))).length;
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => coordinators
    .filter(c => !department || c.department === department)
    .filter(c => status === 'all' || (status === 'active' ? isActive(c) : !isActive(c)))
    .filter(c => !term || [personName(c), c.email].some(v => String(v || '').toLowerCase().includes(term)))
    .sort((a, b) => {
      const v = x => sort.key === 'name' ? (personName(x) || '').toLowerCase() : sort.key === 'department' ? (x.department || '~')
        : sort.key === 'sections' ? ownSections(x).length : sort.key === 'students' ? studentCount(x) : (isActive(x) ? 0 : 1);
      const A = v(a), B = v(b); return (A < B ? -1 : A > B ? 1 : 0) * sort.dir;
    }), [coordinators, sections, students, department, status, term, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [department, status, term]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)), current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const open = coordinators.find(c => c.id === params.get('coordinator'));
  const head = (key, label) => <th aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
    <button type="button" onClick={() => setSort(p => ({ key, dir: p.key === key ? -p.dir : 1 }))}>{label}{sort.key === key && <Icon name="chevronDown" size={12} />}</button></th>;

  return <div className="asd">
    <dl className="asd-stats">
      {[['Coordinators', 'users', 'blue', coordinators.length], ['Active', 'check', 'green', coordinators.filter(isActive).length],
        ['Departments', 'building', 'indigo', departments.length], ['Sections without a coordinator', 'alert', orphan ? 'amber' : 'green', orphan]].map(([label, icon, tone, n]) =>
        <div key={label} className="asd-stat"><div><span className="asd-ico" data-tone={tone}><Icon name={icon} size={20} /></span><dt>{label}</dt><dd>{n}</dd></div></div>)}
    </dl>
    <section className="asd-card">
      <div className="asd-tools">
        <label className="asd-search"><Icon name="search" size={16} /><span className="sr-only">Search coordinators</span>
          <input type="search" value={search} placeholder="Search name or email" onChange={e => setSearch(e.target.value)} /></label>
        <label className="asd-select"><span className="sr-only">Filter by department</span>
          <select value={department} onChange={e => setDepartment(e.target.value)}><option value="">All departments</option>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
        <label className="asd-select"><span className="sr-only">Filter by account status</span>
          <select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <button type="button" className="asd-btn asd-primary" onClick={onCreate}><Icon name="plus" size={15} />Create coordinator</button>
      </div>
      {shown.length === 0 ? <PortalEmpty icon="users" compact title={term ? 'No matching coordinators' : 'No coordinators here'} description={term ? 'Try another name or email.' : 'Change the filters or create a coordinator.'} />
      : <div className="asd-table-wrap"><table className="asd-table">
        <thead><tr>{head('name', 'Coordinator')}{head('department', 'Department')}{head('sections', 'Sections')}{head('students', 'Students')}{head('status', 'Status')}<th><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{shown.map(c => { const own = ownSections(c); const name = personName(c) || 'Name unavailable';
          return <tr key={c.id} tabIndex={0} onClick={() => setParams({ coordinator: c.id })} onKeyDown={e => { if (e.key === 'Enter') setParams({ coordinator: c.id }); }}>
            <td><div className="asd-who"><span aria-hidden="true">{((c.firstName || '?')[0] + (c.lastName || '')[0]).toUpperCase()}</span><div><strong>{name}</strong><small>{c.email || '—'}</small></div></div></td>
            <td className="asd-dept">{c.department || '—'}</td>
            <td title={own.map(s => s.name).join(', ')}>{own.length}</td>
            <td>{studentCount(c)}</td>
            <td><span className="asd-status" data-on={isActive(c)}><i aria-hidden="true" />{isActive(c) ? 'Active' : 'Inactive'}</span></td>
            <td><button type="button" className="asd-more" aria-label={'Details for ' + name} onClick={e => { e.stopPropagation(); setParams({ coordinator: c.id }); }}>Open</button></td>
          </tr>; })}</tbody></table></div>}
      <div className="asd-foot"><span role="status">{rows.length ? `${(current - 1) * PAGE + 1}–${(current - 1) * PAGE + shown.length} of ${rows.length}` : '0 of 0'}</span>
        <Pager page={current} pages={pages} label="Coordinator pages" onGo={setPage} /></div>
    </section>
    {open && <CoordinatorDrawer coordinator={open} own={ownSections(open)} students={students} saving={saving}
      peers={coordinators.filter(c => c.id !== open.id && isActive(c) && c.department === open.department)}
      onClose={() => setParams({})} onToggle={() => setConfirm(open)} onChanged={onChanged} onDeleted={() => setParams({})} />}
    <AlertDialog open={Boolean(confirm)} title={confirm && isActive(confirm) ? 'Deactivate coordinator?' : 'Activate coordinator?'}
      description={confirm ? (isActive(confirm) ? 'Block sign-in for ' : 'Allow sign-in again for ') + (personName(confirm) || 'this coordinator') + '?' : ''}
      confirmLabel={confirm && isActive(confirm) ? 'Deactivate' : 'Activate'} busy={saving} onCancel={() => setConfirm(null)}
      onConfirm={async () => { await onToggle(confirm.id, isActive(confirm)); setConfirm(null); }} />
  </div>;
}

function CoordinatorDrawer({ coordinator: c, own, students, peers, saving, onClose, onToggle, onChanged, onDeleted }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState(null);
  useEffect(() => { const k = e => { if (e.key === 'Escape' && !ask) onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose, ask]);
  const count = s => students.filter(x => x.sectionId === s.id).length;
  const run = async (fn, done) => { setBusy(true); setError(''); try { await fn(); done?.(); await onChanged?.(); } catch (e) { setError(e.message || 'Something went wrong.'); } finally { setBusy(false); setAsk(null); } };
  const reassign = () => run(() => adminRequest(`/admin/coordinators/${encodeURIComponent(c.id)}/reassign-sections`, { method: 'POST', body: JSON.stringify({ targetCoordinatorId: target }) }),
    () => showToast('Sections moved', `${own.length} section(s) reassigned.`));
  const deleteSection = s => run(() => adminRequest(`/admin/sections/${encodeURIComponent(s.id)}`, { method: 'DELETE' }), () => showToast('Section deleted', s.name));
  const remove = () => run(() => adminRequest(`/admin/coordinators/${encodeURIComponent(c.id)}`, { method: 'DELETE' }), () => { showToast('Coordinator deleted', personName(c)); onDeleted(); });
  const active = c.role === 'coordinator' && c.accountApproved !== false;
  return <div className="asd-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !ask) onClose(); }}>
    <aside className="asd-drawer" role="dialog" aria-modal="true" aria-label={'Coordinator details for ' + (personName(c) || 'coordinator')}>
      <header><span className="asd-big" aria-hidden="true">{((c.firstName || '?')[0] + (c.lastName || '')[0]).toUpperCase()}</span>
        <div><h2>{personName(c) || 'Name unavailable'}</h2><p><span className="asd-status" data-on={active}><i aria-hidden="true" />{active ? 'Active' : 'Inactive'}</span></p></div>
        <button type="button" className="asd-x" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></header>
      <h3>Profile</h3>
      <dl className="asd-dl">
        <div><dt>Email</dt><dd>{c.email || '—'}</dd></div>
        <div><dt>Department</dt><dd>{c.department || '—'}</dd></div>
        <div><dt>Phone</dt><dd>{c.phone || '—'}</dd></div>
        <div><dt>Created</dt><dd>{c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</dd></div>
      </dl>
      <h3>Sections ({own.length})</h3>
      {own.length ? <ul className="asd-list">{own.map(s => <li key={s.id}><div><strong>{s.name}</strong><small>{[s.termName, count(s) + ' students'].filter(Boolean).join(' · ')}</small></div>
        {count(s) === 0 && <button type="button" className="asd-more asd-danger" disabled={busy} onClick={() => setAsk({ kind: 'section', section: s })}>Delete</button>}</li>)}</ul>
        : <p className="asd-note">No sections assigned.</p>}
      {own.length > 0 && <div className="asd-reassign">
        <label>Move all sections to<select value={target} onChange={e => setTarget(e.target.value)} disabled={busy}>
          <option value="">Choose a coordinator</option>{peers.map(p => <option key={p.id} value={p.id}>{personName(p)}</option>)}</select></label>
        <button type="button" className="asd-btn asd-primary" disabled={!target || busy} onClick={() => setAsk({ kind: 'reassign' })}>Move</button>
        {!peers.length && <small>No other active coordinator in {c.department || 'this department'}. Create one first.</small>}
      </div>}
      {error && <p role="alert" className="asd-err">{error}</p>}
      <footer className="asd-foot-actions">
        <button type="button" className="asd-btn" disabled={saving || busy || (active && own.length > 0)} title={active && own.length ? 'Move the sections first' : undefined} onClick={onToggle}>
          {active ? 'Deactivate' : 'Activate'}</button>
        <button type="button" className="asd-btn asd-danger" disabled={busy || own.length > 0} title={own.length ? 'Move the sections first' : undefined} onClick={() => setAsk({ kind: 'delete' })}>
          <Icon name="trash" size={15} />Delete coordinator</button>
      </footer>
    </aside>
    <AlertDialog open={Boolean(ask)} busy={busy}
      title={ask?.kind === 'reassign' ? 'Move sections?' : ask?.kind === 'section' ? 'Delete section?' : 'Delete coordinator?'}
      description={ask?.kind === 'reassign' ? `Move ${own.length} section(s) and their students to ${personName(peers.find(p => p.id === target)) || 'the selected coordinator'}?`
        : ask?.kind === 'section' ? `Delete the empty section ${ask.section.name}? This cannot be undone.`
        : `Delete sign-in access for ${personName(c)}? This cannot be undone. Their history stays.`}
      confirmLabel={ask?.kind === 'reassign' ? 'Move sections' : 'Delete'} onCancel={() => setAsk(null)}
      onConfirm={() => ask.kind === 'reassign' ? reassign() : ask.kind === 'section' ? deleteSection(ask.section) : remove()} />
  </div>;
}
