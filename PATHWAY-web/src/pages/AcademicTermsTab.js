// src/pages/AcademicTermsTab.js
import { useEffect, useState, useCallback } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { PageSkeleton } from '../components/LoadingSkeleton';
import './AdminConfiguration.css';

const EMPTY = { name: '', startDate: '', endDate: '', isActive: false };

export default function AcademicTermsTab() {
  const [terms, setTerms]     = useState([]);
  const [form, setForm]       = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(() => {
    setLoading(true);
    adminRequest('/admin/academic-terms')
      .then(data => setTerms(data.terms || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const data = editing
        ? await adminRequest(`/admin/academic-terms/${editing}`, { method: 'PATCH', body: JSON.stringify(form) })
        : await adminRequest('/admin/academic-terms', { method: 'POST', body: JSON.stringify(form) });
      setTerms(current => editing ? current.map(term => term.id === editing ? data.term : term) : [data.term, ...current]);
      setForm(EMPTY);
      setEditing(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = term => {
    setEditing(term.id);
    setForm({ name: term.name, startDate: term.startDate, endDate: term.endDate, isActive: term.isActive });
  };

  if (loading) {
    return <PageSkeleton label="Loading academic terms" variant="table" />;
  }

  return (
    <div style={s.page} className="admin-configuration admin-terms">
      <div style={s.header}>
        <h2 style={s.title}>Academic terms</h2>
        <p style={s.sub}>Manage school-year dates and term availability for new sections.</p>
      </div>

      {error && <div role="alert" style={s.error}>{error}</div>}

      <form onSubmit={submit} style={s.form} className="admin-configuration-form">
        <div style={s.formHeader}>
          <div style={s.iconWrap}><Icon name="calendar" size={20} label="Academic term" /></div>
          <div>
            <h3 style={s.formTitle}>{editing ? 'Edit term' : 'Create term'}</h3>
            <p style={s.formSub}>Define start and end dates for section rosters.</p>
          </div>
        </div>

        <div style={s.field}>
          <label style={s.label} htmlFor="academic-term-name">Term name / school year</label>
          <input
            id="academic-term-name"
            required
            style={s.input}
            placeholder="e.g. 1st Semester A.Y. 2026–2027"
            value={form.name}
            onChange={e => update('name', e.target.value)}
          />
        </div>

        <div style={s.row} className="admin-term-date-row">
          <div style={s.field}>
            <label style={s.label} htmlFor="academic-term-start">Start date</label>
            <input
              id="academic-term-start"
              required
              style={s.input}
              type="date"
              value={form.startDate}
              onChange={e => update('startDate', e.target.value)}
            />
          </div>
          <div style={s.field}>
            <label style={s.label} htmlFor="academic-term-end">End date</label>
            <input
              id="academic-term-end"
              required
              style={s.input}
              type="date"
              value={form.endDate}
              onChange={e => update('endDate', e.target.value)}
            />
          </div>
        </div>

        <label style={s.checkboxLabel}>
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={e => update('isActive', e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ color: '#000000', fontWeight: 700 }}>Set as the Active Academic Term for new sections</span>
        </label>

        <div style={s.btnRow}>
          <button type="submit" className="admin-configuration-save" style={s.button} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save Changes' : '+ Create Academic Term'}
          </button>
          {editing && (
            <button
              type="button"
              style={s.cancel}
              onClick={() => { setEditing(null); setForm(EMPTY); }}
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <div style={s.listSection} className="admin-term-records">
        <h3 style={s.listTitle}>Recorded Academic Terms ({terms.length})</h3>
        <div style={s.termsGrid}>
          {terms.map(term => (
            <div className="admin-term-card" key={term.id} style={{ ...s.card, ...(term.isActive ? s.cardActive : {}) }}>
              <div style={s.cardLeft}>
                <div style={s.termName}>{term.name}</div>
                <div style={s.meta}>
                  <Icon name="calendar" size={14} /> {term.startDate || '—'} to {term.endDate || '—'}
                </div>
              </div>
              <div style={s.actions}>
                {term.isActive && (
                  <span style={s.activeBadge}><Icon name="check" size={13} /> Active Term</span>
                )}
                <button style={s.editBtn} onClick={() => edit(term)}>
                  Edit Term
                </button>
              </div>
            </div>
          ))}
          {terms.length === 0 && (
            <div style={s.empty}>No academic terms configured yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 860,
  },
  header: {
    marginBottom: 4,
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
  form: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 24,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
  },
  formHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.yellow100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    border: `1px solid ${COLORS.yellow300}`,
  },
  formTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
  },
  formSub: {
    margin: '2px 0 0',
    fontSize: 12,
    color: '#000000',
  },
  field: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
    backgroundColor: COLORS.white,
  },
  row: {
    display: 'flex',
    gap: 14,
  },
  checkboxLabel: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
    margin: '6px 0 20px',
    cursor: 'pointer',
  },
  btnRow: {
    display: 'flex',
    gap: 10,
  },
  button: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '11px 20px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 13,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  cancel: {
    backgroundColor: COLORS.white,
    color: '#000000',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '11px 18px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 13,
  },
  listSection: {
    marginTop: 8,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 12px',
  },
  termsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '16px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardActive: {
    borderLeft: `4px solid ${COLORS.yellow500}`,
    backgroundColor: COLORS.yellow50,
  },
  cardLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  termName: {
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
  },
  meta: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  activeBadge: {
    color: '#000000',
    backgroundColor: COLORS.yellow100,
    border: `1px solid ${COLORS.yellow300}`,
    borderRadius: THEME.radius.full,
    padding: '3px 10px',
    fontSize: 11,
    fontWeight: 800,
  },
  editBtn: {
    backgroundColor: COLORS.white,
    color: '#000000',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    padding: '6px 12px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
  },
  error: {
    backgroundColor: COLORS.rose50,
    color: '#000000',
    padding: 12,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.rose200}`,
    fontSize: 13,
  },
  empty: {
    color: '#000000',
    padding: 32,
    textAlign: 'center',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
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
