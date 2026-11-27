import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import personName from '../personName';
import Icon from './Icons';
import Pager from './Pager';
import AlertDialog from './AlertDialog';
import { PortalEmpty } from './PortalStates';
import './AdminStudentsDirectory.css';

const PAGE = 10;
const STAGES = ['Not started', 'Documents', 'Placement', 'Deployed', 'Completed', 'Cleared'];
const TONE = { 'Not started': 'mute', Documents: 'amber', Placement: 'violet', Deployed: 'blue', Completed: 'teal', Cleared: 'green' };

export function ojtStage(s) {
  if (s.clearanceStatus === 'cleared') return 'Cleared';
  const placed = s.placementStatus === 'approved';
  if (placed && Number(s.hoursRequired) > 0 && Number(s.hoursRendered) >= Number(s.hoursRequired)) return 'Completed';
  if (placed && s.preDeploymentStatus === 'approved') return 'Deployed';
  if (placed || s.requirementsStatus === 'approved') return 'Placement';
  if (Object.values(s.requirements || {}).some(r => ['submitted', 'approved', 'rejected'].includes(r?.status))) return 'Documents';
  return 'Not started';
}
const hoursOf = s => ({ done: Number(s.hoursRendered) || 0, need: Number(s.hoursRequired) || 0 });

