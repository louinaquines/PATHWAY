import { readPortalPage, readMatchingPortalPage } from '../portalRecordPages';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/LogbookTab.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { PortalFormDialog } from '../components/PortalStates';
import DtrReviewDialog from '../components/DtrReviewDialog';
import { collection, getCountFromServer, getDocs, getDocsFromServer, limit, onSnapshot, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import SubmissionNotifications from '../components/SubmissionNotifications';
import JournalKeywordSettings from '../components/JournalKeywordSettings';
import JournalAiAnalysis from '../components/JournalAiAnalysis';
import './LogbookTab.css';
import { downloadStudentRecordsExcel } from '../studentRecordsExport';

const studentDisplayName = student => [student.firstName, student.lastName].filter(Boolean).join(' ').trim();

const rosterDateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
});
const submittedJournalStatuses = new Set(['pending', 'submitted', 'approved', 'rejected']);

function recordDate(value) {
  if (!value) return null;
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

async function latestJournalDate(records, field, isCurrent) {
  // Read past drafts in small pages without downloading a student's journal history.
  const pageSize = 5;
  let cursor;
  while (isCurrent()) {
    const page = await getDocsFromServer(query(records, orderBy(field, 'desc'),
      ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)));
    for (const item of page.docs) {
      const data = item.data();
      if (!submittedJournalStatuses.has(data.status)) continue;
      const date = recordDate(data[field]);
      if (date) return date;
    }
    if (page.docs.length < pageSize) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return null;
}

async function latestRosterRecords(studentId, isCurrent) {
  const attendance = collection(db, 'users', studentId, 'attendance');
  const journals = collection(db, 'users', studentId, 'logbook');
  const [punch, journal] = await Promise.allSettled([
    getDocsFromServer(query(attendance, orderBy('date', 'desc'), limit(1))).then(page => {
      const record = page.docs[0];
      return recordDate(record?.data().date || record?.id);
    }),
    Promise.all([
      latestJournalDate(journals, 'submittedAt', isCurrent),
      latestJournalDate(journals, 'createdAt', isCurrent),
    ]).then(([submitted, created]) => submitted && (!created || submitted > created) ? submitted : created),
  ]);
  return { attendance: dateLabel(punch, 'No attendance'), journals: dateLabel(journal, 'No journal') };
}

function dateLabel(result, empty) {
  if (result.status === 'rejected') return { text: 'Unavailable' };
  return result.value ? { text: rosterDateFormat.format(result.value), dated: true } : { text: empty };
}

const RECORD_PAGE_SIZE = 25;

export default function LogbookTab({ coordinatorId, selectedSection: sharedSection, sections = [], onSectionChange, pendingStudentIds, openJournals = false }) {
  const [rosterPage, setRosterPage] = useState(null);
  const [rosterPaging, setRosterPaging] = useState(null);
  const [rosterRetry, setRosterRetry] = useState(0);
  const [rosterSearch, setRosterSearch] = useState('');
  const [entries, setEntries]                 = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState('');
  const entryRequest = useRef(0);
  const [journalCursors, setJournalCursors] = useState([null]);
  const [nextJournalCursor, setNextJournalCursor] = useState(null);
  const [journalStatus, setJournalStatus] = useState(Array.isArray(pendingStudentIds) ? 'pending' : '');
  const [decisionRevision, setDecisionRevision] = useState(0);
  const journalCursor = journalCursors.at(-1);
  const confirmHost = useRef(null);
  const selectedSection = sharedSection;
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving]                   = useState(false);

  const [searchQuery, setSearchQuery]         = useState('');
  const [rejectConfirm, setRejectConfirm]     = useState(null);
  const [recordView, setRecordView] = useState(openJournals ? 'journals' : 'attendance');
  const [pendingOnly, setPendingOnly] = useState(Array.isArray(pendingStudentIds));
  const [attendance, setAttendance] = useState([]);
  const [attendanceCursors, setAttendanceCursors] = useState([null]);
  const [nextAttendanceCursor, setNextAttendanceCursor] = useState(null);
  const [attendanceRetry, setAttendanceRetry] = useState(0);
  const [attendanceDate, setAttendanceDate] = useState('');
  const attendanceCursor = attendanceCursors.at(-1);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [dtrStudent, setDtrStudent] = useState(null);
  useEffect(() => { setDtrStudent(null); }, [selectedSection?.id, selectedStudent?.id, recordView]);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState('');
  useEffect(() => {
    let active = true; setAnalysis(null); setAnalysisError('');
    if (selectedStudent?.id && recordView === 'journals') adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/review-analysis`)
      .then(data => { if (active) setAnalysis(data); }).catch(failure => { if (active) setAnalysisError(failure.message); });
    return () => { active = false; };
  }, [selectedStudent?.id, decisionRevision, recordView]);
  const exportStudentRecords = async () => {
    if (!selectedStudent || !selectedSection || exporting) return;
    const student = selectedStudent;
    const section = selectedSection;
    setExporting(true);
    setExportError('');
    try {
      const [punches, journals] = await Promise.all([
        getDocs(collection(db, 'users', student.id, 'attendance')),
        getDocs(collection(db, 'users', student.id, 'logbook')),
      ]);
      await downloadStudentRecordsExcel(student, section, punches.docs.map(item => item.data()), journals.docs.map(item => item.data()));
    } catch (_) { setExportError('Could not export student records. Check your connection and try again.'); }
    finally { setExporting(false); }
  };
  useEffect(() => {
    if (!selectedStudent?.id || recordView !== 'attendance') return;
    setAttendanceLoading(true);
    setAttendanceError('');
    setNextAttendanceCursor(null);
    const records = collection(db, 'users', selectedStudent.id, 'attendance');
    const pageQuery = query(records, orderBy('date', 'desc'),
      ...(attendanceDate ? [where('date', '==', attendanceDate)] : []),
      ...(attendanceCursor ? [startAfter(attendanceCursor)] : []), limit(RECORD_PAGE_SIZE + 1));
    return onSnapshot(pageQuery, snapshot => {
      const page = snapshot.docs.slice(0, RECORD_PAGE_SIZE);
      setAttendance(page.map(item => ({ ...item.data(), id: item.id })));
      setNextAttendanceCursor(snapshot.docs.length > RECORD_PAGE_SIZE ? page.at(-1) : null);
      setAttendanceLoading(false);
    }, () => {
      setAttendanceError('Could not load attendance records.');
      setAttendanceLoading(false);
    });
  }, [selectedStudent?.id, recordView, attendanceCursor, attendanceDate, attendanceRetry]);
  const formatPunch = value => {
    if (!value) return 'Not recorded';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const rosterScopeKey = (selectedSection?.id || '') + ':' + pendingOnly + ':' + rosterSearch + ':' + rosterRetry;
  const rosterCursors = rosterPaging?.scope === rosterScopeKey ? rosterPaging.cursors : [null];
  const rosterCursor = rosterCursors.at(-1);
  const currentRoster = rosterPage?.scope === rosterScopeKey && rosterPage.cursor === rosterCursor ? rosterPage : null;
  const [rosterTotal, setRosterTotal] = useState(null);
  const studentCount = rosterTotal?.scope === rosterScopeKey ? rosterTotal.count : null;
  const pageNumber = rosterCursors.length;
  const hasMoreStudents = Boolean(currentRoster?.page?.hasMore);
  const pageTotal = studentCount != null ? Math.max(1, Math.ceil(studentCount / RECORD_PAGE_SIZE)) : null;
  const pageLabel = pageTotal != null
    ? 'Page ' + pageNumber + ' of ' + Math.max(pageTotal, pageNumber + Number(hasMoreStudents))
    : 'Page ' + pageNumber + (hasMoreStudents ? ' of at least ' + (pageNumber + 1) : currentRoster?.page ? ' of ' + pageNumber : '');
  const loading = !!selectedSection && !currentRoster;

  useEffect(() => {
    const timer = setTimeout(() => setRosterSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const sectionId = selectedSection?.id;
    if (!sectionId) return;
    let active = true;
    const scope = [where('role', '==', 'student'), where('sectionId', '==', sectionId)];
    const students = collection(db, 'users');
    const exactId = /^\d{5,24}$/.test(rosterSearch);
    const base = exactId
      ? query(students, ...scope, where('idNumber', '==', rosterSearch))
      : query(students, ...scope, orderBy('firstName'), orderBy('lastName'));
    const pendingIds = new Set(pendingStudentIds);
    const requiresMatching = pendingOnly || (rosterSearch && !exactId);
    if (!requiresMatching && !rosterCursor) {
      getCountFromServer(base).then(snapshot => {
        if (active) setRosterTotal({ scope: rosterScopeKey, count: snapshot.data().count });
      }).catch(() => {});
    }
    const request = requiresMatching
      ? readMatchingPortalPage(base, rosterCursor, RECORD_PAGE_SIZE, student => (
        (!pendingOnly || pendingIds.has(student.id))
        && matchesCoordinatorSearch(rosterSearch, studentDisplayName(student), student.idNumber, selectedSection.name)
      ))
      : readPortalPage(base, rosterCursor, RECORD_PAGE_SIZE);
    request.then(page => {
      if (active) setRosterPage({ scope: rosterScopeKey, cursor: rosterCursor, page });
    }).catch(() => {
      if (active) setRosterPage({ scope: rosterScopeKey, cursor: rosterCursor, error: 'Could not load students.' });
    });
    return () => { active = false; };
  }, [selectedSection?.id, selectedSection?.name, rosterScopeKey, rosterCursor, rosterSearch, pendingOnly, pendingStudentIds]);

  useEffect(() => {
    setSelectedStudent(null);
    setEntries([]);
  }, [selectedSection?.id]);

  const fetchEntries = async (student, { silent = false, isCurrent = () => true } = {}) => {
    const request = ++entryRequest.current;
    const current = () => request === entryRequest.current && isCurrent();
    if (!silent) {
      setEntriesLoading(true);
      setEntriesError('');
    }
    try {
      const records = collection(db, 'users', student.id, 'logbook');
      const snap = await getDocs(query(records, orderBy('createdAt', 'desc'),
        ...(journalStatus ? [where('status', '==', journalStatus)] : []),
        ...(journalCursor ? [startAfter(journalCursor)] : []), limit(RECORD_PAGE_SIZE + 1)));
      if (!current()) return;
      const page = snap.docs.slice(0, RECORD_PAGE_SIZE);
      setEntries(page.map(item => ({ ...item.data(), id: item.id })));
      setNextJournalCursor(snap.docs.length > RECORD_PAGE_SIZE ? page.at(-1) : null);
      setEntriesError('');
    } catch (e) {
      if (current()) setEntriesError('Could not load journal entries.');
    } finally {
      if (request === entryRequest.current) setEntriesLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedStudent || recordView !== 'journals') return;
    fetchEntries(selectedStudent);
    return () => { entryRequest.current++; };
  }, [selectedStudent, recordView, journalStatus, journalCursor]);

  const openRecords = (student, view) => {
    setAttendance([]);
    setAttendanceCursors([null]);
    setAttendanceDate('');
    setNextAttendanceCursor(null);
    setAttendanceError('');
    setAttendanceLoading(view === 'attendance');
    setJournalCursors([null]);
    setNextJournalCursor(null);
    setJournalStatus(pendingOnly ? 'pending' : '');
    setSelectedStudent(student);
    setRecordView(view);
    setEntries([]);
    setExportError('');
    setEntriesLoading(view === 'journals');
  };

  const closeRecords = () => {
    if (saving || rejectConfirm) return;
    entryRequest.current++;
    setSelectedStudent(null);
    setEntries([]);
  };

  usePortalAutoRefresh(async options => {
    if (!selectedSection) return;

    if (options.isCurrent() && selectedStudent && recordView === 'journals') await fetchEntries(selectedStudent, options);
  }, { enabled: !loading && !saving, scope: (sharedSection?.id || '') + ':' + (selectedStudent?.id || '') });

  const handleAction = async (entryId, status) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/logbook/${encodeURIComponent(entryId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setEntries(prev => prev.map(e => e.id === entryId ? {
        ...e, status, reviewReason: status === 'rejected' ? `Please revise and resubmit this ${e.frequency === 'daily' ? 'daily' : 'weekly'} entry.` : '',
      } : e));
      if (journalStatus && journalStatus !== status) await fetchEntries(selectedStudent);
      setDecisionRevision(value => value + 1);
      return true;
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Could not process this logbook review.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const STATUS_BG = {
    pending: COLORS.yellow100,
    approved: COLORS.emerald50,
    rejected: COLORS.rose50,
  };
  const STATUS_BORDER = {
    pending: COLORS.yellow300,
    approved: COLORS.emerald200,
    rejected: COLORS.rose200,
  };
  const STATUS_TEXT = {
    pending: 'Pending Review',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  const visibleStudents = currentRoster?.page?.records || [];
  const visibleStudentIds = JSON.stringify(visibleStudents.map(student => student.id));
  const rosterScope = (selectedSection?.id || '') + ':' + visibleStudentIds;
  const [rosterSummary, setRosterSummary] = useState(null);
  const loadRosterSummary = useCallback(async ({ isCurrent = () => true } = {}) => {
    const ids = JSON.parse(visibleStudentIds);
    const summaries = {};
    for (let i = 0; i < ids.length && isCurrent(); i += 5) {
      await Promise.all(ids.slice(i, i + 5).map(async id => {
        summaries[id] = await latestRosterRecords(id, isCurrent);
      }));
    }
    if (isCurrent()) setRosterSummary({ scope: rosterScope, summaries });
  }, [visibleStudentIds, rosterScope]);

  useEffect(() => {
    let active = true;
    loadRosterSummary({ isCurrent: () => active });
    return () => { active = false; };
  }, [loadRosterSummary]);
  usePortalAutoRefresh(loadRosterSummary, {
    enabled: !loading && rosterSummary?.scope === rosterScope,
    scope: rosterScope, intervalMs: 60000,
  });



  return (
    <div className="logbook-workspace logbook-table-page">
      <section className="logbook-roster" aria-label="Student roster">
        <div className="logbook-roster-toolbar">
          <label className="logbook-section-field"><span>Section</span>
            <select aria-label="Current section" disabled={!sections.length} value={sharedSection?.id || ''}
              onChange={event => { const section = sections.find(item => item.id === event.target.value); if (section) onSectionChange?.(section); }}>
              {!sections.length && <option value="">No sections assigned to you</option>}
              {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search students" placeholder="Search name or ID" />
          <SubmissionNotifications kind="logbook" coordinatorId={coordinatorId} section={selectedSection}
            onOpen={student => openRecords(student, 'journals')} />
        </div>
        {pendingOnly && <div className="logbook-pending-filter"><span>Journals awaiting review</span>
          <button type="button" className="portal-secondary" onClick={() => setPendingOnly(false)}>Show all students</button>
        </div>}
        {!selectedSection ? <p className="logbook-table-empty">Choose a section to see its students.</p> : <>
          {loading && <p role="status">Loading students…</p>}
          {currentRoster?.error && <p role="alert">{currentRoster.error} <button type="button" className="portal-secondary"
            onClick={() => setRosterRetry(value => value + 1)}>Retry</button></p>}
          <div className="logbook-roster-scroll">
            <table aria-label={'Students in ' + (selectedSection.name || 'this section')}>
              <thead><tr><th scope="col">Student ID</th><th scope="col">Student name</th><th scope="col">Attendance</th><th scope="col">Journals</th></tr></thead>
              <tbody>{visibleStudents.map(student => {
                const name = studentDisplayName(student) || 'Student';
                const summary = rosterSummary?.scope === rosterScope ? rosterSummary.summaries[student.id] : null;
                return <tr key={student.id}>
                  <td>{student.idNumber || '—'}</td>
                  <th scope="row">{name}</th>
                  <td><button type="button" aria-label={'View attendance for ' + name + (summary?.attendance.dated ? ', ' + summary.attendance.text : '')} onClick={() => openRecords(student, 'attendance')}><span>{summary?.attendance.text || 'Loading…'}</span><Icon name="chevronRight" size={14} /></button></td>
                  <td><button type="button" aria-label={'View journal for ' + name + (summary?.journals.dated ? ', ' + summary.journals.text : '')} onClick={() => openRecords(student, 'journals')}><span>{summary?.journals.text || 'Loading…'}</span><Icon name="chevronRight" size={14} /></button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!loading && !currentRoster?.error && !visibleStudents.length && <p className="logbook-table-empty">{currentRoster?.page?.hasMore ? 'No matches in this window. Choose Next to continue searching.' : 'No students match this view.'}</p>}
          {(currentRoster?.page || pageNumber > 1) && <footer className="logbook-roster-footer">
            <span aria-live="polite">{studentCount != null && visibleStudents.length
              ? ((pageNumber - 1) * RECORD_PAGE_SIZE + 1) + '–' + ((pageNumber - 1) * RECORD_PAGE_SIZE + visibleStudents.length) + ' of ' + studentCount + ' students'
              : visibleStudents.length + (visibleStudents.length === 1 ? ' student on this page' : ' students on this page')}</span>
            <nav aria-label="Students pagination">
              <button type="button" className="portal-secondary" aria-label="Previous page" disabled={pageNumber === 1}
                onClick={() => setRosterPaging({ scope: rosterScopeKey, cursors: rosterCursors.slice(0, -1) })}><Icon name="chevronLeft" size={16} /></button>
              <span aria-live="polite">{pageLabel}</span>
              <button type="button" className="portal-secondary" aria-label="Next page" disabled={!hasMoreStudents}
                onClick={() => setRosterPaging({ scope: rosterScopeKey, cursors: [...rosterCursors, currentRoster.page.cursor] })}><Icon name="chevronRight" size={16} /></button>
            </nav>
          </footer>}
        </>}
      </section>
      {selectedStudent && <PortalFormDialog className="logbook-record-drawer" label={`Records for ${[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(' ') || 'student'}`} onCancel={closeRecords} closeOnBackdrop>
        <header className="logbook-drawer-heading">
          <div className="logbook-drawer-title-row">
            <div><h2>{[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(' ') || 'Student'}</h2>
              <p>{[selectedStudent.idNumber, selectedSection?.name].filter(Boolean).join(' · ')}</p></div>
            <button type="button" className="portal-secondary logbook-drawer-close" aria-label="Close records" title="Close records" disabled={saving} onClick={closeRecords}><Icon name="x" size={19} /></button>
          </div>
          <div className="logbook-drawer-toolbar">
            <div className="logbook-drawer-tabs" role="group" aria-label="Student record type">
              <button type="button" aria-pressed={recordView === 'attendance'} onClick={() => setRecordView('attendance')}>Attendance</button>
              <button type="button" aria-pressed={recordView === 'journals'} onClick={() => setRecordView('journals')}>Journals</button>
            </div>

          </div>
        </header>
        <div className="logbook-detail-content" style={t.entriesScroll}>
          <div className="logbook-record-controls">
            {recordView === 'attendance' ? <label>Attendance date <input type="date" value={attendanceDate} onChange={event => {
                setAttendanceLoading(true);
                setAttendanceDate(event.target.value);
                setAttendanceCursors([null]);
              }} /></label> : <label>Journal status <select value={journalStatus} disabled={saving} onChange={event => {
            setEntriesLoading(true);
            setJournalStatus(event.target.value);
            setJournalCursors([null]);
          }}>
            <option value="">All statuses</option>
            <option value="pending">Awaiting review</option>
            <option value="approved">Approved</option>
            <option value="rejected">Changes requested</option>
          </select></label>}
            <div className="logbook-record-actions">
              {recordView === 'attendance' && <button type="button" className="portal-secondary" onClick={() => setDtrStudent(selectedStudent)}>Compare Form 48</button>}
            <button type="button" className="portal-secondary logbook-drawer-download" aria-label="Export student records (Excel)"
              disabled={exporting} onClick={exportStudentRecords} aria-busy={exporting}>
              <Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            </div>
          </div>
          {exportError && <p role="alert">{exportError}</p>}
          {selectedStudent && recordView === 'attendance' && <section className="coordinator-attendance" aria-label="Attendance records">
            <p className="logbook-time-note">Times shown in Philippine time.</p>
            {dtrStudent && <DtrReviewDialog key={dtrStudent.id} student={dtrStudent} onClose={() => setDtrStudent(null)} />}
            {attendanceLoading && <p role="status">Loading attendance…</p>}
            {attendanceError && <p role="alert">{attendanceError} <button type="button" className="portal-secondary" onClick={() => setAttendanceRetry(value => value + 1)}>Retry</button></p>}
            {!attendanceLoading && !attendanceError && attendance.length === 0 && attendanceCursors.length === 1 && <div className="logbook-record-empty"><Icon name="clock" size={18} /><p>{attendanceDate ? 'No attendance records for this date.' : 'No attendance records yet.'}</p></div>}
            {!attendanceLoading && !attendanceError && (attendance.length > 0 || attendanceCursors.length > 1) && <div className="attendance-table-wrap">{(attendanceCursors.length > 1 || nextAttendanceCursor) && <nav className="portal-record-pagination" aria-label="Attendance records pagination">
              <button type="button" className="portal-secondary" disabled={attendanceCursors.length === 1} onClick={() => { setAttendanceLoading(true); setAttendanceCursors(cursors => cursors.slice(0, -1)); }}>Previous</button>
              <span>Page {attendanceCursors.length}</span>
              <button type="button" className="portal-secondary" disabled={!nextAttendanceCursor} onClick={() => { setAttendanceLoading(true); setAttendanceCursors(cursors => [...cursors, nextAttendanceCursor]); }}>Next</button>
            </nav>}<table><thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th>Hours</th></tr></thead><tbody>{attendance.map(record => <tr key={record.id}><td>{record.date || record.id}</td><td>{formatPunch(record.timeIn)}</td><td>{formatPunch(record.timeOut)}</td><td>{record.timeOut ? Number(record.hoursToday || 0).toFixed(2) : 'In progress'}</td></tr>)}</tbody></table></div>}
          </section>}
          {selectedStudent && recordView === 'journals' && analysis && <JournalKeywordSettings sectionId={selectedSection.id} keywords={analysis.keywords} onSaved={async () => {
            try { setAnalysis(await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/review-analysis`)); }
            catch (failure) { setAnalysisError(failure.message); }
          }} />}
          {selectedStudent && recordView === 'journals' && analysis?.missingWeeksBetweenSubmissions?.length > 0 && <aside className="journal-check-settings"><strong>Weeks without a journal entry</strong><p>No entry found between submitted weeks for: {analysis.missingWeeksBetweenSubmissions.join(', ')}. Confirm the reporting schedule before requesting revisions.</p>{analysis.truncated && <p>Only the latest 100 entries were checked.</p>}</aside>}

          {recordView === 'journals' && entriesLoading && <PageSkeleton label="Loading journal entries" />}
          {recordView === 'journals' && entriesError && <p role="alert">{entriesError} <button type="button" className="portal-secondary" onClick={() => fetchEntries(selectedStudent)}>Retry</button></p>}
          {recordView === 'journals' && !entriesLoading && !entriesError && entries.length === 0 && (
            <div className="logbook-record-empty">
              <Icon name="book" size={18} />
              <p>{journalStatus ? 'No journals match this status.' : 'No journals submitted yet.'}</p>
            </div>
          )}

          <div style={t.entriesList} hidden={recordView !== 'journals' || entriesLoading || !!entriesError}>
            {(journalCursors.length > 1 || nextJournalCursor) && <nav className="portal-record-pagination" aria-label="Journal entries pagination">
              <button type="button" className="portal-secondary" disabled={saving || journalCursors.length === 1} onClick={() => { setEntriesLoading(true); setJournalCursors(cursors => cursors.slice(0, -1)); }}>Previous</button>
              <span>Page {journalCursors.length}</span>
              <button type="button" className="portal-secondary" disabled={saving || !nextJournalCursor} onClick={() => { setEntriesLoading(true); setJournalCursors(cursors => [...cursors, nextJournalCursor]); }}>Next</button>
            </nav>}
            {entries.map(entry => (
            <div className="logbook-entry-card" key={entry.id} style={t.entryCard}>
              <div style={t.entryTop}>
                <div>
                  <div style={t.entryWeek}>{entry.frequency === 'daily' ? `Daily journal · ${entry.periodStart}` : entry.frequency === 'weekly' ? 'Weekly journal' : `Week ${entry.weekNum}`}</div>
                  <div style={t.entrySub}>
                    <span><Icon name="calendar" size={14} /> {entry.frequency === 'daily' ? entry.periodStart : entry.weekRange || 'Weekly period'}</span><span><strong>{entry.hours} hrs rendered</strong></span>
                  </div>
                </div>
                <span style={{
                  ...t.badge,
                  backgroundColor: STATUS_BG[entry.status] || COLORS.slate100,
                  color: '#000000',
                  border: `1px solid ${STATUS_BORDER[entry.status] || COLORS.slate300}`,
                }}>
                  {Object.hasOwn(STATUS_TEXT, entry.status) ? STATUS_TEXT[entry.status] : 'Status unavailable'}
                </span>
              </div>

              <div style={t.entryLabel}>{entry.frequency === 'daily' ? 'Daily report' : 'Weekly report'}</div>
              <div style={t.entryText}>{entry.refined || entry.rawNotes || 'No journal text.'}</div>
              <JournalAiAnalysis key={`${selectedStudent.id}:${entry.id}`} studentId={selectedStudent.id} entryId={entry.id} sourceText={entry.rawNotes || entry.refined} hours={entry.hours} weekRange={entry.weekRange} />
              {analysisError && <p role="alert">Review checks unavailable: {analysisError}</p>}
              {analysis?.journals?.filter(item => item.id === entry.id).map(item => <details key={item.id}><summary>Automatic journal checks</summary>
                {item.findings.map(finding => <p key={finding}>{finding}</p>)}
                {!item.findings.length && <p>No structural warnings found. This is not an approval.</p>}
                {item.competencies.map(skill => <p key={skill.name}>{skill.name}: matched words {skill.evidence.join(', ')}</p>)}
                {item.sentimentCues.length > 0 && <p>Text cues: {item.sentimentCues.join(', ')}</p>}
                <p>{item.limitation}</p>{analysis.truncated && <p>Checks cover the latest 100 entries only.</p>}
              </details>)}

              {entry.status === 'rejected' && entry.reviewReason && <p className="logbook-feedback"><strong>Changes requested</strong><span>{entry.reviewReason}</span></p>}

              {entry.status === 'pending' && (
                <div style={t.actionRow}>
                  <button
                    style={t.approveBtn}
                    disabled={saving}
                    onClick={() => handleAction(entry.id, 'approved')}
                  >
                    Approve Entry
                  </button>
                  <button
                    style={t.rejectBtn}
                    disabled={saving}
                    onClick={() => setRejectConfirm(entry)}
                  >
                    Reject Entry
                  </button>
                </div>
              )}
            </div>
            ))}
          </div>
        </div>
        <div ref={confirmHost} />
        <AlertDialog
        portalTarget={confirmHost.current || undefined}
        open={Boolean(rejectConfirm)}
        title="Reject this logbook entry?"
        description="The student will be notified and can revise and resubmit this journal entry."
        confirmLabel="Reject entry"
        busy={saving}
        onCancel={() => setRejectConfirm(null)}
        onConfirm={async () => {
          const saved = await handleAction(rejectConfirm.id, 'rejected');
          if (saved) setRejectConfirm(null);
        }}
        />
      </PortalFormDialog>}
    </div>
  );
}

const t = {
  entriesList: {
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    width: '100%',
    boxSizing: 'border-box',
  },
  entriesScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    backgroundColor: COLORS.white,
  },
  entryCard: {
    padding: 20,
    backgroundColor: COLORS.slate50,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
  },
  entryTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  entryWeek: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
  },
  entrySub: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  badge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
  },
  entryLabel: {
    fontSize: 10,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.08em',
    marginBottom: 6,
  },
  entryText: {
    fontSize: 14,
    color: '#000000',
    lineHeight: 1.65,
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
  },
  actionRow: {
    display: 'flex',
    gap: 10,
    marginTop: 16,
  },
  approveBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '8px 18px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  rejectBtn: {
    backgroundColor: COLORS.rose50,
    color: '#000000',
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.md,
    padding: '8px 16px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
  },
};
