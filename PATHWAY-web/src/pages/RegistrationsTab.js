import personName from '../personName';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SectionPicker from '../components/SectionPicker';
import { adminRequest } from '../adminApi';
import CoordinatorSearch from '../components/CoordinatorSearch';
import { PortalFormDialog } from '../components/PortalStates';
import './CoordinatorRecords.css';
import './RegistrationsRedesign.css';

const tabs = { pending: 'Waiting', approved: 'Approved', rejected: 'Turned away' };
const initials = s => ((s.firstName || '')[0] || '') + ((s.lastName || '')[0] || '') || '?';
const ago = v => { if (!v) return ''; const t = typeof v === 'number' ? v : v?._seconds ? v._seconds * 1000 : Date.parse(v); if (!t) return ''; const d = Math.floor((Date.now() - t) / 86400000); if (d < 1) { const h = Math.floor((Date.now() - t) / 3600000); return h < 1 ? 'signed up just now' : `signed up ${h} hour${h === 1 ? '' : 's'} ago`; } return d === 1 ? 'signed up yesterday' : `signed up ${d} days ago`; };
const nameOf = student => personName(student);

const usernameOf = student => student.username || (student.idNumber ? 'uclm-' + student.idNumber : '—');

export default function RegistrationsTab({ selectedSection, sections = [], onSectionChange }) {
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('rg-top-actions')); }, []);
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
  const countOf = key => counts?.sectionId === sectionId && counts?.revision === revision ? counts.values[key] : 0;
  const total = data?.total || 0;
  return <div ref={workspace} tabIndex={-1} className="rgx">
    {topHost && sections.length > 0 && createPortal(<SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />, topHost)}
    <div className="rgx-tools">
      <div className="rq-pills rgx-pills" role="group" aria-label="Account status">
        {Object.entries(tabs).map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key}
          onClick={() => { setTab(key); setCursors(['']); }}>{label} <b>{countOf(key)}</b></button>)}
      </div>
      <div className="rgx-right">
        <label className="rgx-check"><input type="checkbox" checked={unassigned} onChange={event => { setUnassigned(event.target.checked); setCursors(['']); }} /> No section yet</label>
        <CoordinatorSearch value={search} onChange={setSearch} label="Search student accounts" placeholder="Find a student" />
      </div>
    </div>
    {actionError && !selected && <p role="alert" className="rgx-alert">{actionError}</p>}
    {error ? <div className="rgx-empty" role="status"><strong>Couldn’t load accounts</strong><span>{error}</span><button type="button" className="rq-btn" onClick={() => setRevision(value => value + 1)}>Try again</button></div>
      : sectionId === undefined ? <div className="rgx-empty"><strong>Select a section</strong><span>Pick a section to see who signed up.</span></div>
      : !data ? <p role="status" className="rgx-loading">Loading student accounts…</p>
      : !data.rows.length ? <div className="rgx-empty"><strong>{term ? 'No matching students' : tab === 'pending' ? 'No one is waiting' : 'No students here'}</strong>
          <span>{term ? 'Try another name or student ID.' : tab === 'pending' ? 'New sign-ups for this section will show up here.' : 'Nothing in this list yet.'}</span>
          {!term && tab === 'pending' && countOf('approved') > 0 && <button type="button" className="rq-btn" onClick={() => { setTab('approved'); setCursors(['']); }}>View approved accounts</button>}</div>
      : <div className="rgx-list">
        {data.rows.map(student => { const name = nameOf(student) || 'Name unavailable';
          return <div key={student.id} className="rgx-row">
            <span className="rgx-av" aria-hidden="true">{initials(student).toUpperCase()}</span>
            <button type="button" className="rgx-who" aria-label={(tab === 'pending' ? 'Review ' : 'Details for ') + (nameOf(student) || student.idNumber || 'student')}
              onClick={event => { opener.current = event.currentTarget; setActionError(''); setSelected(student); }}>
              <strong>{name}</strong>
              <small>{[student.idNumber, unassigned ? 'No section' : selectedSection?.name, tab === 'pending' ? ago(student.createdAt) : null].filter(Boolean).join(' · ')}</small>
            </button>
            {tab === 'pending' ? <div className="rgx-acts">
              <button type="button" className="rq-btn" aria-label={'Turn away ' + name} disabled={saving} onClick={event => { opener.current = event.currentTarget; setActionError(''); setSelected(student); setReject(student); }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>Turn away</button>
              <button type="button" className="rq-btn rq-primary" aria-label={'Approve ' + name} disabled={saving} onClick={() => decide(student, 'approved')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>Approve</button>
            </div> : <b className="lb-chip" data-tone={tab === 'approved' ? 'green' : 'red'}>{student.status === 'inactive' ? 'Inactive' : tabs[tab]}</b>}
          </div>; })}
        <nav className="rgx-foot" aria-label="Student accounts pagination">
          <span role="status">{total ? ((page - 1) * 25 + 1) + '–' + ((page - 1) * 25 + data.rows.length) + ' of ' + total : '0'}</span>
          <div className="rgx-pager">
            <button type="button" className="rq-btn" aria-label="Previous page" disabled={page === 1} onClick={() => setCursors(cursors.slice(0, -1))}>‹</button>
            <span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span>
            <button type="button" className="rq-btn" aria-label="Next page" disabled={!data.nextCursor} onClick={() => setCursors([...cursors, data.nextCursor])}>›</button>
          </div>
        </nav>
      </div>}
    {selected && <PortalFormDialog className="rgx-dialog" closeOnBackdrop
      label="Student account details" onCancel={() => {
        if (saving) return;
        if (reject) setReject(null);
        else closeDetails();
      }}>
      <div className="accounts-drawer-layout">
        <header>
          <h2>{nameOf(selected) || 'Name unavailable'}</h2>
          <button autoFocus type="button" className="plt-x" aria-label="Close" disabled={saving} onClick={() => closeDetails()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
        </header>
        <div className="accounts-drawer-body">
          <dl>
            <div><dt>Student ID</dt><dd>{selected.idNumber || '—'}</dd></div>
            <div><dt>Username</dt><dd>{usernameOf(selected)}</dd></div>
            <div><dt>Section</dt><dd>{unassigned ? 'Unassigned' : selectedSection?.name}</dd></div>
            <div><dt>Department</dt><dd>{selected.department || '—'}</dd></div>
            <div><dt>Account created</dt><dd>{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-PH') : '—'}</dd></div>
          </dl>
          {reject && <p role="status" className="rgx-warn">Reject this student registration? They won’t be able to use the student app until approved.</p>}
          {actionError && <p role="alert">{actionError}</p>}
        </div>
        {tab === 'pending' && <footer>
          {reject ? <>
            <button type="button" className="rq-btn" disabled={saving} onClick={() => setReject(null)}>Cancel</button>
            <button type="button" className="rq-btn rgx-danger" disabled={saving} onClick={() => decide(selected, "rejected")}>Reject registration</button>
          </> : <>
            <button type="button" className="rq-btn" disabled={saving} onClick={() => setReject(selected)}>Reject</button>
            <button type="button" className="rq-btn rq-primary" disabled={saving} onClick={() => decide(selected, "approved")}>Approve</button>
          </>}
        </footer>}
      </div>
    </PortalFormDialog>}
  </div>;
}
