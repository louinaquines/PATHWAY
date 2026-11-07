import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/LogbookTab.js
import { useEffect, useRef, useState } from 'react';
import { PortalFormDialog } from '../components/PortalStates';
import DtrReviewDialog from '../components/DtrReviewDialog';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
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

export default function LogbookTab({ coordinatorId, selectedSection: sharedSection, sections = [], onSectionChange, pendingStudentIds, openJournals = false }) {
  const [students, setStudents]               = useState([]);
  const [entries, setEntries]                 = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState('');
  const entryRequest = useRef(0);
  const confirmHost = useRef(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving]                   = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [searchQuery, setSearchQuery]         = useState('');
  const [rejectConfirm, setRejectConfirm]     = useState(null);
  const [recordView, setRecordView] = useState(openJournals ? 'journals' : 'attendance');
  const [pendingOnly, setPendingOnly] = useState(Array.isArray(pendingStudentIds));
  const [attendance, setAttendance] = useState([]);
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
  }, [selectedStudent?.id, entries, recordView]);
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
    setAttendance([]);
    setAttendanceError('');
    if (!selectedStudent?.id) { setAttendanceLoading(false); return; }
    setAttendanceLoading(true);
    return onSnapshot(collection(db, 'users', selectedStudent.id, 'attendance'), snapshot => {
      setAttendance(snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
      setAttendanceLoading(false);
    }, () => {
      setAttendanceError('Could not load attendance records. Select the student again to retry.');
      setAttendanceLoading(false);
    });
  }, [selectedStudent?.id]);
  const formatPunch = value => {
    if (!value) return 'Not recorded';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' });
  };

  const fetchStudents = async (section, { silent = false, isCurrent = () => true } = {}) => {
    if (!silent) { setSelectedSection(section); setLoading(true); setSelectedStudent(null); setEntries([]); }
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)));
      if (!isCurrent()) return;
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sharedSection) fetchStudents(sharedSection);
    else {
      setLoading(false);
      setSelectedSection(null);
      setStudents([]);
      setSelectedStudent(null);
      setEntries([]);
    }
    // The section selector intentionally reloads the selected section's students.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSection?.id]);

  const fetchEntries = async (student, { silent = false, isCurrent = () => true } = {}) => {
    const request = ++entryRequest.current;
    const current = () => request === entryRequest.current && isCurrent();
    if (!silent) {
      setEntriesLoading(true);
      setEntriesError('');
    }
    try {
      const snap = await getDocs(collection(db, 'users', student.id, 'logbook'));
      if (!current()) return;
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(b.periodStart || b.createdAt || '').localeCompare(String(a.periodStart || a.createdAt || '')));
      setEntries(sorted);
      setEntriesError('');
    } catch (e) {
      if (current()) setEntriesError('Could not load journal entries.');
    } finally {
      if (request === entryRequest.current) setEntriesLoading(false);
    }
  };

  const openRecords = (student, view) => {
    setSelectedStudent(student);
    setRecordView(view);
    setEntries([]);
    setExportError('');
    fetchEntries(student);
  };

  const closeRecords = () => {
    if (saving || rejectConfirm) return;
    entryRequest.current++;
    setSelectedStudent(null);
    setEntries([]);
  };

  usePortalAutoRefresh(async options => {
    if (!selectedSection) return;
    await fetchStudents(selectedSection, options);
    if (options.isCurrent() && selectedStudent) await fetchEntries(selectedStudent, options);
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
  const pendingIds = new Set(pendingStudentIds);
  const filteredStudents = students.filter(student => (!pendingOnly || pendingIds.has(student.id)) && matchesCoordinatorSearch(searchQuery, student.firstName, student.lastName, student.idNumber, selectedSection?.name));

  const studentsPage = useRecordPage(filteredStudents, (selectedSection?.id || '') + ':' + searchQuery);
  const visibleEntries = pendingOnly ? entries.filter(entry => entry.status === 'pending') : entries;
  const entriesPage = useRecordPage(visibleEntries, (selectedStudent?.id || '') + ':' + pendingOnly);
  const attendancePage = useRecordPage(attendance, selectedStudent?.id || '');
  if (loading) {
    return <PageSkeleton label="Loading logbook data" variant="three-column" />;
  }

  return (
    <div className="logbook-workspace logbook-table-page">
      <section className="logbook-roster" aria-label="Student roster">
        <div className="logbook-roster-toolbar">
          <label className="logbook-section-field"><span>Section</span>
            <select aria-label="Current section" disabled={!sections.length} value={sharedSection?.id || ''}
              onChange={event => { const section = sections.find(item => item.id === event.target.value); if (section) onSectionChange?.(section); }}>
              {!sections.length && <option value="">No assigned sections</option>}
              {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search students" placeholder="Search name or ID" />
          <SubmissionNotifications kind="logbook" coordinatorId={coordinatorId} section={selectedSection}
            onOpen={student => openRecords(student, 'journals')} />
        </div>
        {pendingOnly && <div className="logbook-pending-filter"><span>Pending journals</span>
          <button type="button" className="portal-secondary" onClick={() => setPendingOnly(false)}>Show all students</button>
        </div>}
        {!selectedSection ? <p className="logbook-table-empty">Choose a section to see its students.</p> : <>
          <RecordPagination pagination={studentsPage} label="Students" />
          <div className="logbook-roster-scroll">
            <table aria-label={'Students in ' + (selectedSection.name || 'this section')}>
              <thead><tr><th scope="col">Student</th><th scope="col">Student ID</th><th scope="col">Attendance</th><th scope="col">Journal</th></tr></thead>
              <tbody>{studentsPage.items.map(student => {
                const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Student';
                return <tr key={student.id}>
                  <th scope="row">{name}</th>
                  <td>{student.idNumber || '—'}</td>
                  <td><button type="button" aria-label={'View attendance for ' + name} onClick={() => openRecords(student, 'attendance')}>View <Icon name="chevronRight" size={14} /></button></td>
                  <td><button type="button" aria-label={'View journal for ' + name} onClick={() => openRecords(student, 'journals')}>View <Icon name="chevronRight" size={14} /></button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          {!filteredStudents.length && <p className="logbook-table-empty">{pendingOnly ? 'No students with pending journals match this view.' : 'No students match this view.'}</p>}
        </>}
      </section>
      {selectedStudent && <PortalFormDialog className="logbook-record-drawer" label={`Records for ${[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(' ') || 'student'}`} onCancel={closeRecords}>
        <header className="logbook-drawer-heading">
          <div className="logbook-drawer-title-row">
            <div><h2>{[selectedStudent.firstName, selectedStudent.lastName].filter(Boolean).join(' ') || 'Student'}</h2>
              <p>{[selectedStudent.idNumber, selectedSection?.name].filter(Boolean).join(' · ')}</p></div>
            <button type="button" className="portal-secondary" aria-label="Close records" disabled={saving} onClick={closeRecords}>Close</button>
          </div>
          <div className="logbook-drawer-toolbar">
            <div className="logbook-drawer-tabs" role="group" aria-label="Student record type">
              <button type="button" aria-pressed={recordView === 'attendance'} onClick={() => setRecordView('attendance')}>Attendance <span>{attendanceLoading ? '–' : attendance.length}</span></button>
              <button type="button" aria-pressed={recordView === 'journals'} onClick={() => setRecordView('journals')}>Journals <span>{entriesLoading ? '–' : entries.length}</span></button>
            </div>
            <button type="button" className="portal-secondary logbook-drawer-download" aria-label="Export student records (Excel)"
              disabled={exporting} onClick={exportStudentRecords} aria-busy={exporting}>
              <Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
          </div>
        </header>
        <div className="logbook-detail-content" style={t.entriesScroll}>
          {exportError && <p role="alert">{exportError}</p>}
          {selectedStudent && recordView === 'attendance' && <section className="coordinator-attendance" aria-label="Attendance records">
            <div className="logbook-attendance-heading">
              <p>Times shown in Philippine time.</p>
              <button type="button" className="portal-secondary" onClick={() => setDtrStudent(selectedStudent)}>Compare DTR</button>
            </div>
            {dtrStudent && <DtrReviewDialog key={dtrStudent.id} student={dtrStudent} onClose={() => setDtrStudent(null)} />}
            {attendanceLoading && <p role="status">Loading attendance…</p>}
            {attendanceError && <p role="alert">{attendanceError}</p>}
            {!attendanceLoading && !attendanceError && attendance.length === 0 && <div className="logbook-record-empty"><Icon name="clock" size={18} /><p>No attendance records yet.</p></div>}
            {!attendanceLoading && !attendanceError && attendance.length > 0 && <div className="attendance-table-wrap"><RecordPagination pagination={attendancePage} label="Attendance records" /><table><thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th>Hours</th></tr></thead><tbody>{attendancePage.items.map(record => <tr key={record.id}><td>{record.date || record.id}</td><td>{formatPunch(record.timeIn)}</td><td>{formatPunch(record.timeOut)}</td><td>{record.timeOut ? Number(record.hoursToday || 0).toFixed(2) : 'In progress'}</td></tr>)}</tbody></table></div>}
          </section>}
          {selectedStudent && recordView === 'journals' && analysis && <JournalKeywordSettings sectionId={selectedSection.id} keywords={analysis.keywords} onSaved={async () => {
            try { setAnalysis(await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/review-analysis`)); }
            catch (failure) { setAnalysisError(failure.message); }
          }} />}
          {selectedStudent && recordView === 'journals' && analysis?.missingWeeksBetweenSubmissions?.length > 0 && <aside className="journal-check-settings"><strong>Weekly completeness</strong><p>No entry found between submitted weeks for: {analysis.missingWeeksBetweenSubmissions.join(', ')}. Confirm the reporting schedule before requesting revisions.</p>{analysis.truncated && <p>Only the latest 100 entries were checked.</p>}</aside>}
          {recordView === 'journals' && entriesLoading && <PageSkeleton label="Loading journal entries" />}
          {recordView === 'journals' && entriesError && <p role="alert">{entriesError} <button type="button" className="portal-secondary" onClick={() => fetchEntries(selectedStudent)}>Retry</button></p>}
          {recordView === 'journals' && !entriesLoading && !entriesError && visibleEntries.length === 0 && (
            <div className="logbook-record-empty">
              <Icon name="book" size={18} />
              <p>{pendingOnly ? 'No journals awaiting review.' : 'No journals submitted yet.'}</p>
            </div>
          )}

          <div style={t.entriesList} hidden={recordView !== 'journals' || entriesLoading || !!entriesError}>
            <RecordPagination pagination={entriesPage} label="Journal entries" />
            {entriesPage.items.map(entry => (
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
                  {STATUS_TEXT[entry.status] || entry.status}
                </span>
              </div>

              <div style={t.entryLabel}>{entry.frequency === 'daily' ? 'Daily report' : 'Weekly report'}</div>
              <div style={t.entryText}>{entry.refined || entry.rawNotes || 'No journal text.'}</div>
              <JournalAiAnalysis key={`${selectedStudent.id}:${entry.id}`} studentId={selectedStudent.id} entryId={entry.id} sourceText={entry.rawNotes || entry.refined} hours={entry.hours} weekRange={entry.weekRange} />
              {analysisError && <p role="alert">Review checks unavailable: {analysisError}</p>}
              {analysis?.journals?.filter(item => item.id === entry.id).map(item => <details key={item.id}><summary>Journal review checks · rules and keywords</summary>
                {item.findings.map(finding => <p key={finding}>{finding}</p>)}
                {!item.findings.length && <p>No structural warnings found. This is not an approval.</p>}
                {item.competencies.map(skill => <p key={skill.name}>{skill.name}: matched words {skill.evidence.join(', ')}</p>)}
                {item.sentimentCues.length > 0 && <p>Text cues: {item.sentimentCues.join(', ')}</p>}
                <p>{item.limitation}</p>{analysis.truncated && <p>Checks cover the latest 100 entries only.</p>}
              </details>)}

              {entry.status === 'rejected' && entry.reviewReason && <p className="logbook-feedback"><strong>Revision needed</strong><span>{entry.reviewReason}</span></p>}

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
