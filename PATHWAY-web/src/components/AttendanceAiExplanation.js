import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './JournalAiAnalysis.css';

const labels = { creditedHours: 'Credited hours', completionPercentage: 'Completion', attendanceRate: 'Attendance rate', onTimeRate: 'On-time rate', missedShifts: 'Missed shifts', projectedCompletion: 'Estimated completion', risk: 'Calculated risk' };
export default function AttendanceAiExplanation({ sectionId, studentId, metricsVersion }) {
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [result, setResult] = useState(null), [error, setError] = useState('');
  const generation = useRef(0), inFlight = useRef(false);
  useEffect(() => { generation.current++; setResult(null); setConsent(false); setError(''); return () => { generation.current++; }; }, [sectionId, studentId, metricsVersion]);
  async function explain() {
    if (!consent || inFlight.current) return;
    const version = generation.current;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const data = await adminRequest(`/coordinator/sections/${encodeURIComponent(sectionId)}/students/${encodeURIComponent(studentId)}/attendance-ai`, { method: 'POST', body: JSON.stringify({ consent: true }) });
      if (version === generation.current) setResult(data);
    } catch { if (version === generation.current) setError('AI explanation unavailable. Calculated analytics remain available.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <details className="journal-ai"><summary>Explain with AI <span>Advisory only</span></summary><div className="journal-ai__body">
    <p>Optional explanation of current calculated metrics. No hours, risk labels or approvals are changed.</p>
    <label><input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} /> Share aggregate metrics with Anthropic. Names, emails and individual attendance logs are not shared.</label>
    <div className="journal-ai__actions"><button type="button" disabled={!consent || busy} onClick={explain}>{busy ? 'Explaining…' : 'Explain current metrics'}</button>{result && <button type="button" onClick={() => setResult(null)}>Discard explanation</button>}</div>
    <p role="status" aria-live="polite">{busy ? 'Preparing an advisory explanation…' : ''}</p>{error && <p role="alert">{error}</p>}
    {result && <div><p>Calculated snapshot: {result.today}</p>{result.explanations.map(item => <section key={item.field}><h4>{labels[item.field]}: {item.value === null ? 'Unavailable' : String(item.value)}</h4><p>{item.explanation}</p></section>)}<p>{result.limitation}</p></div>}
  </div></details>;
}
