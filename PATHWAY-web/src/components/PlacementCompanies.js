import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import { PortalFormDialog } from './PortalStates';
import Icon from './Icons';
import './PlacementCompanies.css';

function useWorkspacePage(sectionId, view, companyId) {
  const [search, setSearchValue] = useState('');
  const [cursors, setCursors] = useState(['']);
  const [result, setResult] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const cursor = cursors[cursors.length - 1];
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ sectionId, view, search: search.trim(), cursor });
      if (companyId != null) params.set('companyId', companyId);
      try {
        const data = await adminRequest('/coordinator/placement-workspace?' + params);
        if (current) setResult(data);
      } catch (err) {
        if (current) setError(err.message || 'Unable to load records.');
      } finally {
        if (current) setLoading(false);
      }
    }, search ? 300 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [sectionId, view, companyId, search, cursor, retry]);
  return {
    search, result, loading, error, page: cursors.length,
    setSearch: value => { setSearchValue(value); setCursors(['']); },
    previous: () => setCursors(value => value.slice(0, -1)),
    next: () => setCursors(value => [...value, result.nextCursor]),
    retry: () => setRetry(value => value + 1),
  };
}

function PageFooter({ page, label }) {
  return <footer className="placement-page-footer" aria-label={label + ' pagination'}>
    <span>Page {page.page}</span>
    <div><button type="button" disabled={page.loading || page.page === 1} onClick={page.previous}>Previous</button>
      <button type="button" disabled={page.loading || !!page.error || !page.result.nextCursor} onClick={page.next}>Next</button></div>
  </footer>;
}
function Search({ page, label }) {
  return <label className="placement-search"><Icon name="search" size={18} /><input type="search" aria-label={label} placeholder={label + '…'} value={page.search} onChange={event => page.setSearch(event.target.value)} /></label>;
}
function PageState({ page, children }) {
  if (page.loading) return <p role="status">Loading…</p>;
  if (page.error) return <div role="alert">{page.error} <button type="button" onClick={page.retry}>Retry</button></div>;
  return children;
}
const studentName = student => [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Name not provided';

export default function PlacementCompanies({ selectedSection, onOpenStudent }) {
  if (!selectedSection?.id) return <p className="placement-empty">Select a section to view companies.</p>;
  return <CompanyTable key={selectedSection.id} section={selectedSection} onOpenStudent={onOpenStudent} />;
}

function CompanyTable({ section, onOpenStudent }) {
  const page = useWorkspacePage(section.id, 'companies');
  const [company, setCompany] = useState(null);
  const companies = page.result.companies || [];
  return <section className="placement-companies" aria-label="Companies and assigned students">
    <div className="placement-toolbar"><h3>Companies · {section.name}</h3><Search page={page} label="Search companies" /></div>
    <p className="placement-results">Assignments are for {section.name}. Available slots cover all sections.</p>
    <PageState page={page}>
      <div className="placement-table-scroll"><table className="placement-company-table">
        <thead><tr><th scope="col">Company</th><th scope="col">Assigned in this section</th><th scope="col">Available slots (all sections)</th><th scope="col">Status</th></tr></thead>
        <tbody>{companies.map(item => <tr key={item.id} onClick={() => setCompany(item)}>
          <td><button type="button" className="placement-company-link" onClick={event => { event.stopPropagation(); setCompany(item); }}>{item.name || 'Unnamed company'}</button></td>
          <td>{item.assignedCount ?? 'Not provided'}</td><td>{item.availableSlots ?? 'Not configured'}</td>
          <td><span className={`placement-company-status ${item.active ? '' : 'placement-company-status--inactive'}`}>{item.active ? 'Active' : 'Inactive / unlisted'}</span></td>
        </tr>)}</tbody>
      </table></div>
      {!companies.length && <p className="placement-empty">{page.search ? 'No matching companies.' : 'No companies yet.'}</p>}
    </PageState>
    <PageFooter page={page} label="Companies" />
    {company && <CompanyDrawer key={company.id} company={company} section={section} onClose={() => setCompany(null)} onOpenStudent={onOpenStudent} />}
  </section>;
}

function CompanyDrawer({ company, section, onClose, onOpenStudent }) {
  const page = useWorkspacePage(section.id, 'students', company.id);
  const students = page.result.students || [];
  return <PortalFormDialog label={company.name || 'Company details'} className="placement-company-drawer" onCancel={onClose} closeOnBackdrop>
    <header className="placement-drawer-header"><h2>{company.name || 'Unnamed company'}</h2><button type="button" aria-label="Close company details" onClick={onClose}>Close</button></header>
    <dl className="placement-company-facts">
      <div><dt>Address</dt><dd>{company.address || 'Not provided'}</dd></div>
      <div><dt>Email</dt><dd>{company.email || 'Not provided'}</dd></div>
      <div><dt>Phone</dt><dd>{company.phone || 'Not provided'}</dd></div>
      <div><dt>Capacity (all sections)</dt><dd>{company.capacity == null ? 'Not configured' : `${company.occupiedSlots ?? '—'} / ${company.capacity} occupied · ${company.availableSlots ?? '—'} available`}</dd></div>
    </dl>
    <h3>Assigned students · {section.name}</h3>
    <Search page={page} label="Search assigned students" />
    <PageState page={page}>
      {students.length ? <ul className="placement-drawer-students">{students.map(student => <li key={student.id}>
        {onOpenStudent ? <button type="button" onClick={() => { onClose(); onOpenStudent(student); }}><span>{student.idNumber || 'ID not provided'}</span> <strong>{studentName(student)}</strong></button>
          : <div><span>{student.idNumber || 'ID not provided'}</span> <strong>{studentName(student)}</strong></div>}
      </li>)}</ul> : <p className="placement-students-empty">{page.search ? 'No matching students.' : 'No students from this section are assigned here.'}</p>}
    </PageState>
    <PageFooter page={page} label="Assigned students" />
  </PortalFormDialog>;
}
