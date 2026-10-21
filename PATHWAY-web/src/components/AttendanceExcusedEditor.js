import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';

export function parseExcusedDates(text) {
  const dates = text.trim() ? text.split(/[\s,]+/).filter(Boolean) : [];
  if (dates.length > 366 || new Set(dates).size !== dates.length || dates.some(value => {
    if (!/^(20\d\d|2100)-\d{2}-\d{2}$/.test(value)) return true;
    const time = Date.parse(`${value}T00:00:00Z`);
    return !Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value;
  })) throw new Error('Enter at most 366 unique real calendar dates from 2000–2100.');
  return dates.sort();
}

export default function AttendanceExcusedEditor({ sectionId, studentId, onDenied, isCurrent, onSaved }) {
  const [text, setText] = useState(''), [version, setVersion] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const alive = useRef(true), pending = useRef(false), revision = useRef(0);
  const path = `/coordinator/sections/${encodeURIComponent(sectionId)}/students/${encodeURIComponent(studentId)}/attendance-excused-dates`;
  const current = () => alive.current && isCurrent();
  async function request(save) {
    if (pending.current || !current() || (save && version === null)) return;
    const requestVersion = ++revision.current;
    const accepted = () => current() && requestVersion === revision.current;
    let dates;
    try { if (save) dates = parseExcusedDates(text); } catch (failure) { setError(failure.message); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      const result = await adminRequest(path, { deadlineMs: 15000, ...(save ? { method: 'PUT', body: JSON.stringify({ dates, expectedVersion: version }) } : {}) });
      if (!accepted()) return;
      setText(result.dates.join(', ')); setVersion(result.version);
      if (save) { setError('Excused dates saved. Refresh analytics to recalculate.'); onSaved?.(); }
    } catch (failure) {
      if (!accepted()) return;
      if ([401,403,404].includes(failure.status)) { setText(''); setVersion(null); onDenied(); }
      else { setError(failure.message); if (failure.status === 409 || failure.code === 'DEADLINE_EXCEEDED') setVersion(null); }
    } finally { if (accepted()) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true; pending.current = false; request(false);
    return () => { alive.current = false; revision.current++; pending.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="attendance-excused-editor">
    <p>Coordinator excused dates exclude scheduled days from attendance and projection. This does not approve leave or change credited hours. Reload replaces the draft; review current dates before saving.</p>
    <label>Excused dates (YYYY-MM-DD)<textarea value={text} disabled={busy} onChange={event => setText(event.target.value)} /></label>
    <button type="button" disabled={busy || version === null} onClick={() => request(true)}>Save excused dates</button>
    <button type="button" disabled={busy} onClick={() => request(false)}>Reload excused dates for review</button>
    {busy && <p role="status">Loading excused dates…</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
