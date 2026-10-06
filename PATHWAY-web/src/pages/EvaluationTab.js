// src/pages/EvaluationTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import PaginationButtonGroup from '../components/PaginationButtonGroup';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
const EVALUATIONS_PER_PAGE = 2;

export default function EvaluationTab({ coordinatorId, selectedSection }) {
  const [students, setStudents]       = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [form, setForm]               = useState({
    studentId: '',
    supervisorName: '',
    supervisorEmail: '',
    companyName: '',
  });
  const [link, setLink]               = useState('');
  const [copied, setCopied]           = useState(false);
  const [status, setStatus]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const loadEvaluations = useCallback(async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch(`${API}/coordinator-evaluations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('Could not load evaluations');
    const data = await response.json();
    setEvaluations(data.evaluations || []);
  }, []);

  useEffect(() => {
    if (!coordinatorId) return;
    Promise.all([
      getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId))),
      loadEvaluations(),
    ])
      .then(async ([sectionSnap]) => {
        const studentSnaps = await Promise.all(sectionSnap.docs.map(section =>
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id)))
        ));
        const assigned = studentSnaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
          .filter(student => !selectedSection || student.sectionId === selectedSection.id);
        setStudents([...new Map(assigned.map(student => [student.id, student])).values()]);
      })
      .catch(error => setStatus(error.message))
      .finally(() => setLoading(false));
  }, [coordinatorId, loadEvaluations, selectedSection]);

  const createLink = async event => {
    event.preventDefault();
    setStatus('Generating secure evaluation link...');
    setLink('');
    setCopied(false);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch(`${API}/create-evaluation-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          studentName: students.find(student => student.id === form.studentId)?.firstName || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create evaluation link');
      const generatedLink = `${window.location.origin}/evaluate?token=${data.token}`;
      setLink(generatedLink);
      setStatus('Evaluation link generated successfully. Share it directly with the industry supervisor.');
      await loadEvaluations();
    } catch (error) {
      setStatus(error.message);
    }
  };

  const copyToClipboard = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      setCopied(false);
      setStatus('Could not copy the link. Select and copy it manually.');
    }
  };

  const refreshEvaluations = async () => {
    setRefreshing(true);
    try {
      await loadEvaluations();
      setStatus('Evaluation records refreshed.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredEvaluations = evaluations.filter(item => matchesCoordinatorSearch(
    searchQuery,
    item.studentName,
    item.studentId,
    item.sectionName,
  ));
  const pageCount = Math.max(1, Math.ceil(filteredEvaluations.length / EVALUATIONS_PER_PAGE));
  const visibleEvaluations = filteredEvaluations.slice(
    (currentPage - 1) * EVALUATIONS_PER_PAGE,
    currentPage * EVALUATIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(page => Math.min(page, pageCount));
  }, [pageCount]);

  if (loading) {
    return <PageSkeleton label="Loading supervisor evaluations" variant="cards" />;
  }

  return (
    <div style={styles.panel} className="evaluation-panel">
      {/* Generator Card */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.iconWrap}><Icon name="star" size={22} label="Supervisor evaluation" /></div>
          <div>
            <h2 style={styles.title}>Supervisor Evaluation Link Generator</h2>
            <p style={styles.sub}>
              Create a secure, one-time evaluation link to send to an industry supervisor upon internship completion.
            </p>
          </div>
        </div>

        <form onSubmit={createLink} style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.field}>
              <label style={styles.label}>Select Enrolled Student</label>
              <select
                required
                value={form.studentId}
                onChange={e => setForm({ ...form, studentId: e.target.value })}
                style={styles.select}
              >
                <option value="">Select student...</option>
                {students.map(student => (
                  <option key={student.id} value={student.id}>
                    {student.firstName} {student.lastName} ({student.idNumber || student.id})
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Host Company / Organization</label>
              <input
                required
                placeholder="e.g. Acme Tech Solutions Inc."
                value={form.companyName}
                onChange={e => setForm({ ...form, companyName: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.field}>
              <label style={styles.label}>Supervisor Full Name</label>
              <input
                required
                placeholder="e.g. John Doe, Senior Dev"
                value={form.supervisorName}
                onChange={e => setForm({ ...form, supervisorName: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Supervisor Email Address</label>
              <input
                type="email"
                required
                placeholder="supervisor@company.com"
                value={form.supervisorEmail}
                onChange={e => setForm({ ...form, supervisorEmail: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <button type="submit" style={styles.generateBtn}>
            Generate Secure Evaluation Link
          </button>
        </form>

        {status && (
          <div style={status.includes('Could not') || status.includes('Error') ? styles.errorBox : styles.infoBox}>
            {status}
          </div>
        )}

        {link && (
          <div style={styles.linkCard}>
            <div style={styles.linkTop}>
              <span style={styles.linkLabel}>Generated Link (Expires in 7 days):</span>
              <button style={styles.copyBtn} onClick={copyToClipboard}>
                {copied ? 'Copied to Clipboard!' : 'Copy Link'}
              </button>
            </div>
            <div style={styles.linkUrl}>{link}</div>
          </div>
        )}
      </div>

      {/* Evaluations Log Card */}
      <div style={styles.card}>
          <div style={styles.recordsHeader}>
          <div>
            <h3 style={styles.title}>Submitted & Pending Evaluations</h3>
            <p style={styles.sub}>{evaluations.length} evaluation record(s)</p>
          </div>
          <div style={styles.recordsActions}>
            <CoordinatorSearch value={searchQuery} onChange={value => { setSearchQuery(value); setCurrentPage(1); }} label="Search evaluations" />
            <div style={styles.recordsUtilityRow}>
              <PaginationButtonGroup
                align="right"
                page={currentPage}
                pageCount={pageCount}
                onPageChange={setCurrentPage}
              />
              <button
                type="button"
                onClick={refreshEvaluations}
                disabled={refreshing}
                style={styles.refreshButton}
              >
                <Icon name="refresh" size={14} />
                {refreshing ? 'Refreshing...' : 'Refresh Records'}
              </button>
            </div>
          </div>
        </div>

        {evaluations.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}><Icon name="clipboard" size={28} label="Evaluation records" /></div>
            <p style={{ margin: 0, color: '#000000' }}>No evaluation links created yet.</p>
          </div>
        ) : (
          <div style={styles.recordsGrid}>
            {visibleEvaluations.map(item => {
              const submitted = item.submitted || item.used;
              return (
                <div key={item.id} style={styles.recordCard}>
                  <div style={styles.recordTop}>
                    <div>
                      <h4 style={styles.recordStudent}>{item.studentName || item.studentId}</h4>
                      <div style={styles.recordCompany}>
                        <Icon name="building" size={14} /> {item.companyName} · <strong>Supervisor: {item.supervisorName}</strong> ({item.supervisorEmail})
                      </div>
                    </div>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: submitted ? COLORS.emerald50 : COLORS.yellow100,
                      color: '#000000',
                      border: `1px solid ${submitted ? COLORS.emerald200 : COLORS.yellow300}`,
                    }}>
                      {submitted ? 'Submitted' : 'Awaiting Response'}
                    </span>
                  </div>

                  {submitted && (
                    <div style={styles.ratingsSection}>
                      <div style={styles.ratingsRow}>
                        <span style={styles.ratingLabel}>Criteria Scores:</span>
                        <div style={styles.ratingPills}>
                          {item.ratings && Object.entries(item.ratings).map(([k, v]) => (
                            <span key={k} style={styles.ratingChip}>
                              {k.replace(/([A-Z])/g, ' $1')}: <strong>{v}/5</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                      {item.comments && (
                        <div style={styles.commentsWrap}>
                          <strong>Supervisor Feedback:</strong> "{item.comments}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    width: '100%',
    maxWidth: 'none',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.yellow100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
    border: `1px solid ${COLORS.yellow300}`,
  },
  title: {
    margin: '0 0 2px',
    fontSize: 17,
    fontWeight: 800,
    color: '#000000',
  },
  sub: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  generateBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '12px 20px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 14,
    marginTop: 4,
    alignSelf: 'flex-start',
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  infoBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.sky50,
    color: '#000000',
    fontSize: 13,
    border: `1px solid ${COLORS.sky200}`,
  },
  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    fontSize: 13,
    border: `1px solid ${COLORS.rose200}`,
  },
  linkCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: COLORS.yellow50,
    border: `1.5px solid ${COLORS.yellow300}`,
    borderRadius: THEME.radius.md,
  },
  linkTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  linkLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
  },
  copyBtn: {
    backgroundColor: COLORS.yellow400,
    color: '#000000',
    border: 'none',
    borderRadius: THEME.radius.sm,
    padding: '5px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
  },
  linkUrl: {
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
    color: '#000000',
    wordBreak: 'break-all',
    backgroundColor: COLORS.white,
    padding: 10,
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow200}`,
    fontWeight: 600,
  },
  recordsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  recordsActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    width: 'min(100%, 460px)',
    flex: '0 1 460px',
  },
  recordsUtilityRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  refreshButton: {
    backgroundColor: COLORS.white,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  recordsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  recordCard: {
    padding: 16,
    border: `1px solid ${COLORS.slate300}`,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
  },
  recordTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },
  recordStudent: {
    margin: '0 0 3px',
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
  },
  recordCompany: {
    fontSize: 13,
    color: '#000000',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: THEME.radius.full,
  },
  ratingsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px solid ${COLORS.slate200}`,
  },
  ratingsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
  },
  ratingPills: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  ratingChip: {
    fontSize: 11,
    backgroundColor: COLORS.slate50,
    border: `1px solid ${COLORS.slate300}`,
    padding: '2px 8px',
    borderRadius: THEME.radius.sm,
    color: '#000000',
  },
  commentsWrap: {
    fontSize: 13,
    color: '#000000',
    backgroundColor: COLORS.slate50,
    padding: 10,
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.slate200}`,
    fontStyle: 'italic',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#000000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
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
