// PATHWAY-web/src/components/RequirementAutoCheckDialog.js
// Coordinator settings for AI auto-check of one section requirement.
import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import './RequirementAutoCheckDialog.css';

const MAX_BYTES = 700 * 1024;
const toBase64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function RequirementAutoCheckDialog({ sectionId, requirement, onClose, onSaved }) {
  const path = `/coordinator/sections/${encodeURIComponent(sectionId)}/requirements/${encodeURIComponent(requirement.id)}/auto-check`;
  const [form, setForm] = useState(null);
  const [file, setFile] = useState(null);
  const [removeReference, setRemoveReference] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminRequest(path).then(r => setForm({ ...r.autoCheck, phrasesText: (r.autoCheck.requiredPhrases || []).join('\n') }))
      .catch(e => setError(e.message || 'Could not load settings.'));
  }, [path]);

  const pickFile = e => {
    const f = e.target.files?.[0];
    setError('');
    if (!f) return setFile(null);
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(f.type)) return setError('Reference must be a PDF, PNG or JPEG.');
    if (f.size > MAX_BYTES) return setError('Reference file must be 700 KB or smaller.');
    setFile(f); setRemoveReference(false);
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const body = {
        enabled: !!form.enabled, autoApprove: !!form.enabled && !!form.autoApprove, nameMustMatch: form.nameMustMatch !== false,
        requiredPhrases: form.phrasesText.split('\n').map(p => p.trim()).filter(Boolean),
        notes: form.notes || '', removeReference,
        ...(file ? { reference: { fileName: file.name, data: await toBase64(file) } } : {}),
      };
      const result = await adminRequest(path, { method: 'PUT', body: JSON.stringify(body) });
      onSaved?.(result.autoCheck); onClose();
    } catch (e) { setError(e.message || 'Could not save settings.'); }
    finally { setSaving(false); }
  };

  const set = patch => setForm(f => ({ ...f, ...patch }));
  return (
    <div className="autocheck-backdrop" role="presentation" onClick={onClose}>
      <div className="autocheck-dialog" role="dialog" aria-modal="true" aria-labelledby="autocheck-title" onClick={e => e.stopPropagation()}>
        <header><h2 id="autocheck-title">Auto-check: {requirement.label}</h2>
          <p>Claude compares each student upload to your reference and checks the name. Results are Green, Yellow or Red. Red is never rejected automatically.</p></header>
        {!form ? <p>{error || 'Loading…'}</p> : <>
          <label className="autocheck-toggle"><input type="checkbox" checked={!!form.enabled} onChange={e => set({ enabled: e.target.checked })} /> Turn on auto-check for this requirement</label>
          <fieldset disabled={!form.enabled}>
            <div className="autocheck-field">
              <span className="autocheck-label">Reference / standard file</span>
              {form.referenceName && !removeReference && !file && <div className="autocheck-current">Current: <strong>{form.referenceName}</strong> <button type="button" onClick={() => setRemoveReference(true)}>Remove</button></div>}
              <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} />
              <small>A correctly filled sample of this document (PDF, PNG or JPEG, up to 700 KB). Blur out real personal data first.</small>
            </div>
            <label className="autocheck-toggle"><input type="checkbox" checked={form.nameMustMatch !== false} onChange={e => set({ nameMustMatch: e.target.checked })} /> Name on the document must match the student's profile</label>
            <label className="autocheck-field"><span className="autocheck-label">Required words or phrases (one per line)</span>
              <textarea rows={3} value={form.phrasesText} onChange={e => set({ phrasesText: e.target.value })} placeholder={'e.g. Certificate of Registration\nFirst Semester 2026-2027'} /></label>
            <label className="autocheck-field"><span className="autocheck-label">Notes for the checker</span>
              <textarea rows={2} maxLength={1000} value={form.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder="e.g. Must have the registrar's dry seal area" /></label>
            <label className="autocheck-toggle autocheck-approve"><input type="checkbox" checked={!!form.autoApprove} onChange={e => set({ autoApprove: e.target.checked })} /> Auto-approve when the result is Green
              <small>You can undo any automatic approval from the student's Requirements view. Every auto-approval is logged.</small></label>
          </fieldset>
          {error && <p className="autocheck-error" role="alert">{error}</p>}
          <footer><button type="button" className="autocheck-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="autocheck-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button></footer>
        </>}
      </div>
    </div>
  );
}
