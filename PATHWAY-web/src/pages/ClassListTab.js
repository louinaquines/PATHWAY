import { compareStudents, studentName } from '../coordinatorStudentSort';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/ClassListTab.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import { adminRequest } from '../adminApi';
import './CoordinatorRecords.css';
import './RequirementsRedesign.css';
import './ClassListRedesign.css';
import Pager from '../components/Pager';
import { UnassignedStudents } from './SectionsTab';

export default function ClassListTab({ department, coordinatorId, selectedSection, onBusyChange, onClose, initialTab }) {
  const [tab, setTab] = useState(initialTab || null);
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState('');
  const [drag, setDrag] = useState(false);
  const [sections, setSections] = useState([]);
  const confirmHost = useRef(null);
  const loadVersion = useRef(0);

  const [sectionId, setSectionId] = useState(selectedSection?.id || '');
  const [outcomes, setOutcomes] = useState([]);
  const [resetResult, setResetResult] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [ids, setIds]         = useState([]);
  const [input, setInput]     = useState('');
  const [student, setStudent] = useState({ idNumber: '', firstName: '', lastName: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  useEffect(() => { onBusyChange?.(saving); }, [saving, onBusyChange]);
  const [message, setMessage] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);

  const loadIds = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    const version = ++loadVersion.current;
    if (!department || !sectionId) { setIds([]); setLoading(false); return; }

    if (!silent) setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'studentRoster'),
        where('department', '==', department),
        where('sectionId', '==', sectionId),
        where('active', '==', true)
      ));
      const roster = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const profiles = roster.some(item => !studentName(item)) ? await getDocs(query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('department', '==', department),
        where('sectionId', '==', sectionId)
      )).catch(() => null) : null;
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      const names = new Map(profiles?.docs.map(doc => [String(doc.data().idNumber), studentName(doc.data())]));
      setIds(roster.map(item => ({ ...item, name: studentName(item) || names.get(item.id) })).sort(compareStudents));
    } catch (e) {
      if (!isRefreshCurrent()) return;
      console.error(e);
      setMessage('Could not load the authorized class list.');
    } finally {
      if (version === loadVersion.current && isRefreshCurrent()) setLoading(false);
    }
  }, [department, sectionId]);

  usePortalAutoRefresh(loadIds, { enabled: !loading && !saving, scope: sectionId || '', protectInputs: true, intervalMs: 60000 });

  useEffect(() => {
    loadIds();
  }, [department, loadIds]);

  useEffect(() => {
    getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)))
      .then(snap => setSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setMessage('Could not load your assigned sections.'));
  }, [coordinatorId]);

  const addIds = async (manual = false) => {
    if (saving) return;
    const students = manual ? [{ ...Object.fromEntries(Object.entries(student).map(([key, value]) => [key, value.trim()])), extra: [] }] : input.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [idNumber, firstName, lastName, ...extra] = line.split(',').map(v => v.trim());
      return { idNumber, firstName, lastName, extra };
    }).filter(row => row.idNumber.toLowerCase() !== 'studentid');
    if (!sectionId || !students.length || students.some(row => !row.idNumber || !row.firstName || !row.lastName || row.extra.length)) {
      setMessage(manual ? 'Select a section and enter the student ID, first name, and last name.' : 'Select a section and upload a CSV with StudentID,FirstName,LastName columns. Commas inside CSV names are not supported.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const result = await adminRequest('/coordinator/provision-students', {
        method: 'POST', body: JSON.stringify({ sectionId, students: students.map(({ extra, ...row }) => row) }),
      });
      setOutcomes(result.outcomes);
      if (result.outcomes.every(row => row.status !== 'failed')) {
        if (manual) setStudent({ idNumber: '', firstName: '', lastName: '' });
        else setInput('');
      }
      setMessage(`Import finished: ${result.outcomes.filter(row => row.status === 'created').length} created, ${result.outcomes.filter(row => row.status === 'unchanged').length} unchanged, ${result.outcomes.filter(row => row.status === 'failed').length} failed.`);
      await loadIds();
    } catch (e) {
      console.error(e);
      setMessage(e.message || 'Could not provision student accounts. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeId = async (id) => {
    setSaving(true);
    setMessage('');
    try {
      await adminRequest(`/coordinator/student-roster/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setIds(prev => prev.filter(item => item.id !== id));
      setMessage(`Removed student ID ${id}.`);
    } catch (e) {
      console.error(e);
      setMessage('Could not remove that ID.');
    } finally {
      setSaving(false);
    }
  };

  const filteredIds = ids.filter(item => matchesCoordinatorSearch(filterQuery, item.id, studentName(item)));

  const recordsPage = useRecordPage(filteredIds, sectionId + ':' + filterQuery);
  if (loading) {
    return <PageSkeleton label="Loading authorized roster" variant="table" />;
  }

  const activeTab = tab || (ids.length ? 'students' : 'add');
  const pages = Math.max(1, Math.ceil(filteredIds.length / 10)); const cur = Math.min(page, pages);
  const rows = filteredIds.slice((cur - 1) * 10, cur * 10);
  const sectionName = sections.find(x => x.id === sectionId)?.name || selectedSection?.name || '';
  const readFile = async file => {
    if (!file) return;
    if (file.size > 100000) { setMessage('Class list must be under 100 KB.'); return; }
    try { setInput((await file.text()).replace(/^﻿/, '')); setMessage(''); } catch { setMessage('Could not read the class list.'); }
  };
  const csvRows = input.trim() ? input.trim().split(/\r?\n/).filter(Boolean).filter(l => !/^\s*studentid/i.test(l)) : [];
  const existing = new Set(ids.map(x => String(x.id)));
  const csvNew = csvRows.filter(l => !existing.has(l.split(',')[0].trim())).length;
  const template = 'data:text/csv;charset=utf-8,' + encodeURIComponent('StudentID,FirstName,LastName\n24228132,Juan,Dela Cruz\n');
  return (
    <div className="cls" onClick={() => menuId && setMenuId('')}>
      <header className="cls-head">
        <div className="cls-title"><div><h2>Class list & accounts</h2><label className="cls-secpick"><select aria-label="Assigned section" value={sectionId} onChange={e => { setSectionId(e.target.value); setIds([]); setFilterQuery(''); setOutcomes([]); setResetResult(null); }} disabled={saving}>{!sectionId && <option value="">Select section</option>}{sections.length ? sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>) : sectionName && <option value={sectionId}>{sectionName}</option>}</select><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></label></div>
          {onClose && <button type="button" className="plt-x" aria-label="Close" disabled={saving} onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>}</div>
        <div className="cls-tabs" role="tablist" aria-label="Class list">
          <button type="button" role="tab" aria-selected={activeTab === 'students'} onClick={() => setTab('students')}>Students <b>{ids.length}</b></button>
          <button type="button" role="tab" aria-selected={activeTab === 'add'} onClick={() => setTab('add')}>Add students</button>
        </div>
      </header>
      <div className="cls-body">
        {message && <p role="status" className="cls-msg" data-bad={/could not|enter|must|select/i.test(message) || undefined}>{message}</p>}
        {resetResult && <div role="status" className="cls-pass"><span>Temporary password for <b>{resetResult.id}</b>: <code>{resetResult.password}</code><small>Give it privately after checking their identity.</small></span><button type="button" className="rq-btn" onClick={() => setResetResult(null)}>Done</button></div>}
        <section hidden={activeTab !== 'students'} className="cls-panel">
          {ids.length > 0 && <CoordinatorSearch value={filterQuery} onChange={v => { setFilterQuery(v); setPage(1); }} placeholder="Find a student" label="Search authorized students" />}
          {ids.length === 0 ? <div className="cls-empty"><strong>No students yet</strong><span>{sectionId ? 'Use Add students to create their accounts.' : 'Choose a section first.'}</span>{sectionId && <button type="button" className="rq-btn rq-primary" onClick={() => setTab('add')}>Add students</button>}</div>
          : <div className="cls-table" role="table" aria-label="Authorized students">
              <div className="cls-row cls-rowhead" role="row"><span role="columnheader">Student ID</span><span role="columnheader">Name</span><span role="columnheader">Username</span><span role="columnheader">Added</span><span role="columnheader" aria-label="Actions" /></div>
              {filteredIds.length === 0 && <p className="cls-none">No matching students.</p>}
              {rows.map(item => <div key={item.id} className="cls-row" role="row">
                <span role="cell" className="cls-id">{item.id}</span>
                <span role="cell" className="cls-name">{studentName(item) || '—'}</span>
                <span role="cell" className="cls-user">{item.claimedBy?.startsWith('roster-') ? `uclm-${item.id.toLowerCase()}` : 'Not signed up yet'}</span>
                <span role="cell" className="cls-date">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                <span role="cell" className="cls-menuwrap" onClick={e => e.stopPropagation()}>
                  <button type="button" className="cls-more" aria-label={`Actions for ${item.id}`} aria-expanded={menuId === item.id} onClick={() => setMenuId(menuId === item.id ? '' : item.id)}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></button>
                  {menuId === item.id && <span className="cls-menu" role="menu">
                    {item.claimedBy && <button type="button" role="menuitem" disabled={saving} onClick={() => { setMenuId(''); setResetResult(null); setResetConfirm(item); }}>Reset password</button>}
                    <button type="button" role="menuitem" className="cls-danger" disabled={saving} onClick={() => { setMenuId(''); setRemoveConfirm(item); }}>Remove from list</button>
                  </span>}
                </span>
              </div>)}
            </div>}
          {filteredIds.length > 10 && <div className="cls-foot"><span>{(cur - 1) * 10 + 1}–{Math.min(cur * 10, filteredIds.length)} of {filteredIds.length}</span><Pager page={cur} pages={pages} onGo={setPage} label="Roster students" /></div>}
        </section>
        <section hidden={activeTab !== 'add'} className="cls-panel">
          <div className="cls-card">
            <h3>Add one student</h3>
            <div className="cls-fields">
              {[['idNumber', 'Student ID', 'e.g. 24228132'], ['firstName', 'First name', 'Juan'], ['lastName', 'Last name', 'Dela Cruz']].map(([key, label, placeholder]) =>
                <label key={key}>{label}<input type="text" value={student[key]} placeholder={placeholder} disabled={saving} onChange={e => setStudent(previous => ({ ...previous, [key]: e.target.value }))} /></label>)}
            </div>
            <div className="cls-cardfoot"><small>Their first password is <code>UC@</code> + their student ID. They change it when they first sign in.</small>
              <button type="button" className="rq-btn rq-primary" onClick={() => addIds(true)} disabled={saving || !sectionId || Object.values(student).some(value => !value.trim())}>{saving ? 'Creating…' : 'Create student account'}</button></div>
          </div>
          <div className="cls-card">
            <h2 className="cls-h">Import class list</h2>
            <label className="cls-drop" data-drag={drag || undefined} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files?.[0]); }}>
              <input type="file" title="" accept=".csv,text/csv" disabled={saving} aria-label="Upload authorized class list" onChange={e => readFile(e.target.files?.[0])} />
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
              <span>{input ? <><b>{csvRows.length} students in this file</b> · {csvNew} new, {csvRows.length - csvNew} already on the list</> : <>Drop your CSV here, or <u>choose a file</u></>}</span>
              <small>Columns: StudentID, FirstName, LastName</small>
            </label>
            <div className="cls-cardfoot"><a href={template} download="pathway-class-list-template.csv">Download template</a>
              {input && <button type="button" className="rq-btn" disabled={saving} onClick={() => setInput('')}>Clear</button>}
              <button type="button" className="rq-btn rq-primary" onClick={() => addIds(false)} disabled={saving || !sectionId || !input.trim()}>{saving ? 'Creating…' : csvNew ? `Create ${csvNew} account${csvNew === 1 ? '' : 's'}` : 'Import CSV'}</button></div>
            {outcomes.some(row => row.status === 'created') && <p className="cls-note" role="status">New accounts sign in with <code>UC@</code> + their student ID, then must change it.</p>}
            {outcomes.length > 0 && <ul className="cls-results" aria-label="Import results">{outcomes.map(row => <li key={row.idNumber} data-status={row.status}><b>{row.idNumber}</b><span>{row.status}</span><small>{row.error || row.username}</small></li>)}</ul>}
          </div>
          {sectionId && <div className="cls-card"><h3>Students already in your department</h3><p className="cls-sub">They have an account but no section yet.</p>
            <UnassignedStudents sectionId={sectionId} department={department} onAssign={() => loadIds()} /></div>}
        </section>
      </div>
      <div ref={confirmHost} />
      <AlertDialog portalTarget={confirmHost.current || undefined}
        open={Boolean(resetConfirm)} title="Verify identity before resetting password"
        description={resetConfirm ? 'Confirm that you verified the identity of student ' + resetConfirm.id + '. Existing sessions will be revoked and a password change will be required.' : ''}
        confirmLabel="Identity verified — reset" busy={saving} onCancel={() => setResetConfirm(null)}
        onConfirm={async () => {
          setSaving(true);
          try {
            const result = await adminRequest(`/coordinator/students/${encodeURIComponent(resetConfirm.claimedBy)}/reset-password`, { method: 'POST', body: JSON.stringify({ identityVerified: true }) });
            setResetResult({ id: resetConfirm.id, password: result.temporaryPassword }); setResetConfirm(null);
          } catch (e) { setMessage(e.message); }
          finally { setSaving(false); }
        }}
      />
      <AlertDialog
        open={Boolean(removeConfirm)}
        title="Remove authorized student ID?"
        description={removeConfirm ? `Student ID ${removeConfirm.id} will be marked inactive in the roster. This does not delete or suspend an existing student account.` : ''}
        confirmLabel="Remove ID"
        busy={saving}
        onCancel={() => setRemoveConfirm(null)}
        onConfirm={async () => { await removeId(removeConfirm.id); setRemoveConfirm(null); }}
      />
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
    maxWidth: 900,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    margin: '0 0 6px',
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
  },
  help: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: 580,
  },
  deptBadge: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    fontSize: 12,
    fontWeight: 800,
    padding: '4px 12px',
    borderRadius: THEME.radius.full,
  },
  inputSection: {
    marginTop: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: 12,
    fontSize: 13,
    fontFamily: THEME.fonts.mono,
    color: '#000000',
    resize: 'vertical',
  },
  formActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  addButton: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  successText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
  },
  errorText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
  },
  countText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#000000',
  },
  searchInput: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '7px 12px',
    fontSize: 13,
    width: 200,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  tableContainer: {
    overflowX: 'auto',
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    textAlign: 'left',
  },
  th: {
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  tr: {
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  td: {
    padding: '11px 14px',
    color: '#000000',
  },
  idCode: {
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.yellow100,
    padding: '2px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow300}`,
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
  },
  removeBtn: {
    color: '#000000',
    backgroundColor: COLORS.rose50,
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.sm,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  emptyState: {
    padding: 36,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    margin: 0,
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 12,
    color: '#000000',
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
