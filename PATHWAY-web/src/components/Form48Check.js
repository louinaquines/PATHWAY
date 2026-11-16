import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest, adminDocumentBlob } from '../adminApi';
import { readDtrSpreadsheet } from '../dtrSpreadsheet';
import { createDtrOcrJob } from '../dtrOcr';
import PdfPreview from './PdfPreview';
import DocumentAiAssistance from './DocumentAiAssistance';
import Icon from './Icons';
import './Form48Check.css';

const FIELDS = ['amArrival', 'amDeparture', 'pmArrival', 'pmDeparture'];
const HEADS = ['AM in', 'AM out', 'PM in', 'PM out'];
const blankCopy = () => Array.from({ length: 31 }, (_, i) => ({ day: i + 1 }));
const clock = minutes => { if (minutes == null) return ''; const h = Math.floor(minutes / 60), m = minutes % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const punch = value => { const d = value?.toDate ? value.toDate() : value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : ''; };
const dayName = iso => { const d = new Date(`${iso}T00:00:00Z`); return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }); };
const monthName = period => { const [y, m] = (period || '').split('-').map(Number); return y && m ? new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''; };
const mins = n => { const a = Math.abs(Number(n) || 0); const h = Math.floor(a / 60), r = a % 60; return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`; };

/* Form 48 check shown inside the student card: start → reading → check times → result. Attendance is never changed. */
export default function Form48Check({ student }) {
  const firstName = student.firstName || 'the student';
  const [step, setStep] = useState('start');
  const [history, setHistory] = useState(null);
  const [month, setMonth] = useState('');
  const [copies, setCopies] = useState(() => [blankCopy()]);
  const [copyIndex, setCopyIndex] = useState(0);
  const [scanCopies, setScanCopies] = useState(1);
  const [info, setInfo] = useState(null);
  const [preview, setPreview] = useState(null);
  const [progress, setProgress] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [sourceVersion, setSourceVersion] = useState(null);
  const [result, setResult] = useState(null);
  const [savedFrom, setSavedFrom] = useState(null);
  const [notes, setNotes] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [appDays, setAppDays] = useState({});
  const [focus, setFocus] = useState(false);
  const job = useRef(null); const revision = useRef(0); const saveId = useRef(null); const fileInput = useRef(null);
  const base = `/coordinator/students/${encodeURIComponent(student.id)}/dtr`;

  useEffect(() => {
    let active = true;
    adminRequest(`${base}/reviews`).then(data => {
      if (!active) return; const list = data.reviews || []; setHistory(list);
      if (list[0]?.comparison) { setResult(list[0].comparison); setSavedFrom(list[0]); setMonth(list[0].period); setStep('result'); }
    }).catch(() => { if (active) setHistory([]); });
    return () => { active = false; revision.current++; job.current?.cancel(); };
  }, [base]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  useEffect(() => {
    if (step !== 'result' || !month) return undefined;
    let active = true;
    getDocs(query(collection(db, 'users', student.id, 'attendance'), where('date', '>=', month + '-01'), where('date', '<=', month + '-31')))
      .then(snap => { if (active) setAppDays(Object.fromEntries(snap.docs.map(item => [item.data().date || item.id, item.data()]))); }).catch(() => {});
    return () => { active = false; };
  }, [step, month, student.id]);

  const importDocument = async (file, version = null) => {
    if (!file) return;
    const rev = ++revision.current;
    setStep('reading'); setError(''); setResult(null); setSavedFrom(null); setSavedMsg(''); setProgress('Opening the file…');
    try {
      const sheet = /\.(xls|xlsx)$/i.test(file.name);
      const ocr = sheet ? null : createDtrOcrJob(file, { copyCount: scanCopies, onProgress: message => { if (rev === revision.current) setProgress(message); } });
      job.current = ocr;
      const data = sheet ? await readDtrSpreadsheet(file) : await ocr.promise;
      if (rev !== revision.current) return;
      setCopies(data.copies); setCopyIndex(0); setMonth(data.month); setReviewed(false); setInfo({ fileName: file.name, ...data });
      setSourceVersion(version); setPreview(sheet ? null : { url: URL.createObjectURL(file), pdf: /\.pdf$/i.test(file.name) });
      setStep('check');
    } catch (failure) { if (rev === revision.current) { setError(failure.message); setStep('start'); } }
    finally { if (rev === revision.current) { setProgress(''); job.current = null; } }
  };
  const useSubmitted = async () => {
    setError(''); setStep('reading'); setProgress('Getting the submitted Form 48…');
    const rev = ++revision.current;
    try {
      const source = await adminRequest(`${base}/source`);
      const blob = await adminDocumentBlob(`${base}/source?version=${encodeURIComponent(source.version)}`);
      if (rev !== revision.current) return;
      await importDocument(new File([blob], source.fileName, { type: blob.type }), source.version);
    } catch (failure) { if (rev === revision.current) { setError(failure.message); setStep('start'); } }
  };
  const openPaper = async () => {
    try { const source = await adminRequest(`${base}/source`); const blob = await adminDocumentBlob(`${base}/source?version=${encodeURIComponent(source.version)}`); window.open(URL.createObjectURL(blob), '_blank', 'noopener'); }
    catch (failure) { setError(failure.message); }
  };
  const daysIn = month ? new Date(Date.UTC(...month.split('-').map(Number), 0)).getUTCDate() : 31;
  const formBody = () => { const [year, m] = month.split('-').map(Number); return { year, month: m, copies: copies.map(rows => rows.map(row => ({ ...row, needsReview: row.ocrReview && reviewed ? Boolean(row.reviewFields?.length) : row.needsReview })).filter(row => row.day <= daysIn || FIELDS.some(f => row[f]) || row.needsReview)) }; };
  const change = (day, field, value) => {
    revision.current++; setResult(null); setReviewed(false);
    setCopies(current => current.map((rows, index) => index !== copyIndex ? rows : rows.map(row => {
      if (row.day !== day) return row; const reviewFields = (row.reviewFields || []).filter(name => name !== field);
      return { ...row, [field]: value, reviewFields, needsReview: reviewFields.length > 0 };
    })));
  };
  const compare = async () => {
    setBusy(true); setError('');
    try { const data = await adminRequest(`${base}/compare`, { method: 'POST', body: JSON.stringify({ form: formBody() }) }); setResult(data); setSavedFrom(null); saveId.current = crypto.randomUUID(); setStep('result'); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const save = async () => {
    setBusy(true); setError('');
    try {
      const data = await adminRequest(`${base}/reviews`, { method: 'POST', body: JSON.stringify({ reviewId: saveId.current, sourceVersion, notes, form: formBody() }) });
      setResult(data.review.comparison); setSavedFrom(data.review); setSavedMsg('Saved. Attendance was not changed.');
      setHistory(current => [data.review, ...(current || []).filter(item => item.id !== data.review.id)].slice(0, 20));
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };

  const fileField = <input ref={fileInput} type="file" hidden accept=".xls,.xlsx,.pdf,.png,.jpg,.jpeg" onChange={event => { const f = event.target.files?.[0]; event.target.value = ''; importDocument(f); }} />;

  if (history === null) return <div className="f48"><p className="f48-muted">Loading Form 48…</p></div>;

  if (step === 'start') return <div className="f48 f48-start">{fileField}
    <img src="/guide-thinking.png" alt="" aria-hidden="true" />
    <h3>Check {firstName}’s Form 48 against the app</h3>
    <p>We read the paper Daily Time Record and compare each day with the app’s clock-ins. Attendance is never changed.</p>
    <div className="f48-layout" role="group" aria-label="How the paper was scanned">
      <button type="button" aria-pressed={scanCopies === 1} onClick={() => setScanCopies(1)}>One copy per page</button>
      <button type="button" aria-pressed={scanCopies === 2} onClick={() => setScanCopies(2)}>Two copies side by side</button>
    </div>
    <button type="button" className="rq-btn rq-primary f48-big" onClick={useSubmitted}><Icon name="file" size={15} /> Use the submitted Form 48</button>
    <button type="button" className="rq-link" onClick={() => fileInput.current?.click()}>Upload a different file</button>
    {error && <p className="f48-error" role="alert">{error}</p>}
    <small>Files are read on this computer. Handwriting can be misread, so you’ll check the times before comparing.</small>
    {history.length > 0 && <PastChecks history={history} onOpen={item => { setResult(item.comparison); setSavedFrom(item); setMonth(item.period); setStep('result'); }} />}
  </div>;

  if (step === 'reading') return <div className="f48 f48-start">
    <div className="f48-reading"><span className="f48-spinner" aria-hidden="true" /><strong>Reading the Form 48…</strong><span role="status">{progress}</span></div>
    {job.current && <button type="button" className="rq-link" onClick={() => { job.current?.cancel(); revision.current++; setStep('start'); }}>Cancel</button>}
  </div>;

  if (step === 'check') {
    const anyRead = copies[copyIndex].some(row => FIELDS.some(f => row[f]) || row.reviewFields?.length);
    const rows = copies[copyIndex].filter(row => (showEmpty || !anyRead) ? row.day <= daysIn : (FIELDS.some(f => row[f]) || row.reviewFields?.length));
    const flagged = copies[copyIndex].filter(row => row.reviewFields?.length).length;
    const grid = <>
          {copies.length > 1 && <div className="lb-mini-pills">{copies.map((_, i) => <button key={i} type="button" aria-pressed={copyIndex === i} onClick={() => setCopyIndex(i)}>Copy {i + 1}</button>)}</div>}
          <div className="f48-grid" role="table">
            <div className="f48-gr f48-gh" role="row"><span>Day</span>{HEADS.map(h => <span key={h}>{h}</span>)}</div>
            {rows.map(row => <div className="f48-gr" role="row" key={row.day} data-flag={row.reviewFields?.length ? true : undefined}>
              <span className="f48-dayno">{row.day}</span>
              {FIELDS.map((f, i) => <input key={f} aria-label={`Day ${row.day} ${HEADS[i]}`} value={row[f] || ''} maxLength={80} data-flag={row.reviewFields?.includes(f) || undefined} onChange={event => change(row.day, f, event.target.value)} />)}
            </div>)}
          </div>
          {anyRead && <button type="button" className="rq-link" onClick={() => setShowEmpty(v => !v)}>{showEmpty ? 'Hide empty days' : 'Show all days'}</button>}
    </>;
    return <div className="f48 f48-check">{fileField}
      <div className="f48-bar">
        <p><strong>Check the times</strong> · {info?.fileName}{flagged ? <> · <b className="lb-chip" data-tone="amber">{flagged} day{flagged === 1 ? '' : 's'} to check</b></> : ''}</p>
        <label className="f48-month">Month <input type="month" value={month} onChange={event => { setMonth(event.target.value); setReviewed(false); }} /></label>
      </div>
      {info?.warnings?.length > 0 && <div className="f48-warn" role="note"><Icon name="alert" size={15} /><span>{info.warnings.length === 1 ? info.warnings[0].replace(/^Copy \d+: /, '') : <>The scanner had trouble with this file. Check each time against the scan{info.warnings.some(w => /could not be mapped/i.test(w)) ? ' and type in any that are missing' : ''}.</>}</span></div>}
      {!anyReadAll(copies) && <p className="f48-muted">No times could be read from the scan. Type them in using the page on the left.</p>}
      <div className="f48-split">
        {preview && <div className="f48-scan">
          <button type="button" className="f48-max" aria-label="Open full screen" title="Open full screen" onClick={() => setFocus(true)}><Icon name="expand" size={15} /></button>
          {preview.pdf ? <PdfPreview url={preview.url} hideSinglePage /> : <img src={preview.url} alt="The scanned Form 48" />}</div>}
        <div className="f48-times">{grid}</div>
      </div>
      {focus && preview && <FocusMode preview={preview} fileName={info?.fileName} onClose={() => setFocus(false)}
        footer={<>
          <label className="f48-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I checked the month and the times</label>
          <button type="button" className="rq-btn rq-primary" disabled={busy || !month || !reviewed} onClick={async () => { await compare(); setFocus(false); }}>{busy ? 'Comparing…' : 'Compare with the app'}</button>
        </>}>{grid}</FocusMode>}
      {error && <p className="f48-error" role="alert">{error}</p>}
      <div className="lb-actions">
        <label className="f48-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /> I checked the month and the times</label>
        <button type="button" className="rq-btn" onClick={() => { revision.current++; setStep('start'); }}>Start over</button>
        <button type="button" className="rq-btn rq-primary" disabled={busy || !month || !reviewed} onClick={compare}>{busy ? 'Comparing…' : 'Compare with the app'}</button>
      </div>
    </div>;
  }

  // result
  const rows = (result?.results || []).filter(row => row.status !== 'blank').map(row => ({ date: row.date, row }));
  (result?.digitalOnlyDates || []).forEach(date => rows.push({ date, onlyApp: true }));
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const differ = rows.filter(r => r.onlyApp || r.row.status !== 'endpoints_match').length;
  const paperMinutes = (result?.results || []).reduce((sum, row) => sum + (row.workedMinutes || 0), 0);
  const appHours = Object.entries(appDays).filter(([date, rec]) => rec.timeOut && rows.some(r => r.date === date)).reduce((sum, [, rec]) => sum + Number(rec.hoursToday || 0), 0);
  const tagFor = r => {
    if (r.onlyApp) return ['Not on paper', 'amber'];
    if (r.row.status === 'endpoints_match') return ['Matches', 'green'];
    if (r.row.issues.some(i => i.startsWith('No digital attendance'))) return ['Not in the app', 'amber'];
    if (r.row.status === 'discrepancy') return ['Times differ', 'amber'];
    if (r.row.issues.some(i => /incomplete/.test(i))) return ['No time-out', 'amber'];
    return ['Check this day', 'amber'];
  };
  return <div className="f48 f48-result">{fileField}
    <div className="f48-bar">
      <p>Form 48 for {monthName(month)}{savedFrom ? ` · saved ${new Date(savedFrom.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}` : info?.fileName ? ` · ${info.fileName}` : ''}. {differ ? <><strong>{differ} day{differ === 1 ? ' is' : 's are'} different</strong> from the app.</> : 'Every day matches the app.'}</p>
      <button type="button" className="rq-btn" onClick={openPaper}><Icon name="file" size={14} /> Open the paper copy</button>
    </div>
    <div className="lb-table f48-res" role="table">
      <div className="lb-tr lb-th" role="row"><span>Day</span><span>On paper</span><span>In the app</span><span /></div>
      {rows.map(r => { const tag = tagFor(r); const app = appDays[r.date]; const t = r.row?.times || {};
        const paper = r.onlyApp ? '—' : `${clock(t.amArrival ?? t.pmArrival)} – ${clock(t.pmDeparture ?? t.amDeparture)}`;
        const inApp = !app ? 'Didn’t clock in' : !app.timeOut ? `${punch(app.timeIn)} · no time-out` : `${punch(app.timeIn)} – ${punch(app.timeOut)}`;
        return <div className="lb-tr" role="row" key={r.date} data-differ={tag[1] !== 'green' || undefined}>
          <span className="lb-day">{dayName(r.date)}</span><span>{paper}</span>
          <span className={tag[1] !== 'green' ? 'f48-off' : ''}>{inApp}{r.row?.endpointDifferences && r.row.status === 'discrepancy' && <small> ({r.row.endpointDifferences.arrival ? `in ${mins(r.row.endpointDifferences.arrival)} off` : ''}{r.row.endpointDifferences.arrival && r.row.endpointDifferences.departure ? ', ' : ''}{r.row.endpointDifferences.departure ? `out ${mins(r.row.endpointDifferences.departure)} off` : ''})</small>}</span>
          <span className="f48-tag">{tag[1] === 'green' ? <em className="f48-ok">Matches</em> : <b className="lb-chip" data-tone="amber">{tag[0]}</b>}</span>
        </div>; })}
      {!rows.length && <p className="f48-muted">No times on this Form 48.</p>}
      {rows.length > 0 && <div className="lb-tr f48-total" role="row"><span>Total</span><span>{(paperMinutes / 60).toFixed(0)} hours</span><span>{appHours.toFixed(0)} hours counted</span><span /></div>}
    </div>
    {!savedFrom && info?.extractedText && <details className="lb-details"><summary>AI help reading this Form 48</summary>
      <DocumentAiAssistance studentId={student.id} requirementId="dtr" text={info.extractedText} sourceVersion={sourceVersion} form={formBody()} /></details>}
    <p className="f48-muted f48-limit">{result?.limitation}</p>
    {history?.length > 1 && <PastChecks history={history} onOpen={item => { setResult(item.comparison); setSavedFrom(item); setMonth(item.period); }} />}
    {error && <p className="f48-error" role="alert">{error}</p>}
    <div className="lb-actions">
      {savedFrom ? <><span className="f48-muted f48-grow">{savedMsg || (savedFrom.notes ? `Note: ${savedFrom.notes}` : 'This check is saved.')}</span>
        <button type="button" className="rq-btn rq-primary" onClick={() => { setStep('start'); setResult(null); setSavedFrom(null); }}><Icon name="refresh" size={14} /> Check again</button></>
        : <><input className="lb-note-input" placeholder="Add a note (optional)" value={notes} maxLength={2000} onChange={event => { setNotes(event.target.value); saveId.current = crypto.randomUUID(); }} />
          <button type="button" className="rq-btn" onClick={() => setStep('check')}>Edit times</button>
          <button type="button" className="rq-btn rq-primary" disabled={busy || !sourceVersion || !reviewed} title={!sourceVersion ? 'Only the submitted Form 48 can be saved' : ''} onClick={save}><Icon name="check" size={14} /> {busy ? 'Saving…' : 'Save review'}</button></>}
    </div>
  </div>;
}

function FocusMode({ preview, fileName, onClose, footer, children }) {
  const dialog = useRef(null); const stage = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [panel, setPanel] = useState(true);
  useEffect(() => { dialog.current?.showModal?.(); }, []);
  useEffect(() => {
    const keys = event => {
      if (event.target.closest?.('input, textarea')) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(z => Math.min(4, +(z + 0.25).toFixed(2))); }
      if (event.key === '-') { event.preventDefault(); setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2))); }
      if (event.key === '0') setZoom(1);
      if (event.key === 'ArrowRight') setPage(p => Math.min(pages, p + 1));
      if (event.key === 'ArrowLeft') setPage(p => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', keys); return () => window.removeEventListener('keydown', keys);
  }, [pages]);
  const wheel = event => { if (!event.ctrlKey) return; event.preventDefault(); setZoom(z => Math.min(4, Math.max(0.5, +(z + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))); };
  return <dialog ref={dialog} className="f48-focus" aria-label="Form 48 full screen" onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}>
    <header className="f48-focus-bar">
      <strong title={fileName}>{fileName || 'Form 48'}</strong>
      <div className="f48-tools" role="toolbar" aria-label="View controls">
        <button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}>+</button>
        <button type="button" className="f48-tool-text" onClick={() => setZoom(1)}>Fit width</button>
        {pages > 1 && <><span className="f48-sep" /><button type="button" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(p => p - 1)}><Icon name="chevronLeft" size={14} /></button>
          <span>{page} / {pages}</span>
          <button type="button" aria-label="Next page" disabled={page === pages} onClick={() => setPage(p => p + 1)}><Icon name="chevronRight" size={14} /></button></>}
        <span className="f48-sep" />
        <a href={preview.url} download={fileName || 'form48'} aria-label="Download" title="Download"><Icon name="download" size={15} /></a>
        <button type="button" className="f48-tool-text f48-times-toggle" aria-pressed={panel} onClick={() => setPanel(v => !v)}>Times</button>
        <button type="button" aria-label="Close full screen" onClick={onClose}><Icon name="x" size={16} /></button>
      </div>
    </header>
    <div className="f48-focus-body" data-panel={panel || undefined}>
      <div className="f48-stage" ref={stage} onWheel={wheel} style={{ '--z': zoom }}>
        {preview.pdf ? <PdfPreview url={preview.url} scale={2 * zoom} page={page} onPages={setPages} /> : <img src={preview.url} alt="The scanned Form 48" />}
      </div>
      {panel && <aside className="f48-side" aria-label="Times">
        <div className="f48-side-scroll">{children}</div>
        <div className="f48-side-foot">{footer}</div>
      </aside>}
    </div>
  </dialog>;
}

function anyReadAll(copies) { return copies.some(rows => rows.some(row => FIELDS.some(f => row[f]))); }

function PastChecks({ history, onOpen }) {
  return <details className="lb-details f48-past"><summary>Past checks ({history.length})</summary>
    <ul>{history.map(item => <li key={item.id}><button type="button" className="rq-link" onClick={() => onOpen(item)}>{monthName(item.period)} · {new Date(item.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</button>
      <span>{(item.comparison?.results || []).filter(r => r.status !== 'blank' && r.status !== 'endpoints_match').length} days differ{item.notes ? ` · ${item.notes}` : ''}</span></li>)}</ul>
  </details>;
}
