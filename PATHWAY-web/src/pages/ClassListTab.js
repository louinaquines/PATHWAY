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

export default function ClassListTab({ department }) {
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

  const addIds = async () => {
    const newIds = [...new Set(input.split(/[\s,;]+/).map(v => v.trim()).filter(Boolean))];
    if (!newIds.length) {
      setMessage('Enter at least one valid student ID.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      await adminRequest('/coordinator/student-roster', {
        method: 'POST', body: JSON.stringify({ idNumbers: newIds }),
      });
      setInput('');
      setMessage(`Successfully added ${newIds.length} authorized ID(s) to ${department}.`);
      await loadIds();
    } catch (e) {
      console.error(e);
      setMessage('Could not save the student IDs. Please try again.');
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
    <div style={s.page}>
      {/* Top Banner / Card */}
      <div style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <h2 style={s.title}>Authorized Department Roster</h2>
            <p style={s.help}>
              Students can only register their PATHWAY accounts if their student ID number is listed here for <strong>{department}</strong>.
            </p>
          </div>
          <span style={s.deptBadge}>{department}</span>
        </div>

        <div style={s.inputSection}>
          <label style={s.label}>Add Student ID Numbers (Bulk or Single)</label>
          <textarea
            style={s.textarea}
            rows={4}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Paste student IDs separated by spaces, commas, or new lines (e.g. 21-00123 21-00124 21-00125)..."
            disabled={saving}
          />
          <div style={s.formActions}>
            <button
              style={s.addButton}
              onClick={addIds}
              disabled={saving || !input.trim()}
            >
              {saving ? 'Adding IDs...' : '+ Add to Authorized Roster'}
            </button>
            {message && (
              <span style={message.includes('Could not') || message.includes('Enter') ? s.errorText : s.successText}>
                {message}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Roster List Card */}
      <div style={s.card}>
        <div style={s.listHeader}>
          <div>
            <h3 style={s.subtitle}>Authorized Student IDs</h3>
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
                  <th style={s.th}>Department</th>
                  <th style={s.th}>Date Added</th>
                  <th style={{ ...s.th, textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredIds.map(item => (
                  <tr key={item.id} style={s.tr}>
                    <td style={s.td}>
                      <span style={s.idCode}>{item.id}</span>
                    </td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AlertDialog
        open={Boolean(removeConfirm)}
        title="Remove authorized student ID?"
        description={removeConfirm ? `Student ID ${removeConfirm.id} will no longer be allowed to register under ${department}. This does not delete an existing student account.` : ''}
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
