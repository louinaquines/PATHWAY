import { PortalFormDialog } from '../components/PortalStates';
import { compareStudents } from '../coordinatorStudentSort';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/AnalyticsTab.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AttendanceAiExplanation from '../components/AttendanceAiExplanation';
import AttendanceAccess from '../components/AttendanceAccess';
import AttendanceExcusedEditor from '../components/AttendanceExcusedEditor';
import AttendanceCheckStatus from '../components/AttendanceCheckStatus';
import { attendanceReasonLabels } from '../attendanceRiskLabels';
import './CoordinatorRecords.css';

function csvEscape(v) {
  const text = String(v ?? '');
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

export default function AnalyticsTab(props) {
  return <AttendanceAccess key={`${props.coordinatorId}:${props.selectedSection?.id || ''}`} actorId={props.coordinatorId} sectionId={props.selectedSection?.id}>
    {access => <AnalyticsContent {...props} {...access} />}
  </AttendanceAccess>;
}

function AnalyticsContent({ coordinatorId, selectedSection, highlightStudentId, onDenied, isCurrent }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [progressFilter, setProgressFilter] = useState('all');
  const [exceptionDate, setExceptionDate] = useState('');
  const [schedule, setSchedule] = useState({ startDate: '', deadline: '', startTime: '08:00', workingDays: [1,2,3,4,5], exceptions: [] });
  const [draft, setDraft] = useState(null);
  const [scheduleError, setScheduleError] = useState('');
  const editButton = useRef(null);
  function closeSchedule() {
    setDraft(null);
    requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true }));
  }
  const [saving, setSaving] = useState(false);
  const requestRevision = useRef(0);
  const [editing, setEditing] = useState(null);

  const loadData = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    const revision = ++requestRevision.current;
    if (!coordinatorId) { setData(null); setLoading(false); return; }
    if (!silent) setLoading(true);
    setError('');
    // Never substitute fabricated fallback metrics when the authenticated API fails.
    try {
      if (!selectedSection?.id) { setData(null); return; }
      const payload = await adminRequest(`/coordinator/sections/${encodeURIComponent(selectedSection.id)}/analytics`, { deadlineMs: 15000 });
      if (!isRefreshCurrent()) return;
      if (revision !== requestRevision.current || !isCurrent()) return;
      setData(payload);
      if (payload.schedule) setSchedule(payload.schedule);
      else setSchedule({ startDate: '', deadline: '', startTime: '08:00', workingDays: [1,2,3,4,5], exceptions: [] });
    } catch (failure) {
      if (!isRefreshCurrent()) return; if (revision === requestRevision.current && isCurrent()) { setData(null); setEditing(null); setError(failure.message); if ([401,403].includes(failure.status)) onDenied(); } }
    finally { if (revision === requestRevision.current) setLoading(false); }
    return;
  }, [coordinatorId, selectedSection]); // Access lifetime is controlled by the keyed boundary.

  usePortalAutoRefresh(loadData, { enabled: !loading && !saving && !editing && !draft, scope: selectedSection?.id || '', protectInputs: true });


  useEffect(() => {
    loadData();
    return () => { requestRevision.current++; };
  }, [loadData]);
  useEffect(() => {
    if (data && highlightStudentId) document.getElementById(`attendance-student-${highlightStudentId}`)?.scrollIntoView?.({ block: 'center' });
  }, [data, highlightStudentId]);
  const saveSchedule = async event => {
    event.preventDefault(); if (saving) return; setSaving(true); setScheduleError('');
    const revision = requestRevision.current;
    try {
      const saved = await adminRequest(`/coordinator/sections/${encodeURIComponent(selectedSection.id)}/analytics/schedule`, { method: 'PUT', body: JSON.stringify({ schedule: draft }), deadlineMs: 15000 });
      if (isCurrent()) {
        setSchedule(saved?.schedule || draft);
        closeSchedule();
        await loadData({ silent: true });
      }
    } catch (failure) { if (isCurrent()) { setScheduleError(failure.message); if ([401,403].includes(failure.status)) onDenied(); } }
    finally { if (isCurrent()) setSaving(false); }
  };

  const exportCsv = () => {
    if (!data?.students) return;
    const header = ['Student ID', 'Student Name', 'Section', 'Department', 'Company', 'Server-credited hours', 'Hours Required', 'Progress (%)', 'Risk tier', 'Progress status', 'Data status'];
    const rows = [...data.students].sort(compareStudents).map(s => [
      s.idNumber,
      s.name,
      s.section,
      s.department,
      s.companyName,
      s.hoursRendered,
      s.hoursRequired,
      s.completionPercentage,
      s.riskTier ?? 'Unavailable', s.progressStatus ?? 'Unavailable', s.dataStatus ?? 'Unavailable',
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



  const filteredStudents = (data?.students || []).filter(student => matchesCoordinatorSearch(
    searchQuery,
    student.name,
    student.idNumber,
    student.section,
  ) && (
    progressFilter === 'all'
    || (progressFilter === 'risk' && ['High', 'Medium'].includes(student.riskTier))
    || (progressFilter === 'complete' && student.progressStatus === 'Completed')
    || (progressFilter === 'unavailable' && student.attendanceRate == null)
  ));

  const recordsPage = useRecordPage(filteredStudents.sort(compareStudents), (selectedSection?.id || '') + ':' + searchQuery + ':' + progressFilter);
  if (loading) {
    return <PageSkeleton label="Calculating cohort analytics" variant="dashboard" />;
  }
  return (
    <div className="coordinator-analytics-page" style={s.page}>
      <div className="analytics-toolbar">
        <div className="analytics-actions" style={s.actions}>
          <button type="button" style={s.secondaryBtn} onClick={loadData}><Icon name="refresh" size={15} /> Refresh</button>
          {selectedSection?.id && <button ref={editButton} type="button" style={s.secondaryBtn} onClick={() => {
            setScheduleError('');
            setExceptionDate('');
            setDraft(schedule);
          }}>Work schedule</button>}
          <button type="button" style={s.secondaryBtn} onClick={exportCsv} disabled={!data?.students?.length}>
            <Icon name="download" size={15} /> Export CSV
          </button>
        </div>
      </div>

      {error && <div role="alert" style={s.errorBox}>{error}</div>}
      {draft && <PortalFormDialog className="admin-term-dialog analytics-schedule-modal" label="Edit work schedule" closeOnBackdrop
        onCancel={() => { if (!saving) closeSchedule(); }}>
        <form onSubmit={saveSchedule}>
          <header><h2>Edit work schedule</h2></header>
          <div className="analytics-drawer-body">
            <fieldset disabled={saving}>
        <details><summary>How is this calculated?</summary><p>Section-wide schedule, Philippine time. Attendance uses the last 20 eligible completed scheduled days; projection uses the prior 28 calendar days. At least 5 eligible days are needed. Today, non-working days, exceptions and excused dates are excluded. Hours are server-credited, not coordinator-verified. Estimates are not guarantees; uncertain inputs may prevent a tier or recovery.</p></details>
        <div className="analytics-schedule-fields">{['startDate', 'deadline', 'startTime'].map(field => <label key={field}>{field === 'startDate' ? 'Start date' : field === 'deadline' ? 'Deadline' : 'Start time'} <input required type={field === 'startTime' ? 'time' : 'date'} value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} /></label>)}</div>
        <div className="analytics-working-days">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, index) => <label key={day}><input type="checkbox" checked={draft.workingDays.includes(index)} onChange={event => setDraft(current => ({ ...current, workingDays: event.target.checked ? [...current.workingDays, index] : current.workingDays.filter(value => value !== index) }))} />{day}</label>)}</div>
        <div className="analytics-exceptions">
          <label>Exception date <input type="date" value={exceptionDate} onChange={event => setExceptionDate(event.target.value)} /></label>
          <button type="button" className="portal-secondary" disabled={!exceptionDate || draft.exceptions.includes(exceptionDate)} onClick={() => {
            setDraft(current => ({ ...current, exceptions: [...current.exceptions, exceptionDate] }));
            setExceptionDate('');
          }}>Add date</button>
          {draft.exceptions.map(date => <button type="button" className="portal-secondary" key={date} aria-label={'Remove excluded date ' + date}
            onClick={() => setDraft(current => ({ ...current, exceptions: current.exceptions.filter(value => value !== date) }))}>{date} ×</button>)}
        </div>

            </fieldset>
            {scheduleError && <p role="alert">{scheduleError}</p>}
          </div>
          <footer>
            <button type="button" className="portal-secondary" disabled={saving} onClick={() => closeSchedule()}>Cancel</button>
            <button type="submit" style={s.primaryBtn} disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
          </footer>
        </form>
      </PortalFormDialog>}

      {/* Metrics Summary Grid */}
      {data && (
        <div className="analytics-metrics" style={s.metricsGrid}>
          <MetricCard label="Total Students" value={data.totalStudents ?? 'Unavailable'} />
          <MetricCard label="Active Interns" value={data.activeInterns ?? 'Unavailable'} />
          <MetricCard label="Completed OJT" value={data.countsAvailable?.completed === true ? data.completedInterns ?? 'Unavailable' : 'Unavailable'} />
          <MetricCard label="Students at high risk of falling behind" value={data.countsAvailable?.highRisk === true ? data.atRiskStudents ?? 'Unavailable' : 'Unavailable'} />
          <MetricCard label="Hours counted toward internship" value={data.countsAvailable?.totalHours === true && data.totalHoursLogged != null ? `${data.totalHoursLogged} hrs` : 'Unavailable'} />
          <MetricCard label="Average hours" value={data.countsAvailable?.totalHours === true && data.averageHours != null ? `${data.averageHours} hrs` : 'Unavailable'} />
        </div>
      )}

      {/* Student Progress Breakdown Table */}
      <div className="analytics-records" style={s.tableCard}>
        <div style={s.cardHeader}>
          <div>
            <h3 style={s.cardTitle}>Student progress</h3>
            {data?.today && <p style={s.sub}>As of <time dateTime={data.today}>{data.today}</time></p>}
          </div>
          <div className="analytics-table-controls"><CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search analytics records" placeholder="Search by name or ID…" />
          <select aria-label="Progress filter" value={progressFilter} onChange={event => setProgressFilter(event.target.value)}>
            <option value="all">All students</option>
            <option value="risk">At risk</option>
            <option value="complete">Target met</option>
            <option value="unavailable">Attendance unavailable</option>
          </select></div>
        </div>

        <div className="analytics-table-scroll" style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Student ID</th>
                <th style={s.th}>Student name</th>
                {!selectedSection?.id && <th style={s.th}>Section</th>}
                <th style={s.th}>Hours</th>
                <th style={s.th}>Progress</th>
                <th style={s.th}>Attendance</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recordsPage.items.map(st => {
                const percent = st.completionPercentage;
                return (
                  <tr key={st.id} id={`attendance-student-${st.id}`} style={{ ...s.tr, ...(st.id === highlightStudentId ? { backgroundColor: COLORS.sky50, outline: `2px solid ${COLORS.sky500}`, outlineOffset: -2 } : {}) }}>
                    <td style={s.td}><span style={s.idCode}>{st.idNumber || '—'}</span></td>
                    <td style={s.td}><div style={s.studentName}>{st.name}</div></td>
                    {!selectedSection?.id && <td style={s.td}>{st.section}</td>}
                    <td style={s.td}>
                      <strong>{st.hoursRendered ?? 'Unavailable'}</strong> / {st.hoursRequired ?? 'Unavailable'} hrs
                    </td>
                    <td style={s.td}>
                      <div style={s.progressContainer}>
                        <div style={s.progressBarWrap}>
                          <div style={{ ...s.progressBar, width: `${percent == null ? 0 : Math.max(0, Math.min(100, percent))}%` }} />
                        </div>
                        <span style={s.progressText}>{percent == null ? 'Unavailable' : `${percent}%`}</span>
                      </div>
                    </td>
                    <td style={s.td}>
                      <details open={st.id === highlightStudentId || undefined} className="analytics-attendance-metrics" style={s.attendanceMini}>
                        <summary>Attendance details</summary>
                        <span style={{ display: 'block' }}>Risk: {st.riskTier ?? 'Unavailable'} · Data: {st.dataStatus ?? 'Unavailable'}</span>
                        <span>Attendance rate: <strong>{st.attendanceRate == null ? 'Unavailable' : `${st.attendanceRate}%`}</strong></span>
                        {st.lateRate > 0 && <span style={{ display: 'block' }}>{st.lateRate}% late</span>}
                        {st.missedShifts > 0 && <span style={{ display: 'block' }}>{st.missedShifts} missed</span>}
                        <span>{st.projectedCompletion ? `Estimated completion: ${st.projectedCompletion}` : 'Completion estimate unavailable'}</span>
                        {(st.reasonCodes || []).map((reason, index) => <small key={`${reason.code}:${index}`} style={{ display: 'block' }}>{attendanceReasonLabels[reason.code] || reason.code}</small>)}
                        <small>Scheduled days used in the calculation: attendance {st.observationCounts?.attendanceEligibleDays ?? 'Unavailable'}; projection {st.observationCounts?.projectionEligibleDays ?? 'Unavailable'}</small>
                        <button type="button" aria-label={`Edit excused dates for ${st.name}`} onClick={() => setEditing(editing === st.id ? null : st.id)}>Edit excused dates</button>
                        {editing === st.id && <AttendanceExcusedEditor key={`excused:${selectedSection.id}:${st.id}`} sectionId={selectedSection.id} studentId={st.id} isCurrent={isCurrent} onDenied={onDenied} />}
                        {selectedSection?.id && <AttendanceAiExplanation key={`${selectedSection.id}:${st.id}`} sectionId={selectedSection.id} studentId={st.id} onDenied={onDenied} isCurrent={isCurrent} metricsVersion={JSON.stringify([st.creditedHours, st.riskTier, st.progressStatus, st.dataStatus, st.reasonCodes, st.observationCounts, st.projectedCompletion, st.attendanceRate, st.onTimeRate, st.missedShifts, data.today])} />}
                      </details>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <span style={{
                        ...s.statusBadge,
                        backgroundColor: st.riskTier === 'High' ? COLORS.rose50 : st.riskTier === 'Medium' ? COLORS.yellow100 : COLORS.sky50,
                        color: '#000000',
                        border: `1px solid ${COLORS.slate300}`,
                      }}>
                        Risk: {st.riskTier ?? 'Unavailable'}
                      </span>
                      <p>Progress: {st.progressStatus ?? 'Unavailable'}</p>
                      <p>Data: {st.dataStatus ?? 'Unavailable'}</p>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={selectedSection?.id ? 6 : 7} style={{ ...s.td, textAlign: 'center', color: '#000000', padding: 32 }}>
                    {searchQuery || progressFilter !== 'all' ? 'No students match this search or filter.' : 'No student progress records found for this cohort.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <RecordPagination pagination={recordsPage} label="Analytics students" compact showSinglePage />
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="analytics-metric-card" style={s.metricCard}>
      <div style={s.metricLabel}>{label}</div>
      <div className={value === 'Unavailable' ? 'analytics-metric-unavailable' : undefined} style={s.metricValue}>{value === 'Unavailable' ? '—' : value}</div>
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
    fontWeight: 600,
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
