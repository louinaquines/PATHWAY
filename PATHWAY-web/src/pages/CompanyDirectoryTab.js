import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { PortalEmpty, PortalFormDialog } from '../components/PortalStates';
import AdminCompanyDirectory from '../components/AdminCompanyDirectory';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import AlertDialog from '../components/AlertDialog';
import './CompanyDirectoryTab.css';

const EMPTY_FORM = { placementDefaults: {}, name: '', address: '', industry: '', email: '', phone: '', capacity: '1', active: true, geofenceEnabled: false, latitude: '', longitude: '', radiusMeters: '150' };

export default function CompanyDirectoryTab({ readOnly = true }) {
  const [formOpen, setFormOpen] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [paging, setPaging] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const loadVersion = useRef(0);
  const scope = searchTerm + ':' + availability;
  const cursors = paging?.scope === scope ? paging.cursors : [null];
  const cursor = cursors.at(-1);

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim().slice(0, 150)), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [suggestions, setSuggestions] = useState({ query: '', items: [], busy: false, error: '' });
  const [suggestOpen, setSuggestOpen] = useState(false);
  useEffect(() => {
    const query = form.name.trim();
    if (!formOpen || editingId || !suggestOpen || query.length < 3) { setSuggestions(current => ({ ...current, items: [], busy: false, error: '' })); return undefined; }
    let active = true;
    setSuggestions(current => ({ ...current, busy: true, error: '' }));
    const timer = setTimeout(() => {
      adminRequest('/coordinator/company-search?q=' + encodeURIComponent(query))
        .then(result => { if (active) setSuggestions({ query, items: result.results || [], busy: false, error: '' }); })
        .catch(failure => { if (active) setSuggestions({ query, items: [], busy: false, error: failure.message }); });
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [form.name, formOpen, editingId, suggestOpen]);
  const useSuggestion = item => {
    setForm(previous => ({ ...previous, name: item.name, address: item.address || previous.address, industry: previous.industry || item.industry,
      latitude: Number.isFinite(item.latitude) ? String(item.latitude) : previous.latitude, longitude: Number.isFinite(item.longitude) ? String(item.longitude) : previous.longitude }));
    setSuggestOpen(false);
  };

  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    const version = ++loadVersion.current;
    if (!silent) setLoading(true);
    setError('');
    setLoadFailed(false);
    try {
      const params = new URLSearchParams({ page: 'true', search: searchTerm, availability });
      if (cursor) params.set('cursor', cursor);
      const result = await adminRequest(readOnly ? '/admin/companies' : '/coordinator/company-directory?' + params);
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      setCompanies(result.companies || []);
      setNextCursor(result.nextCursor || null);

    } catch (loadError) {
      if (!isRefreshCurrent() || version !== loadVersion.current) return;
      setLoadFailed(!silent);
      setError(loadError.message || 'Could not load the company directory.');
    } finally { if (version === loadVersion.current) setLoading(false); }
  }, [readOnly, searchTerm, availability, cursor]);

  usePortalAutoRefresh(load, { enabled: !loading && !saving && !formOpen, scope: String(readOnly), protectInputs: true });

  useEffect(() => { load(); }, [load]);


  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(''); setFormOpen(false); };
  const editCompany = company => {
    setFormOpen(true);
    setEditingId(company.id);
    setForm({ placementDefaults: { ...(company.placementDefaults || {}), supervisorEmail: company.placementDefaults?.supervisorEmail || company.email || '' }, name: company.name || '', address: company.address || '', industry: company.industry || '',
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

    {error && !formOpen && <div role="alert" style={styles.error}>{error}</div>}
    {notice && <div role="status" style={styles.notice}>{notice}</div>}

    <div className={`company-directory-layout${readOnly || !formOpen ? ' is-readonly' : ''}`} style={{ ...styles.layout, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {!readOnly && formOpen && !confirmDeactivate && <PortalFormDialog className="admin-create-drawer directory-edit-drawer" closeOnBackdrop label={editingId ? 'Edit company' : 'Add company'} onCancel={() => { if (!saving) resetForm(); }}>
      <form className="company-directory-form" onSubmit={onSubmit} ><header><h2>{editingId ? "Edit company" : "Add company"}</h2></header><div className="directory-form-body">
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <section className="directory-form-section"><h3>Company</h3>
        <div className="company-name-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSuggestOpen(false); }}>
          <label style={styles.label}>Company name<input required maxLength={160} autoComplete="off" value={form.name}
            placeholder={editingId ? '' : 'Start typing to search'} aria-autocomplete="list" aria-expanded={suggestOpen && suggestions.items.length > 0}
            onFocus={() => setSuggestOpen(true)} onChange={event => { setSuggestOpen(true); setForm(previous => ({ ...previous, name: event.target.value })); }} style={styles.input} /></label>
          {!editingId && suggestOpen && form.name.trim().length >= 3 && <div className="company-suggestions" role="listbox" aria-label="Company suggestions">
            {suggestions.busy && <small role="status">Searching…</small>}
            {!suggestions.busy && suggestions.error && <small role="alert">{suggestions.error}</small>}
            {!suggestions.busy && !suggestions.error && !suggestions.items.length && <small>No matches. Keep typing or enter details manually.</small>}
            {!suggestions.busy && suggestions.items.map((item, index) => <button type="button" role="option" aria-selected="false" key={index} onClick={() => useSuggestion(item)}>
              <strong>{item.name}</strong><span>{item.address}</span></button>)}
            <p className="company-suggestions-note">Suggestions from OpenStreetMap. Check them before saving.</p>
          </div>}
        </div>
        <label style={styles.label}>Address<input maxLength={300} value={form.address} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} style={styles.input} /></label>
        <label style={styles.label}>Industry<input maxLength={120} value={form.industry} onChange={event => setForm(previous => ({ ...previous, industry: event.target.value }))} style={styles.input} /></label>
        </section><section className="directory-form-section"><h3>Supervisor</h3><p style={styles.help}>Used for every student placed here. Edit it here only.</p><div className="directory-field-pair">
          <label style={styles.label}>Supervisor name<input maxLength={160} value={form.placementDefaults.supervisorName || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, supervisorName: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Supervisor email<input type="email" maxLength={254} value={form.placementDefaults.supervisorEmail || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, email: value, placementDefaults: { ...previous.placementDefaults, supervisorEmail: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Phone<input maxLength={60} value={form.phone} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} style={styles.input} /></label>
        </div>
        </section><section className="directory-form-section"><h3>Internship</h3><div className="directory-field-pair">
          <label style={styles.label}>Role or department<input maxLength={160} value={form.placementDefaults.internshipRole || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, internshipRole: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Work arrangement<select value={form.placementDefaults.workArrangement || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, workArrangement: value } })); }} style={styles.input}><option value="">Choose an arrangement</option><option>On-site</option><option>Remote</option><option>Hybrid</option></select></label>
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
        </section></div><footer className="directory-form-actions">
          <button type="submit" disabled={saving || loading || loadFailed} style={styles.primaryButton}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add company'}</button>
          <button type="button" disabled={saving} onClick={resetForm} style={styles.secondaryButton}>Cancel</button>
        </footer>
      </form></PortalFormDialog>}

      <section className="company-directory-records" style={styles.listCard} aria-label="Company records">
        <div className="directory-controls">
          <label className="directory-search">Search companies<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, industry, or address" aria-label="Search companies" style={styles.input} /></label>
          <label>Availability <select value={availability} onChange={event => setAvailability(event.target.value)}>
            <option value="all">All companies</option>
            <option value="active">Active companies</option>
            <option value="slots">Has available slots</option>
          </select></label>
          <button type="button" onClick={load} style={styles.secondaryButton}>Refresh</button>
          <button type="button" className="coordinator-add-company" style={styles.primaryButton} disabled={loading || loadFailed} onClick={() => { resetForm(); setError(''); setFormOpen(true); }}>Add company</button>
        </div>

        {loading ? <div className="directory-skeleton" role="status" aria-label="Loading companies"><span /><span /><span /></div> : loadFailed ? <p style={styles.empty}>Company records could not be loaded. Resolve the error above, then click Refresh.</p> : companies.length === 0 ? <PortalEmpty title={searchTerm || availability !== 'all' ? 'No matching companies on this page.' : 'No companies have been added yet.'} description={nextCursor ? 'Choose Next to continue searching.' : searchTerm || availability !== 'all' ? 'Try another search or filter.' : 'Add a company to make it available for placements.'} /> :
          <div className="directory-table-wrap"><table className="directory-table"><thead><tr><th>Company</th><th>Industry</th><th>Internship slots <small>All sections</small></th><th>Status</th><th>Actions</th></tr></thead><tbody>{companies.map(company => {
            const configured = Number.isSafeInteger(company.capacity) && company.capacity > 0;
            return <tr key={company.id}>
              <td><strong>{company.name || 'Unnamed company'}</strong><small>{company.address || '—'}</small></td>
              <td>{company.industry || <button type="button" className="coordinator-inline-link" onClick={() => editCompany(company)}>Add industry</button>}</td>
              <td><strong>{!configured || company.availableSlots == null ? "Capacity not set" : company.availableSlots === 0 ? "Full" : company.availableSlots + " available"}</strong>{configured && <small>{company.occupiedSlots} / {company.capacity} placed</small>}</td>
              <td><span style={company.active ? styles.activePill : styles.inactivePill}>{company.active ? 'Active' : 'Inactive'}</span></td>
              <td><button type="button" aria-label={'Edit ' + company.name} onClick={() => editCompany(company)} style={styles.editButton}>Edit</button></td>
            </tr>;
          })}</tbody></table></div>}
        {!loading && !loadFailed && <footer className="directory-results"><span>{companies.length} {companies.length === 1 ? "company" : "companies"} on this page</span><nav className="portal-record-pagination" aria-label="Partner companies pagination">
          <button type="button" className="portal-secondary" disabled={loading || cursors.length === 1}
            onClick={() => setPaging({ scope, cursors: cursors.slice(0, -1) })}>Previous</button>
          <span>Page {cursors.length}</span>
          <button type="button" className="portal-secondary" disabled={loading || !nextCursor}
            onClick={() => setPaging({ scope, cursors: [...cursors, nextCursor] })}>Next</button>
        </nav></footer>}
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
  error: { padding: 12, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginBottom: 12 },
  notice: { padding: 12, border: '1px solid #86EFAC', borderRadius: 10, background: '#F0FDF4', color: '#166534', marginBottom: 12 },
  layout: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start', gap: 18 },
  listCard: { minWidth: 0, padding: 20, border: '1px solid #DBE3EE', borderRadius: 14, background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.04)' },
  label: { display: 'grid', gap: 6, color: '#334155', fontSize: 13, fontWeight: 650 },
  input: { width: '100%', minWidth: 0, boxSizing: 'border-box', padding: '10px 11px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', color: '#0F172A', font: 'inherit' },
  help: { display: 'block', margin: '4px 0 0', color: '#64748B', fontSize: 12, fontWeight: 400 },
  activeCheck: { display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 },
  primaryButton: { padding: '10px 14px', border: 0, borderRadius: 8, background: '#0284C7', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  secondaryButton: { padding: '9px 12px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff', color: '#334155', fontWeight: 650, cursor: 'pointer' },
  empty: { padding: 24, color: '#64748B', textAlign: 'center' },
  activePill: { padding: '3px 8px', borderRadius: 999, background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700 },
  inactivePill: { padding: '3px 8px', borderRadius: 999, background: '#F1F5F9', color: '#475569', fontSize: 11, fontWeight: 700 },
  editButton: { padding: '7px 11px', border: '1px solid #BAE6FD', borderRadius: 8, background: '#F0F9FF', color: '#0369A1', fontWeight: 700, cursor: 'pointer' },
};
