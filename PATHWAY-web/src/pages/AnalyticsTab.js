// src/pages/AnalyticsTab.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import './CoordinatorRecords.css';

function csvEscape(v) {
  const text = String(v ?? '');
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

export default function AnalyticsTab({ coordinatorId, selectedSection }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [schedule, setSchedule] = useState({ startDate: '', deadline: '', startTime: '08:00', workingDays: [1,2,3,4,5], exceptions: [] });
  const [saving, setSaving] = useState(false);
  const requestRevision = useRef(0);

  const loadData = useCallback(async () => {
    const revision = ++requestRevision.current;
    if (!coordinatorId) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError('');
    // Never substitute fabricated fallback metrics when the authenticated API fails.
    try {
      if (!selectedSection?.id) { setData(null); return; }
      const payload = await adminRequest(`/coordinator/sections/${encodeURIComponent(selectedSection.id)}/analytics`);
      if (revision !== requestRevision.current) return;
      setData(payload);
      if (payload.schedule) setSchedule(payload.schedule);
      else setSchedule({ startDate: '', deadline: '', startTime: '08:00', workingDays: [1,2,3,4,5], exceptions: [] });
    } catch (failure) { if (revision === requestRevision.current) { setData(null); setError(failure.message); } }
    finally { if (revision === requestRevision.current) setLoading(false); }
    return;
  }, [coordinatorId, selectedSection]);

  useEffect(() => {
    loadData();
    return () => { requestRevision.current++; };
  }, [loadData]);
  const saveSchedule = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selectedSection.id)}/analytics/schedule`, { method: 'PUT', body: JSON.stringify({ schedule }) });
      await loadData();
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };

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
    <div className="coordinator-analytics-page" style={s.page}>
      {/* Top Header */}
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>Cohort overview</h2>
          <p style={s.sub}>Student hours, completion, and reported attendance for {selectedSection?.name || 'your assigned sections'}.</p>
        </div>
        <div style={s.actions}>
          <button style={s.secondaryBtn} onClick={loadData}><Icon name="refresh" size={15} /> Refresh</button>
          <button style={s.primaryBtn} onClick={exportCsv} disabled={!data?.students?.length}>
            <Icon name="download" size={15} /> Export CSV Report
          </button>
        </div>
      </div>

      {error && <div role="alert" style={s.errorBox}>{error}</div>}
      {selectedSection?.id && <form onSubmit={saveSchedule} style={s.tableCard}>
        <h3>Work schedule and completion deadline</h3>
        <p>Section-wide schedule, Philippine time. Today is excluded from attendance rates. Exceptions are non-working dates. Projections use the last 28 days and are not guarantees.</p>
        {['startDate', 'deadline', 'startTime'].map(field => <label key={field} style={{ marginRight: 16 }}>{field === 'startDate' ? 'Start date' : field === 'deadline' ? 'Deadline' : 'Start time'} <input required type={field === 'startTime' ? 'time' : 'date'} value={schedule[field]} onChange={event => setSchedule(current => ({ ...current, [field]: event.target.value }))} /></label>)}
        <div>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, index) => <label key={day} style={{ marginRight: 12 }}><input type="checkbox" checked={schedule.workingDays.includes(index)} onChange={event => setSchedule(current => ({ ...current, workingDays: event.target.checked ? [...current.workingDays, index] : current.workingDays.filter(value => value !== index) }))} />{day}</label>)}</div>
        <label>Exceptions (YYYY-MM-DD, comma-separated) <input value={schedule.exceptions.join(',')} onChange={event => setSchedule(current => ({ ...current, exceptions: event.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} /></label>
        <button disabled={saving} type="submit">{saving ? 'Saving…' : 'Save schedule'}</button>
      </form>}

      {/* Metrics Summary Grid */}
      {data && (
        <div className="analytics-metrics" style={s.metricsGrid}>
          <MetricCard label="Total Students" value={data.totalStudents || 0} accent="sky" />
          <MetricCard label="Active Interns" value={data.activeInterns || 0} accent="emerald" />
          <MetricCard label="Completed OJT" value={data.completedInterns || 0} accent="yellow" />
          <MetricCard label="At-Risk Interns" value={data.atRiskStudents ?? 'Unavailable'} accent="rose" />
          <MetricCard label="Total Hours Rendered" value={`${data.totalHoursLogged || 0} hrs`} accent="slate" />
          <MetricCard label="Cohort Average" value={`${data.averageHours || 0} hrs`} accent="sky" />
        </div>
      )}

      {/* Student Progress Breakdown Table */}
      <div className="analytics-records" style={s.tableCard}>
        <div style={s.cardHeader}>
          <div>
            <h3 style={s.cardTitle}>Student progress</h3>
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
                        <span>Rate: <strong>{st.attendanceRate == null ? 'Unavailable' : `${st.attendanceRate}%`}</strong></span>
                        {st.lateRate > 0 && <span style={{ display: 'block' }}>{st.lateRate}% late</span>}
                        {st.missedShifts > 0 && <span style={{ display: 'block' }}>{st.missedShifts} missed</span>}
                        <span>{st.projectedCompletion ? `Estimated completion: ${st.projectedCompletion}` : 'Completion estimate unavailable'}</span>
                        {(st.reasons || []).map(reason => <small key={reason} style={{ display: 'block' }}>{reason}</small>)}
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
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#000000', padding: 32 }}>
                    {searchQuery ? 'No matching students. Try another name or ID.' : 'No student progress records found for this cohort.'}
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

function MetricCard({ label, value }) {
  return (
    <div style={s.metricCard}>
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
