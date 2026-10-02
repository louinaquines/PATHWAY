import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../adminApi';
import AlertDialog from '../components/AlertDialog';

const EMPTY_FORM = { name: '', address: '', industry: '', email: '', phone: '', capacity: '1', active: true };

export default function CompanyDirectoryTab() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminRequest('/admin/companies');
      setCompanies(result.companies || []);
    } catch (loadError) {
      setError(loadError.message || 'Could not load the company directory.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter(company => !term || [company.name, company.industry, company.address]
      .some(value => String(value || '').toLowerCase().includes(term)));
  }, [companies, search]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(''); };
  const editCompany = company => {
    setEditingId(company.id);
    setForm({ name: company.name || '', address: company.address || '', industry: company.industry || '',
      email: company.email || '', phone: company.phone || '', capacity: String(company.capacity ?? 1), active: company.active });
    setNotice('');
    setError('');
  };

  const saveCompany = async active => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...form, capacity: Number(form.capacity), active };
      const result = await adminRequest(editingId ? `/admin/companies/${encodeURIComponent(editingId)}` : '/admin/companies', {
        method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      });
      setNotice(editingId ? `${result.company.name} was updated.` : `${result.company.name} was added to the directory.`);
      resetForm();
      await load();
    } catch (saveError) {
      setError(saveError.message || 'Could not save company details.');
    } finally { setSaving(false); }
  };

  const onSubmit = event => {
    event.preventDefault();
    if (editingId && companies.find(company => company.id === editingId)?.active && !form.active) {
      setConfirmDeactivate(true);
      return;
    }
    saveCompany(Boolean(form.active));
  };

  return <div style={styles.page}>
    <div style={styles.headingRow}>
      <div>
        <h2 style={styles.heading}>Company directory</h2>
        <p style={styles.subheading}>Maintain approved placement destinations and their internship capacity. Companies with active placements are retained; deactivate them instead of deleting.</p>
      </div>
      <div style={styles.summary}><strong>{companies.length}</strong><span>companies</span></div>
    </div>

    {error && <div role="alert" style={styles.error}>{error}</div>}
    {notice && <div role="status" style={styles.notice}>{notice}</div>}

    <div style={styles.layout}>
      <form onSubmit={onSubmit} style={styles.formCard}>
        <h3 style={styles.cardTitle}>{editingId ? 'Edit company' : 'Add company'}</h3>
        <label style={styles.label}>Company name<input required maxLength={160} value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} style={styles.input} /></label>
        <label style={styles.label}>Address<input maxLength={300} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} style={styles.input} /></label>
        <label style={styles.label}>Industry<input maxLength={120} value={form.industry} onChange={event => setForm(previous => ({ ...previous, industry: event.target.value }))} style={styles.input} /></label>
        <div style={styles.twoCols}>
          <label style={styles.label}>Contact email<input type="email" maxLength={254} value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} style={styles.input} /></label>
          <label style={styles.label}>Phone<input maxLength={60} value={form.phone} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} style={styles.input} /></label>
        </div>
        <label style={styles.label}>Internship capacity<input type="number" min="1" step="1" required value={form.capacity} onChange={event => setForm(previous => ({ ...previous, capacity: event.target.value }))} style={styles.input} /><small style={styles.help}>Total active student placements allowed at this company.</small></label>
        {editingId && <label style={styles.activeCheck}><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} /> Available for new placements</label>}
        <div style={styles.formActions}>
          <button type="submit" disabled={saving} style={styles.primaryButton}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to directory'}</button>
          {editingId && <button type="button" disabled={saving} onClick={resetForm} style={styles.secondaryButton}>Cancel edit</button>}
        </div>
      </form>

      <section style={styles.listCard} aria-label="Company records">
        <div style={styles.listHeader}>
          <div><h3 style={styles.cardTitle}>Directory records</h3><p style={styles.help}>Approved placements are counted from official student records.</p></div>
          <button type="button" onClick={load} style={styles.secondaryButton}>Refresh</button>
        </div>
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search companies…" aria-label="Search companies" style={{ ...styles.input, margin: '8px 0 12px' }} />
        {loading ? <p style={styles.empty}>Loading companies…</p> : filteredCompanies.length === 0 ? <p style={styles.empty}>{companies.length ? 'No matching companies.' : 'No companies have been added yet.'}</p> :
          <div style={styles.companyList}>{filteredCompanies.map(company => {
            const configured = Number.isSafeInteger(company.capacity);
            const slots = configured ? `${company.occupiedSlots} / ${company.capacity} placements` : `Capacity not configured · ${company.occupiedSlots} active placement${company.occupiedSlots === 1 ? '' : 's'}`;
            return <article key={company.id} style={styles.companyRow}>
              <div style={styles.companyMain}>
                <div style={styles.companyNameLine}><strong>{company.name || 'Unnamed company'}</strong><span style={company.active ? styles.activePill : styles.inactivePill}>{company.active ? 'Active' : 'Inactive'}</span></div>
                <div style={styles.meta}>{[company.industry, company.address].filter(Boolean).join(' · ') || 'No industry or address supplied'}</div>
                <div style={styles.slots}>{slots}{configured ? ` · ${company.availableSlots} available` : ''}</div>
              </div>
              <button type="button" onClick={() => editCompany(company)} style={styles.editButton}>Edit</button>
            </article>;
          })}</div>}
      </section>
    </div>
    <AlertDialog open={confirmDeactivate} tone="warning" title="Deactivate this company?"
      description="Students will no longer be able to submit new proposals for this company. Existing official placements and history will remain unchanged."
      confirmLabel="Deactivate company" busy={saving}
      onCancel={() => setConfirmDeactivate(false)}
      onConfirm={async () => { setConfirmDeactivate(false); await saveCompany(false); }} />
  </div>;
}

