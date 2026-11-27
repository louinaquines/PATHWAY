import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import personName from '../personName';
import { adminRequest } from '../adminApi';
import { showToast } from '../successFx';
import { PageSkeleton } from './LoadingSkeleton';
import { PortalEmpty, PortalError } from './PortalStates';
import Icon from './Icons';
import Pager from './Pager';
import './AdminStudentsDirectory.css';

const PAGE = 10;
const slotsOf = c => { const cap = Number.isSafeInteger(c.capacity) && c.capacity > 0 ? c.capacity : 0; const used = c.occupiedSlots || 0; return { cap, used, open: cap ? (c.availableSlots ?? Math.max(0, cap - used)) : 0 }; };
const city = address => String(address || '').split(',').map(x => x.trim()).filter(Boolean).slice(-2).join(', ');

export default function AdminCompanyDirectory({ companies, loading, error, loadFailed, onReload, students = [], sections = [], departments = [] }) {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState('');
  const industries = [...new Set(companies.map(c => c.industry?.trim()).filter(Boolean))].sort();
  const deptOptions = [...new Set(companies.map(c => c.department).filter(Boolean))].sort();
  const untagged = companies.filter(c => !c.department).length;
  const totals = companies.reduce((t, c) => { const s = slotsOf(c); return { cap: t.cap + s.cap, used: t.used + Math.min(s.used, s.cap || s.used) }; }, { cap: 0, used: 0 });
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => companies
    .filter(c => !department || (department === '__none' ? !c.department : c.department === department))
    .filter(c => !industry || c.industry?.trim() === industry)
    .filter(c => status === 'all' || (status === 'active' ? c.active : !c.active))
    .filter(c => !term || [c.name, c.industry, c.address].some(v => String(v || '').toLowerCase().includes(term)))
    .sort((a, b) => {
      const v = x => sort.key === 'name' ? String(x.name || '').toLowerCase() : sort.key === 'department' ? (x.department || '~') : sort.key === 'industry' ? (x.industry || '~')
        : sort.key === 'slots' ? slotsOf(x).open : (x.active ? 0 : 1);
      const A = v(a), B = v(b); return (A < B ? -1 : A > B ? 1 : 0) * sort.dir;
    }), [companies, department, industry, status, term, sort]);
  useEffect(() => { setPage(1); }, [department, industry, status, term]);
  if (loading) return <PageSkeleton label="Loading company directory" variant="table" />;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)), current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const open = companies.find(c => c.id === openId);
  const head = (key, label) => <th aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
    <button type="button" onClick={() => setSort(p => ({ key, dir: p.key === key ? -p.dir : 1 }))}>{label}{sort.key === key && <Icon name="chevronDown" size={12} />}</button></th>;
  const exportCsv = () => {
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Company', 'Department', 'Industry', 'Address', 'Email', 'Phone', 'Placed', 'Capacity', 'Open slots', 'Status'].map(cell).join(',')]
      .concat(rows.map(c => { const s = slotsOf(c); return [c.name, c.department || '', c.industry, c.address, c.email, c.phone, s.used, s.cap || '', s.cap ? s.open : '', c.active ? 'Active' : 'Inactive'].map(cell).join(','); }));
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'PATHWAY-companies.csv' }).click(); URL.revokeObjectURL(url);
  };

  return <div className="asd" aria-label="Partner company directory">
    {error && <PortalError message={error} onRetry={onReload} />}
    <dl className="asd-stats">
      <div className="asd-stat"><div><span className="asd-ico" data-tone="indigo"><Icon name="building" size={20} /></span><dt>Partner companies</dt><dd>{companies.length}</dd></div></div>
      <div className="asd-stat"><div><span className="asd-ico" data-tone="blue"><Icon name="users" size={20} /></span><dt>Internship slots</dt><dd>{totals.cap}</dd></div></div>
      <div className="asd-stat"><div><span className="asd-ico" data-tone="green"><Icon name="check" size={20} /></span><dt>Filled</dt><dd>{totals.used}</dd></div></div>
      <div className="asd-stat" data-selected={department === '__none' ? 'true' : undefined}><button type="button" aria-pressed={department === '__none'} onClick={() => setDepartment(department === '__none' ? '' : '__none')}>
        <span className="asd-ico" data-tone={untagged ? 'amber' : 'green'}><Icon name="alert" size={20} /></span><dt>Without department</dt><dd>{untagged}</dd></button></div>
    </dl>
    <section className="asd-card">
      <div className="asd-tools">
        <label className="asd-search"><Icon name="search" size={16} /><span className="sr-only">Search companies</span>
          <input type="search" value={search} placeholder="Search name, industry or address" onChange={e => setSearch(e.target.value)} /></label>
        <label className="asd-select"><span className="sr-only">Department</span><select value={department} onChange={e => setDepartment(e.target.value)}>
          <option value="">All departments</option>{deptOptions.map(d => <option key={d} value={d}>{d}</option>)}<option value="__none">No department</option></select></label>
        <label className="asd-select"><span className="sr-only">Industry</span><select value={industry} onChange={e => setIndustry(e.target.value)}>
          <option value="">All industries</option>{industries.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="asd-select"><span className="sr-only">Status</span><select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <button type="button" className="asd-btn" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={15} />Export CSV</button>
      </div>
      {loadFailed ? null : shown.length === 0 ? <PortalEmpty icon="building" compact title={companies.length ? 'No matching companies' : 'No companies yet'}
        description={companies.length ? 'Try another search or filter.' : 'Companies added by coordinators will appear here.'} />
      : <div className="asd-table-wrap"><table className="asd-table">
        <thead><tr>{head('name', 'Company')}{head('department', 'Department')}{head('industry', 'Industry')}{head('slots', 'Slots')}{head('status', 'Status')}<th><span className="sr-only">Details</span></th></tr></thead>
        <tbody>{shown.map(c => { const s = slotsOf(c);
          return <tr key={c.id} tabIndex={0} onClick={() => setOpenId(c.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(c.id); }}>
            <td><div className="asd-who"><span aria-hidden="true">{(c.name || '?').trim()[0]?.toUpperCase()}</span><div><strong>{c.name || 'Unnamed company'}</strong><small>{city(c.address) || '—'}</small></div></div></td>
            <td className="asd-dept">{c.department || <span className="asd-chip" data-tone="warn">No department</span>}</td>
            <td>{c.industry || <span className="asd-muted">Not set</span>}</td>
            <td>{s.cap ? <div className="asd-hours"><span>{s.used} / {s.cap} · {s.open} open</span><i><b style={{ width: Math.min(100, s.used / s.cap * 100) + '%' }} /></i></div> : <span className="asd-muted">No slots set</span>}</td>
            <td><span className="asd-status" data-on={!!c.active}><i aria-hidden="true" />{c.active ? 'Active' : 'Inactive'}</span></td>
            <td><button type="button" className="asd-more" aria-label={'Details for ' + c.name} onClick={e => { e.stopPropagation(); setOpenId(c.id); }}>Open</button></td>
          </tr>; })}</tbody></table></div>}
      {pages > 1 && <div className="asd-foot"><span role="status">{rows.length ? `${(current - 1) * PAGE + 1}–${(current - 1) * PAGE + shown.length} of ${rows.length}` : '0 of 0'}</span>
        <Pager page={current} pages={pages} label="Company pages" onGo={setPage} /></div>}
    </section>
    {open && <CompanyDrawer company={open} students={students.filter(s => s.companyId === open.id && s.placementStatus === 'approved')} sections={sections}
      departments={departments} onClose={() => setOpenId('')} onSaved={onReload} />}
  </div>;
}