export default function AdminStudentsDirectory({ students, sections, allSections, coordinators, departmentPicker, departmentFilter,
  sectionFilter, onSectionFilter, status, onStatus, saving, onToggle }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'name', dir: 1 });
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(null);
  const [params, setParams] = useSearchParams();
  const openId = params.get('student');
  const sectionOf = s => allSections.find(x => x.id === s.sectionId);

  const counts = { all: students.length, active: students.filter(s => s.accountApproved).length };
  counts.suspended = counts.all - counts.active;
  const term = search.trim().toLowerCase();
  const rows = useMemo(() => students
    .filter(s => status === 'all' || (status === 'active' ? s.accountApproved : !s.accountApproved))
    .filter(s => !term || [personName(s), s.idNumber, s.username, sectionOf(s)?.name].some(v => String(v || '').toLowerCase().includes(term)))
    .sort((a, b) => {
      const v = x => sort.key === 'name' ? (personName(x) || '').toLowerCase() : sort.key === 'section' ? (sectionOf(x)?.name || '~')
        : sort.key === 'hours' ? (hoursOf(x).need ? hoursOf(x).done / hoursOf(x).need : -1) : sort.key === 'status' ? (x.accountApproved ? 0 : 1) : STAGES.indexOf(ojtStage(x));
      const A = v(a), B = v(b);
      return (A < B ? -1 : A > B ? 1 : 0) * sort.dir;
    }), [students, status, term, sort, allSections]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(1); }, [status, term, sectionFilter, departmentFilter]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  const shown = rows.slice((current - 1) * PAGE, current * PAGE);
  const open = students.find(s => s.id === openId);

  const head = (key, label) => <th aria-sort={sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : undefined}>
    <button type="button" onClick={() => setSort(prev => ({ key, dir: prev.key === key ? -prev.dir : 1 }))}>{label}
      {sort.key === key && <Icon name="chevronDown" size={12} />}</button></th>;

  const exportCsv = () => {
    const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Name', 'Student ID', 'Username', 'Section', 'Department', 'OJT stage', 'Hours rendered', 'Hours required', 'Status'].map(cell).join(',')]
      .concat(rows.map(s => [personName(s), s.idNumber, s.username, sectionOf(s)?.name || '', s.department, ojtStage(s), hoursOf(s).done, hoursOf(s).need, s.accountApproved ? 'Active' : 'Suspended'].map(cell).join(',')));
    const url = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' }));
    Object.assign(document.createElement('a'), { href: url, download: 'PATHWAY-students.csv' }).click();
    URL.revokeObjectURL(url);
  };

  const filterName = [status !== 'all' && (status === 'active' ? 'active' : 'suspended'), 'students',
    sectionFilter !== 'all' && 'in ' + (allSections.find(x => x.id === sectionFilter)?.name || 'this section'),
    sectionFilter === 'all' && departmentFilter && 'in ' + departmentFilter].filter(Boolean).join(' ');

  return <div className="asd">
    <dl className="asd-stats">
      {[['all', 'Total students', 'cap', 'blue', counts.all], ['active', 'Active', 'check', 'green', counts.active],
        ['suspended', 'Suspended', 'lock', 'red', counts.suspended], [null, 'Sections', 'section', 'indigo', sections.length]].map(([key, label, icon, tone, n]) =>
        <div key={label} className="asd-stat" data-selected={key && key !== 'all' && status === key ? 'true' : undefined}>
          {key ? <button type="button" onClick={() => onStatus(status === key && key !== 'all' ? 'all' : key)} aria-pressed={status === key}>
            <span className="asd-ico" data-tone={tone}><Icon name={icon} size={20} /></span><dt>{label}</dt><dd>{n}</dd></button>
          : <div><span className="asd-ico" data-tone={tone}><Icon name={icon} size={20} /></span><dt>{label}</dt><dd>{n}</dd></div>}
        </div>)}
    </dl>

    <section className="asd-card">
      <div className="asd-tools">
        <label className="asd-search"><Icon name="search" size={16} /><span className="sr-only">Search students</span>
          <input type="search" value={search} placeholder="Search name, ID or section" onChange={e => setSearch(e.target.value)} /></label>
        <div className="asd-filter">{departmentPicker}</div>
        <label className="asd-select"><span className="sr-only">Filter by section</span>
          <select value={sectionFilter} onChange={e => onSectionFilter(e.target.value)}>
            <option value="all">All sections</option>
            {sections.map(x => <option key={x.id} value={x.id}>{x.name || x.id}</option>)}
          </select></label>
        <label className="asd-select"><span className="sr-only">Filter by account status</span>
          <select value={status} onChange={e => onStatus(e.target.value)}>
            <option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select></label>
        <button type="button" className="asd-btn" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={15} />Export CSV</button>
      </div>

      {shown.length === 0 ? <PortalEmpty icon="users" compact title={term ? 'No matching students' : `No ${filterName}`}
        description={term ? 'Try another name, ID or section.' : 'Change the filters to see more students.'} />
      : <div className="asd-table-wrap"><table className="asd-table">
        <thead><tr>{head('name', 'Student')}{head('section', 'Section')}{!departmentFilter && <th>Department</th>}{head('stage', 'OJT stage')}{head('hours', 'Hours')}{head('status', 'Status')}<th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{shown.map(s => { const h = hoursOf(s); const stage = ojtStage(s); const name = personName(s) || 'Name unavailable';
          return <tr key={s.id} onClick={() => setParams({ student: s.id })} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setParams({ student: s.id }); }}>
            <td><div className="asd-who"><span aria-hidden="true">{((s.firstName || '?')[0] + (s.lastName || '')[0]).toUpperCase()}</span>
              <div><strong>{name}</strong><small>{s.idNumber || '—'}</small></div></div></td>
            <td>{sectionOf(s)?.name || <span className="asd-muted">No section</span>}</td>
            {!departmentFilter && <td className="asd-dept">{s.department || '—'}</td>}
            <td><span className="asd-chip" data-tone={TONE[stage]}>{stage}</span></td>
            <td>{h.need ? <div className="asd-hours"><span>{h.done} / {h.need}</span><i><b style={{ width: Math.min(100, h.done / h.need * 100) + '%' }} /></i></div> : <span className="asd-muted">—</span>}</td>
            <td><span className="asd-status" data-on={!!s.accountApproved}><i aria-hidden="true" />{s.accountApproved ? 'Active' : 'Suspended'}</span></td>
            <td onClick={e => e.stopPropagation()}><button type="button" className="asd-more" aria-label={'Actions for ' + name} onClick={() => setConfirm(s)} disabled={saving}>
              {s.accountApproved ? 'Suspend' : 'Restore'}</button></td>
          </tr>; })}</tbody>
      </table></div>}
      {pages > 1 && <div className="asd-foot"><span role="status">{rows.length ? `${(current - 1) * PAGE + 1}–${(current - 1) * PAGE + shown.length} of ${rows.length}` : '0 of 0'}</span>
        <Pager page={current} pages={pages} label="Student pages" onGo={setPage} /></div>}
    </section>

    {open && <StudentDrawer student={open} section={sectionOf(open)} coordinator={coordinators.find(c => c.id === sectionOf(open)?.coordinatorId)}
      saving={saving} onClose={() => setParams({})} onToggle={() => setConfirm(open)} />}
    <AlertDialog open={Boolean(confirm)} title={confirm?.accountApproved ? 'Suspend access?' : 'Restore access?'}
      description={confirm ? (confirm.accountApproved ? 'Block sign-in for ' : 'Allow sign-in again for ') + (personName(confirm) || 'this student') + '? Their OJT records stay.' : ''}
      confirmLabel={confirm?.accountApproved ? 'Suspend access' : 'Restore access'} busy={saving} onCancel={() => setConfirm(null)}
      onConfirm={async () => { await onToggle(confirm.id, confirm.accountApproved); setConfirm(null); }} />
  </div>;
}

