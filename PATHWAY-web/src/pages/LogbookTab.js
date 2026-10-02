// src/pages/LogbookTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';

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
      const snap = await getDocs(query(collection(db, 'users'), where('sectionId', '==', section.id)));
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
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Could not process this logbook review.');
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
    <div style={t.page}>
      {/* Col 1: Sections */}
      <div style={t.col1}>
        <div style={t.colHeader}>SECTIONS ({sections.length})</div>
        <div style={t.searchWrap}><CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search sections and students" /></div>
        {filteredSections.length === 0 && <div style={t.empty}>No sections created yet.</div>}
        {filteredSections.map(sec => (
          <div
            key={sec.id}
            style={{ ...t.card, ...(selectedSection?.id === sec.id ? t.cardActive : {}) }}
            onClick={() => fetchStudents(sec)}
          >
            <div style={t.cardTitle}>{sec.name}</div>
            <div style={t.cardSub}>{sec.department}</div>
          </div>
        ))}
      </div>

      {/* Col 2: Students */}
      <div style={t.col2}>
        <div style={t.colHeader}>
          {selectedSection ? `STUDENTS — ${selectedSection.name}` : 'STUDENTS'}
        </div>
        {!selectedSection && <div style={t.empty}>Select a section first.</div>}
        {selectedSection && filteredStudents.length === 0 && <div style={t.empty}>No students in this section.</div>}
        {filteredStudents.map(st => (
          <div
            key={st.id}
            style={{ ...t.card, ...(selectedStudent?.id === st.id ? t.cardActive : {}) }}
            onClick={() => fetchEntries(st)}
          >
            <div style={t.cardTitle}>{st.firstName} {st.lastName}</div>
            <div style={t.cardSub}>{st.idNumber || '—'}</div>
          </div>
        ))}
      </div>

      {/* Col 3: Logbook Entries */}
      <div style={t.col3}>
        <div style={t.colHeader}>
          {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName} — Weekly Entries` : 'LOGBOOK ENTRIES'}
        </div>

        <div style={t.entriesScroll}>
          {!selectedStudent && (
            <div style={t.emptyDetail}>
              <div style={t.emptyIcon}><Icon name="book" size={28} label="Logbook" /></div>
              <h3 style={t.emptyTitle}>Select a Student</h3>
              <p style={t.emptySub}>Select a section and student to review their weekly journal submissions and hours.</p>
            </div>
          )}

          {selectedStudent && entries.length === 0 && (
            <div style={t.emptyDetail}>
              <div style={t.emptyIcon}><Icon name="clipboard" size={28} label="No entries" /></div>
              <h3 style={t.emptyTitle}>No Entries Submitted</h3>
              <p style={t.emptySub}>This student has not submitted any logbook entries yet.</p>
            </div>
          )}

          <div style={t.entriesList}>
            {entries.map(entry => (
            <div key={entry.id} style={t.entryCard}>
              <div style={t.entryTop}>
                <div>
                  <div style={t.entryWeek}>Week {entry.weekNum}</div>
                  <div style={t.entrySub}>
                    <Icon name="calendar" size={14} /> {entry.weekRange || 'Weekly Period'} · <strong>{entry.hours} hrs rendered</strong>
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

              <div style={t.entryLabel}>REFINED ENTRY</div>
              <div style={t.entryText}>{entry.refined || 'No refined content.'}</div>

              {entry.rawNotes && (
                <details style={t.detailsWrap}>
                  <summary style={t.rawToggle}>View student's original raw notes</summary>
                  <div style={t.rawNotesBox}>{entry.rawNotes}</div>
                </details>
              )}

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
      onConfirm={async () => { await handleAction(rejectConfirm.id, 'rejected'); setRejectConfirm(null); }}
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
    borderLeft: `4px solid ${COLORS.sky600}`,
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
