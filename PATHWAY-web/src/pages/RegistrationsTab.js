import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import CoordinatorSearch from '../components/CoordinatorSearch';
import AlertDialog from '../components/AlertDialog';
import './CoordinatorRecords.css';

const tabs = { pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected or inactive' };
const nameOf = student => [student.firstName, student.lastName].filter(Boolean).join(' ').trim();

export default function RegistrationsTab({ selectedSection }) {
  const [unassigned, setUnassigned] = useState(false);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [cursors, setCursors] = useState(['']);
  const [result, setResult] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [reject, setReject] = useState(null);
  const sectionId = unassigned ? '' : selectedSection?.id;
  const cursor = cursors.at(-1);
  const scope = JSON.stringify([sectionId, tab, term, cursor, revision]);

  useEffect(() => {
    const timer = setTimeout(() => { setTerm(search.trim()); setCursors(['']); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (sectionId === undefined) return;
    let active = true;
    const params = new URLSearchParams({ sectionId, view: 'counts' });
    adminRequest('/coordinator/registrations?' + params)
      .then(data => { if (active) setCounts({ sectionId, revision, values: data.counts }); })
      .catch(() => { if (active) setCounts(null); });
    return () => { active = false; };
  }, [sectionId, revision]);

  useEffect(() => {
    if (sectionId === undefined) return;
    let active = true;
    setError('');
    const params = new URLSearchParams({ sectionId, tab, search: term, cursor });
    adminRequest('/coordinator/registrations?' + params)
      .then(data => {
        if (!active) return;
        if (!data.rows.length && cursor) setCursors(previous => previous.slice(0, -1));
        else setResult({ ...data, scope });
      })
      .catch(err => { if (active) setError(err.message || 'Could not load student accounts.'); });
    return () => { active = false; };
  }, [sectionId, tab, term, cursor, scope]);

  async function decide(student, status) {
    setSaving(true);
    setActionError('');
    try {
      await adminRequest('/coordinator/registrations/' + encodeURIComponent(student.id) + '/decision', {
        method: 'POST', body: JSON.stringify({ status }),
      });
      setReject(null);
      setRevision(value => value + 1);
    } catch (err) {
      setReject(null);
      setActionError(err.message || 'Could not update the account.');
    } finally {
      setSaving(false);
    }
  }

  const data = result?.scope === scope ? result : null;
  const page = cursors.length;
  return <div className="registrations-page accounts-workspace">
    <div className="registration-tabs" aria-label="Account status">
      {Object.entries(tabs).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key}
        onClick={() => { setTab(key); setCursors(['']); }}>
        {label} <span>{counts?.sectionId === sectionId && counts?.revision === revision ? counts.values[key] : '—'}</span>
      </button>)}
    </div>
    <div className="accounts-card">
      <div className="accounts-toolbar">
        <CoordinatorSearch value={search} onChange={setSearch} label="Search student accounts" placeholder="Search name or ID…" />
        <label><input type="checkbox" checked={unassigned} onChange={event => {
          setUnassigned(event.target.checked); setCursors(['']);
        }} /> Show students without a section</label>
      </div>
      {actionError && <p role="alert">{actionError}</p>}
      {error ? <p role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Try again</button></p>
        : sectionId === undefined ? <p>Select a section to view student accounts.</p>
        : !data ? <p role="status">Loading student accounts…</p>
        : <>
          <div className="coordinator-compact-table-wrap">
            <table className="coordinator-compact-table">
              <thead><tr>{['Student ID', 'Student name', 'Username', 'Section', 'Account status', 'Actions'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{data.rows.length ? data.rows.map(student => <tr key={student.id}>
                <td>{student.idNumber || '—'}</td>
                <td>{nameOf(student) || 'Name unavailable'}
                  <details><summary>Account details</summary><div>{student.department}</div>
                    {student.createdAt && <div>Created {new Date(student.createdAt).toLocaleDateString('en-PH')}</div>}
                  </details>
                </td>
                <td>{student.username || (student.idNumber ? 'uclm-' + student.idNumber : '—')}</td>
                <td>{unassigned ? 'Unassigned' : selectedSection?.name}</td>
                <td>{student.status === 'inactive' ? 'Inactive' : tab === 'rejected' ? 'Rejected' : tabs[tab]}</td>
                <td>{tab === 'pending' ? <div className="accounts-actions">
                  <button type="button" className="portal-secondary" disabled={saving} onClick={() => decide(student, 'approved')}>Approve</button>
                  <button type="button" className="portal-secondary" disabled={saving} onClick={() => setReject(student)}>Reject</button>
                </div> : '—'}</td>
              </tr>) : <tr><td colSpan={6}>{term ? 'No matching students.' : 'No students in this view.'}</td></tr>}</tbody>
            </table>
          </div>
          <nav className="accounts-footer" aria-label="Student accounts pagination">
            <span role="status">{data.total ? ((page - 1) * 25 + 1) + '–' + ((page - 1) * 25 + data.rows.length) + ' of ' + data.total + ' students' : '0 students'}</span>
            <div className="accounts-actions">
              <button type="button" className="portal-secondary" aria-label="Previous page" disabled={page === 1} onClick={() => setCursors(cursors.slice(0, -1))}>‹</button>
              <span>Page {page} of {Math.max(1, Math.ceil(data.total / 25))}</span>
              <button type="button" className="portal-secondary" aria-label="Next page" disabled={!data.nextCursor} onClick={() => setCursors([...cursors, data.nextCursor])}>›</button>
            </div>
          </nav>
        </>}
    </div>
    <AlertDialog open={Boolean(reject)} title="Reject this student registration?"
      description={reject ? nameOf(reject) + ' will remain unable to access the student workflow.' : ''}
      confirmLabel="Reject registration" busy={saving} onCancel={() => setReject(null)}
      onConfirm={() => decide(reject, 'rejected')} />
  </div>;
}
