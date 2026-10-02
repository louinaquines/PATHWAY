// src/pages/ClearanceTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export default function ClearanceTab({ coordinatorId, selectedSection }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    setError('');
    try {
      const sectionSnap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      const sections = sectionSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const scopedSections = selectedSection ? sections.filter(section => section.id === selectedSection.id) : [];
      const groups = await Promise.all(scopedSections.map(async section => {
        const studentSnap = await getDocs(query(collection(db, 'users'), where('sectionId', '==', section.id)));
        return studentSnap.docs.map(d => {
          const student = d.data();
          const required = Number(student.hoursRequired || section.hoursRequired || 486);
          const rendered = Number(student.hoursRendered || 0);
          const requirements = student.requirementsStatus === 'approved';
          const hours = rendered >= required;
          return {
            id: d.id,
            section: section.name || section.id,
            student: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
            idNumber: student.idNumber || '',
            requirements: requirements ? 'Approved' : (student.requirementsStatus || 'Not submitted'),
            rendered,
            required,
            hours: hours ? 'Complete' : 'Incomplete',
            account: student.accountApproved ? 'Approved' : 'Pending',
            ready: student.accountApproved && requirements && hours,
            clearanceStatus: student.clearanceStatus || 'not_cleared',
          };
        });
      }));
      setRows(groups.flat());
    } catch (e) {
      console.error(e);
      setError('Could not load clearance records.');
    } finally {
      setLoading(false);
    }
  }, [coordinatorId, selectedSection]);

  useEffect(() => {
    load();
  }, [load]);

  const markCleared = async row => {
    if (!row.ready || row.clearanceStatus === 'cleared') return;
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(row.id)}/clearance`, {
        method: 'POST',
      });
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, clearanceStatus: 'cleared' } : item));
    } catch (e) {
      console.error(e);
      setError('Could not approve clearance. Check your permissions and try again.');
    }
  };

  const exportCsv = () => {
    const columns = ['Section', 'Student', 'ID Number', 'Account', 'Requirements', 'Hours Rendered', 'Hours Required', 'Hours Status', 'Clearance'];
    const content = [
      columns,
      ...rows.map(row => [
        row.section,
        row.student,
        row.idNumber,
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
    const body = rows.map(row => `
      <tr>
        <td>${row.section}</td>
        <td><strong>${row.student}</strong></td>
        <td>${row.idNumber}</td>
        <td>${row.requirements}</td>
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
                <th>Section</th>
                <th>Student</th>
                <th>ID Number</th>
                <th>Requirements</th>
                <th>Hours Rendered</th>
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

  if (loading) {
    return <PageSkeleton label="Loading clearance matrix" variant="detail" />;
  }

  const readyCount = rows.filter(row => row.ready && row.clearanceStatus !== 'cleared').length;
  const clearedCount = rows.filter(row => row.clearanceStatus === 'cleared').length;
  const needsReqs = rows.filter(row => row.requirements !== 'Approved').length;
  const needsHours = rows.filter(row => row.hours !== 'Complete').length;
  const filteredRows = rows.filter(row => matchesCoordinatorSearch(searchQuery, row.student, row.idNumber, row.section));

  return (
    <div style={s.page} className="clearance-page">
      {/* Top Toolbar */}
      <div style={s.toolbar}>
        <div>
          <h2 style={s.title}>Clearance Readiness</h2>
          <p style={s.sub}>Review student eligibility and issue official OJT clearance sign-offs.</p>
        </div>
        <div style={s.actions}>
          <button style={s.secondaryBtn} onClick={load}>Refresh</button>
          <button style={s.secondaryBtn} onClick={printReport} disabled={!rows.length}><Icon name="download" size={15} /> Print Report</button>
          <button style={s.primaryBtn} onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={15} /> Export CSV</button>
        </div>
      </div>

      {error && <div style={s.errorBox}>{error}</div>}

      {/* Metrics Grid */}
      <div style={s.metrics}>
        <MetricCard label="Total Students" value={rows.length} accent="sky" />
        <MetricCard label="Cleared" value={clearedCount} accent="emerald" />
        <MetricCard label="Ready for Sign-Off" value={readyCount} accent="yellow" />
        <MetricCard label="Needs Requirements" value={needsReqs} accent="slate" />
        <MetricCard label="Needs Hours" value={needsHours} accent="rose" />
      </div>

      {/* Table Card */}
      <div style={s.card}>
        <div style={s.searchRow}>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search clearance records" />
          <span style={s.searchCount}>{filteredRows.length} of {rows.length} record(s)</span>
        </div>
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Student Name & ID</th>
                <th style={s.th}>Section</th>
                <th style={s.th}>Requirements</th>
                <th style={s.th}>Hours Rendered</th>
                <th style={s.th}>Account</th>
                <th style={{ ...s.th, textAlign: 'right' }}>Clearance Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={`${row.idNumber}-${row.section}`} style={s.tr}>
                  <td style={s.td}>
                    <div style={s.studentName}>{row.student || 'Unnamed student'}</div>
                    <span style={s.idCode}>{row.idNumber || '—'}</span>
                  </td>
                  <td style={s.td}>{row.section}</td>
                  <td style={s.td}>
                    <span style={{
                      ...s.pill,
                      backgroundColor: row.requirements === 'Approved' ? COLORS.emerald50 : COLORS.yellow100,
                      color: '#000000',
                      border: `1px solid ${row.requirements === 'Approved' ? COLORS.emerald200 : COLORS.yellow300}`,
                    }}>
                      {row.requirements === 'Approved' ? 'Approved' : row.requirements}
                    </span>
                  </td>
                  <td style={s.td}>
                    <strong>{row.rendered}</strong> / {row.required} hrs
                    <span style={s.hoursTag}>
                      ({row.hours})
                    </span>
                  </td>
                  <td style={s.td}>
                    <span style={{
                      ...s.pill,
                      backgroundColor: row.account === 'Approved' ? COLORS.sky50 : COLORS.slate100,
                      color: '#000000',
                      border: `1px solid ${row.account === 'Approved' ? COLORS.sky200 : COLORS.slate300}`,
                    }}>
                      {row.account}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {row.clearanceStatus === 'cleared' ? (
                      <span style={s.clearedPill}><Icon name="check" size={13} /> Cleared</span>
                    ) : row.ready ? (
                      <button style={s.clearBtn} onClick={() => markCleared(row)}>
                        Approve Clearance
                      </button>
                    ) : (
                      <span style={s.notReadyPill}>Incomplete</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <div style={s.empty}>No student records found in your assigned sections.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }) {
  const accentColors = {
    sky: { border: COLORS.sky500, bg: COLORS.sky50 },
    yellow: { border: COLORS.yellow500, bg: COLORS.yellow50 },
    emerald: { border: COLORS.emerald500, bg: COLORS.emerald50 },
    rose: { border: COLORS.rose500, bg: COLORS.rose50 },
    slate: { border: COLORS.slate400, bg: COLORS.slate100 },
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
