// src/pages/AuditLogsTab.js
import { useEffect, useState, useCallback } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { PageSkeleton } from '../components/LoadingSkeleton';
import './AdminConfiguration.css';

export default function AuditLogsTab() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');

  const loadLogs = useCallback(() => {
    setLoading(true);
    adminRequest('/admin/audit-logs')
      .then(data => setLogs(data.logs || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter(log =>
    `${log.actorId || ''} ${log.actorRole || ''} ${log.action || ''} ${log.targetType || ''} ${log.targetId || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  if (loading) {
    return <PageSkeleton label="Loading security audit logs" variant="table" />;
  }

  return (
    <div style={s.page} className="admin-configuration admin-audit">
      <div style={s.headerRow}>
        <div>
          <h2 style={s.title}>Audit logs</h2>
          <p style={s.sub}>Chronological record of sensitive actions, status modifications, and approvals.</p>
        </div>
        <button style={s.refreshBtn} onClick={loadLogs}><Icon name="refresh" size={15} /> Refresh Logs</button>
      </div>

      {error && <div role="alert" style={s.error}>{error}</div>}

      <div style={s.card} className="admin-audit-records">
        <div style={s.searchBarRow}>
          <input
            type="text"
            aria-label="Search audit logs"
            placeholder="Search by action, role, actor ID, or target..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={s.searchInput}
          />
          <span style={s.countBadge}>{filteredLogs.length} of {logs.length} logged events</span>
        </div>

        {filteredLogs.length === 0 ? (
          <div style={s.empty}>
            <div style={s.emptyIcon}><Icon name="shield" size={28} label="Audit logs" /></div>
            <p style={{ margin: 0, color: '#000000' }}>{error ? 'Audit records could not be loaded. Try Refresh Logs.' : logs.length ? 'No audit records match your query.' : 'No audit records yet.'}</p>
          </div>
        ) : (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Timestamp</th>
                  <th style={s.th}>Action</th>
                  <th style={s.th}>Actor & Role</th>
                  <th style={s.th}>Target</th>
                  <th style={s.th}>Metadata Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.timeText}>
                        {new Date(log.createdAt).toLocaleString('en-PH', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </td>
                    <td style={s.td}>
                      <span style={s.actionBadge}>{log.action}</span>
                    </td>
                    <td style={s.td}>
                      <div style={s.actorText}>{log.actorId || 'system'}</div>
                      <span style={{
                        ...s.roleBadge,
                        backgroundColor: log.actorRole === 'admin' ? COLORS.rose50 : COLORS.sky50,
                        color: '#000000',
                        border: `1px solid ${log.actorRole === 'admin' ? COLORS.rose200 : COLORS.sky200}`,
                      }}>
                        {log.actorRole || 'System'}
                      </span>
                    </td>
                    <td style={s.td}>
                      <strong style={{ color: '#000000' }}>{log.targetType}</strong>
                      {log.targetId && (
                        <div style={s.targetIdCode}>ID: {log.targetId}</div>
                      )}
                    </td>
                    <td style={s.td}>
                      <details className="admin-audit-details"><summary>View details</summary><pre style={s.detailsPre}>
                        {JSON.stringify(log.details || {}, null, 2)}
                      </pre></details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 1100,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  title: {
    margin: '0 0 4px',
    color: '#000000',
    fontSize: 20,
    fontWeight: 800,
  },
  sub: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
  },
  refreshBtn: {
    backgroundColor: COLORS.white,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '8px 14px',
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
    cursor: 'pointer',
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 20,
    boxShadow: THEME.shadows.xs,
  },
  searchBarRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  searchInput: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '8px 14px',
    fontSize: 13,
    width: 340,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  countBadge: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 700,
  },
  tableWrap: {
    overflowX: 'auto',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '11px 14px',
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  td: {
    padding: '12px 14px',
    color: '#000000',
    verticalAlign: 'top',
  },
  timeText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: THEME.fonts.mono,
    whiteSpace: 'nowrap',
    fontWeight: 600,
  },
  actionBadge: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    padding: '3px 8px',
    borderRadius: THEME.radius.sm,
    fontWeight: 800,
    fontSize: 11,
    fontFamily: THEME.fonts.mono,
    display: 'inline-block',
  },
  actorText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: THEME.fonts.mono,
    fontWeight: 700,
  },
  roleBadge: {
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 7px',
    borderRadius: THEME.radius.full,
    display: 'inline-block',
    marginTop: 4,
  },
  targetIdCode: {
    fontSize: 11,
    color: '#000000',
    fontFamily: THEME.fonts.mono,
    marginTop: 2,
    fontWeight: 600,
  },
  detailsPre: {
    margin: 0,
    fontSize: 11,
    backgroundColor: COLORS.slate50,
    padding: '6px 10px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.slate300}`,
    color: '#000000',
    maxHeight: 120,
    overflowY: 'auto',
    maxWidth: 300,
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
  error: {
    backgroundColor: COLORS.rose50,
    color: '#000000',
    padding: 12,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.rose200}`,
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
