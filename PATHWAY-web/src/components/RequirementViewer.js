import { useEffect, useRef, useState } from 'react';
import { adminDocumentBlob, adminDownload, adminRequest } from '../adminApi';
import Icon from './Icons';
import PdfPreview from './PdfPreview';
import DocumentAiAssistance from './DocumentAiAssistance';
import RequirementCheckResult from './RequirementCheckResult';
import { previewMime } from './DocumentPreviewDialog';
import { extractPdfChecks, documentTextChecks } from '../documentTextChecks';
import './Form48Check.css';
import './RequirementViewer.css';

const fmt = value => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const pathFor = (studentId, reqId) => `/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(reqId)}/download`;

/* Full-screen document viewer with a review panel: approve, ask to fix, previous/next document. */
export default function RequirementViewer({ student, studentName, rows, startId, sectionId, stageLabel, saving, onApprove, onFix, onUndo, onClose }) {
  const dialog = useRef(null);
  const [currentId, setCurrentId] = useState(startId);
  const index = Math.max(0, rows.findIndex(row => row.id === currentId));
  const row = rows[index];
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [checks, setChecks] = useState(null);
  const [fixOpen, setFixOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [panel, setPanel] = useState(true);
  const [terms, setTerms] = useState('');
  const [termsMsg, setTermsMsg] = useState('');
  const [termsBusy, setTermsBusy] = useState(false);
  const path = row ? pathFor(student.id, row.id) : null;
  const settingsPath = sectionId && row ? `/coordinator/sections/${encodeURIComponent(sectionId)}/document-checks/${encodeURIComponent(row.id)}` : null;

  useEffect(() => { dialog.current?.showModal?.(); }, []);
  useEffect(() => { setZoom(1); setPage(1); setPages(1); setFixOpen(false); setReason(''); }, [currentId]);
  useEffect(() => {
    if (!path) return undefined;
    let active = true; let url;
    setPreview(null); setChecks(null); setLoadError(''); setLoading(true);
    (async () => {
      try {
        const blob = await adminDocumentBlob(path);
        const mime = previewMime(new Uint8Array(await blob.slice(0, 12).arrayBuffer()));
        if (!active) return;
        if (!mime) { setPreview({ unsupported: true }); return; }
        url = URL.createObjectURL(new Blob([blob], { type: mime }));
        setPreview({ url, mime }); setLoading(false);
        if (mime === 'application/pdf') { try { const result = await extractPdfChecks(blob); if (active) setChecks(result); } catch (_) { /* text checks optional */ } }
      } catch (failure) {
        if (active) setLoadError(/failed to fetch|network/i.test(failure.message || '') ? 'Couldn’t load this file. Check your connection and try again.' : (failure.message || 'Couldn’t load this file.'));
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [path, retry]);
  useEffect(() => {
    let active = true; setTerms(''); setTermsMsg('');
    if (settingsPath) adminRequest(settingsPath).then(data => { if (active) setTerms(data.requiredTerms.join('\n')); }).catch(() => {});
    return () => { active = false; };
  }, [settingsPath]);
  useEffect(() => {
    const keys = event => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === '+' || event.key === '=') setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
      if (event.key === '-') setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
      if (event.key === '0') setZoom(1);
      if (event.key === 'ArrowRight' && index < rows.length - 1) setCurrentId(rows[index + 1].id);
      if (event.key === 'ArrowLeft' && index > 0) setCurrentId(rows[index - 1].id);
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, [index, rows]);

  const saveTerms = async () => {
    setTermsBusy(true); setTermsMsg('');
    try { const data = await adminRequest(settingsPath, { method: 'PUT', body: JSON.stringify({ requiredTerms: terms.split('\n').map(t => t.trim()).filter(Boolean) }) }); setTerms(data.requiredTerms.join('\n')); setTermsMsg('Saved.'); }
    catch (failure) { setTermsMsg(failure.message); } finally { setTermsBusy(false); }
  };
  const nextWaiting = () => { const next = rows.findIndex((r, i) => i > index && r.status === 'submitted'); if (next >= 0) setCurrentId(rows[next].id); else if (index < rows.length - 1) setCurrentId(rows[index + 1].id); };
  const approve = async () => { if (await onApprove(row.id)) nextWaiting(); };
  const sendFix = async () => { if (reason.trim() && await onFix(row.id, reason.trim())) { setFixOpen(false); nextWaiting(); } };
  const download = async () => { try { await adminDownload(path, row.req?.fileName); } catch (failure) { setLoadError(failure.message); } };
  const textChecks = checks?.text != null && terms.trim() ? documentTextChecks(checks.text, terms.split('\n').map(t => t.trim()).filter(Boolean)) : null;
  if (!row) return null;
  const pct = Number.isFinite(row.review?.confidence) ? Math.round(row.review.confidence * 100) : null;
  const pill = row.status === 'approved' ? ['Approved', 'green'] : row.status === 'rejected' ? ['Sent back', 'red'] : row.tone === 'green' ? ['Looks good', 'green'] : row.tone === 'red' ? ['Looks wrong', 'red'] : row.tone === 'yellow' ? ['Check closely', 'amber'] : ['To check', 'blue'];
  const findings = row.status === 'rejected' && row.req?.rejectionReason ? [row.req.rejectionReason] : (row.review?.findings || []);
  const late = row.deadline && new Date(row.deadline) < new Date() && row.status !== 'approved';

  return <dialog ref={dialog} className="f48-focus rqv" aria-label={`${row.label} for ${studentName}`} onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header className="f48-focus-bar">
      <strong title={row.req?.fileName}>{row.label}<span className="rqv-who"> · {studentName}</span></strong>
      <div className="f48-tools" role="toolbar" aria-label="View controls">
        <button type="button" aria-label="Zoom out" disabled={!preview?.url} onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" disabled={!preview?.url} onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}>+</button>
        <button type="button" className="f48-tool-text" disabled={!preview?.url} onClick={() => setZoom(1)}>Fit width</button>
        {pages > 1 && <><span className="f48-sep" /><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(p => p - 1)}><Icon name="chevronLeft" size={14} /></button><span>{page} / {pages}</span><button type="button" aria-label="Next page" disabled={page === pages} onClick={() => setPage(p => p + 1)}><Icon name="chevronRight" size={14} /></button></>}
        <span className="f48-sep" />
        <button type="button" aria-label="Download" title="Download" onClick={download}><Icon name="download" size={15} /></button>
        <button type="button" className="f48-tool-text f48-times-toggle" aria-pressed={panel} onClick={() => setPanel(v => !v)}>Review</button>
        <button type="button" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
    </header>
    <div className="f48-focus-body" data-panel={panel || undefined}>
      <div className="f48-stage" style={{ '--z': zoom }} onWheel={event => { if (!event.ctrlKey) return; event.preventDefault(); setZoom(z => Math.min(4, Math.max(0.5, +(z + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))); }}>
        {loading && <div className="rqv-state"><span className="f48-spinner" aria-hidden="true" /><p role="status">Opening the file…</p></div>}
        {!loading && loadError && <div className="rqv-state"><Icon name="alert" size={22} /><p role="alert">{loadError}</p><div><button type="button" className="rq-btn" onClick={() => setRetry(v => v + 1)}>Try again</button><button type="button" className="rq-btn" onClick={download}>Download</button></div></div>}
        {!loading && !loadError && preview?.unsupported && <div className="rqv-state"><p>This file type can’t be shown here.</p><button type="button" className="rq-btn" onClick={download}>Download to open it</button></div>}
        {!loading && !loadError && preview?.url && (preview.mime === 'application/pdf'
          ? <PdfPreview url={preview.url} scale={2 * zoom} page={page} onPages={setPages} />
          : <img src={preview.url} alt={row.label} />)}
      </div>
      {panel && <aside className="f48-side rqv-side" aria-label="Review">
        <div className="f48-side-scroll">
          <div className="rqv-status"><b className="lb-chip" data-tone={pill[1]}>{pill[0]}{pct != null && row.status === 'submitted' ? ` · ${pct}% sure` : ''}</b></div>
          {findings.length > 0 && <ul className="rqv-findings">{findings.slice(0, 3).map(f => <li key={f}>{f}</li>)}</ul>}
          {row.review && findings.length > 3 && <details className="lb-details"><summary>More findings</summary><RequirementCheckResult review={row.review} compact /></details>}
          <dl className="rqv-facts">
            <div><dt>Sent</dt><dd>{row.req?.submittedAt ? fmt(row.req.submittedAt) : 'Not sent yet'}</dd></div>
            {row.deadline && <div><dt>Due</dt><dd data-late={late || undefined}>{fmt(row.deadline)}{late ? ' (late)' : ''}</dd></div>}
            <div><dt>Stage</dt><dd>{stageLabel(row.stage)} · {index + 1} of {rows.length}</dd></div>
            {row.req?.fileName && <div><dt>File</dt><dd className="rqv-file">{row.req.fileName}</dd></div>}
          </dl>
          {settingsPath && <details className="lb-details"><summary>Required text</summary>
            <p className="f48-muted">One expected word or phrase per line. Used to flag files that are missing them.</p>
            <textarea className="rq-reason rqv-terms" rows={3} maxLength={3100} value={terms} disabled={termsBusy} onChange={event => setTerms(event.target.value)} />
            <button type="button" className="rq-btn" disabled={termsBusy} onClick={saveTerms}>{termsBusy ? 'Saving…' : 'Save'}</button>{termsMsg && <span className="f48-muted"> {termsMsg}</span>}
            {textChecks && <p className="f48-muted">{textChecks.missingTerms.length ? `Not found: ${textChecks.missingTerms.join(', ')}.` : 'All required text was found.'}</p>}
          </details>}
          {checks?.text?.trim() && <details className="lb-details"><summary>AI help reading this file</summary><DocumentAiAssistance studentId={student.id} requirementId={row.id} text={checks.text} sourceVersion={path} /></details>}
        </div>
        <div className="f48-side-foot">
          {row.status === 'submitted' && (fixOpen
            ? <div className="rqv-fix"><textarea autoFocus className="rq-reason rqv-reason" rows={3} placeholder="What should the student fix? e.g. The parent’s signature is missing." value={reason} onChange={event => setReason(event.target.value)} />
              <div><button type="button" className="rq-btn" onClick={() => setFixOpen(false)}>Cancel</button><button type="button" className="rq-btn rq-danger" disabled={saving || !reason.trim()} onClick={sendFix}>Send back</button></div></div>
            : <div className="rqv-decide"><button type="button" className="rq-btn" disabled={saving} onClick={() => setFixOpen(true)}>Ask to fix</button><button type="button" className="rq-btn rq-primary" disabled={saving} onClick={approve}><Icon name="check" size={14} /> Approve</button></div>)}
          {row.status === 'approved' && row.req?.autoApproved && <button type="button" className="rq-btn" disabled={saving} onClick={() => onUndo(row.id)}>Undo AI approval</button>}
          <div className="rqv-nav">
            <button type="button" className="rq-link" disabled={index === 0} onClick={() => setCurrentId(rows[index - 1].id)}><Icon name="chevronLeft" size={14} /> Previous</button>
            <span>{index + 1} of {rows.length}</span>
            <button type="button" className="rq-link" disabled={index >= rows.length - 1} onClick={() => setCurrentId(rows[index + 1].id)}>Next <Icon name="chevronRight" size={14} /></button>
          </div>
        </div>
      </aside>}
    </div>
  </dialog>;
}
