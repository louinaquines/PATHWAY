import { useState } from 'react';
import { PageSkeleton } from './LoadingSkeleton';
import { PortalEmpty, PortalError } from './PortalStates';
import Icon from './Icons';

const PAGE_SIZE = 10;

export default function AdminCompanyDirectory({ companies, loading, error, loadFailed, onReload }) {
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const industries = [...new Set(companies.map(company => company.industry?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const filtered = companies.filter(company => {
    const matchesSearch = [company.name, company.industry, company.address].some(value =>
      String(value || '').toLowerCase().includes(search.trim().toLowerCase()));
    const companyIndustry = company.industry?.trim() || '';
    return matchesSearch && (!industry || (industry === '__missing' ? !companyIndustry : companyIndustry === industry))
      && (status === 'all' || (status === 'active' ? company.active : !company.active));
  }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')) || a.id.localeCompare(b.id));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  if (loading) return <PageSkeleton label="Loading company directory" variant="table" />;

  const capacityTotal = companies.reduce((sum, company) => sum + (Number.isSafeInteger(company.capacity) && company.capacity > 0 ? company.capacity : 0), 0);
  const availableTotal = companies.reduce((sum, company) => {
    if (!(Number.isSafeInteger(company.capacity) && company.capacity > 0)) return sum;
    return sum + (company.availableSlots ?? Math.max(0, company.capacity - (company.occupiedSlots || 0)));
  }, 0);

  return <section className="admin-company-directory" aria-label="Partner company directory">
    {error && <PortalError message={error} onRetry={onReload} />}
    <dl className="admin-stat-cards admin-stat-cards-compact" aria-label="Company summary">
      <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="indigo"><Icon name="building" size={20} /></span><dt>Partner companies</dt><dd>{companies.length}</dd></div>
      <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="green"><Icon name="check" size={20} /></span><dt>Active companies</dt><dd>{companies.filter(company => company.active).length}</dd></div>
      <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="blue"><Icon name="users" size={20} /></span><dt>Internship slots</dt><dd>{capacityTotal}</dd></div>
      <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="teal"><Icon name="layers" size={20} /></span><dt>Available slots</dt><dd>{availableTotal}</dd></div>
    </dl>
    <div className="admin-records-card">
    <div className="admin-company-filters admin-filter-bar">
      <label className="admin-filter-search"><span className="sr-only">Search companies</span><input type="search" value={search} placeholder="Search by name, industry, or address"
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label><span className="sr-only">Industry</span><select value={industry} onChange={event => { setIndustry(event.target.value); setPage(1); }}>
        <option value="">All industries</option>
        {industries.map(value => <option key={value} value={value}>{value}</option>)}
        <option value="__missing">Industry not set</option>
      </select></label>
      <label><span className="sr-only">Status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
      </select></label>
      <button type="button" className="admin-icon-button" onClick={onReload} aria-label="Refresh" title="Refresh"><Icon name="refresh" size={18} /></button>
      <span className="admin-count-pill">{filtered.length} {filtered.length === 1 ? 'company' : 'companies'}</span>
    </div>
    {loadFailed ? null : filtered.length === 0 ? <PortalEmpty icon="building" compact title={companies.length ? 'No matching companies' : 'No companies yet'}
      description={companies.length ? 'Try another search, industry, or status.' : 'Companies added by coordinators will appear here.'} /> : <>
      <div className="admin-company-table-wrap admin-table-scroll">
        <table className="coordinator-compact-table">
          <thead><tr><th>Company</th><th>Industry</th><th>Address</th><th>Placements</th><th>Available</th><th>Status</th></tr></thead>
          <tbody>{visible.map(company => {
            const configured = Number.isSafeInteger(company.capacity) && company.capacity > 0;
            const available = configured ? company.availableSlots ?? Math.max(0, company.capacity - (company.occupiedSlots || 0)) : null;
            return <tr key={company.id}>
              <td><div className="admin-person"><span className="admin-avatar admin-avatar-square" aria-hidden="true">{(company.name || '?').trim()[0]?.toUpperCase()}</span><span className="admin-person-text"><strong title={company.name}>{company.name || '—'}</strong></span></div></td>
              <td>{company.industry?.trim() || <span className="admin-muted">Not set</span>}</td>
              <td title={company.address || ''}>{company.address || <span className="admin-muted">—</span>}</td>
              <td>{configured ? <div className="admin-capacity"><span>{company.occupiedSlots ?? 0} / {company.capacity}</span>
                <progress className="coordinator-capacity-progress" aria-label={company.name + ' capacity'} value={company.occupiedSlots ?? 0} max={company.capacity} /></div> : <span className="admin-muted">Not configured</span>}</td>
              <td className="admin-company-slots" data-zero={configured && available === 0}>{configured ? available : '—'}</td>
              <td><span className={`admin-student-status ${company.active ? 'is-active' : 'is-inactive'}`}>{company.active ? 'Active' : 'Inactive'}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <nav className="admin-company-pagination admin-table-footer" aria-label="Company pages">
        <span role="status">Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} companies</span>
        <div><button type="button" className="portal-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {pageCount}</span>
        <button type="button" className="portal-secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      </nav>
    </>}
    </div>
  </section>;
}
