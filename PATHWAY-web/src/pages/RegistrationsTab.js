// src/pages/RegistrationsTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';

export default function RegistrationsTab({ department, sections = [] }) {
  const [pending, setPending]   = useState([]);
  const [approved, setApproved] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [tab, setTab]           = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [rejectConfirm, setRejectConfirm] = useState(null);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const sectionQueries = sections.map(section => getDocs(query(
        collection(db, 'users'), where('sectionId', '==', section.id), where('role', '==', 'student')
      )));
      const [unassigned, ...assigned] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', department), where('sectionId', '==', ''))),
        ...sectionQueries,
      ]);
      const all  = [...unassigned.docs, ...assigned.flatMap(result => result.docs)]
        .filter((item, index, records) => records.findIndex(candidate => candidate.id === item.id) === index)
        .map(d => ({ id: d.id, ...d.data() }));
      setPending(all.filter(s => !s.accountApproved && s.status !== 'rejected_registration'));
      setApproved(all.filter(s => s.accountApproved));
      setRejected(all.filter(s => s.status === 'rejected_registration'));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [department, sections]);

  useEffect(() => {
    fetchRegistrations();
  }, [fetchRegistrations]);

  const handleApprove = async (studentId) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/registrations/${encodeURIComponent(studentId)}/decision`, {
        method: 'POST', body: JSON.stringify({ status: 'approved' }),
      });
      await fetchRegistrations();
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Could not approve this registration.');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async (studentId) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/registrations/${encodeURIComponent(studentId)}/decision`, {
        method: 'POST', body: JSON.stringify({ status: 'rejected' }),
      });
      await fetchRegistrations();
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Could not reject this registration.');
    } finally {
      setSaving(false);
    }
  };

  const list = tab === 'pending' ? pending : tab === 'approved' ? approved : rejected;
  const filteredList = list.filter(student => matchesCoordinatorSearch(
    searchQuery,
    student.firstName,
    student.lastName,
    student.idNumber,
    student.sectionName,
    student.department,
  ));

  if (loading) {
    return <PageSkeleton label="Loading registrations" variant="cards" />;
  }

  return (
    <div style={r.page} className="registrations-page">
      {/* Sub tabs / Filter navigation */}
      <div style={r.subTabs}>
        <button
          style={{ ...r.subTab, ...(tab === 'pending' ? r.subTabActive : {}) }}
          onClick={() => setTab('pending')}
        >
          <span>Pending Approvals</span>
          <span style={{ ...r.count, ...(tab === 'pending' ? r.countActive : {}) }}>
            {pending.length}
          </span>
        </button>

        <button
          style={{ ...r.subTab, ...(tab === 'approved' ? r.subTabActive : {}) }}
          onClick={() => setTab('approved')}
        >
          <span>Approved Students</span>
          <span style={{ ...r.count, ...(tab === 'approved' ? r.countActive : {}) }}>
            {approved.length}
          </span>
        </button>

        <button
          style={{ ...r.subTab, ...(tab === 'rejected' ? r.subTabActive : {}) }}
          onClick={() => setTab('rejected')}
        >
          <span>Rejected / Inactive</span>
          <span style={{ ...r.count, ...(tab === 'rejected' ? r.countActive : {}) }}>
            {rejected.length}
          </span>
        </button>
      </div>

      {/* List content */}
      <div style={r.list}>
        <div style={r.searchRow}>
          <div style={r.searchField}>
            <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search registrations" />
          </div>
          <span style={r.searchCount}>{filteredList.length} of {list.length} record(s)</span>
        </div>
        {filteredList.length === 0 && (
          <div style={r.emptyCard}>
            <div style={r.emptyIcon}><Icon name="users" size={28} label="No registrations" /></div>
            <h3 style={r.emptyTitle}>No {tab} registrations</h3>
            <p style={r.emptySub}>There are currently no students in the {tab} registration queue.</p>
          </div>
        )}

        <div style={r.cardsGrid}>
          {filteredList.map((student) => (
            <div key={student.id} style={r.card}>
              <div style={r.cardMain}>
                <div style={r.avatar}>
                  {student.firstName?.[0] || 'S'}
                  {student.lastName?.[0] || 'T'}
                </div>
                <div style={r.details}>
                  <div style={r.nameRow}>
                    <h3 style={r.name}>{student.firstName} {student.lastName}</h3>
                    <span style={r.idBadge}>{student.idNumber || 'No ID'}</span>
                  </div>
                  <div style={r.metaRow}>
                    <span style={r.metaItem}><Icon name="mail" size={14} /> {student.email}</span>
                    <span style={r.metaItem}><Icon name="building" size={14} /> {student.department || department}</span>
                  </div>
                  {student.createdAt && (
                    <div style={r.date}>
                      Registered: {new Date(student.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  )}
                </div>
              </div>

              <div style={r.actionArea}>
                {tab === 'pending' && (
                  <div style={r.btnGroup}>
                    <button
                      style={r.approveBtn}
                      disabled={saving}
                      onClick={() => handleApprove(student.id)}
                    >
                      {saving ? '...' : 'Approve'}
                    </button>
                    <button
                      style={r.rejectBtn}
                      disabled={saving}
                        onClick={() => setRejectConfirm(student)}
                    >
                      {saving ? '...' : 'Reject'}
                    </button>
                  </div>
                )}

                {tab === 'approved' && (
                  <span style={r.approvedPill}><Icon name="check" size={13} /> Approved</span>
                )}

                {tab === 'rejected' && (
                  <span style={r.rejectedPill}><Icon name="x" size={13} /> Rejected</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <AlertDialog
      open={Boolean(rejectConfirm)}
      title="Reject this student registration?"
      description={rejectConfirm ? `${rejectConfirm.firstName || ''} ${rejectConfirm.lastName || ''}`.trim() + ' will remain unable to access the student workflow until the registration is reviewed again.' : ''}
      confirmLabel="Reject registration"
      busy={saving}
      onCancel={() => setRejectConfirm(null)}
      onConfirm={async () => { await handleReject(rejectConfirm.id); setRejectConfirm(null); }}
      />
    </div>
  );
}

const r = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.slate50,
  },
  subTabs: {
    display: 'flex',
    backgroundColor: COLORS.white,
    borderBottom: `1px solid ${COLORS.slate200}`,
    padding: '0 28px',
    gap: 8,
  },
  subTab: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '14px 18px',
    fontSize: 14,
    fontWeight: 700,
    color: '#000000',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    fontFamily: THEME.fonts.main,
  },
  subTabActive: {
    color: '#000000',
    borderBottom: `3px solid ${COLORS.sky600}`,
    fontWeight: 800,
  },
  count: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    fontSize: 11,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: THEME.radius.full,
  },
  countActive: {
    backgroundColor: COLORS.yellow400,
    color: '#000000',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  searchField: {
    width: 460,
    maxWidth: '100%',
    flex: '0 1 460px',
    minWidth: 0,
  },
  searchCount: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  cardsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxWidth: 900,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: '18px 22px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    flexWrap: 'wrap',
    gap: 14,
  },
  cardMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flex: 1,
    minWidth: 260,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    color: '#000000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 800,
    flexShrink: 0,
    border: `1.5px solid ${COLORS.sky300}`,
  },
  details: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  idBadge: {
    fontSize: 11,
    fontWeight: 800,
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    padding: '2px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow300}`,
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    fontSize: 13,
    color: '#000000',
    flexWrap: 'wrap',
  },
  metaItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: '#000000',
  },
  date: {
    fontSize: 11,
    color: '#000000',
    marginTop: 2,
    fontWeight: 600,
  },
  actionArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  btnGroup: {
    display: 'flex',
    gap: 8,
  },
  approveBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '9px 18px',
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
    padding: '9px 16px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
  },
  approvedPill: {
    fontSize: 12,
    fontWeight: 800,
    padding: '5px 14px',
    borderRadius: THEME.radius.full,
    backgroundColor: COLORS.emerald50,
    color: '#000000',
    border: `1px solid ${COLORS.emerald200}`,
  },
  rejectedPill: {
    fontSize: 12,
    fontWeight: 800,
    padding: '5px 14px',
    borderRadius: THEME.radius.full,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    border: `1px solid ${COLORS.rose200}`,
  },
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate200}`,
    padding: 48,
    textAlign: 'center',
    maxWidth: 600,
    margin: '40px auto 0',
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
