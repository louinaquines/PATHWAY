// src/components/JournalAiAnalysis.js
import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './JournalAiAnalysis.css';

const MOODS = { positive: 'green', negative: 'red', unclear: 'gray' };

export default function JournalAiAnalysis({ studentId, entryId, sourceText }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const inFlight = useRef(false);
  useEffect(() => {
    generation.current++;
    setResult(null); setError(''); setConsent(false);
    return () => { generation.current++; };
  }, [studentId, entryId, sourceText]);
  async function analyze() {
    if (!consent || inFlight.current) return;
    const version = generation.current;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const data = await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/logbook/${encodeURIComponent(entryId)}/ai-analysis`, { method: 'POST', body: JSON.stringify({ consent: true }) });
      if (version === generation.current) setResult(data);
    } catch {
      if (version === generation.current) setError('AI review unavailable. Try again later.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const tone = MOODS[result?.mood] || 'gray';
  return <section className="journal-ai" data-tone={result ? tone : undefined} aria-label="AI journal review">
    <header className="journal-ai__head">
      {result
        ? <h4><i aria-hidden="true" />{result.headline}</h4>
        : <h4 className="journal-ai__title">AI journal review</h4>}
      <button type="button" disabled={!consent || busy} onClick={analyze}>{busy ? 'Reading…' : result ? 'Analyze again' : 'Analyze'}</button>
    </header>
    {result && <p className="journal-ai__summary">{result.summary}</p>}
    {!result && !busy && <p className="journal-ai__hint">Shows how the student seems to feel at work, with a short analysis. Not a grade.</p>}
    {busy && <p className="journal-ai__hint" role="status">Reading the journal…</p>}
    {error && <p className="journal-ai__error" role="alert">{error}</p>}
    <label className="journal-ai__consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> I have permission to share this journal with AI</label>
  </section>;
}
