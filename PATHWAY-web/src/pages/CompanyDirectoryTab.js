import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { PortalEmpty, PortalFormDialog } from '../components/PortalStates';
import AdminCompanyDirectory from '../components/AdminCompanyDirectory';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminRequest } from '../adminApi';
import AlertDialog from '../components/AlertDialog';
import './CompanyDirectoryTab.css';

const EMPTY_FORM = { name: '', address: '', industry: '', email: '', phone: '', capacity: '1', active: true, geofenceEnabled: false, latitude: '', longitude: '', radiusMeters: '150' };

export default function CompanyDirectoryTab({ readOnly = true }) {
  const [formOpen, setFormOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [website, setWebsite] = useState('');
  const [profilePreview, setProfilePreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewWebsite = async () => {
    setPreviewBusy(true); setError(''); setProfilePreview(null);
    try { const result = await adminRequest('/coordinator/company-profile-preview', { method: 'POST', body: JSON.stringify({ url: website }) }); setProfilePreview(result.preview); }
    catch (failure) { setError(failure.message); }
    finally { setPreviewBusy(false); }
  };

  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    setLoadFailed(false);
    try {
      const result = await adminRequest(readOnly ? '/admin/companies' : '/coordinator/company-directory');
      if (!isRefreshCurrent()) return;
      setCompanies(result.companies || []);

    } catch (loadError) {
      if (!isRefreshCurrent()) return;
      setLoadFailed(!silent);
      setError(loadError.message || 'Could not load the company directory.');
    } finally { setLoading(false); }
  }, [readOnly]);

  usePortalAutoRefresh(load, { enabled: !loading && !saving && !previewBusy, scope: String(readOnly), protectInputs: true });

  useEffect(() => { load(); }, [load]);

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter(company => !term || [company.name, company.industry, company.address]
      .some(value => String(value || '').toLowerCase().includes(term)));
  }, [companies, search]);

  const companyPage = useRecordPage(filteredCompanies, search);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(''); setFormOpen(false); };
  const editCompany = company => {
    setFormOpen(true);
    setEditingId(company.id);
    setForm({ name: company.name || '', address: company.address || '', industry: company.industry || '',
      email: company.email || '', phone: company.phone || '', capacity: String(company.capacity ?? 1), active: company.active,
      geofenceEnabled: company.geofence?.enabled === true, latitude: String(company.geofence?.latitude ?? ''), longitude: String(company.geofence?.longitude ?? ''), radiusMeters: String(company.geofence?.radiusMeters ?? 150) });
    setNotice('');
    setError('');
  };

  const saveCompany = async active => {
    if (readOnly) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { geofenceEnabled, latitude, longitude, radiusMeters, ...details } = form;
      const payload = { ...details, capacity: Number(form.capacity), active, geofence: geofenceEnabled
        ? { enabled: true, latitude: Number(latitude), longitude: Number(longitude), radiusMeters: Number(radiusMeters) }
        : { enabled: false } };
      const result = await adminRequest(editingId ? `/coordinator/companies/${encodeURIComponent(editingId)}` : '/coordinator/companies', {
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

  if (readOnly) return <AdminCompanyDirectory companies={companies} loading={loading} error={error}
    loadFailed={loadFailed} onReload={load} />;

  return <div className="company-directory-page" style={styles.page}>
    <div className="directory-toolbar"><p><strong>{loadFailed ? '—' : companies.length}</strong> companies <span>Capacity includes placements across all sections.</span></p><button type="button" className="coordinator-add-company" style={styles.primaryButton} disabled={loading || loadFailed} onClick={() => { resetForm(); setError(''); setFormOpen(true); }}>+ Add company</button></div>
    {error && !formOpen && <div role="alert" style={styles.error}>{error}</div>}
    {notice && <div role="status" style={styles.notice}>{notice}</div>}

    <div className={`company-directory-layout${readOnly || !formOpen ? ' is-readonly' : ''}`} style={{ ...styles.layout, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {!readOnly && formOpen && !confirmDeactivate && <PortalFormDialog className="admin-create-drawer" label={editingId ? 'Edit company' : 'Add company'} onCancel={() => { if (!saving) resetForm(); }}>
      <form className="company-directory-form" onSubmit={onSubmit} style={styles.formCard}>
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <h3 style={styles.cardTitle}>{editingId ? 'Edit company' : 'Add company'}</h3>
        <p className="directory-form-help">{editingId ? 'Update contact details and placement availability.' : 'Create a destination for official student placements.'}</p>
        <label style={styles.label}>Company name<input required maxLength={160} value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} style={styles.input} /></label>
        <label style={styles.label}>Address<input maxLength={300} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} style={styles.input} /></label>
        <label style={styles.label}>Industry<input maxLength={120} value={form.industry} onChange={event => setForm(previous => ({ ...previous, industry: event.target.value }))} style={styles.input} /></label>
        <div style={styles.twoCols}>
          <label style={styles.label}>Contact email<input type="email" maxLength={254} value={form.email} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} style={styles.input} /></label>
          <label style={styles.label}>Phone<input maxLength={60} value={form.phone} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} style={styles.input} /></label>
        </div>
        <label style={styles.label}>Internship capacity<input type="number" min="1" step="1" required value={form.capacity} onChange={event => setForm(previous => ({ ...previous, capacity: event.target.value }))} style={styles.input} /><small style={styles.help}>Total active student placements allowed at this company.</small></label>
        {editingId && <label style={styles.activeCheck}><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} /> Available for new placements</label>}
        <label style={styles.activeCheck}><input type="checkbox" checked={form.geofenceEnabled} onChange={event => setForm(previous => ({ ...previous, geofenceEnabled: event.target.checked }))} /> Require location for attendance</label>
        {form.geofenceEnabled && <fieldset style={{ border: '1px solid #dbe5f0', borderRadius: 12, padding: 12 }}>
          <legend>Company attendance area</legend>
          <p style={styles.help}>Use verified company coordinates. Both attendance punches must be inside this area.</p>
          <label style={styles.label}>Latitude<input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={event => setForm(previous => ({ ...previous, latitude: event.target.value }))} style={styles.input} /></label>
          <label style={styles.label}>Longitude<input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={event => setForm(previous => ({ ...previous, longitude: event.target.value }))} style={styles.input} /></label>
          <label style={styles.label}>Radius (metres)<input required type="number" min="50" max="2000" value={form.radiusMeters} onChange={event => setForm(previous => ({ ...previous, radiusMeters: event.target.value }))} style={styles.input} /></label>
        </fieldset>}
        <div style={styles.formActions}>
          <button type="submit" disabled={saving || loading || loadFailed} style={styles.primaryButton}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add to directory'}</button>
          <button type="button" disabled={saving} onClick={resetForm} style={styles.secondaryButton}>Cancel</button>
        </div>
      </form></PortalFormDialog>}

      <section className="company-directory-records" style={styles.listCard} aria-label="Company records">
        <div style={styles.listHeader}>
          <label className="directory-search">Search companies<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, industry, or address" aria-label="Search companies" style={styles.input} /></label>
          <button type="button" onClick={load} style={styles.secondaryButton}>Refresh</button>
        </div>
        <RecordPagination pagination={companyPage} label="Partner companies" />
        {loading ? <div className="directory-skeleton" role="status" aria-label="Loading companies"><span /><span /><span /></div> : loadFailed ? <p style={styles.empty}>Company records could not be loaded. Resolve the error above, then click Refresh.</p> : filteredCompanies.length === 0 ? <PortalEmpty title={companies.length ? 'No matching companies.' : 'No companies have been added yet.'} description={companies.length ? 'Try another company name, industry, or address.' : 'Add a company to make it available for placements.'} /> :
          <div className="directory-table-wrap"><table className="directory-table"><thead><tr><th>Company</th><th>Industry</th><th>Internship slots</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{companyPage.items.map(company => {
            const configured = Number.isSafeInteger(company.capacity) && company.capacity > 0;
            return <tr key={company.id}>
              <td><strong>{company.name || 'Unnamed company'}</strong><small>{company.address || '—'}</small></td>
              <td>{company.industry || <button type="button" className="coordinator-inline-link" onClick={() => editCompany(company)}>Add industry</button>}</td>
              <td><span>{configured ? company.occupiedSlots + ' / ' + company.capacity + ' placed' : 'Slot limit not set'}</span>{configured && <><progress aria-label={company.name + ' internship slots'} value={company.occupiedSlots || 0} max={company.capacity} /><small className={company.availableSlots === 0 ? 'capacity-full' : ''}>{company.availableSlots === 0 ? 'No slots available' : company.availableSlots + ' available'}</small></>}</td>
              <td><span style={company.active ? styles.activePill : styles.inactivePill}>{company.active ? 'Active' : 'Inactive'}</span></td>
              <td><button type="button" aria-label={'Edit ' + company.name} onClick={() => editCompany(company)} style={styles.editButton}>Edit</button></td>
            </tr>;
          })}</tbody></table></div>}
      </section>
    </div>
    {!readOnly && <details className="company-import-card"><summary>Look up company details from a website</summary><section aria-label="Import company suggestions">
      <p>Preview suggested details, then check them before adding them to the form. Nothing is saved automatically.</p>
      <div className="company-import-controls"><label>Company website<input type="url" placeholder="https://company.example" value={website} disabled={previewBusy} onChange={event => { setWebsite(event.target.value); setProfilePreview(null); }} /></label>
        <button type="button" disabled={previewBusy || !website.trim()} onClick={previewWebsite}>{previewBusy ? 'Reading website…' : 'Preview details'}</button></div>
      {profilePreview && <div className="company-import-preview"><strong>{profilePreview.name || 'Company name not found'}</strong><p>{profilePreview.description || 'Description not found.'}</p>
        <dl><dt>Email</dt><dd>{profilePreview.email || 'Not found'}</dd><dt>Phone</dt><dd>{profilePreview.phone || 'Not found'}</dd></dl>
        <a href={profilePreview.sourceUrl} target="_blank" rel="noopener noreferrer">View source website</a><p>{profilePreview.warning}</p>
        <button type="button" disabled={saving} onClick={() => { setForm(current => ({ ...current, name: profilePreview.name || current.name, email: profilePreview.email || current.email, phone: profilePreview.phone || current.phone })); setNotice('Suggestions added to the form. Review every field before saving.'); setProfilePreview(null); setFormOpen(true); }}>Use suggestions in form</button>
      </div>}
    </section></details>}
    <AlertDialog open={confirmDeactivate} tone="warning" title="Deactivate this company?"
      description="Students will no longer be able to submit new proposals for this company. Existing official placements and history will remain unchanged."
      confirmLabel="Deactivate company" busy={saving}
      onCancel={() => setConfirmDeactivate(false)}
      onConfirm={async () => { setConfirmDeactivate(false); await saveCompany(false); }} />
  </div>;
}

const styles = {
  page: { padding: 24, maxWidth: 1500, margin: '0 auto' },
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
  activePill: { padding: '3px 8px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 },
  inactivePill: { padding: '3px 8px', borderRadius: 999, background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700 },
  editButton: { padding: '7px 11px', border: '1px solid #BAE6FD', borderRadius: 8, background: '#F0F9FF', color: '#0369A1', fontWeight: 700, cursor: 'pointer' },
};
