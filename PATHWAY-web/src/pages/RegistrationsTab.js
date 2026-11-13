import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import CoordinatorSearch from '../components/CoordinatorSearch';
import { PortalFormDialog } from '../components/PortalStates';
import './CoordinatorRecords.css';

const tabs = { pending: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected or inactive' };
const nameOf = student => [student.firstName, student.lastName].filter(Boolean).join(' ').trim();

const usernameOf = student => student.username || (student.idNumber ? 'uclm-' + student.idNumber : '—');

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
  const [selected, setSelected] = useState(null);
  const opener = useRef(null);
  const workspace = useRef(null);
  function closeDetails(updated = false) {
    setSelected(null);
    setReject(null);
    requestAnimationFrame(() => {
      const target = updated ? workspace.current : opener.current;
      (target?.isConnected ? target : workspace.current)?.focus();
    });
  }
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
      closeDetails(true);
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
  return <div ref={workspace} tabIndex={-1} className="registrations-page accounts-workspace">
    <div className="registration-tabs" aria-label="Account status">
      {Object.entries(tabs).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key}
        onClick={() => { setTab(key); setCursors(['']); }}>
        {label} <span>{counts?.sectionId === sectionId && counts?.revision === revision ? counts.values[key] : 0}</span>
      </button>)}
    </div>
    <div className="accounts-card">
      <div className="accounts-toolbar">
        <CoordinatorSearch value={search} onChange={setSearch} label="Search student accounts" placeholder="Search name or ID…" />
        <label><input type="checkbox" checked={unassigned} onChange={event => {
          setUnassigned(event.target.checked); setCursors(['']);
        }} /> Show students without a section</label>
      </div>
      {error ? <div className="accounts-empty-state" role="status"><strong>No student accounts yet</strong><span>Accounts appear here once students sign up for this section.</span><button type="button" onClick={() => setRevision(value => value + 1)}>Check again</button></div>
        : sectionId === undefined ? <p>Select a section to view student accounts.</p>
        : !data ? <p role="status" className="accounts-loading">Loading student accounts…</p>
        : <>
          <div className="coordinator-compact-table-wrap">
            <table className="coordinator-compact-table">
              <thead><tr>{['Student ID', 'Student name', 'Username', 'Section', 'Account status', 'Actions'].map(label => <th key={label} scope="col" className={["Username", "Section"].includes(label) ? "accounts-extra" : undefined}>{label}</th>)}</tr></thead>
              <tbody>{data.rows.length ? data.rows.map(student => <tr key={student.id}>
                <td>{student.idNumber || '—'}</td>
                <td className="accounts-name">{nameOf(student) || 'Name unavailable'}</td>
                <td className="accounts-extra">{usernameOf(student)}</td>
                <td className="accounts-extra">{unassigned ? 'Unassigned' : selectedSection?.name}</td>
                <td>{student.status === 'inactive' ? 'Inactive' : tab === 'rejected' ? 'Rejected' : tabs[tab]}</td>
                <td><button type="button" className="portal-secondary accounts-row-action"
                  aria-label={(tab === 'pending' ? 'Review ' : 'Details for ') + (nameOf(student) || student.idNumber || 'student')}
                  onClick={event => {
                    opener.current = event.currentTarget;
                    setActionError('');
                    setSelected(student);
                  }}>{tab === 'pending' ? 'Review' : 'Details'}</button></td>
              </tr>) : <tr><td className="accounts-empty" colSpan={6}>
                <p>{term ? 'No matching students.' : tab === 'pending' ? 'No accounts awaiting approval.' : 'No students in this view.'}</p>
                {!term && tab === 'pending' && counts?.sectionId === sectionId && counts?.revision === revision && counts.values.approved > 0 && (
                  <button type="button" className="portal-secondary" onClick={() => {
                    setTab('approved');
                    setCursors(['']);
                  }}>View approved accounts</button>
                )}
              </td></tr>}</tbody>
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
    {selected && <PortalFormDialog className="admin-create-drawer accounts-drawer" closeOnBackdrop
      label="Student account details" onCancel={() => {
        if (saving) return;
        if (reject) setReject(null);
        else closeDetails();
      }}>
      <div className="accounts-drawer-layout">
        <header>
          <h2>{nameOf(selected) || 'Name unavailable'}</h2>
          <button autoFocus type="button" className="portal-secondary" disabled={saving} onClick={() => closeDetails()}>Close</button>
        </header>
        <div className="accounts-drawer-body">
          <dl>
            <div><dt>Student ID</dt><dd>{selected.idNumber || '—'}</dd></div>
            <div><dt>Username</dt><dd>{usernameOf(selected)}</dd></div>
            <div><dt>Section</dt><dd>{unassigned ? 'Unassigned' : selectedSection?.name}</dd></div>
            <div><dt>Department</dt><dd>{selected.department || '—'}</dd></div>
            <div><dt>Account created</dt><dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-PH') : '—'}</dd></div>
          </dl>
          {reject && <p role="status">Reject this student registration? The student will remain unable to access the student workflow.</p>}
          {actionError && <p role="alert">{actionError}</p>}
        </div>
        {tab === 'pending' && <footer>
          {reject ? <>
            <button type="button" className="portal-secondary" disabled={saving} onClick={() => setReject(null)}>Cancel rejection</button>
            <button type="button" className="portal-secondary" disabled={saving} onClick={() => decide(selected, 'rejected')}>Reject registration</button>
          </> : <>
            <button type="button" className="portal-secondary" disabled={saving} onClick={() => setReject(selected)}>Reject</button>
            <button type="button" className="portal-primary" disabled={saving} onClick={() => decide(selected, 'approved')}>Approve</button>
          </>}
        </footer>}
      </div>
    </PortalFormDialog>}
  </div>;
}