function CompanyDrawer({ company: c, students, sections, departments, onClose, onSaved }) {
  const [dept, setDept] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onClose]);
  const d = c.placementDefaults || {}, s = slotsOf(c), g = c.geofence || {};
  const save = async () => {
    setBusy(true); setError('');
    try { await adminRequest(`/admin/companies/${encodeURIComponent(c.id)}/department`, { method: 'PATCH', body: JSON.stringify({ department: dept }) });
      showToast('Department set', `${c.name} now belongs to ${dept}.`); await onSaved?.(); }
    catch (e) { setError(e.message || 'Could not save the department.'); } finally { setBusy(false); }
  };
  return createPortal(<div className="asd-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="asd-drawer" role="dialog" aria-modal="true" aria-label={'Company details for ' + (c.name || 'company')}>
      <header><span className="asd-big" aria-hidden="true">{(c.name || '?').trim()[0]?.toUpperCase()}</span>
        <div><h2>{c.name}</h2><p>{c.industry || 'Industry not set'} · <span className="asd-status" data-on={!!c.active}><i aria-hidden="true" />{c.active ? 'Active' : 'Inactive'}</span></p></div>
        <button type="button" className="asd-x" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></header>
      {!c.department && <div className="asd-reassign">
        <label>This company has no department, so no coordinator can see it. Set one:<select value={dept} onChange={e => setDept(e.target.value)} disabled={busy}>
          <option value="">Choose a department</option>{departments.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
        <button type="button" className="asd-btn asd-primary" disabled={!dept || busy} onClick={save}>Save</button>
        {error && <p role="alert" className="asd-err">{error}</p>}
      </div>}
      <h3>Company</h3>
      <dl className="asd-dl">
        <div><dt>Department</dt><dd>{c.department || '—'}</dd></div>
        <div><dt>Address</dt><dd>{c.address || '—'}</dd></div>
        <div><dt>Email</dt><dd>{c.email || '—'}</dd></div>
        <div><dt>Phone</dt><dd>{c.phone || '—'}</dd></div>
        <div><dt>Slots</dt><dd>{s.cap ? `${s.used} of ${s.cap} filled · ${s.open} open` : 'Not set'}</dd></div>
        <div><dt>Geofence</dt><dd>{g.enabled ? `On · ${g.radiusMeters} m radius` : 'Off'}</dd></div>
      </dl>
      <h3>Default placement</h3>
      <dl className="asd-dl">
        <div><dt>Supervisor</dt><dd>{d.supervisorName || '—'}</dd></div>
        <div><dt>Supervisor email</dt><dd>{d.supervisorEmail || '—'}</dd></div>
        <div><dt>Role</dt><dd>{d.internshipRole || '—'}</dd></div>
        <div><dt>Arrangement</dt><dd>{d.workArrangement || '—'}</dd></div>
      </dl>
      <h3>Placed students ({students.length})</h3>
      {students.length ? <ul className="asd-list">{students.map(st => <li key={st.id}><div><strong>{personName(st)}</strong>
        <small>{[st.idNumber, sections.find(x => x.id === st.sectionId)?.name].filter(Boolean).join(' · ')}</small></div>
        <a className="asd-more" href={'/admin/students?student=' + encodeURIComponent(st.id)}>Open</a></li>)}</ul> : <p className="asd-note">No students placed here yet.</p>}
      <p className="asd-note">Companies are managed by coordinators in their department.</p>
    </aside>
  </div>, document.body);
}