function StudentDrawer({ student: s, section, coordinator, saving, onClose, onToggle }) {
  useEffect(() => { const key = e => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key); }, [onClose]);
  const reqs = Object.values(s.requirements || {});
  const h = hoursOf(s);
  const stage = ojtStage(s);
  return createPortal(<div className="asd-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="asd-drawer" role="dialog" aria-modal="true" aria-label={'Student details for ' + (personName(s) || 'student')}>
      <header><span className="asd-big" aria-hidden="true">{((s.firstName || '?')[0] + (s.lastName || '')[0]).toUpperCase()}</span>
        <div><h2>{personName(s) || 'Name unavailable'}</h2><p>{s.idNumber} · <span className="asd-status" data-on={!!s.accountApproved}><i aria-hidden="true" />{s.accountApproved ? 'Active' : 'Suspended'}</span></p></div>
        <button type="button" className="asd-x" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button></header>
      <h3>Account</h3>
      <dl className="asd-dl">
        <div><dt>Username</dt><dd>{s.username || '—'}</dd></div>
        <div><dt>Section</dt><dd>{section?.name || 'No section'}</dd></div>
        <div><dt>Department</dt><dd>{s.department || '—'}</dd></div>
        <div><dt>Coordinator</dt><dd>{coordinator ? personName(coordinator) : 'Unassigned'}</dd></div>
      </dl>
      <h3>OJT progress</h3>
      <ol className="asd-steps">
        {STAGES.slice(1).map(step => <li key={step} data-done={STAGES.indexOf(step) <= STAGES.indexOf(stage)}><i aria-hidden="true" />{step}</li>)}
      </ol>
      <dl className="asd-dl">
        <div><dt>Requirements</dt><dd>{reqs.filter(r => r?.status === 'approved').length} approved of {reqs.length || '—'} submitted</dd></div>
        <div><dt>Company</dt><dd>{s.placementStatus === 'approved' && s.company ? s.company : 'Not placed yet'}</dd></div>
        <div><dt>Hours</dt><dd>{h.need ? `${h.done} of ${h.need} hrs` : '—'}</dd></div>
        <div><dt>Clearance</dt><dd>{s.clearanceStatus === 'cleared' ? 'Cleared' : 'In progress'}</dd></div>
      </dl>
      <p className="asd-note">OJT records are managed by the student's coordinator.</p>
      <footer><button type="button" className={'asd-btn ' + (s.accountApproved ? 'asd-danger' : 'asd-primary')} disabled={saving} onClick={onToggle}>
        <Icon name={s.accountApproved ? 'lock' : 'check'} size={15} />{s.accountApproved ? 'Suspend access' : 'Restore access'}</button></footer>
    </aside>
  </div>, document.body);
}
