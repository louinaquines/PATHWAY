import personName from '../personName';
import { compareStudents } from '../coordinatorStudentSort';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/ClearanceTab.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { isReadyForClearance } from '../coordinatorOverviewData';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import './CoordinatorOperations.css';
import Pager from '../components/Pager';
import { createPortal } from 'react-dom';
import './RequirementsRedesign.css';
import './LogbookRedesign.css';
import './ClearanceRedesign.css';

export function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

export function escapeReportText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

const CLEARANCE_ICONS = {
  all: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c-.4-2-1.4-3.5-2.9-4.5" /></>,
  cleared: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  ready: <><path d="M4 21V4h11l-1.5 4L15 12H4" /></>,
  requirements: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  hours: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export default function ClearanceTab({ coordinatorId, selectedSection, initialFilter = 'all' }) {
  const loadVersion = useRef(0);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [summaryFilter, setSummaryFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('cl-top-actions')); }, []);

  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    const version = ++loadVersion.current;
    if (!coordinatorId || !selectedSection?.id) { setRows([]); setLoading(false); return; }
    if (!silent) setLoading(true);
    setError('');
    try {
      const sectionSnap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      const sections = sectionSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const scopedSections = selectedSection ? sections.filter(section => section.id === selectedSection.id) : [];
      if (!scopedSections.length) { setRows([]); setError('This section is not assigned to you.'); return; }
      const evaluationResult = await adminRequest('/coordinator-evaluations');
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      const evaluatedStudents = new Set((evaluationResult.evaluations || []).filter(item => item.submitted).map(item => item.studentId));
      const evalState = new Map();
      (evaluationResult.evaluations || []).forEach(item => {
        const state = item.submitted ? 'answered' : Date.parse(item.expiresAt) < Date.now() ? 'expired' : 'waiting';
        const rank = { answered: 3, waiting: 2, expired: 1 };
        if (!evalState.has(item.studentId) || rank[state] > rank[evalState.get(item.studentId)]) evalState.set(item.studentId, state);
      });
      const groups = await Promise.all(scopedSections.map(async section => {
        const [studentSnap, reqSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', section.id))),
          getDocs(collection(db, 'sections', section.id, 'requirements')).catch(() => ({ docs: [] })),
        ]);
        const reqIds = reqSnap.docs.map(d => d.id);
      if (!isRefreshCurrent()) return;
        return studentSnap.docs.map(d => {
          const student = d.data();
          const required = Number(student.hoursRequired || section.hoursRequired || 486);
          const rendered = Number(student.hoursRendered || 0);
          const requirements = student.requirementsStatus === 'approved';
          const hours = rendered >= required;
          return {
            id: d.id,
            section: section.name || section.id,
            student: personName(student),
            idNumber: student.idNumber || '',
            requirements: requirements ? 'Approved' : (student.requirementsStatus || 'Not submitted'),
            rendered,
            required,
            hours: hours ? 'Complete' : 'Incomplete',
            account: student.accountApproved ? 'Approved' : 'Pending',
            ready: isReadyForClearance({ ...student, id: d.id }, section, evaluatedStudents),
            clearanceStatus: student.clearanceStatus || 'not_cleared',
            clearedAt: student.clearedAt?.toDate ? student.clearedAt.toDate().toISOString() : student.clearedAt || '',
            company: student.companyName || student.company || '',
            docsTotal: reqIds.length,
            docsApproved: reqIds.filter(id => student.requirements?.[id]?.status === 'approved').length,
            evaluation: evalState.get(d.id) || 'none',
            checks: {
              account: !!student.accountApproved,
              placement: student.placementStatus === 'approved',
              preDeployment: student.preDeploymentStatus === 'approved',
            },
          };
        });
      }));
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      setRows(groups.flat());
    } catch (e) {
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      console.error(e);
      setError(e.message || 'Could not load clearance records.');
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [coordinatorId, selectedSection]);

  usePortalAutoRefresh(load, { enabled: !loading, scope: selectedSection?.id || '', protectInputs: true });


  useEffect(() => {
    setRows([]); setSearchQuery(''); setSummaryFilter(initialFilter);
    load();
    return () => { loadVersion.current += 1; };
  }, [load, initialFilter]);

  const markCleared = async row => {
    if (!row.ready || row.clearanceStatus === 'cleared') return;
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(row.id)}/clearance`, {
        method: 'POST',
      });
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, clearanceStatus: 'cleared', clearedAt: new Date().toISOString() } : item));
    } catch (e) {
      console.error(e);
      setError('Could not approve clearance. Check your permissions and try again.');
    }
  };

  const exportCsv = () => {
    const columns = ['Student ID', 'Student', 'Section', 'Account', 'Requirements', 'Hours Rendered', 'Hours Required', 'Hours Status', 'Clearance'];
    const content = [
      columns,
      ...[...rows].sort(compareStudents).map(row => [
        row.idNumber,
        row.student,
        row.section,
        row.account,
        row.requirements,
        row.rendered,
        row.required,
        row.hours,
        row.clearanceStatus === 'cleared' ? 'Cleared' : row.ready ? 'Ready' : 'Not ready'
      ])
    ].map(line => line.map(csvCell).join(',')).join('\n');

    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pathway-clearance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const printable = window.open('', '_blank', 'width=1000,height=700');
    if (!printable) {
      setError('Allow pop-ups to print the clearance report.');
      return;
    }
    const body = [...rows].sort(compareStudents).map(row => `
      <tr>
        <td>${escapeReportText(row.idNumber)}</td>
        <td><strong>${escapeReportText(row.student)}</strong></td>
        <td>${escapeReportText(row.section)}</td>
        <td>${escapeReportText(row.requirements)}</td>
        <td>${row.rendered} / ${row.required} hrs</td>
        <td>${row.clearanceStatus === 'cleared' ? 'CLEARED' : row.ready ? 'READY' : 'NOT READY'}</td>
      </tr>
    `).join('');

    printable.document.write(`
      <html>
        <head>
          <title>PATHWAY Clearance Report</title>
          <style>
            body { font-family: 'Plus Jakarta Sans', Arial, sans-serif; padding: 32px; color: #000000; }
            h1 { color: #0284C7; margin: 0 0 4px; font-size: 22px; }
            p { color: #000000; font-size: 13px; margin: 0 0 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
            th, td { border: 1px solid #000000; padding: 8px 12px; text-align: left; color: #000000; }
            th { background: #FEF9C3; text-transform: uppercase; font-size: 11px; color: #000000; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>PATHWAY OJT Clearance Report</h1>
          <p>Generated: ${new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          <table>
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Student</th>
                <th>Section</th>
                <th>Requirements</th>
                <th>Internship hours completed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
          <br/>
          <button onclick="window.print()" style="padding: 8px 16px; background: #0284C7; color: #FFF; border: none; border-radius: 6px; cursor: pointer;">Print</button>
        </body>
      </html>
    `);
    printable.document.close();
  };



  const stateOf = row => row.clearanceStatus === 'cleared' ? 'cleared' : row.ready ? 'ready' : 'working';
  const counts = { all: rows.length, ready: 0, working: 0, cleared: 0 };
  rows.forEach(row => { counts[stateOf(row)] += 1; });
  const view = ['all', 'ready', 'working', 'cleared'].includes(summaryFilter) ? summaryFilter : 'all';
  const filteredRows = rows.filter(row => (view === 'all' || stateOf(row) === view) && matchesCoordinatorSearch(searchQuery, row.student, row.idNumber, row.company))
    .sort(compareStudents);
  const pages = Math.max(1, Math.ceil(filteredRows.length / 10));
  const current = Math.min(page, pages);
  const pageRows = filteredRows.slice((current - 1) * 10, current * 10);
  const short = value => { const t = Date.parse(value); return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''; };
  const evalLabel = { answered: 'Answered', waiting: 'Waiting', expired: 'Link expired', none: 'Not asked' };
  const missing = row => [
    row.docsTotal && row.docsApproved < row.docsTotal && `${row.docsTotal - row.docsApproved} document${row.docsTotal - row.docsApproved === 1 ? '' : 's'} not approved yet`,
    row.rendered < row.required && `${Math.max(0, row.required - row.rendered)} more hours to render`,
    row.evaluation !== 'answered' && (row.evaluation === 'none' ? 'Supervisor evaluation not asked yet' : row.evaluation === 'expired' ? 'Evaluation link expired' : 'Waiting for the supervisor’s evaluation'),
    !row.checks.placement && 'Placement not approved',
    !row.checks.preDeployment && 'Pre-deployment not approved',
    !row.checks.account && 'Account not approved',
  ].filter(Boolean);
  const Tick = ({ ok }) => ok
    ? <svg className="cl-tick" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1f7a4d" /><path d="m7 12.5 3.2 3L17 9" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
    : <svg className="cl-tick" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="#c9c4ba" strokeWidth="1.6" /></svg>;
  const initials = name => String(name || '?').split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();

  if (loading) {
    return <PageSkeleton label="Loading clearance matrix" variant="detail" />;
  }
  const topActions = <>
    <button type="button" className="rq-btn" onClick={printReport} disabled={!rows.length}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z" /></svg> Print report</button>
    <button type="button" className="rq-btn" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={14} /> Export list</button>
  </>;
  return (
    <div className="cl">
      {topHost ? createPortal(topActions, topHost) : <div className="cl-inline-actions">{topActions}</div>}
      <p className="cl-sub">Clear a student once every step has a green tick.</p>
      {error && <div role="alert" className="cl-error">{error}</div>}
      <div className="cl-card">
        <div className="cl-toolbar">
          <div className="rq-pills" role="group" aria-label="Filter clearance">
            {[['all', 'All'], ['ready', 'Ready to clear'], ['working', 'Still working'], ['cleared', 'Cleared']].map(([v, l]) =>
              <button key={v} type="button" aria-pressed={view === v} onClick={() => { setSummaryFilter(v); setPage(1); }}>{l} {counts[v]}</button>)}
          </div>
          <CoordinatorSearch value={searchQuery} onChange={value => { setSearchQuery(value); setPage(1); }} label="Search clearance records" placeholder="Find a student" />
        </div>
        <div className="cl-table" role="table" aria-label="Clearance">
          <div className="cl-row cl-headrow" role="row">
            <span role="columnheader">Student</span><span role="columnheader">Documents</span><span role="columnheader">Hours</span>
            <span role="columnheader">Evaluation</span><span role="columnheader">Status</span><span role="columnheader" aria-label="Action" />
          </div>
          {pageRows.map(row => {
            const state = stateOf(row);
            const docsOk = row.docsTotal > 0 && row.docsApproved >= row.docsTotal;
            const hoursOk = row.rendered >= row.required;
            const evalOk = row.evaluation === 'answered';
            const open = openId === row.id;
            return <div key={row.id} className="cl-item" data-open={open || undefined}>
              <div className="cl-row" role="row">
                <span className="cl-student" role="cell"><i className="cl-av">{initials(row.student)}</i><span><strong>{row.student || 'Unnamed student'}</strong><small>{row.company || 'No company yet'}</small></span></span>
                <span className="cl-check" data-ok={docsOk || undefined} role="cell"><Tick ok={docsOk} />{row.docsTotal ? `${row.docsApproved} of ${row.docsTotal}` : '—'}</span>
                <span className="cl-check" data-ok={hoursOk || undefined} role="cell"><Tick ok={hoursOk} />{Math.round(row.rendered)} of {row.required} h</span>
                <span className="cl-check" data-ok={evalOk || undefined} role="cell"><Tick ok={evalOk} />{evalLabel[row.evaluation]}</span>
                <span role="cell">{state === 'cleared' ? <b className="lb-chip" data-tone="green">Cleared{row.clearedAt ? ` ${short(row.clearedAt)}` : ''}</b>
                  : state === 'ready' ? <b className="lb-chip" data-tone="blue">Ready to clear</b> : <b className="lb-chip" data-tone="mute">Still working</b>}</span>
                <span className="cl-act" role="cell">{state === 'cleared' ? <em>Certificate ready</em>
                  : state === 'ready' ? <button type="button" className="rq-btn rq-primary" disabled={busyId === row.id} onClick={async () => { setBusyId(row.id); await markCleared(row); setBusyId(null); }}><Icon name="check" size={14} /> {busyId === row.id ? 'Clearing…' : 'Clear student'}</button>
                  : <button type="button" className="rq-link" aria-expanded={open} onClick={() => setOpenId(open ? null : row.id)}>{open ? 'Hide' : 'See what’s missing'}</button>}</span>
              </div>
              {open && <ul className="cl-missing">{missing(row).length ? missing(row).map(m => <li key={m}>{m}</li>) : <li>Everything is done. Refresh to update.</li>}</ul>}
            </div>;
          })}
          {!filteredRows.length && <div className="cl-empty">{error ? 'Records could not load. Use Refresh to try again.' : searchQuery ? 'No matching students. Try another name or ID.' : selectedSection ? (rows.length ? 'No students in this view.' : 'No students yet. Clearance progress will appear here once students join this section.') : 'Select a section to review clearance readiness.'}</div>}
        </div>
        {filteredRows.length > 0 && <footer className="cl-foot"><span>{(current - 1) * 10 + 1}–{Math.min(current * 10, filteredRows.length)} of {filteredRows.length}</span><Pager page={current} pages={pages} onGo={setPage} label="Clearance pages" /></footer>}
      </div>
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
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
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
  metrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    marginBottom: 20,
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
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    overflow: 'hidden',
    boxShadow: THEME.shadows.xs,
  },
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  searchCount: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 700,
    whiteSpace: 'nowrap',
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
    fontWeight: 500,
    fontFamily: "inherit",
    color: "inherit",
    fontSize: 14,
  },
  idCode: {
    fontSize: 11,
    color: '#000000',
    fontWeight: 600,
    fontFamily: THEME.fonts.mono,
  },
  pill: {
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 8px',
    borderRadius: THEME.radius.full,
    display: 'inline-block',
  },
  hoursTag: {
    fontSize: 11,
    fontWeight: 700,
    color: '#000000',
    marginLeft: 4,
  },
  clearBtn: {
    padding: '6px 14px',
    border: 'none',
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  clearedPill: {
    backgroundColor: COLORS.emerald50,
    color: '#000000',
    border: `1px solid ${COLORS.emerald200}`,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
    fontWeight: 800,
    fontSize: 11,
  },
  notReadyPill: {
    color: '#000000',
    backgroundColor: COLORS.slate100,
    border: `1px solid ${COLORS.slate300}`,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
    fontSize: 11,
    fontWeight: 700,
  },
  empty: {
    padding: 40,
    textAlign: 'center',
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
  errorBox: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.rose200}`,
    fontSize: 13,
  },
};
