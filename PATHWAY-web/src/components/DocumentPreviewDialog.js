import { useEffect, useRef, useState } from 'react';
import { adminDocumentBlob, adminDownload, adminRequest } from '../adminApi';
import Icon from './Icons';
import PdfPreview from './PdfPreview';
import DocumentAiAssistance from './DocumentAiAssistance';
import { extractPdfChecks, documentTextChecks } from '../documentTextChecks';
import './DocumentPreviewDialog.css';

export function previewMime(bytes) {
  const text = String.fromCharCode(...bytes.slice(0, 12));
  if (text.startsWith('%PDF-')) return 'application/pdf';
  if (bytes[0] === 137 && text.slice(1, 8) === 'PNG\r\n\x1a\n') return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export default function DocumentPreviewDialog({ path, fileName, sectionId, requirementId, studentId, onClose }) {
  const dialog = useRef(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [checks, setChecks] = useState(null);
  const [terms, setTerms] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const settingsPath = sectionId && requirementId ? `/coordinator/sections/${encodeURIComponent(sectionId)}/document-checks/${encodeURIComponent(requirementId)}` : null;
  useEffect(() => {
    let active = true;
    setTerms(''); setSettingsMessage('');
    if (settingsPath) adminRequest(settingsPath).then(data => { if (active) setTerms(data.requiredTerms.join('\n')); })
      .catch(failure => { if (active) setSettingsMessage(failure.message); });
    return () => { active = false; };
  }, [settingsPath]);
  const saveSettings = async () => {
    setSettingsBusy(true); setSettingsMessage('');
    try {
      const data = await adminRequest(settingsPath, { method: 'PUT', body: JSON.stringify({ requiredTerms: terms.split('\n').map(term => term.trim()).filter(Boolean) }) });
      setTerms(data.requiredTerms.join('\n')); setSettingsMessage('Check settings saved. Document approval is unchanged.');
    } catch (failure) { setSettingsMessage(failure.message); }
    finally { setSettingsBusy(false); }
  };
  const textChecks = checks?.text != null ? documentTextChecks(checks.text, terms.split('\n').map(term => term.trim()).filter(Boolean)) : null;
  useEffect(() => {
    dialog.current.showModal();
    setPreview(null); setChecks(null); setError(''); setLoading(true);
    let active = true;
    let url;
    (async () => {
      try {
        const blob = await adminDocumentBlob(path);
        const mime = previewMime(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
        if (!active) return;
        if (mime) {
          url = URL.createObjectURL(new Blob([blob], { type: mime }));
          setPreview({ url, mime });
          setLoading(false);
          setChecks({ message: 'Checking available text…' });
          if (mime === 'application/pdf') {
            try { const result = await extractPdfChecks(blob); if (active) setChecks(result); }
            catch (failure) { if (active) setChecks({ message: failure.message }); }
          } else setChecks({ message: 'Image contents require manual review. No signature or field validation was performed.' });
        } else {
          setChecks({ message: 'Automatic text checks are unavailable for this format. Download and inspect the document manually.' });
        }
      } catch (failure) {
        if (active) setError(failure.message || 'Could not load this document.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [path]);
  const download = async () => {
    setDownloading(true);
    try { await adminDownload(path, fileName); }
    catch (failure) { setError(failure.message || 'Could not download this document.'); }
    finally { setDownloading(false); }
  };
  return <dialog ref={dialog} className="document-preview" aria-labelledby="document-preview-title" onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <header className="document-preview-header">
      <div><h2 id="document-preview-title">Document preview</h2><p>{fileName || 'Document'}</p></div>
      <div className="document-preview-actions">
        <button type="button" onClick={download} disabled={loading || downloading}><Icon name="download" size={18} />{downloading ? 'Downloading…' : 'Download'}</button>
        <button type="button" aria-label="Close document preview" onClick={onClose}><Icon name="x" size={20} /></button>
      </div>
    </header>
    <div className="document-preview-body">
      {checks && <aside className="document-review-checks"><strong>Document checks · manual review required</strong><p>{checks.message}</p>{checks.pages && <p>{checks.pages} pages · {checks.characters} extracted characters</p>}<small>These checks do not approve the document or verify signatures.</small></aside>}
      {settingsPath && <details className="document-review-checks"><summary>Required text settings</summary><p>One expected label or phrase per line. These are section-wide checks for this requirement, not proof that a field is filled in.</p>
        <label>Expected terms<textarea rows={3} maxLength={3100} value={terms} disabled={settingsBusy} onChange={event => setTerms(event.target.value)} /></label>
        <button type="button" disabled={settingsBusy} onClick={saveSettings}>{settingsBusy ? 'Saving…' : 'Save check settings'}</button>
        {settingsMessage && <p role="status">{settingsMessage}</p>}
      </details>}
      {textChecks && terms.trim() && <aside className="document-review-checks"><strong>Expected text check · current settings</strong>
        {textChecks.missingTerms.length ? <p>Not found: {textChecks.missingTerms.join(', ')}. Review the document manually.</p> : <p>Expected text found. Field values and signatures still require manual inspection.</p>}
      </aside>}
      {studentId && requirementId && checks?.text?.trim() && <DocumentAiAssistance studentId={studentId} requirementId={requirementId} text={checks.text} sourceVersion={path} />}
      {error ? <p role="alert">{error}</p> : loading ? <p role="status">Loading document…</p> : !preview ? <p>Preview is unavailable for this file. Download it to open it.</p> : preview.mime === 'application/pdf'
        ? <PdfPreview url={preview.url} />
        : <img src={preview.url} alt={fileName || 'Uploaded document'} />}
    </div>
  </dialog>;
}
