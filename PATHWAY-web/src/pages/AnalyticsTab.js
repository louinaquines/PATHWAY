import { PortalFormDialog } from '../components/PortalStates';
import { compareStudents } from '../coordinatorStudentSort';
import { useRecordPage } from '../components/RecordPagination';
import Pager from '../components/Pager';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { showToast } from '../successFx';
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
import './AnalyticsRedesign.css';
import { createPortal } from 'react-dom';
import SectionPicker from '../components/SectionPicker';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid, ReferenceLine } from 'recharts';

function csvEscape(v) {
  const text = String(v ?? '');
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

export default function AnalyticsTab(props) {
  return <AttendanceAccess key={`${props.coordinatorId}:${props.selectedSection?.id || ''}`} actorId={props.coordinatorId} sectionId={props.selectedSection?.id}>
    {access => <AnalyticsContent {...props} {...access} />}
  </AttendanceAccess>;
}

function AnalyticsContent({ coordinatorId, selectedSection, highlightStudentId, onDenied, isCurrent, sections = [], onSectionChange }) {
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('an-top-actions')); }, []);
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
  const [panelId, setPanelId] = useState(null);

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

  usePortalAutoRefresh(loadData, { enabled: !loading && !saving && !editing && !draft && !panelId, scope: selectedSection?.id || '', protectInputs: true });


  useEffect(() => {
    loadData();
    return () => { requestRevision.current++; };
  }, [loadData]);
  useEffect(() => {
    if (data && highlightStudentId) { document.getElementById(`attendance-student-${highlightStudentId}`)?.scrollIntoView?.({ block: 'center' }); setPanelId(highlightStudentId); }
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

  const exportCsv = async () => {
    if (!data?.students) return;
    const { newWorkbook, styleSheet, addInfoSheet, downloadWorkbook, fileSafe, today, addExportedColumns } = await import('../excelKit');
    const tierText = s => { const t = s.riskTier ?? (['Not deployed', 'Completed'].includes(s.risk) ? s.risk : null); return { High: 'High risk', Medium: 'At risk', Low: 'On track' }[t] || t || 'Not enough data'; };
    const workbook = await newWorkbook();
    const sheet = workbook.addWorksheet('Progress');
    sheet.addRow(['Student ID', 'Student name', 'Section', 'Company', 'Hours done', 'Hours required', 'Progress', 'Attendance', 'Status', 'Progress status', 'Data quality', 'Estimated finish']);
    [...data.students].sort(compareStudents).forEach(s => sheet.addRow([
      String(s.idNumber || ''), s.name || '', s.section || selectedSection?.name || '', s.companyName || '',
      Number.isFinite(Number(s.hoursRendered)) ? Number(s.hoursRendered) : null, Number.isFinite(Number(s.hoursRequired)) ? Number(s.hoursRequired) : null,
      Number.isFinite(Number(s.completionPercentage)) ? Number(s.completionPercentage) / 100 : null,
      Number.isFinite(Number(s.attendanceRate)) ? Number(s.attendanceRate) / 100 : null,
      tierText(s), s.progressStatus || '', s.dataStatus || '', s.projectedCompletion || '',
    ]));
    addExportedColumns(sheet, workbook.created);
    styleSheet(sheet);
    sheet.getColumn(7).numFmt = '0%'; sheet.getColumn(8).numFmt = '0%'; sheet.getColumn(5).numFmt = '0.0'; sheet.getColumn(6).numFmt = '0';
    addInfoSheet(workbook, [['Section', selectedSection?.name || ''], ['Term', selectedSection?.termName || ''], ['Students', data.students.length], ['As of', data.today || ''],
      ['Status', 'High risk / At risk / On track come from attendance and hours. "Not enough data" means fewer than five reliable work days.'],
      ['Hours', 'Hours done count only server-credited attendance hours.']]);
    await downloadWorkbook(workbook, `PATHWAY-${fileSafe(selectedSection?.name)}-progress-${today()}.xlsx`);
    showToast('Export ready', 'Progress report downloaded.');
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

  const recordsPage = useRecordPage(filteredStudents.sort(compareStudents), (selectedSection?.id || '') + ':' + searchQuery + ':' + progressFilter, 10);
  if (loading) {
    return <PageSkeleton label="Calculating cohort analytics" variant="dashboard" />;
  }
  return (
    <div className="an coordinator-analytics-page">
      {(() => { const acts = <>
          <button type="button" className="rq-btn" onClick={loadData}><Icon name="refresh" size={15} /> Refresh</button>
          {selectedSection?.id && <button ref={editButton} type="button" className="rq-btn" onClick={() => {
            setScheduleError('');
            setExceptionDate('');
            setDraft(schedule);
          }}>Work schedule</button>}
          <button type="button" className="rq-btn" onClick={exportCsv} disabled={!data?.students?.length}>
            <Icon name="download" size={15} /> Export Excel
          </button>
        {sections.length > 0 && <SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />}</>;
        return topHost ? createPortal(acts, topHost) : <div className="an-inline-actions">{acts}</div>; })()}
      {error && <div role="alert" style={s.errorBox}>{error}</div>}
      {draft && <PortalFormDialog className="ans-dialog" label="Edit work schedule" closeOnBackdrop
        onCancel={() => { if (!saving) closeSchedule(); }}>
        <form onSubmit={saveSchedule} className="ans">
          <header className="ans-head"><div><h2>Edit work schedule</h2><p>Used to count attendance and estimate finish dates for {selectedSection?.name || 'this section'}.</p></div>
            <button type="button" className="plt-x" aria-label="Close" disabled={saving} onClick={() => closeSchedule()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></header>
          <fieldset disabled={saving} className="ans-body">
            <div className="ans-sec"><h3>OJT period</h3>
              <div className="ans-grid">{['startDate', 'deadline', 'startTime'].map(field => <label key={field} className="ans-field"><span>{field === 'startDate' ? 'Start date' : field === 'deadline' ? 'Deadline' : 'Start time'}</span> <input required type={field === 'startTime' ? 'time' : 'date'} value={draft[field]} onChange={event => setDraft(current => ({ ...current, [field]: event.target.value }))} /></label>)}</div>
            </div>
            <fieldset className="ans-sec">
              <legend><h3>Working days</h3></legend>
              <div className="ans-days">
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                  <label key={day} className="ans-day">
                    <input type="checkbox" aria-label={day} checked={draft.workingDays.includes(index)}
                      onChange={event => setDraft(current => ({
                        ...current,
                        workingDays: event.target.checked
                          ? [...current.workingDays, index]
                          : current.workingDays.filter(value => value !== index),
                      }))} />
                    <span>{day.slice(0, 3)}</span>
                  </label>
                ))}
              </div>
              <p className="ans-hint">{draft.workingDays.length} day{draft.workingDays.length === 1 ? '' : 's'} a week</p>
            </fieldset>
            <div className="ans-sec"><h3>Days off</h3><p className="ans-hint">Holidays or school events — these won’t count as absences.</p>
              <div className="ans-add">
                <label className="ans-field"><span className="sr-only">Excluded date</span><input type="date" aria-label="Excluded date" value={exceptionDate} onChange={event => setExceptionDate(event.target.value)} /></label>
                <button type="button" className="rq-btn" disabled={!exceptionDate || draft.exceptions.includes(exceptionDate)} onClick={() => {
                  setDraft(current => ({ ...current, exceptions: [...current.exceptions, exceptionDate].sort() }));
                  setExceptionDate('');
                }}>Add date</button>
              </div>
              {draft.exceptions.length > 0 && <div className="ans-chips">{draft.exceptions.map(date => <button type="button" className="ans-chip" key={date} aria-label={'Remove excluded date ' + date}
                onClick={() => setDraft(current => ({ ...current, exceptions: current.exceptions.filter(value => value !== date) }))}>{shortDate(date)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>)}</div>}
            </div>
            {scheduleError && <p role="alert" className="ans-err">{scheduleError}</p>}
          </fieldset>
          <footer className="ans-foot">
            <button type="button" className="rq-btn" disabled={saving} onClick={() => closeSchedule()}>Cancel</button>
            <button type="submit" className="rq-btn rq-primary" disabled={saving}>{saving ? 'Saving…' : 'Save schedule'}</button>
          </footer>
        </form>
      </PortalFormDialog>}

      {data && <AnalyticsOverview data={data} />}

      {/* Student Progress Breakdown Table */}
      <div className="an-card an-records">
        <div className="an-head">
          <div>
            <h3 className="an-title">All students</h3>
            {data?.today && <p className="an-sub">As of <time dateTime={data.today}>{data.today}</time></p>}
          </div>
          <div className="analytics-table-controls"><CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search analytics records" placeholder="Search by name or ID…" />
          <span className="an-sel"><select aria-label="Progress filter" value={progressFilter} onChange={event => setProgressFilter(event.target.value)}>
            <option value="all">All students</option>
            <option value="risk">At risk</option>
            <option value="complete">Target met</option>
            <option value="unavailable">Attendance unavailable</option>
          </select><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></div>
        </div>

        <div className="analytics-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student name</th>
                {!selectedSection?.id && <th>Section</th>}
                <th>Hours</th>
                <th>Progress</th>
                <th>Attendance</th>
                <th className="an-r">Status</th>
              </tr>
            </thead>
            <tbody>
              {recordsPage.items.map(st => {
                const percent = st.completionPercentage;
                return (
                  <tr data-risk={st.riskTier || undefined} key={st.id} id={`attendance-student-${st.id}`} className={st.id === highlightStudentId ? "an-hl" : undefined}>
                    <td className="an-id">{st.idNumber || '—'}</td>
                    <td className="an-name">{st.name}</td>
                    {!selectedSection?.id && <td>{st.section}</td>}
                    <td>
                      <strong>{st.hoursRendered ?? 'Unavailable'}</strong> / {st.hoursRequired ?? 'Unavailable'} hrs
                    </td>
                    <td>
                      <div className="an-prog">
                        <div className="an-track">
                          <div className="an-fill" style={{ width: `${percent == null ? 0 : Math.max(0, Math.min(100, percent))}%` }} />
                        </div>
                        <span>{percent == null ? 'Unavailable' : `${percent}%`}</span>
                      </div>
                    </td>
                    <td>
                      <div className="an-att"><span className="analytics-att-rate">{st.attendanceRate == null ? "No data yet" : `${st.attendanceRate}% attendance`}</span>
                        <button type="button" className="an-att-link" onClick={() => { setPanelId(st.id); setEditing(null); }}>Attendance details</button></div>
                    </td>
                    <td className="an-r analytics-status-cell">
                      {(() => {
                        const label = st.riskTier ?? (['Not deployed', 'Completed'].includes(st.risk) ? st.risk : 'Unavailable');
                        const tone = { High: 'high', Medium: 'medium', Low: 'low', Completed: 'done' }[label] || 'none';
                        const text = { High: 'High risk', Medium: 'At risk', Low: 'On track' }[label] || label;
                        return <span className="risk-badge" data-tone={tone}><i aria-hidden="true" />{text}</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={selectedSection?.id ? 6 : 7} className="an-none">
                    {searchQuery || progressFilter !== 'all' ? 'No students match this search or filter.' : 'No student progress records found for this cohort.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {recordsPage.total > 10 && <div className="an-foot"><span>{recordsPage.start + 1}–{recordsPage.start + recordsPage.items.length} of {recordsPage.total}</span><Pager page={recordsPage.page} pages={recordsPage.pageCount} onGo={recordsPage.onPageChange} label="Analytics students" /></div>}
      </div>
      {(() => { const st = panelId && (data?.students || []).find(x => x.id === panelId); if (!st) return null;
        return <AttendancePanel st={st} today={data.today} deadline={schedule?.deadline} sectionId={selectedSection?.id} editing={editing === st.id}
          onEdit={() => setEditing(editing === st.id ? null : st.id)} onClose={() => { setPanelId(null); setEditing(null); }}
          isCurrent={isCurrent} onDenied={onDenied} />; })()}
    </div>
  );
}

const METRIC_ICONS = {
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c-.4-2-1.4-3.5-2.9-4.5" /></>,
  active: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  done: <><path d="m22 10-10-5-10 5 10 5 10-5z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></>,
  risk: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  avg: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
};

function MetricCard({ label, value, icon, tone }) {
  const unavailable = value === 'Unavailable';
  return (
    <div className="analytics-metric-card" data-tone={tone}>
      <span className="analytics-metric-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{METRIC_ICONS[icon]}</svg></span>
      <div className={'analytics-metric-value' + (unavailable ? ' analytics-metric-unavailable' : '')}>{unavailable ? '—' : value}</div>
      <div className="analytics-metric-label">{label}</div>
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

const TIER = { Low: 'on', Completed: 'on', Medium: 'mid', High: 'far' };
function AnalyticsOverview({ data }) {
  const [wide, setWide] = useState(false);
  useEffect(() => { if (!wide) return undefined; const k = e => { if (e.key === 'Escape') setWide(false); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [wide]);
  const students = data.students || [];
  const total = students.length;
  const bars = [...students].filter(st => st.hoursRendered != null).sort((a, b) => (b.hoursRendered || 0) - (a.hoursRendered || 0));
  const max = Math.max(1, ...bars.map(st => st.hoursRequired || st.hoursRendered || 0));
  const count = tier => students.filter(st => TIER[st.riskTier ?? st.risk] === tier).length;
  const placed = students.filter(st => st.companyName).length;
  const done = students.filter(st => st.progressStatus === 'Completed').length;
  const nudge = students.filter(st => ['High', 'Medium'].includes(st.riskTier)).sort((a, b) => (a.riskTier === 'High' ? 0 : 1) - (b.riskTier === 'High' ? 0 : 1));
  const stats = [
    ['Placed in a company', placed],
    ['Clocking in now', data.activeInterns ?? 0],
    ['Finished their hours', done],
    ['Behind on hours or attendance', nudge.length],
  ];
  return <>
    <div className="an-top">
      <section className="an-card an-chart" aria-label="Hours done so far">
        <div className="an-chart-head"><div><h3 className="an-title">Hours done so far</h3>
          <p className="an-sub">Each bar is one student, tallest first. Hover a bar to see who it is.</p></div>
          {bars.length > 0 && <button type="button" className="rq-btn an-expand" aria-label="Expand hours chart" onClick={() => setWide(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>Expand</button>}</div>
        {bars.length ? <HoursChart bars={bars} average={data.averageHours} height={190} /> : <p className="an-empty">No hours logged yet.</p>}
        <div className="an-legend"><span data-tier="on">On track {count('on')}</span><span data-tier="mid">A little behind {count('mid')}</span><span data-tier="far">Far behind {count('far')}</span>{data.averageHours != null && <span className="an-avg">Class average: {data.averageHours} h.</span>}</div>
      </section>
      {wide && createPortal(<div className="an-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setWide(false); }}>
        <div className="an-modal" role="dialog" aria-modal="true" aria-label="Hours done so far, expanded">
          <div className="an-chart-head"><div><h3 className="an-title">Hours done so far</h3><p className="an-sub">{bars.length} students · names under each bar{bars.length > 25 ? ' · scroll sideways to see everyone' : ''}</p></div>
            <button type="button" className="plt-x" aria-label="Close expanded chart" autoFocus onClick={() => setWide(false)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
          <HoursChart bars={bars} average={data.averageHours} height={Math.min(520, window.innerHeight - 220)} wide />
          <div className="an-legend"><span data-tier="on">On track {count('on')}</span><span data-tier="mid">A little behind {count('mid')}</span><span data-tier="far">Far behind {count('far')}</span></div>
        </div></div>, document.body)}
      <section className="an-card an-where" aria-label="Where the class is">
        <h3 className="an-title">Where the class is</h3>
        {stats.map(([label, n]) => <div key={label} className="an-stat">
          <div><span>{label}</span><b>{n} of {total}</b></div>
          <i><em style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></i>
        </div>)}
      </section>
    </div>
  </>;
}

const TIER_COLOR = { on: '#0b5fd3', mid: '#b07a12', far: '#b3261e', none: '#c9ced8' };
function HoursTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return <div className="an-tip"><strong>{d.name}</strong><span>{d.hours} of {d.required ?? '—'} h</span></div>;
}
function HoursChart({ bars, average, height, wide = false }) {
  const rows = bars.map(st => ({ id: st.id, name: st.name, short: String(st.name || '').split(',')[0], hours: st.hoursRendered || 0, required: st.hoursRequired, tier: TIER[st.riskTier ?? st.risk] || 'none' }));
  const top = Math.max(1, ...rows.map(r => Math.max(r.required || 0, r.hours)));
  const step = top > 400 ? 100 : top > 100 ? 50 : 10;
  const max = Math.ceil(top / step) * step;
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  return <div className={wide ? 'an-rc an-rc-wide' : 'an-rc'} style={{ height }}>
    <div className="an-rc-inner" style={{ width: wide ? `max(100%, ${rows.length * 56}px)` : '100%', height: '100%' }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 10, right: 8, left: wide ? 0 : -18, bottom: wide ? 40 : 0 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke="#efece5" />
        <XAxis dataKey={wide ? 'short' : 'id'} tick={wide ? { fontSize: 11, fill: '#7b8494' } : false} tickLine={false} axisLine={{ stroke: '#e8e5de' }} interval={0} angle={wide ? -40 : 0} textAnchor={wide ? 'end' : 'middle'} height={wide ? 60 : 4} />
        <YAxis domain={[0, max]} ticks={ticks} tick={{ fontSize: 11, fill: '#7b8494' }} tickLine={false} axisLine={false} width={44} />
        <Tooltip cursor={{ fill: 'rgba(11,95,211,.06)' }} content={<HoursTip />} />
        {average != null && <ReferenceLine y={average} stroke="#465066" strokeDasharray="4 4" label={{ value: `avg ${average} h`, position: 'insideTopRight', fontSize: 11, fill: '#465066' }} />}
        <Bar dataKey="hours" radius={[3, 3, 0, 0]} maxBarSize={wide ? 34 : 22} isAnimationActive>
          {rows.map(r => <Cell key={r.id} fill={TIER_COLOR[r.tier]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  </div>;
}

const shortDate = d => { if (!d) return null; const t = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return isNaN(t) ? String(d) : t.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }); };
function AttendancePanel({ st, today, deadline, sectionId, editing, onEdit, onClose, isCurrent, onDenied }) {
  useEffect(() => { const k = e => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const label = st.riskTier ?? (['Not deployed', 'Completed'].includes(st.risk) ? st.risk : 'Unavailable');
  const tone = { High: 'red', Medium: 'amber', Low: 'green', Completed: 'green' }[label] || 'mute';
  const text = { High: 'High risk', Medium: 'At risk', Low: 'On track' }[label] || label;
  const days = st.observationCounts?.attendanceEligibleDays;
  const left = st.hoursRequired != null && st.hoursRendered != null ? Math.max(0, st.hoursRequired - st.hoursRendered) : null;
  const describe = r => {
    switch (r.code) {
      case 'ATTENDANCE_BELOW_80': case 'ATTENDANCE_BELOW_90': {
        const goal = r.code === 'ATTENDANCE_BELOW_80' ? 80 : 90;
        return st.attendanceRate != null ? `Attendance is ${st.attendanceRate}%${days ? ` over ${days} work days` : ''} — below the ${goal}% goal` : `Attendance is below the ${goal}% goal`;
      }
      case 'CONSECUTIVE_ABSENCES': return r.count ? `Absent ${r.count} work days in a row without an excuse` : 'Absent several work days in a row';
      case 'CREDIT_PROJECTION': return st.projectedCompletion ? `At the current pace (${st.hoursRendered ?? 0} h so far${left != null ? `, ${left} h left` : ''}), expected to finish ${shortDate(st.projectedCompletion)}` : `Finish date is estimated from ${st.hoursRendered ?? 0} counted hours`;
      case 'PROJECTED_SHORTFALL': return `Expected to finish ${st.projectedCompletion ? shortDate(st.projectedCompletion) : 'late'}${deadline ? `, after the ${shortDate(deadline)} deadline` : ', after the deadline'}`;
      case 'ZERO_VELOCITY': return `No new hours counted recently (still ${st.hoursRendered ?? 0} h)`;
      case 'OVERDUE': return `Deadline${deadline ? ` (${shortDate(deadline)})` : ''} has passed with ${left ?? '?'} h still to go`;
      case 'UNCERTAIN_ATTENDANCE': return `${r.attendanceDays || 'Some'} day${r.attendanceDays === 1 ? '' : 's'} with missing or duplicate clock-ins need checking`;
      case 'INSUFFICIENT_ATTENDANCE': return `Only ${days ?? 0} work day${days === 1 ? '' : 's'} recorded — needs at least 5 to judge attendance`;
      case 'INSUFFICIENT_CREDIT_HISTORY': return 'Not enough counted hours yet to estimate a finish date';
      default: return attendanceReasonLabels[r.code] || r.code;
    }
  };
  const reasons = (st.reasonCodes || []).map(describe);
  const initials = String(st.name || '?').split(/[ ,]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const tiles = [
    ['Attendance', st.attendanceRate == null ? '—' : `${st.attendanceRate}%`],
    ['Missed days', st.missedShifts ?? 0],
    ['Late', st.lateRate ? `${st.lateRate}%` : '0%'],
    ['Estimated finish', st.projectedCompletion ? shortDate(st.projectedCompletion) : 'Not enough data'],
  ];
  return createPortal(<div className="anp-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <aside className="anp" role="dialog" aria-modal="true" aria-label={`Attendance for ${st.name}`}>
      <header className="anp-head">
        <span className="an-av" aria-hidden="true">{initials}</span>
        <div><h2>{st.name}</h2><small>{st.idNumber}</small></div>
        <button type="button" className="plt-x" aria-label="Close" autoFocus onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
      </header>
      <div className="anp-body">
        <div className="anp-status"><b className="lb-chip" data-tone={tone}>{text}</b><span>Progress: {st.progressStatus ?? 'Unavailable'} · Data: {st.dataStatus ?? 'Unavailable'}</span></div>
        <div className="anp-tiles">{tiles.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        {!st.projectedCompletion && <p className="anp-note">Completion estimate unavailable</p>}
        <section className="anp-sec"><h3>Why they’re flagged</h3>
          {reasons.length ? <ul className="anp-why">{reasons.map((r, i) => <li key={i}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" /></svg>{r}</li>)}</ul>
            : <p className="anp-note">Nothing flagged right now.</p>}
          <p className="anp-note">Based on {st.observationCounts?.attendanceEligibleDays ?? '—'} scheduled days{today ? ` · as of ${shortDate(today)}` : ''}.</p>
        </section>
        <section className="anp-sec anp-fold"><div className="anp-fold-head"><h3>Excused dates</h3>
          <button type="button" className="an-att-link" aria-label={`Edit excused dates for ${st.name}`} aria-expanded={editing} onClick={onEdit}>{editing ? 'Close' : 'Edit'}</button></div>
          {editing ? sectionId && <AttendanceExcusedEditor key={`excused:${sectionId}:${st.id}`} sectionId={sectionId} studentId={st.id} isCurrent={isCurrent} onDenied={onDenied} />
            : <p className="anp-note">Excused days don’t count against attendance. Hours aren’t changed.</p>}
        </section>
        {sectionId && <section className="anp-sec anp-ai"><AttendanceAiExplanation key={`${sectionId}:${st.id}`} sectionId={sectionId} studentId={st.id} onDenied={onDenied} isCurrent={isCurrent} metricsVersion={JSON.stringify([st.creditedHours, st.riskTier, st.progressStatus, st.dataStatus, st.reasonCodes, st.observationCounts, st.projectedCompletion, st.attendanceRate, st.onTimeRate, st.missedShifts, today])} /></section>}
      </div>
      <footer className="anp-foot"><button type="button" className="rq-btn" onClick={onClose}>Close</button></footer>
    </aside>
  </div>, document.body);
}
