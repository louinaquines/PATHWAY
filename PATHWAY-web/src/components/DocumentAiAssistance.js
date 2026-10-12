import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './JournalAiAnalysis.css';

export default function DocumentAiAssistance({ studentId, requirementId, text = '', form, sourceVersion }) {
  const [excerpt, setExcerpt] = useState(''), [consent, setConsent] = useState(false), [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const generation = useRef(0), inFlight = useRef(false);
  const formVersion = JSON.stringify(form);
  useEffect(() => { generation.current++; setExcerpt(text.slice(0, 6000)); setReviewed(false); setConsent(false); setResult(null); setError(''); return () => { generation.current++; }; }, [studentId, requirementId, text, formVersion, sourceVersion]);
  async function assist() {
    if (!reviewed || !consent || inFlight.current) return;
    const version = generation.current; inFlight.current = true; setBusy(true); setError('');
    try {
      const data = await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(requirementId)}/ai-assistance`, { method: 'POST', body: JSON.stringify({ text: excerpt, form, reviewed: true, consent: true }) });
      if (generation.current === version) setResult(data);
    } catch { if (generation.current === version) setError('AI assistance unavailable. Manual checks and comparison remain available.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="journal-ai"><summary>Optional AI document assistance <span>Manual review required</span></summary><div className="journal-ai__body">
    <p>Review and redact the excerpt before sharing. Only this text{form ? ' and server comparison review points' : ''} will be sent—not the file. AI cannot verify signatures or approve documents.</p>
    {text.length > 6000 && <p>Only the first 6,000 characters are prefilled. Choose the relevant excerpt; omitted text is not analyzed.</p>}
    <label className="journal-ai__excerpt">Reviewed excerpt<textarea rows={5} maxLength={6000} value={excerpt} disabled={busy} onChange={event => { generation.current++; setExcerpt(event.target.value); setReviewed(false); setResult(null); }} /></label>
    <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} /> I checked the excerpt against the original and corrected uncertain OCR{form ? ' and DTR times' : ''}.</label>
    <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> I have permission to share this reviewed source with AI and removed unnecessary personal or confidential information.</label>
    <div className="journal-ai__actions"><button type="button" disabled={!consent || !reviewed || busy || (!form && !excerpt.trim())} onClick={assist}>{busy ? 'Reviewing…' : 'Review with AI'}</button>{result && <button type="button" onClick={() => setResult(null)}>Discard findings</button>}</div>
    <p role="status" aria-live="polite">{busy ? 'Preparing advisory review…' : ''}</p>{error && <p role="alert">{error}</p>}
    {result && <div>{result.findings.length ? result.findings.map((item, index) => <section key={index}><p>{item.finding}</p><blockquote>{item.evidence}</blockquote></section>) : <p>No supported findings. This does not mean the document is complete.</p>}<p>{result.limitation}</p></div>}
  </div></details>;
}
