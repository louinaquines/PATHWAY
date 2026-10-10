import { useEffect, useRef, useState } from 'react';
import { adminRequest, adminDocumentBlob } from '../adminApi';
import { readDtrSpreadsheet } from '../dtrSpreadsheet';
import { createDtrOcrJob } from '../dtrOcr';
import PdfPreview from './PdfPreview';
import './DtrReviewDialog.css';

const fields = ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'];
const headings = ['AM arrival', 'AM departure', 'PM arrival', 'PM departure'];
export default function DtrReviewDialog({ student, onClose }) {
  const dialog = useRef(null);
  const [month, setMonth] = useState('');
  const [copies, setCopies] = useState(() => [Array.from({ length: 31 }, (_, i) => ({ day: i + 1 }))]);
  const [copyIndex, setCopyIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState(null);
  const [scanCopies, setScanCopies] = useState(1);
  const [scanPreview, setScanPreview] = useState(null);
  const [progress, setProgress] = useState('');
  const ocrJob = useRef(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [sourceVersion, setSourceVersion] = useState(null);
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const saveId = useRef(null);
  const reviewPath = `/coordinator/students/${encodeURIComponent(student.id)}/dtr/reviews`;
  useEffect(() => {
    let active = true;
    adminRequest(reviewPath).then(data => { if (active) setHistory(data.reviews || []); })
      .catch(() => { if (active) setHistoryError('Could not load saved reviews.'); });
    return () => { active = false; };
  }, [reviewPath]);
  const revision = useRef(0);
  useEffect(() => { dialog.current.showModal(); return () => { revision.current++; ocrJob.current?.cancel(); }; }, []);
  useEffect(() => () => { if (scanPreview) URL.revokeObjectURL(scanPreview.url); }, [scanPreview]);
  const change = (day, field, value) => {
    revision.current++; setResult(null); setError('');
    setReviewed(false);
    setCopies(current => current.map((rows, index) => index !== copyIndex ? rows : rows.map(row => {
      if (row.day !== day) return row;
      const reviewFields = (row.reviewFields || []).filter(name => name !== field);
      return { ...row, [field]: value, reviewFields, needsReview: reviewFields.length > 0 };
    })));
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    await importDocument(file);
  };
  const importSubmitted = async () => {
    setImporting(true); setError(''); setProgress('Loading submitted DTR…');
    const version = ++revision.current;
    try {
      const path = `/coordinator/students/${encodeURIComponent(student.id)}/dtr/source`;
      const source = await adminRequest(path);
      const blob = await adminDocumentBlob(`${path}?version=${encodeURIComponent(source.version)}`);
      if (revision.current !== version) return;
      await importDocument(new File([blob], source.fileName, { type: blob.type }), source.version);
    } catch (failure) {
      if (revision.current === version) { setError(failure.message); setImporting(false); setProgress(''); }
    }
  };
  const importDocument = async (file, submittedVersion = null) => {
    if (!file) return;
    const version = ++revision.current;
    setImporting(true); setError(''); setResult(null); setSourceVersion(null); setSavedMessage(''); setProgress('Reading workbook…');
    try {
      const spreadsheet = /\.(xls|xlsx)$/i.test(file.name);
      const job = spreadsheet ? null : createDtrOcrJob(file, { copyCount: scanCopies, onProgress: message => {
        if (version === revision.current) setProgress(message);
      } });
      ocrJob.current = job;
      const data = spreadsheet ? await readDtrSpreadsheet(file) : await job.promise;
      if (version !== revision.current) return;
      setCopies(data.copies); setCopyIndex(0); setMonth(data.month); setReviewed(false);
      setImportInfo({ fileName: file.name, ...data });
      setSourceVersion(submittedVersion);
      setScanPreview(spreadsheet ? null : { url: URL.createObjectURL(file), pdf: /\.pdf$/i.test(file.name) });
    } catch (failure) { if (version === revision.current) setError(failure.message); }
    finally { if (version === revision.current) { setImporting(false); setProgress(''); ocrJob.current = null; } }
  };
  const compare = async event => {
    event.preventDefault(); setBusy(true); setError(''); setResult(null);
    const version = revision.current;
    try {
      const [year, number] = month.split('-').map(Number);
      const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
      const data = await adminRequest(`/coordinator/students/${encodeURIComponent(student.id)}/dtr/compare`, {
        method: 'POST', body: JSON.stringify({ form: { year, month: number, copies: copies.map(rows => rows.map(row => ({ ...row,
          needsReview: row.ocrReview && reviewed ? Boolean(row.reviewFields?.length) : row.needsReview,
        })).filter(row => row.day <= days || fields.some(field => row[field]) || row.needsReview)) } }),
      });
      if (revision.current === version) { setResult(data); saveId.current = crypto.randomUUID(); setSavedMessage(''); }
    } catch (failure) { if (revision.current === version) setError(failure.message); }
    finally { setBusy(false); }
  };
  const saveReview = async () => {
    setBusy(true); setError('');
    const version = revision.current;
    try {
      const [year, number] = month.split('-').map(Number);
      const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
      const data = await adminRequest(reviewPath, { method: 'POST', body: JSON.stringify({
        reviewId: saveId.current, sourceVersion, notes, form: { year, month: number,
          copies: copies.map(rows => rows.map(row => ({ ...row, needsReview: row.ocrReview && reviewed ? Boolean(row.reviewFields?.length) : row.needsReview })).filter(row => row.day <= days || fields.some(field => row[field]) || row.needsReview)) },
      }) });
      if (revision.current === version) {
        setResult(data.review.comparison); setSavedMessage('Review saved. Attendance and document status are unchanged.');
        setHistory(current => [data.review, ...current.filter(item => item.id !== data.review.id)].slice(0, 20));
      }
    } catch (failure) { if (revision.current === version) setError(failure.message); }
    finally { setBusy(false); }
  };
  const days = month ? new Date(Date.UTC(...month.split('-').map(Number), 0)).getUTCDate() : 31;
  return <dialog ref={dialog} className="dtr-review" onCancel={onClose}>
    <header><div><h2>DTR comparison</h2><p>{student.firstName} {student.lastName} · Form 48</p></div>
      <button type="button" aria-label="Close DTR comparison" onClick={onClose}>×</button></header>
    <form onSubmit={compare}>
      <p>Enter the times from the document. Use 08:00 or 1:00 PM. Blank fields stay missing. Attendance records will not change.</p>
      <label className="dtr-import">Import Form 48 file <input type="file" accept=".xls,.xlsx,.pdf,.png,.jpg,.jpeg" disabled={busy || importing} onChange={importFile} /></label>
      <button type="button" disabled={busy || importing} onClick={importSubmitted}>Import submitted DTR</button>
      <label className="dtr-scan-layout">Scan layout <select value={scanCopies} disabled={busy || importing} onChange={event => setScanCopies(Number(event.target.value))}>
        <option value={1}>One copy</option><option value={2}>Two copies side by side</option></select></label>
      <p>Import replaces the entered times after the file is read. Files stay on this device; only reviewed times are sent for comparison. OCR needs an initial engine download and can misread handwriting.</p>
      {importing && <div><p role="status">{progress}</p>{ocrJob.current && <button type="button" onClick={() => ocrJob.current?.cancel()}>Cancel OCR</button>}</div>}
      {importInfo && <div className="dtr-import-info"><p>{importInfo.fileName} · {importInfo.sheetName} · {copies.length} {copies.length === 1 ? 'copy' : 'copies'}</p>
        {importInfo.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
        {scanPreview && <details><summary>View scan</summary>{scanPreview.pdf ? <PdfPreview url={scanPreview.url} /> : <img className="dtr-scan-image" src={scanPreview.url} alt="Original DTR scan for checking extracted times" />}</details>}
        {importInfo.extractedText && <details><summary>Extracted text</summary><pre className="dtr-ocr-text">{importInfo.extractedText}</pre></details>}
        <label><input type="checkbox" checked={reviewed} disabled={importing} onChange={event => setReviewed(event.target.checked)} /> I checked the document month and times in every copy.</label></div>}
      <label>Document month <input type="month" required min="1900-01" max="2200-12" value={month} onChange={event => {
        revision.current++; setMonth(event.target.value); setReviewed(false); setResult(null); setError('');
      }} disabled={importing} /></label>
      {copies.length > 1 && <div className="dtr-copy-controls">{copies.map((_, index) => <button type="button" key={index} aria-pressed={copyIndex === index} onClick={() => setCopyIndex(index)}>Copy {index + 1}</button>)}</div>}
      <div className="dtr-grid"><table><thead><tr><th>Day</th>{headings.map(heading => <th key={heading}>{heading}</th>)}</tr></thead>
        <tbody>{copies[copyIndex].filter(row => row.day <= days || fields.some(field => row[field]) || row.reviewFields?.length).map(row => <tr key={row.day}><th>{row.day}{row.day > days ? ' (invalid date)' : ''}{row.reviewFields?.length ? ' (check cells)' : ''}</th>{fields.map((field, i) =>
          <td key={field}><input aria-label={`Day ${row.day} ${headings[i]}`} value={row[field] || ''} maxLength={80} disabled={importing}
            onChange={event => change(row.day, field, event.target.value)} /></td>)}</tr>)}</tbody></table></div>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy || importing || !month || (importInfo && !reviewed)}>{busy ? 'Comparing…' : 'Compare attendance'}</button>
      {result && <section aria-label="Comparison results"><h3>Results</h3><p>{result.limitation}</p>
        <label>Review notes <textarea maxLength={2000} value={notes} disabled={busy} onChange={event => { setNotes(event.target.value); saveId.current = crypto.randomUUID(); setSavedMessage(''); }} /></label>
        <button type="button" disabled={busy || importing || !sourceVersion || !reviewed || Boolean(savedMessage)} onClick={saveReview}>Save review</button>
        {!sourceVersion && <p>Import the submitted DTR to save a file-linked review.</p>}
        {savedMessage && <p role="status">{savedMessage}</p>}
        {result.results.filter(row => row.status !== 'blank').map(row => <article key={row.date}>
          <strong>{row.date} — {row.status === 'endpoints_match' ? 'Arrival and departure match' : row.status === 'discrepancy' ? 'Times differ' : 'Needs review'}</strong>
          {row.endpointDifferences && <p>Difference from digital record: arrival {row.endpointDifferences.arrival} min; departure {row.endpointDifferences.departure} min.</p>}
          {row.workedMinutes != null && <p>DTR session total: {row.workedMinutes} min.</p>}
          {row.issues.map((issue, i) => <p key={i}>{issue}</p>)}</article>)}
        {result.results.every(row => row.status === 'blank') && <p>No DTR times entered.</p>}
        {result.digitalOnlyDates.length > 0 && <p>Digital dates not entered: {result.digitalOnlyDates.join(', ')}</p>}
      </section>}
      <section aria-label="Saved DTR reviews"><h3>Saved reviews</h3>{historyError && <p>{historyError}</p>}
        {history.map(item => <details key={item.id}><summary>{item.period} · {new Date(item.createdAt).toLocaleString()}</summary>
          <p>{item.fileName} · Reviewed by {item.coordinatorId}</p><p>{item.notes || 'No notes.'}</p>
          <p>Saved snapshot; current attendance or file may have changed.</p>
          {(item.comparison?.results || []).filter(row => row.status !== 'blank').map(row => <p key={row.date}>{row.date} · {row.status.replaceAll('_', ' ')}</p>)}
        </details>)}
      </section>
    </form>
  </dialog>;
}
