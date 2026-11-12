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
  const [dragging, setDragging] = useState(false);

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
    setFile(f); setRemoveReference(false); setForm(prev => ({ ...prev, enabled: true }));
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
        <header><h2 id="autocheck-title">Reference file · {requirement.label}</h2>
          <p>Upload what a correct document looks like. Each student upload is compared to it and its name checked.</p></header>
        {!form ? <p>{error || 'Loading…'}</p> : <>
          <ol className="autocheck-steps"><li>Upload a correct sample</li><li>Students upload theirs</li><li>You see Green / Yellow / Red</li></ol>
          <label className={'autocheck-drop' + (dragging ? ' is-drag' : '')}
            onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); pickFile({ target: { files: e.dataTransfer.files } }); }}>
            <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} hidden />
            {file ? <><strong>✓ {file.name}</strong><span>Ready to save · click to change</span></>
              : form.referenceName && !removeReference ? <><strong>✓ Current: {form.referenceName}</strong><span>Click or drop a file to replace</span></>
              : <><strong>📄 Drop a correct sample of this document here</strong><span>or click to choose · PDF, PNG or JPEG · up to 700 KB · blur real personal data</span></>}
          </label>
          {form.referenceName && !removeReference && !file && <button type="button" className="autocheck-link" onClick={() => setRemoveReference(true)}>Remove reference file</button>}
          <label className="autocheck-toggle"><input type="checkbox" checked={!!form.enabled} onChange={e => set({ enabled: e.target.checked })} /> Auto-check student uploads for this requirement</label>
          <label className="autocheck-toggle"><input type="checkbox" disabled={!form.enabled} checked={form.nameMustMatch !== false} onChange={e => set({ nameMustMatch: e.target.checked })} /> Student's name on the document must match their profile</label>
          <details className="autocheck-advanced"><summary>Advanced options</summary>
            <fieldset disabled={!form.enabled}>
              <label className="autocheck-field"><span className="autocheck-label">Required words or phrases (one per line)</span>
                <textarea rows={3} value={form.phrasesText} onChange={e => set({ phrasesText: e.target.value })} placeholder={'e.g. Certificate of Registration\nFirst Semester 2026-2027'} /></label>
              <label className="autocheck-field"><span className="autocheck-label">Notes for the checker</span>
                <textarea rows={2} maxLength={1000} value={form.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder="e.g. Must have the registrar's dry seal area" /></label>
              <label className="autocheck-toggle autocheck-approve"><input type="checkbox" checked={!!form.autoApprove} onChange={e => set({ autoApprove: e.target.checked })} /> Auto-approve when the result is Green
                <small>You can undo any automatic approval. Red results are never rejected automatically.</small></label>
            </fieldset>
          </details>
          {error && <p className="autocheck-error" role="alert">{error}</p>}
          <footer><button type="button" className="autocheck-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="autocheck-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button></footer>
        </>}
      </div>
    </div>
  );
}
