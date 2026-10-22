import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './JournalAiAnalysis.css';

export default function JournalAiAnalysis({ studentId, entryId, sourceText, hours, weekRange }) {
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
  }, [studentId, entryId, sourceText, hours, weekRange]);
  async function analyze() {
    if (!consent || inFlight.current) return;
    const version = generation.current;
    inFlight.current = true; setBusy(true); setError(''); setResult(null);
    try {
      const data = await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/logbook/${encodeURIComponent(entryId)}/ai-analysis`, { method: 'POST', body: JSON.stringify({ consent: true }) });
      if (version === generation.current) setResult(data);
    } catch {
      if (version === generation.current) setError('Analysis unavailable. Free journal checks remain available.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="journal-ai">
    <summary>Optional AI journal review <span>Advisory only</span></summary>
    <div className="journal-ai__body">
      <p>Review completeness, possible competencies and tone cues. This is not an academic grade or verified competency and does not approve or change the journal.</p>
      <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> I have permission to share this journal text with AI. It may contain confidential information.</label>
      <div className="journal-ai__actions"><button type="button" disabled={!consent || busy} onClick={analyze}>{busy ? 'Reviewing…' : 'Analyze this journal'}</button>{result && <button type="button" onClick={() => setResult(null)}>Discard findings</button>}</div>
      <p role="status" aria-live="polite">{busy ? 'Review in progress. Original notes remain unchanged.' : ''}</p>
      {error && <p role="alert">{error}</p>}
      {result && <div>
        {result.scoring && <section aria-label="Advisory completeness score">
          <h4>Journal completeness</h4>
          <p>{Number.isFinite(result.scoring.total) ? `${result.scoring.total}/100 — ${result.scoring.status}` : result.scoring.status}</p>
          {result.scoring.criteria.map(item => <div key={item.id}>
            <h5>{item.label} — {item.points}/{item.weight} ({item.level})</h5>
            <p>{item.reason}</p>{item.evidence && <blockquote>{item.evidence}</blockquote>}
          </div>)}
          <p>{result.scoring.version}</p>
        </section>}
        {[['completeness', 'Completeness review notes', 'finding'], ['competencies', 'Possible competencies', 'name'], ['sentiment', 'Tone cues', 'cue']].map(([key, title, field]) => <section key={key}><h4>{title}</h4>{result[key]?.length ? result[key].map((item, index) => <div key={index}><p>{item[field]}</p><blockquote>{item.evidence}</blockquote></div>) : <p>No supported findings.</p>}</section>)}<p>{result.limitation}</p></div>}
    </div>
  </details>;
}
