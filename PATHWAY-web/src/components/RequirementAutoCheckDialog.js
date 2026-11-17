// PATHWAY-web/src/components/RequirementAutoCheckDialog.js
// Coordinator settings for AI auto-check of one section requirement.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [initial, setInitial] = useState('');

  useEffect(() => {
    adminRequest(path).then(r => { const f = { ...r.autoCheck, phrasesText: (r.autoCheck.requiredPhrases || []).join('\n') }; setForm(f); setInitial(JSON.stringify(f)); })
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
        enabled: !!form.enabled, autoApprove: false, nameMustMatch: form.nameMustMatch !== false,
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
  const dirty = !!form && (!!file || removeReference || JSON.stringify(form) !== initial);
  const hasRef = !!file || (form?.referenceName && !removeReference);
  const kb = n => n ? `${Math.max(1, Math.round(n / 1024))} KB` : '';
  const fileIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
  return createPortal(
    <div className="autocheck-backdrop acx-backdrop" role="presentation" onClick={onClose}>
      <div className="autocheck-dialog acx" role="dialog" aria-modal="true" aria-labelledby="autocheck-title" onClick={e => e.stopPropagation()}>
        <header className="acx-head"><div><h2 id="autocheck-title">Reference file</h2><p>{requirement.label}</p></div>
          <button type="button" className="acx-x" aria-label="Close" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></header>
        {!form ? <p className="acx-loading">{error || 'Loading…'}</p> : <>
          <div className="acx-body">
            <p className="acx-flow">Upload a correct sample <span>→</span> students upload theirs <span>→</span> you see <i data-c="g" /><i data-c="y" /><i data-c="r" /></p>
            {hasRef ? <div className="acx-file">
              <span className="acx-ficon">{fileIcon}</span>
              <span className="acx-fname"><strong>{file ? file.name : form.referenceName}</strong><small>{file ? `${kb(file.size)} · ready to save` : 'Current reference file'}</small></span>
              <label className="acx-btn">Replace<input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} hidden /></label>
              <button type="button" className="acx-btn acx-danger" onClick={() => { if (file) setFile(null); else setRemoveReference(true); }}>Remove</button>
            </div>
            : <label className={'autocheck-drop acx-drop' + (dragging ? ' is-drag' : '')}
                onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); pickFile({ target: { files: e.dataTransfer.files } }); }}>
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={pickFile} hidden />
                <span className="acx-ficon">{fileIcon}</span>
                <strong><b>Drop the blank form here</b>, or <u>choose a file</u></strong>
                <span>PDF, PNG or JPEG · up to 700 KB</span>
              </label>}
            <p className="acx-warn">Use a blank form, or blur any real personal details first.</p>
            <label className="acx-switch"><span><strong>Auto-check student uploads</strong><small>AI only flags green, yellow or red. You still approve or reject.</small></span>
              <input type="checkbox" role="switch" aria-label="Auto-check student uploads for this requirement" checked={!!form.enabled} onChange={e => set({ enabled: e.target.checked })} /></label>
            <label className="acx-switch" data-off={!form.enabled || undefined}><span><strong>Name must match their profile</strong><small>The student’s name on the document is checked.</small></span>
              <input type="checkbox" role="switch" aria-label="Student's name on the document must match their profile" disabled={!form.enabled} checked={form.nameMustMatch !== false} onChange={e => set({ nameMustMatch: e.target.checked })} /></label>
            <details className="autocheck-advanced acx-adv"><summary>Advanced options</summary>
              <fieldset disabled={!form.enabled}>
                <label className="autocheck-field"><span className="autocheck-label">Required words or phrases (one per line)</span>
                  <textarea rows={3} value={form.phrasesText} onChange={e => set({ phrasesText: e.target.value })} placeholder={'e.g. Certificate of Registration\nFirst Semester 2026-2027'} /></label>
                <label className="autocheck-field"><span className="autocheck-label">Notes for the checker</span>
                  <textarea rows={2} maxLength={1000} value={form.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder="e.g. Must have the registrar's dry seal area" /></label>
              </fieldset>
            </details>
            {error && <p className="autocheck-error acx-error" role="alert">{error}</p>}
          </div>
          <footer className="acx-foot">
            <span>{form.enabled ? (hasRef ? <>Auto-check is <b>on</b></> : <>Add a reference file so auto-check can compare</>) : <>Auto-check is <b>off</b></>}</span>
            <button type="button" className="autocheck-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="autocheck-primary" disabled={saving || !dirty} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </footer>
        </>}
      </div>
    </div>
  , document.body);
}
