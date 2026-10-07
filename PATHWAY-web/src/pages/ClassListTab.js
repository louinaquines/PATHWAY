// src/pages/ClassListTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import { adminRequest } from '../adminApi';
import './CoordinatorRecords.css';

export default function ClassListTab({ department, coordinatorId }) {
  const [sections, setSections] = useState([]);
  const [sectionId, setSectionId] = useState('');
  const [outcomes, setOutcomes] = useState([]);
  const [resetResult, setResetResult] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(null);
  const [ids, setIds]         = useState([]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [message, setMessage] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);

  const loadIds = useCallback(async () => {
    if (!department) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'studentRoster'),
        where('department', '==', department),
        where('active', '==', true)
      ));
      setIds(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id)));
    } catch (e) {
      console.error(e);
      setMessage('Could not load the authorized class list.');
    } finally {
      setLoading(false);
    }
  }, [department]);

  useEffect(() => {
    if (department) loadIds();
  }, [department, loadIds]);

  useEffect(() => {
    getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)))
      .then(snap => setSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => setMessage('Could not load your assigned sections.'));
  }, [coordinatorId]);

  const addIds = async () => {
    const students = input.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [idNumber, firstName, lastName, ...extra] = line.split(',').map(v => v.trim());
      return { idNumber, firstName, lastName, extra };
    }).filter(row => row.idNumber.toLowerCase() !== 'studentid');
    if (!sectionId || !students.length || students.some(row => !row.firstName || !row.lastName || row.extra.length)) {
      setMessage('Select a section and enter one StudentID,FirstName,LastName row per student. Commas inside names are not supported.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const result = await adminRequest('/coordinator/provision-students', {
        method: 'POST', body: JSON.stringify({ sectionId, students: students.map(({ extra, ...row }) => row) }),
      });
      setOutcomes(result.outcomes);
      if (result.outcomes.every(row => row.status !== 'failed')) setInput('');
      setMessage(`Import finished: ${result.outcomes.filter(row => row.status === 'created').length} created, ${result.outcomes.filter(row => row.status === 'unchanged').length} unchanged, ${result.outcomes.filter(row => row.status === 'failed').length} failed.`);
      await loadIds();
    } catch (e) {
      console.error(e);
      setMessage(e.message || 'Could not provision student accounts. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const removeId = async (id) => {
    setSaving(true);
    setMessage('');
    try {
      await adminRequest(`/coordinator/student-roster/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setIds(prev => prev.filter(item => item.id !== id));
      setMessage(`Removed student ID ${id}.`);
    } catch (e) {
      console.error(e);
      setMessage('Could not remove that ID.');
    } finally {
      setSaving(false);
    }
  };

  const filteredIds = ids.filter(item => item.id.toLowerCase().includes(filterQuery.toLowerCase()));

  if (loading) {
    return <PageSkeleton label="Loading authorized roster" variant="table" />;
  }

  return (
    <div className="authorized-roster-page" style={s.page}>
      {/* Top Banner / Card */}
      <div className="roster-import-card" style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <h2 style={s.title}>Import class list</h2>
            <p style={s.help}>
              Create accounts from your authorized class list. Students must change their initial password before accessing PATHWAY. Reimporting does not reset existing passwords.
            </p>
          </div>
          <span style={s.deptBadge}>{department}</span>
        </div>

        <div style={s.inputSection}>
          <label style={s.label}>Assigned section</label>
          <select aria-label="Assigned section" value={sectionId} onChange={e => setSectionId(e.target.value)} disabled={saving}>
            <option value="">Select section</option>{sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
          <label style={s.label}>Upload a CSV file</label>
          <p className="roster-format-help">Columns: StudentID, FirstName, LastName. Email addresses are not required.</p>
          <input type="file" accept=".csv,text/csv" disabled={saving} aria-label="Upload authorized class list" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 100000) { setMessage('Class list must be under 100 KB.'); return; }
            try { setInput((await file.text()).replace(/^\uFEFF/, '')); } catch { setMessage('Could not read the class list.'); }
          }} />
          <textarea
            aria-label="Class list CSV content"
            style={s.textarea}
            rows={4}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={'StudentID,FirstName,LastName\n24228132,Taylor,Student'}
            disabled={saving}
          />
          <div style={s.formActions}>
            <button
              style={s.addButton}
              onClick={addIds}
              disabled={saving || !input.trim()}
            >
              {saving ? 'Provisioning accounts...' : 'Import and create accounts'}
            </button>
            {message && (
              <span role="status" style={message.includes('Could not') || message.includes('Enter') ? s.errorText : s.successText}>
                {message}
              </span>
            )}
          </div>
        </div>
        {outcomes.length > 0 && <ul aria-label="Import results">{outcomes.map(row => <li key={row.idNumber}>{row.idNumber}: {row.status}{row.error ? ` — ${row.error}` : ` — ${row.username}`}</li>)}</ul>}
        {resetResult && <div role="status">Temporary password for {resetResult.id}: <code>{resetResult.password}</code>. Deliver privately after verifying identity. <button onClick={() => setResetResult(null)}>Dismiss</button></div>}
      </div>

      {/* Roster List Card */}
      <div className="roster-records-card" style={s.card}>
        <div style={s.listHeader}>
          <div>
            <h3 style={s.subtitle}>Authorized students</h3>
            <span style={s.countText}>{filteredIds.length} of {ids.length} students</span>
          </div>
          {ids.length > 0 && (
            <CoordinatorSearch value={filterQuery} onChange={setFilterQuery} placeholder="Search student ID..." label="Search authorized student IDs" />
          )}
        </div>

        {ids.length === 0 ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}><Icon name="clipboard" size={28} label="Authorized roster" /></div>
            <p style={s.empty}>No student IDs have been authorized for {department} yet.</p>
          </div>
        ) : (
          <div style={s.tableContainer}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Student ID</th>
                  <th style={s.th}>Username</th>
                  <th style={s.th}>Department</th>
                  <th style={s.th}>Date Added</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIds.length === 0 && <tr><td colSpan={5} style={s.td}>No matching student IDs.</td></tr>}
                {filteredIds.map(item => (
                  <tr key={item.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.idCode}>{item.id}</span>
                    </td>
                    <td style={s.td}>{item.claimedBy?.startsWith('roster-') ? `uclm-${item.id.toLowerCase()}` : 'Legacy / not provisioned'}</td>
                    <td style={s.td}>{item.department}</td>
                    <td style={s.td}>
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      <button
                        style={s.removeBtn}
                        onClick={() => setRemoveConfirm(item)}
                        disabled={saving}
                      >
                        Remove
                      </button>
                      {item.claimedBy && <button disabled={saving} onClick={() => { setResetResult(null); setResetConfirm(item); }}>Reset password</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AlertDialog
        open={Boolean(resetConfirm)} title="Verify identity before resetting password"
        description="Confirm that you verified this student's identity. Existing sessions will be revoked and a new password change will be required."
        confirmLabel="Identity verified — reset" busy={saving} onCancel={() => setResetConfirm(null)}
        onConfirm={async () => {
          setSaving(true);
          try {
            const result = await adminRequest(`/coordinator/students/${encodeURIComponent(resetConfirm.claimedBy)}/reset-password`, { method: 'POST', body: JSON.stringify({ identityVerified: true }) });
            setResetResult({ id: resetConfirm.id, password: result.temporaryPassword }); setResetConfirm(null);
          } catch (e) { setMessage(e.message); }
          finally { setSaving(false); }
        }}
      />
      <AlertDialog
        open={Boolean(removeConfirm)}
        title="Remove authorized student ID?"
        description={removeConfirm ? `Student ID ${removeConfirm.id} will be marked inactive in the roster. This does not delete or suspend an existing student account.` : ''}
        confirmLabel="Remove ID"
        busy={saving}
        onCancel={() => setRemoveConfirm(null)}
        onConfirm={async () => { await removeId(removeConfirm.id); setRemoveConfirm(null); }}
      />
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
    maxWidth: 900,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  title: {
    margin: '0 0 6px',
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
  },
  help: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: 580,
  },
  deptBadge: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    fontSize: 12,
    fontWeight: 800,
    padding: '4px 12px',
    borderRadius: THEME.radius.full,
  },
  inputSection: {
    marginTop: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: 12,
    fontSize: 13,
    fontFamily: THEME.fonts.mono,
    color: '#000000',
    resize: 'vertical',
  },
  formActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  addButton: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '10px 20px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  successText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
  },
  errorText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
  },
  listHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  subtitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
  },
  countText: {
    fontSize: 12,
    fontWeight: 600,
    color: '#000000',
  },
  searchInput: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '7px 12px',
    fontSize: 13,
    width: 200,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  tableContainer: {
    overflowX: 'auto',
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
    textAlign: 'left',
  },
  th: {
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  tr: {
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  td: {
    padding: '11px 14px',
    color: '#000000',
  },
  idCode: {
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.yellow100,
    padding: '2px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow300}`,
    fontFamily: THEME.fonts.mono,
    fontSize: 12,
  },
  removeBtn: {
    color: '#000000',
    backgroundColor: COLORS.rose50,
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.sm,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  emptyState: {
    padding: 36,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    margin: 0,
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
