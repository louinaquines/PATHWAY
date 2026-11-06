import { useState } from 'react';
import { PageSkeleton } from './LoadingSkeleton';
import { PortalEmpty, PortalError } from './PortalStates';

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

  return <section className="admin-company-directory" aria-label="Partner company directory">
    {error && <PortalError message={error} onRetry={onReload} />}
    <div className="admin-company-summary">
      <span><strong>{companies.length}</strong> companies</span>
      <span><strong>{companies.filter(company => company.active).length}</strong> active</span>
      <span className="admin-company-capacity-note">Capacity includes placements across all sections.</span>
    </div>
    <div className="admin-company-filters">
      <label>Search companies<input type="search" value={search} placeholder="Name, industry, or address"
        onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      <label>Industry<select value={industry} onChange={event => { setIndustry(event.target.value); setPage(1); }}>
        <option value="">All industries</option>
        {industries.map(value => <option key={value} value={value}>{value}</option>)}
        <option value="__missing">Industry not set</option>
      </select></label>
      <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
        <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option>
      </select></label>
      <button type="button" className="portal-secondary" onClick={onReload}>Refresh</button>
    </div>
    {loadFailed ? null : filtered.length === 0 ? <PortalEmpty title={companies.length ? 'No matching companies' : 'No companies yet'}
      description={companies.length ? 'Try another search, industry, or status.' : 'Companies added by coordinators will appear here.'} /> : <>
      <div className="admin-company-table-wrap">
        <table className="coordinator-compact-table">
          <thead><tr><th>Company</th><th>Industry</th><th>Address</th><th>Placements</th><th>Available slots</th><th>Status</th></tr></thead>
          <tbody>{visible.map(company => {
            const configured = Number.isSafeInteger(company.capacity) && company.capacity > 0;
            return <tr key={company.id}>
              <td><strong>{company.name || '—'}</strong></td>
              <td>{company.industry?.trim() || '—'}</td><td>{company.address || '—'}</td>
              <td>{configured ? <><span className="admin-company-capacity-value">{company.occupiedSlots ?? 0} / {company.capacity}<small> occupied</small></span>
                <progress className="coordinator-capacity-progress" aria-label={company.name + ' capacity'}
                  value={company.occupiedSlots ?? 0} max={company.capacity} /></> : 'Not configured'}</td>
              <td className="admin-company-slots" data-zero={configured && (company.availableSlots ?? Math.max(0, company.capacity - (company.occupiedSlots || 0))) === 0}>{configured ? company.availableSlots ?? Math.max(0, company.capacity - (company.occupiedSlots || 0)) : '—'}</td>
              <td><span className="coordinator-queue-status" data-status={company.active ? 'complete' : 'neutral'}>
                {company.active ? 'Active' : 'Inactive'}</span></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <nav className="admin-company-pagination" aria-label="Company pages">
        <span role="status">Showing {start + 1}–{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length} companies</span>
        <button type="button" className="portal-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <span>Page {currentPage} of {pageCount}</span>
        <button type="button" className="portal-secondary" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
      </nav>
    </>}
  </section>;
}
