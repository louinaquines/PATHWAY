// src/pages/AnalyticsTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

function csvEscape(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

export default function AnalyticsTab({ coordinatorId, selectedSection }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      let analyticsPayload = null;
      if (token) {
        try {
          analyticsPayload = await adminRequest('/admin/analytics');
        } catch (adminError) {
          console.warn('Admin analytics route not accessible. Trying coordinator analytics...');
          try {
            const res = await fetch(`${API}/coordinator-analytics`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) analyticsPayload = await res.json();
          } catch (backendError) {
            console.warn('Analytics backend is unavailable. Falling back to Firestore metrics.', backendError);
          }
        }
      }

      if (analyticsPayload) {
        const scopedStudents = selectedSection
          ? (analyticsPayload.students || []).filter(student => student.section === selectedSection.name)
          : [];
        const scopedHours = scopedStudents.reduce((sum, student) => sum + (Number(student.hoursRendered) || 0), 0);
        setData({
          ...analyticsPayload,
          totalStudents: scopedStudents.length,
          activeInterns: scopedStudents.filter(student => student.status !== 'Registration pending').length,
          completedInterns: scopedStudents.filter(student => student.status === 'Completed').length,
          atRiskStudents: scopedStudents.filter(student => student.status === 'High Risk' || student.status === 'Medium Risk').length,
          totalHoursLogged: scopedHours,
          averageHours: scopedStudents.length ? (scopedHours / scopedStudents.length).toFixed(1) : 0,
          students: scopedStudents,
        });
      } else {
        const secSnap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
        const sections = secSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .filter(section => !selectedSection || section.id === selectedSection.id);
        const studentsNested = await Promise.all(sections.map(async s => {
          const stSnap = await getDocs(query(collection(db, 'users'), where('sectionId', '==', s.id)));
          return stSnap.docs.map(d => ({ id: d.id, sectionName: s.name, ...d.data() }));
        }));
        const allStudents = studentsNested.flat();
        const totalHours = allStudents.reduce((sum, s) => sum + (Number(s.hoursRendered) || 0), 0);
        setData({
          totalStudents: allStudents.length,
          activeInterns: allStudents.filter(s => s.accountApproved).length,
          completedInterns: allStudents.filter(s => s.clearanceStatus === 'cleared').length,
          atRiskStudents: allStudents.filter(s => {
            const required = Number(s.hoursRequired || 486);
            const rendered = Number(s.hoursRendered || 0);
            return s.accountApproved && rendered < required * 0.25;
          }).length,
          totalHoursLogged: totalHours,
          averageHours: allStudents.length ? (totalHours / allStudents.length).toFixed(1) : 0,
          students: allStudents.map(s => {
            const required = Number(s.hoursRequired || 486);
            const rendered = Number(s.hoursRendered || 0);
            const percent = Math.min(100, Math.round((rendered / required) * 100));
            return {
              id: s.id,
              name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Unnamed',
              idNumber: s.idNumber || '—',
              section: s.sectionName || '—',
              department: s.department || '—',
              companyName: s.companyName || '—',
              hoursRendered: rendered,
              hoursRequired: required,
              completionPercentage: percent,
              attendanceRate: 100,
              onTimeRate: 100,
              lateRate: 0,
              missedShifts: 0,
              status: s.clearanceStatus === 'cleared' ? 'Completed' : percent < 25 ? 'High Risk' : percent < 60 ? 'Moderate' : 'On Track',
            };
          }),
        });
      }
    } catch (e) {
      console.error(e);
      setError('Could not load analytics. Make sure the server is reachable.');
    } finally {
      setLoading(false);
    }
  }, [coordinatorId, selectedSection]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const exportCsv = () => {
    if (!data?.students) return;
    const header = ['Student Name', 'ID Number', 'Section', 'Department', 'Company', 'Hours Rendered', 'Hours Required', 'Progress (%)', 'Status'];
    const rows = data.students.map(s => [
      s.name,
      s.idNumber,
      s.section,
      s.department,
      s.companyName,
      s.hoursRendered,
      s.hoursRequired,
      s.completionPercentage,
      s.status,
    ]);
    const csvContent = [header, ...rows].map(r => r.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pathway-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <PageSkeleton label="Calculating cohort analytics" variant="dashboard" />;
  }

  const filteredStudents = (data?.students || []).filter(student => matchesCoordinatorSearch(
    searchQuery,
    student.name,
    student.idNumber,
    student.section,
  ));

  return (
    <div style={s.page}>
      {/* Top Header */}
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>OJT Cohort Analytics & Progress</h2>
          <p style={s.sub}>Real-time monitoring of intern hours, attendance trends, risk metrics, and completion milestones.</p>
        </div>
        <div style={s.actions}>
          <button style={s.secondaryBtn} onClick={loadData}><Icon name="refresh" size={15} /> Refresh</button>
          <button style={s.primaryBtn} onClick={exportCsv} disabled={!data?.students?.length}>
            <Icon name="download" size={15} /> Export CSV Report
          </button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Metrics Summary Grid */}
      {data && (
        <div style={s.metricsGrid}>
          <MetricCard label="Total Students" value={data.totalStudents || 0} accent="sky" />
          <MetricCard label="Active Interns" value={data.activeInterns || 0} accent="emerald" />
          <MetricCard label="Completed OJT" value={data.completedInterns || 0} accent="yellow" />
          <MetricCard label="At-Risk Interns" value={data.atRiskStudents || 0} accent="rose" />
          <MetricCard label="Total Hours Rendered" value={`${data.totalHoursLogged || 0} hrs`} accent="slate" />
          <MetricCard label="Cohort Average" value={`${data.averageHours || 0} hrs`} accent="sky" />
        </div>
      )}

      {/* Student Progress Breakdown Table */}
      <div style={s.tableCard}>
        <div style={s.cardHeader}>
          <div>
            <h3 style={s.cardTitle}>Student Progress & Risk Breakdown</h3>
            <p style={s.sub}>{data?.students?.length || 0} intern(s) tracked</p>
          </div>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search analytics records" />
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Student Intern</th>
                <th style={s.th}>Section</th>
                <th style={s.th}>Rendered / Target</th>
                <th style={s.th}>Progress Indicator</th>
                <th style={s.th}>Attendance Metrics</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map(st => {
                const percent = st.completionPercentage || 0;
                return (
                  <tr key={st.id} style={s.tr}>
                    <td style={s.td}>
                      <div style={s.studentName}>{st.name}</div>
                      <span style={s.idCode}>{st.idNumber}</span>
                    </td>
                    <td style={s.td}>{st.section}</td>
                    <td style={s.td}>
                      <strong>{st.hoursRendered}</strong> / {st.hoursRequired} hrs
                    </td>
                    <td style={s.td}>
                      <div style={s.progressContainer}>
                        <div style={s.progressBarWrap}>
                          <div style={{ ...s.progressBar, width: `${percent}%` }} />
                        </div>
                        <span style={s.progressText}>{percent}%</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={s.attendanceMini}>
                        <span>Rate: <strong>{st.attendanceRate ?? 100}%</strong></span>
                        {st.lateRate > 0 && <span style={{ color: '#000000' }}>· {st.lateRate}% late</span>}
                        {st.missedShifts > 0 && <span style={{ color: '#000000' }}>· {st.missedShifts} missed</span>}
                      </div>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <span style={{
                        ...s.statusBadge,
                        backgroundColor: st.status === 'Completed' ? COLORS.emerald50 :
                                         st.status === 'High Risk'  ? COLORS.rose50 :
                                         st.status === 'Moderate'   ? COLORS.yellow100 : COLORS.sky50,
                        color: '#000000',
                        border: `1px solid ${st.status === 'Completed' ? COLORS.emerald200 :
                                             st.status === 'High Risk'  ? COLORS.rose200 :
                                             st.status === 'Moderate'   ? COLORS.yellow300 : COLORS.sky200}`,
                      }}>
                        {st.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(!data?.students || data.students.length === 0) && (
                <tr>
                  <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#000000', padding: 32 }}>
                    No student progress records found for this cohort.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }) {
  const accentColors = {
    sky: { border: COLORS.sky500 },
    yellow: { border: COLORS.yellow500 },
    emerald: { border: COLORS.emerald500 },
    rose: { border: COLORS.rose500 },
    slate: { border: COLORS.slate400 },
  };
  const theme = accentColors[accent] || accentColors.sky;

  return (
    <div style={{ ...s.metricCard, borderLeft: `4px solid ${theme.border}` }}>
      <div style={s.metricLabel}>{label}</div>
      <div style={s.metricValue}>{value}</div>
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    margin: 0,
    color: '#000000',
    fontSize: 20,
    fontWeight: 800,
  },
  sub: {
    margin: '4px 0 0',
    color: '#000000',
    fontSize: 13,
  },
  actions: {
    display: 'flex',
    gap: 8,
  },
  primaryBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '9px 16px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  secondaryBtn: {
    backgroundColor: COLORS.white,
    color: '#000000',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '9px 14px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  metricCard: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '14px 18px',
    boxShadow: THEME.shadows.xs,
  },
  metricLabel: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 700,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: 800,
    color: '#000000',
    marginTop: 4,
  },
  tableCard: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    overflow: 'hidden',
    boxShadow: THEME.shadows.xs,
  },
  cardHeader: {
    padding: '18px 22px',
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    color: '#000000',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontWeight: 800,
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  tr: {
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  td: {
    padding: '13px 16px',
    color: '#000000',
    verticalAlign: 'middle',
  },
  studentName: {
    fontWeight: 800,
    color: '#000000',
    fontSize: 14,
  },
  idCode: {
    fontSize: 11,
    color: '#000000',
    fontWeight: 600,
    fontFamily: THEME.fonts.mono,
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
  },
  progressBarWrap: {
    flex: 1,
    height: 8,
    backgroundColor: COLORS.slate100,
    borderRadius: THEME.radius.full,
    overflow: 'hidden',
    border: `1px solid ${COLORS.slate200}`,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.sky500,
    borderRadius: THEME.radius.full,
  },
  progressText: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
    minWidth: 35,
    textAlign: 'right',
  },
  attendanceMini: {
    fontSize: 12,
    color: '#000000',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
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
  errorBox: {
    padding: 12,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.rose200}`,
    fontSize: 13,
  },
};