const styles = {
  page: { padding: 24, maxWidth: 1500, margin: '0 auto' },
  headingRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, marginBottom: 20 },
  heading: { margin: 0, color: '#0F172A', fontSize: 24 },
  subheading: { maxWidth: 780, margin: '7px 0 0', color: '#64748B', lineHeight: 1.5 },
  summary: { display: 'grid', minWidth: 100, padding: '10px 16px', border: '1px solid #DBEAFE', borderRadius: 12, background: '#EFF6FF', color: '#075985', textAlign: 'center' },
  error: { padding: 12, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginBottom: 12 },
  notice: { padding: 12, border: '1px solid #86EFAC', borderRadius: 10, background: '#F0FDF4', color: '#166534', marginBottom: 12 },
  layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start', gap: 18 },
  formCard: { display: 'grid', gap: 14, padding: 20, border: '1px solid #DBE3EE', borderRadius: 14, background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.04)' },
  listCard: { minWidth: 0, padding: 20, border: '1px solid #DBE3EE', borderRadius: 14, background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.04)' },
  cardTitle: { margin: 0, color: '#0F172A', fontSize: 17 },
  label: { display: 'grid', gap: 6, color: '#334155', fontSize: 13, fontWeight: 650 },
  input: { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '10px 11px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', color: '#0F172A', font: 'inherit' },
  twoCols: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 },
  help: { display: 'block', margin: '4px 0 0', color: '#64748B', fontSize: 12, fontWeight: 400 },
  activeCheck: { display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 },
  formActions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  primaryButton: { padding: '10px 14px', border: 0, borderRadius: 8, background: '#0284C7', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondaryButton: { padding: '9px 12px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', color: '#334155', fontWeight: 650, cursor: 'pointer' },
  listHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  empty: { padding: 24, color: '#64748B', textAlign: 'center' },
  companyList: { display: 'grid', gap: 9 },
  companyRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, padding: 14, border: '1px solid #E2E8F0', borderRadius: 10, background: '#fff' },
  companyMain: { minWidth: 0 },
  companyNameLine: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, color: '#0F172A' },
  meta: { marginTop: 5, color: '#64748B', fontSize: 13, overflowWrap: 'anywhere' },
  slots: { marginTop: 6, color: '#0369A1', fontSize: 12, fontWeight: 650 },
  activePill: { padding: '3px 8px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 },
  inactivePill: { padding: '3px 8px', borderRadius: 999, background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700 },
  editButton: { padding: '7px 11px', border: '1px solid #BAE6FD', borderRadius: 8, background: '#F0F9FF', color: '#0369A1', fontWeight: 700, cursor: 'pointer' },
};
