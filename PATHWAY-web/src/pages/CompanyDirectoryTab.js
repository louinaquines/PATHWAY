import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { PortalEmpty, PortalFormDialog } from '../components/PortalStates';
import AdminCompanyDirectory from '../components/AdminCompanyDirectory';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import AlertDialog from '../components/AlertDialog';
import './CompanyDirectoryTab.css';
import './RequirementsRedesign.css';
import './CompaniesRedesign.css';
import { createPortal } from 'react-dom';
import SectionPicker from '../components/SectionPicker';
import EvaluationInbox from '../components/EvaluationInbox';
import Pager from '../components/Pager';

const EMPTY_FORM = { placementDefaults: {}, name: '', address: '', industry: '', email: '', phone: '', capacity: '1', active: true, geofenceEnabled: false, latitude: '', longitude: '', radiusMeters: '150' };

export default function CompanyDirectoryTab({ readOnly = true, selectedSection = null, sections = [], onSectionChange }) {
  const [selectedId, setSelectedId] = useState('');
  const [lp, setLp] = useState(1);
  const [fullOnly, setFullOnly] = useState(false);
  const [roster, setRoster] = useState({ id: '', items: null });
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('co-top-actions')); }, []);
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
      {!readOnly && formOpen && !confirmDeactivate && <PortalFormDialog className="cof-dialog" closeOnBackdrop label={editingId ? 'Edit company' : 'Add company'} onCancel={() => { if (!saving) resetForm(); }}>
      <form className="company-directory-form cof" onSubmit={onSubmit} >{(() => { const d = form.placementDefaults || {}; const done = [!!form.name.trim(), !!(d.supervisorName && d.supervisorEmail), !!(d.internshipRole && Number(form.capacity) > 0), !form.geofenceEnabled || (form.latitude !== '' && form.longitude !== '')];
        return <header className="cof-head"><div className="cof-title"><h2>{editingId ? 'Edit company' : 'Add company'}</h2>
          <button type="button" className="plt-x" aria-label="Close" disabled={saving} onClick={resetForm}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
          <nav className="cof-nav" aria-label="Form sections">{['Company', 'Supervisor', 'Internship', 'Location'].map((l, i) => <button key={l} type="button" data-done={done[i] || undefined} onClick={() => document.getElementById('cof-' + l.toLowerCase())?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><i>{done[i] ? '✓' : i + 1}</i>{l}</button>)}</nav>
        </header>; })()}<div className="directory-form-body cof-body">
        {error && <div role="alert" style={styles.error}>{error}</div>}
        <section className="directory-form-section" id="cof-company"><h3>Company</h3>
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
        <datalist id="cof-industries">{['Information Technology', 'Software Development', 'BPO / Call Center', 'Education', 'Government', 'Banking & Finance', 'Healthcare', 'Manufacturing', 'Retail', 'Hospitality'].map(x => <option key={x} value={x} />)}</datalist><label style={styles.label}>Industry<input list="cof-industries" maxLength={120} value={form.industry} onChange={event => setForm(previous => ({ ...previous, industry: event.target.value }))} style={styles.input} /></label>
        </section><section className="directory-form-section" id="cof-supervisor"><h3>Supervisor</h3><p style={styles.help}>Used for every student placed here. Edit it here only.</p><div className="directory-field-pair">
          <label style={styles.label}>Supervisor name<input maxLength={160} value={form.placementDefaults.supervisorName || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, supervisorName: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Supervisor email<input type="email" maxLength={254} value={form.placementDefaults.supervisorEmail || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, email: value, placementDefaults: { ...previous.placementDefaults, supervisorEmail: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Phone<input maxLength={60} value={form.phone} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value }))} style={styles.input} /></label>
        </div>
        </section><section className="directory-form-section" id="cof-internship"><h3>Internship</h3><div className="directory-field-pair">
          <label style={styles.label}>Role or department<input maxLength={160} value={form.placementDefaults.internshipRole || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, internshipRole: value } })); }} style={styles.input} /></label>
          <label style={styles.label}>Work arrangement<select value={form.placementDefaults.workArrangement || ''} onChange={event => { const value = event.target.value; setForm(previous => ({ ...previous, placementDefaults: { ...previous.placementDefaults, workArrangement: value } })); }} style={styles.input}><option value="">Choose an arrangement</option><option>On-site</option><option>Remote</option><option>Hybrid</option></select></label>
        </div>
        <label style={styles.label}>Internship capacity<span className="cof-step"><button type="button" aria-label="Fewer slots" onClick={() => setForm(previous => ({ ...previous, capacity: String(Math.max(1, (Number(previous.capacity) || 1) - 1)) }))}>−</button><input type="number" min="1" step="1" required value={form.capacity} onChange={event => setForm(previous => ({ ...previous, capacity: event.target.value }))} style={styles.input} /><button type="button" aria-label="More slots" onClick={() => setForm(previous => ({ ...previous, capacity: String((Number(previous.capacity) || 0) + 1) }))}>+</button></span><small style={styles.help}>Total active student placements allowed at this company.</small></label>
        {editingId && <label style={styles.activeCheck} className="cof-switch"><input type="checkbox" checked={Boolean(form.active)} onChange={event => setForm(previous => ({ ...previous, active: event.target.checked }))} /> Available for new placements</label>}
        </section><section className="directory-form-section" id="cof-location"><h3>Location</h3><label style={styles.activeCheck} className="cof-switch"><input type="checkbox" checked={form.geofenceEnabled} onChange={event => setForm(previous => ({ ...previous, geofenceEnabled: event.target.checked }))} /> Require location for attendance</label>
        {form.geofenceEnabled && <fieldset style={{ border: '1px solid #dbe5f0', borderRadius: 12, padding: 12 }}>
          <legend>Company attendance area</legend>
          <p style={styles.help}>Use verified company coordinates. Both attendance punches must be inside this area.</p>
          <label style={styles.label}>Latitude<input required type="number" step="any" min="-90" max="90" value={form.latitude} onChange={event => setForm(previous => ({ ...previous, latitude: event.target.value }))} style={styles.input} /></label>
          <label style={styles.label}>Longitude<input required type="number" step="any" min="-180" max="180" value={form.longitude} onChange={event => setForm(previous => ({ ...previous, longitude: event.target.value }))} style={styles.input} /></label>
          <div className="cof-radius"><label style={styles.label} htmlFor="cof-radius-n">Radius (metres)</label>
          <div className="cof-radius-row"><input aria-label="Radius slider" type="range" min="50" max="2000" step="10" value={Math.min(2000, Math.max(50, Number(form.radiusMeters) || 50))} onChange={event => setForm(previous => ({ ...previous, radiusMeters: event.target.value }))} />
            <span className="cof-radius-n"><input id="cof-radius-n" required type="number" min="50" max="2000" step="1" value={form.radiusMeters} onChange={event => setForm(previous => ({ ...previous, radiusMeters: event.target.value }))} /><em>m</em></span></div>
          <small className="cof-hint">Between 50 and 2,000 metres.</small></div><div className="co-map" aria-hidden="true"><i className="co-ring" style={{ transform: `scale(${Math.max(.35, Math.min(1.3, Number(form.radiusMeters || 150) / 300))})` }} /><i className="co-pin" /></div>
        </fieldset>}
        </section></div><footer className="directory-form-actions cof-foot">
          {editingId && companies.find(c => c.id === editingId)?.active && <button type="button" className="cof-danger" disabled={saving} onClick={() => setConfirmDeactivate(true)}>Deactivate</button>}
          <span className="cof-status">{(() => { const d = form.placementDefaults || {}; const left = [!form.name.trim(), !(Number(form.capacity) > 0), form.geofenceEnabled && (form.latitude === '' || form.longitude === '')].filter(Boolean).length; const soft = [!d.supervisorName, !d.supervisorEmail, !d.internshipRole].filter(Boolean).length;
            return left ? `${left} required field${left === 1 ? '' : 's'} left` : soft ? 'Add the supervisor and role before placing students' : '✓ Ready to save'; })()}</span>
          <button type="button" disabled={saving} onClick={resetForm} style={styles.secondaryButton}>Cancel</button>
          <button type="submit" disabled={saving || loading || loadFailed || !form.name.trim() || !(Number(form.capacity) > 0)} style={styles.primaryButton}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Add company'}</button>
        </footer>
      </form></PortalFormDialog>}

      {(() => {
        const all = fullOnly ? companies.filter(c => c.availableSlots === 0) : companies;
        const lPages = Math.max(1, Math.ceil(all.length / 8)); const lCur = Math.min(lp, lPages);
        const shown = all.slice((lCur - 1) * 8, lCur * 8);
        const sel = all.find(c => c.id === selectedId) || shown[0] || null;
        const top = <>
          <button type="button" className="rq-btn co-add" disabled={loading || loadFailed} onClick={() => { resetForm(); setError(''); setFormOpen(true); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add company</button>
          {sections.length > 0 && <SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />}
        </>;
        return <>
          {topHost ? createPortal(top, topHost) : null}
          <div className="co">
            <section className="co-list" aria-label="Company records">
              <div className="co-tools">
                <div className="rq-pills" role="group" aria-label="Filter companies">
                  {[['all', 'All', false], ['slots', 'Has open slots', false], ['full', 'Full', true]].map(([v, l, full]) => { const on = full ? fullOnly : !fullOnly && availability === v;
                    return <button key={v} type="button" aria-pressed={on} onClick={() => { setLp(1); setFullOnly(full); if (!full) setAvailability(v); else setAvailability('all'); }}>{l}</button>; })}
                </div>
                <span className="co-right">
                  <label className="co-search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                  <input type="search" value={search} onChange={event => { setSearch(event.target.value); setLp(1); }} placeholder="Find a company" aria-label="Search companies" /></label>
                  <EvaluationInbox items={companies.flatMap(c => { const out = []; const d = c.placementDefaults || {}; const nm = c.name || 'Company';
                    if (c.availableSlots === 0) out.push({ id: `full:${c.id}:${c.capacity}`, kind: 'full', name: nm, company: c, time: 0, hint: `${c.occupiedSlots || 0} of ${c.capacity} slots filled`, text: <><b>{nm}</b> is full</> });
                    else if (c.availableSlots === 1) out.push({ id: `almost:${c.id}:${c.capacity}`, kind: 'almost', name: nm, company: c, time: 0, hint: 'One slot left', text: <><b>{nm}</b> has 1 open slot left</> });
                    const miss = [!d.supervisorName && 'supervisor', !(d.supervisorEmail || c.email) && 'email', !d.internshipRole && 'role', !(Number.isSafeInteger(c.capacity) && c.capacity > 0) && 'capacity'].filter(Boolean);
                    if (miss.length) out.push({ id: `missing:${c.id}:${miss.join(',')}`, kind: 'missing', name: nm, company: c, time: 0, hint: 'Needed before placing students', text: <><b>{nm}</b> is missing its {miss.join(', ')}</> });
                    return out; })}
                    onOpen={n => { setFullOnly(false); setAvailability('all'); setSelectedId(n.company.id); if (n.kind === 'missing') editCompany(n.company); }}
                    storageKey="pathway.companiesInbox.read" emptyText="Full companies and missing details show up here."
                    tabs={[['all', 'All'], ['full', 'Full', ['full']], ['almost', 'Almost full', ['almost']], ['missing', 'Missing info', ['missing']]]} />
                </span>
                {!topHost && <button type="button" className="rq-btn" onClick={() => { resetForm(); setError(''); setFormOpen(true); }}>Add company</button>}
              </div>
              {loading ? <div className="directory-skeleton" role="status" aria-label="Loading companies"><span /><span /><span /></div>
                : loadFailed ? <p className="co-empty">Company records could not be loaded. <button type="button" className="rq-link" onClick={load}>Try again</button></p>
                : shown.length === 0 ? <PortalEmpty title={searchTerm || availability !== 'all' || fullOnly ? 'No matching companies on this page.' : 'No companies have been added yet.'} description={nextCursor ? 'Choose Next to continue searching.' : searchTerm || availability !== 'all' || fullOnly ? 'Try another search or filter.' : 'Add a company to make it available for placements.'} />
                : <ul className="co-rows">{shown.map(company => { const cap = Number.isSafeInteger(company.capacity) && company.capacity > 0 ? company.capacity : null; const used = Number(company.occupiedSlots || 0); const open = company.availableSlots;
                  const sup = company.placementDefaults?.supervisorName;
                  return <li key={company.id}><button type="button" className="co-row" aria-pressed={sel?.id === company.id} onClick={() => setSelectedId(company.id)}>
                    <i className="co-av">{String(company.name || '?').split(/[\s-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}</i>
                    <span className="co-main"><strong>{company.name || 'Unnamed company'}{!company.active && <b className="lb-chip" data-tone="mute">Inactive</b>}</strong><small>{[company.address, sup].filter(Boolean).join(' · ') || 'No address yet'}</small></span>
                    <span className="co-cap">{cap ? (cap <= 10 ? <span className="plo-slots" aria-hidden="true">{Array.from({ length: cap }, (_, i) => <i key={i} data-on={i < used || undefined} />)}</span> : <span className="plo-bar" aria-hidden="true"><b style={{ width: `${Math.min(100, used / cap * 100)}%` }} /></span>) : null}
                      <small data-full={open === 0 || undefined}>{cap ? `${used} student${used === 1 ? '' : 's'} · ${open === 0 ? 'full' : `${open} open`}` : 'Capacity not set'}</small></span>
                  </button></li>; })}</ul>}
              {!loading && !loadFailed && (all.length > 8 || cursors.length > 1 || nextCursor) && <footer className="co-foot"><span>{all.length ? `${(lCur - 1) * 8 + 1}–${Math.min(lCur * 8, all.length)} of ${all.length}${nextCursor ? '+' : ''}` : ''}</span><span className="co-pg">
                {cursors.length > 1 && <button type="button" className="rq-btn" aria-label="Previous" disabled={loading} onClick={() => { setLp(1); setPaging({ scope, cursors: cursors.slice(0, -1) }); }}>‹ Earlier</button>}
                {lPages > 1 && <Pager page={lCur} pages={lPages} onGo={setLp} label="Companies" />}
                {nextCursor && <button type="button" className="rq-btn" aria-label="Next" disabled={loading} onClick={() => { setLp(1); setPaging({ scope, cursors: [...cursors, nextCursor] }); }}>More ›</button>}</span></footer>}
            </section>
            {sel && <CompanyDetail company={sel} section={selectedSection} roster={roster} setRoster={setRoster} onEdit={() => editCompany(sel)} />}
          </div>
        </>;
      })()}
    </div>
    <AlertDialog open={confirmDeactivate} tone="warning" title="Deactivate this company?"
      description="Students will no longer be able to submit new proposals for this company. Existing official placements and history will remain unchanged."
      confirmLabel="Deactivate company" busy={saving}
      onCancel={() => setConfirmDeactivate(false)}
      onConfirm={async () => { setConfirmDeactivate(false); await saveCompany(false); }} />
  </div>;
}

function CompanyDetail({ company, section, roster, setRoster, onEdit }) {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!section?.id || roster.id === company.id + ':' + section.id) return;
    let on = true; setRoster({ id: company.id + ':' + section.id, items: null }); setMore(false);
    adminRequest('/coordinator/placement-workspace?sectionId=' + encodeURIComponent(section.id) + '&view=students&companyId=' + encodeURIComponent(company.id))
      .then(d => { if (on) setRoster({ id: company.id + ':' + section.id, items: d.students || [] }); })
      .catch(() => { if (on) setRoster({ id: company.id + ':' + section.id, items: [] }); });
    return () => { on = false; };
  }, [company.id, section?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = company.placementDefaults || {};
  const email = d.supervisorEmail || company.email;
  const geo = company.geofence;
  const items = roster.id === company.id + ':' + section?.id ? roster.items : null;
  const list = items ? (more ? items : items.slice(0, 3)) : [];
  const nm = s => [s.lastName, s.firstName].filter(Boolean).join(', ') || 'Student';
  return <aside className="co-detail" aria-label={company.name}>
    <div className="co-dhead"><h2>{company.name}</h2><button type="button" className="rq-btn" aria-label={'Edit ' + company.name} onClick={onEdit}>Edit</button></div>
    <dl className="co-facts">
      <div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4-6 8-6s7 2 8 6" /></svg><span><dt>Supervisor</dt><dd>{d.supervisorName || 'Not set'}</dd></span></div>
      <div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg><span><dt>Email</dt><dd>{email || 'Not set'}</dd></span></div>
      <div><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg><span><dt>Address</dt><dd>{company.address || 'Not set'}</dd></span></div>
    </dl>
    {geo?.enabled ? <>
      <div className="co-map" aria-hidden="true"><i className="co-ring" /><i className="co-pin" /></div>
      <p className="co-note">Students can only clock in within {geo.radiusMeters} metres of this spot.</p>
    </> : <p className="co-note co-note-box">Students can clock in from anywhere. <button type="button" className="rq-link" onClick={onEdit}>Set a location</button></p>}
    <div className="co-students">
      <h3>{!section ? 'Pick a section to see students' : items == null ? 'Loading students…' : `${items.length} student${items.length === 1 ? '' : 's'} train${items.length === 1 ? 's' : ''} here`}</h3>
      {list.map(s => <div key={s.id} className="co-stu"><i className="co-av sm">{nm(s).split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}</i><span>{nm(s)}</span><small>{s.idNumber}</small></div>)}
      {items && items.length > 3 && <button type="button" className="rq-link" onClick={() => setMore(!more)}>{more ? 'Show fewer' : `Show ${items.length - 3} more`}</button>}
    </div>
    {email && <a className="rq-btn co-msg" target="_blank" rel="noopener noreferrer" href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>Send a message to the supervisor</a>}
  </aside>;
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
