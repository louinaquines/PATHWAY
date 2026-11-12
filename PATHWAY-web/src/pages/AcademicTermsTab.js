import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/AcademicTermsTab.js
import { useEffect, useState, useCallback } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { PageSkeleton } from '../components/LoadingSkeleton';
import './AdminConfiguration.css';
import { PortalEmpty, PortalError, PortalFormDialog } from '../components/PortalStates';

const EMPTY = { name: '', startDate: '', endDate: '', isActive: false };

function formatDate(value) {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isNaN(date.valueOf()) ? '—'
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function termState(term) {
  const today = new Date().toISOString().slice(0, 10);
  if (term.startDate && term.startDate > today) return 'upcoming';
  if (term.endDate && term.endDate < today) return 'ended';
  return 'inactive';
}

export default function AcademicTermsTab() {
  const [formOpen, setFormOpen] = useState(false);
  const [terms, setTerms]     = useState([]);
  const [form, setForm]       = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(({ silent = false, isCurrent = () => true } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    return adminRequest('/admin/academic-terms')
      .then(data => { if (isCurrent()) setTerms(data.terms || []); })

      .catch(e => { if (isCurrent()) setError(e.message); })
      .finally(() => setLoading(false));
  }, []);

  usePortalAutoRefresh(load, { enabled: !loading && !saving });

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
      setFormOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const edit = term => {
    setFormOpen(true);
    setEditing(term.id);
    setForm({ name: term.name, startDate: term.startDate, endDate: term.endDate, isActive: term.isActive });
  };

  const closeForm = () => { if (!saving) { setEditing(null); setForm(EMPTY); setFormOpen(false); setError(''); } };

  const termsPage = useRecordPage(terms);
  if (loading) {
    return <PageSkeleton label="Loading academic terms" variant="table" />;
  }

  return (
    <div style={s.page} className="admin-configuration admin-terms">
      <div className="admin-directory-head">
        <dl className="admin-stat-cards admin-stat-cards-compact admin-stat-cards-3" aria-label="Term summary">
          <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="blue"><Icon name="calendar" size={20} /></span><dt>Academic terms</dt><dd>{terms.length}</dd></div>
          <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="green"><Icon name="check" size={20} /></span><dt>Active term</dt><dd className="admin-stat-text">{terms.find(term => term.isActive)?.name || 'None set'}</dd></div>
          <div className="admin-stat-card"><span className="admin-stat-icon" data-tone="indigo"><Icon name="clock" size={20} /></span><dt>Upcoming terms</dt><dd>{terms.filter(term => termState(term) === 'upcoming').length}</dd></div>
        </dl>
        <button type="button" className="admin-primary-action" onClick={() => {
          setForm(EMPTY); setEditing(null); setError(''); setFormOpen(true);
        }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>New term</button>
      </div>
      {error && !formOpen && <PortalError message={error} onRetry={load} />}

      {formOpen && <PortalFormDialog className="admin-term-dialog" label={editing ? 'Edit term' : 'New term'} onCancel={closeForm}>
      <form onSubmit={submit} style={s.form} className="admin-configuration-form">
        {error && <PortalError message={error} />}
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
          <span style={{ color: '#000000', fontWeight: 700 }}>Set as active for new sections</span>
        </label>

        <div style={s.btnRow} className="admin-term-form-actions">
          <button type="submit" className="admin-configuration-save" style={s.button} disabled={saving}>
            {saving ? 'Saving...' : editing ? 'Save Changes' : '+ Create Academic Term'}
          </button>
          <button type="button" style={s.cancel} disabled={saving}
            onClick={closeForm}>Cancel</button>
        </div>
      </form></PortalFormDialog>}

      <section className="admin-records-card admin-term-records-card" aria-labelledby="admin-term-list-title">
        <header className="admin-records-head">
          <div><h2 id="admin-term-list-title">All terms</h2><p>New sections use the term marked Active.</p></div>
          <span className="admin-count-pill">{terms.length} {terms.length === 1 ? 'academic term' : 'academic terms'}</span>
        </header>
        <RecordPagination pagination={termsPage} label="Academic terms" />
        {terms.length === 0 ? (
          <PortalEmpty icon="calendar" compact title="No academic terms yet" description="Create a term to define the dates for new section rosters." />
        ) : (
          <ul className="admin-term-rows">
            {termsPage.items.map(term => {
              const state = term.isActive ? 'active' : termState(term);
              return <li key={term.id} className="admin-term-row" data-state={state}>
                <span className="admin-stat-icon" data-tone={term.isActive ? 'green' : 'blue'}><Icon name="calendar" size={20} /></span>
                <div className="admin-term-main">
                  <strong title={term.name}>{term.name}</strong>
                  <span>{formatDate(term.startDate)} – {formatDate(term.endDate)}</span>
                </div>
                <span className={`admin-student-status ${state === 'active' ? 'is-active' : state === 'upcoming' ? 'is-pending' : 'is-inactive'}`}>
                  {state === 'active' ? 'Active term' : state === 'upcoming' ? 'Upcoming' : state === 'ended' ? 'Ended' : 'Inactive'}
                </span>
                <button type="button" className="admin-secondary-action" onClick={() => edit(term)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  Edit Term
                </button>
              </li>;
            })}
          </ul>
        )}
      </section>
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
