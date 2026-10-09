// src/pages/LogbookTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import './LogbookTab.css';
import { downloadStudentRecordsExcel } from '../studentRecordsExport';

export default function LogbookTab({ coordinatorId, selectedSection: sharedSection, onSectionChange }) {
  const [sections, setSections]               = useState([]);
  const [students, setStudents]               = useState([]);
  const [entries, setEntries]                 = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [saving, setSaving]                   = useState(false);
  const [loading, setLoading]                 = useState(true);
  const [searchQuery, setSearchQuery]         = useState('');
  const [rejectConfirm, setRejectConfirm]     = useState(null);
  const [recordView, setRecordView] = useState('attendance');
  const [attendance, setAttendance] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
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

  const fetchSections = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [coordinatorId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const fetchStudents = async (section) => {
    setSelectedSection(section);
    onSectionChange?.(section);
    setSelectedStudent(null);
    setEntries([]);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)));
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (sharedSection) fetchStudents(sharedSection);
    else {
      setSelectedSection(null);
      setStudents([]);
      setSelectedStudent(null);
      setEntries([]);
    }
    // The section selector intentionally reloads the selected section's students.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedSection?.id]);

  const fetchEntries = async (student) => {
    setSelectedStudent(student);
    try {
      const snap = await getDocs(collection(db, 'users', student.id, 'logbook'));
      const sorted = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.weekNum || 0) - (b.weekNum || 0));
      setEntries(sorted);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAction = async (entryId, status) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(selectedStudent.id)}/logbook/${encodeURIComponent(entryId)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      setEntries(prev => prev.map(e => e.id === entryId ? {
        ...e, status, reviewReason: status === 'rejected' ? 'Please revise and resubmit this weekly entry.' : '',
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
  const filteredSections = sections.filter(section => matchesCoordinatorSearch(searchQuery, section.name, section.department));
  const filteredStudents = students.filter(student => matchesCoordinatorSearch(searchQuery, student.firstName, student.lastName, student.idNumber, selectedSection?.name));

  if (loading) {
    return <PageSkeleton label="Loading logbook data" variant="three-column" />;
  }

  return (
    <div className="logbook-workspace" style={t.page}>
      {/* Col 1: Sections */}
      <div className="logbook-sections" style={t.col1}>
        <div className="logbook-panel-header" style={t.colHeader}>Sections <span className="logbook-count">{sections.length}</span><p>Choose a class to review its journals.</p></div>
        <div style={t.searchWrap}><CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search sections and students" /></div>
        {filteredSections.length === 0 && <div style={t.empty}>No sections created yet.</div>}
        {filteredSections.map(sec => (
          <button type="button" className="logbook-select-card" aria-pressed={selectedSection?.id === sec.id}
            key={sec.id}
            style={{ ...t.card, ...(selectedSection?.id === sec.id ? t.cardActive : {}) }}
            onClick={() => fetchStudents(sec)}
          >
            <div style={t.cardTitle}>{sec.name}</div>
            <div style={t.cardSub}>{sec.department}</div>
          </button>
        ))}
      </div>

      {/* Col 2: Students */}
      <div className="logbook-students" style={t.col2}>
        <div className="logbook-panel-header" style={t.colHeader}>
          Students <span className="logbook-count">{students.length}</span><p>{selectedSection?.name || 'Select a section first.'}</p>
        </div>
        {!selectedSection && <div style={t.empty}>Select a section first.</div>}
        {selectedSection && filteredStudents.length === 0 && <div style={t.empty}>No students in this section.</div>}
        {filteredStudents.map(st => (
          <button type="button" className="logbook-select-card" aria-pressed={selectedStudent?.id === st.id}
            key={st.id}
            style={{ ...t.card, ...(selectedStudent?.id === st.id ? t.cardActive : {}) }}
            onClick={() => fetchEntries(st)}
          >
            <div style={t.cardTitle}>{st.firstName} {st.lastName}</div>
            <div style={t.cardSub}>ID {st.idNumber || 'not provided'}</div>
          </button>
        ))}
      </div>

      {/* Col 3: Logbook Entries */}
      <div className="logbook-detail" style={t.col3}>
        <div className="logbook-panel-header logbook-detail-header" style={t.colHeader}>
          <div>{selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Weekly journals'}
          <p>{selectedStudent ? 'Review weekly reports and reported hours.' : 'Select a student to view their submissions.'}</p>
          </div>
          {selectedStudent && <button type="button" className="logbook-export" disabled={exporting} onClick={exportStudentRecords}><Icon name="download" size={16} />{exporting ? 'Exporting…' : 'Export Data'}</button>}
        </div>

        <div className="logbook-detail-content" style={t.entriesScroll}>
          {exportError && <p role="alert">{exportError}</p>}
          {selectedStudent && <div className="logbook-record-switch" role="group" aria-label="Student record type">
            <button type="button" aria-pressed={recordView === 'attendance'} onClick={() => setRecordView('attendance')}>Attendance</button>
            <button type="button" aria-pressed={recordView === 'journals'} onClick={() => setRecordView('journals')}>Weekly journals</button>
          </div>}
          {selectedStudent && recordView === 'attendance' && <section className="coordinator-attendance" aria-label="Attendance records">
            <h3>Attendance records</h3><p>Time-in and time-out are shown in Philippine time. Attendance hours are separate from weekly journal hours.</p>
            {attendanceLoading && <p role="status">Loading attendance…</p>}
            {attendanceError && <p role="alert">{attendanceError}</p>}
            {!attendanceLoading && !attendanceError && attendance.length === 0 && <p>No attendance records yet.</p>}
            {!attendanceLoading && !attendanceError && attendance.length > 0 && <div className="attendance-table-wrap"><table><thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th>Hours</th></tr></thead><tbody>{attendance.map(record => <tr key={record.id}><td>{record.date || record.id}</td><td>{formatPunch(record.timeIn)}</td><td>{formatPunch(record.timeOut)}</td><td>{record.timeOut ? Number(record.hoursToday || 0).toFixed(2) : 'In progress'}</td></tr>)}</tbody></table></div>}
          </section>}
          {!selectedStudent && (
            <div style={t.emptyDetail}>
              <div style={t.emptyIcon}><Icon name="book" size={28} label="Logbook" /></div>
              <h3 style={t.emptyTitle}>Select a Student</h3>
              <p style={t.emptySub}>Select a section and student to review their weekly journal submissions and hours.</p>
            </div>
          )}

          {selectedStudent && recordView === 'journals' && entries.length === 0 && (
            <div style={t.emptyDetail}>
              <div style={t.emptyIcon}><Icon name="clipboard" size={28} label="No entries" /></div>
              <h3 style={t.emptyTitle}>No Entries Submitted</h3>
              <p style={t.emptySub}>This student has not submitted any logbook entries yet.</p>
            </div>
          )}

          <div style={t.entriesList} hidden={recordView !== 'journals'}>
            {entries.map(entry => (
            <div className="logbook-entry-card" key={entry.id} style={t.entryCard}>
              <div style={t.entryTop}>
                <div>
                  <div style={t.entryWeek}>Week {entry.weekNum}</div>
                  <div style={t.entrySub}>
                    <span><Icon name="calendar" size={14} /> {entry.weekRange || 'Weekly period'}</span><span><strong>{entry.hours} hrs rendered</strong></span>
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

              <div style={t.entryLabel}>Weekly report</div>
              <div style={t.entryText}>{entry.refined || 'No refined content.'}</div>

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
      </div>
      <AlertDialog
      open={Boolean(rejectConfirm)}
      title="Reject this logbook entry?"
      description="The student will be notified and can revise and resubmit this weekly entry."
      confirmLabel="Reject entry"
      busy={saving}
      onCancel={() => setRejectConfirm(null)}
      onConfirm={async () => {
        const saved = await handleAction(rejectConfirm.id, 'rejected');
        if (saved) setRejectConfirm(null);
      }}
      />
    </div>
  );
}

const t = {
  page: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.slate50,
  },
  col1: {
    width: 275,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    overflowY: 'auto',
    flexShrink: 0,
  },
  col2: {
    width: 325,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.slate50,
    overflowY: 'auto',
    flexShrink: 0,
  },
  col3: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.06em',
    padding: '14px 16px 8px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  searchWrap: {
    padding: '10px 12px 4px',
    backgroundColor: COLORS.white,
  },
  card: {
    padding: '12px 16px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    cursor: 'pointer',
  },
  cardActive: {
    backgroundColor: COLORS.sky50,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  cardSub: {
    fontSize: 11,
    color: '#000000',
    marginTop: 2,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
  },
  emptyDetail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  emptySub: {
    fontSize: 13,
    color: '#000000',
    maxWidth: 340,
  },
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
  detailsWrap: {
    marginTop: 12,
  },
  rawToggle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
    cursor: 'pointer',
  },
  rawNotesBox: {
    fontSize: 13,
    color: '#000000',
    marginTop: 8,
    padding: 12,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.slate300}`,
    lineHeight: 1.5,
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
