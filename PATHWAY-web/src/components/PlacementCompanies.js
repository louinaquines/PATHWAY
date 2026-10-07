import { useState } from 'react';
import Icon from './Icons';
import './PlacementCompanies.css';

export function groupPlacementCompanies(companies, students) {
  const groups = new Map(companies.map(company => [company.id, { ...company, students: [] }]));
  students.filter(student => student.placementStatus === 'approved' && student.companyId).forEach(student => {
    if (!groups.has(student.companyId)) groups.set(student.companyId, {
      id: student.companyId, name: student.company || student.companyName || 'Company not listed',
      address: student.companyAddress, email: student.companyEmail, phone: student.companyPhone,
      active: false, students: [],
    });
    groups.get(student.companyId).students.push(student);
  });
  return [...groups.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

const studentName = student => [student.firstName, student.lastName].filter(Boolean).join(' ') || student.idNumber || student.id;

export default function PlacementCompanies({ companies, students, sectionName }) {
  const [view, setView] = useState('grid');
  const [search, setSearch] = useState('');
  const groups = groupPlacementCompanies(companies, students);
  const term = search.trim().toLowerCase();
  const filtered = groups.filter(company => !term || String(company.name || '').toLowerCase().includes(term)
    || company.students.some(student => studentName(student).toLowerCase().includes(term)));
  const placedCount = groups.reduce((total, company) => total + company.students.length, 0);
  return <section className="placement-companies" aria-label="Companies and assigned students">
    <div className="placement-metrics">
      <div><span>Companies</span><strong>{groups.length}</strong></div>
      <div><span>Assigned students</span><strong>{placedCount}</strong></div>
      <div><span>Current section</span><strong className="placement-section-name">{sectionName}</strong></div>
    </div>
    <div className="placement-toolbar">
      <label className="placement-search"><Icon name="search" size={18} /><input type="search" aria-label="Search company or student name" placeholder="Search company or student name…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="placement-view-switch" role="group" aria-label="Company display">
        <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" size={17} /> Grid</button>
        <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}><Icon name="clipboard" size={17} /> List</button>
      </div>
    </div>
    <p className="placement-results" role="status">{filtered.length} {filtered.length === 1 ? 'company' : 'companies'} · Students shown are officially assigned in {sectionName}. Capacity covers all sections.</p>
    {!filtered.length ? <div className="placement-empty"><Icon name="building" size={30} /><h3>{term ? 'No matching companies or students' : 'No companies yet'}</h3><p>{term ? 'Try another company or student name.' : 'Add a company from the Company Directory to get started.'}</p></div> :
      <div className={`placement-company-layout placement-company-layout--${view}`}>
        {filtered.map(company => <article className="placement-company-card" key={company.id}>
          <div className="placement-company-details">
            <div className="placement-company-heading"><div className="placement-company-icon"><Icon name="building" size={22} /></div><div><h3>{company.name || 'Unnamed company'}</h3><p>{company.industry || 'Industry not provided'}</p></div><span className={`placement-company-status ${company.active ? '' : 'placement-company-status--inactive'}`}>{company.active ? 'Active' : 'Inactive / unlisted'}</span></div>
            <dl className="placement-company-facts">
              <div><dt>Address</dt><dd>{company.address || 'Not provided'}</dd></div>
              <div><dt>Email</dt><dd>{company.email || 'Not provided'}</dd></div>
              <div><dt>Phone</dt><dd>{company.phone || 'Not provided'}</dd></div>
              <div><dt>Capacity (all sections)</dt><dd>{Number.isSafeInteger(company.capacity) ? `${company.occupiedSlots ?? 0} / ${company.capacity} occupied · ${company.availableSlots ?? 0} available` : 'Not configured'}</dd></div>
            </dl>
          </div>
          <div className="placement-assigned-students">
            <div className="placement-students-heading"><h4>Assigned students</h4><span>{company.students.length}</span></div>
            {!company.students.length ? <p className="placement-students-empty">No students from this section are assigned here.</p> : <ul>{company.students.map(student => <li key={student.id}><span className="placement-student-avatar">{studentName(student).slice(0, 1).toUpperCase()}</span><div><strong>{studentName(student)}</strong><p>{student.idNumber || 'ID not provided'} · {student.internshipRole || 'Role not specified'}</p>{student.supervisorName && <p>Supervisor: {student.supervisorName}</p>}</div></li>)}</ul>}
          </div>
        </article>)}
      </div>}
  </section>;
}
