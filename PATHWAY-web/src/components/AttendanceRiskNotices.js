import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import CoordinatorSearch, { matchesCoordinatorSearch } from './CoordinatorSearch';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { attendanceNoticeKinds, attendanceReasonLabels } from '../attendanceRiskLabels';

export default function AttendanceRiskNotices({ access: { isCurrent, onDenied }, onOpen }) {
  const [records, setRecords] = useState([]), [cursor, setCursor] = useState(null), [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [search, setSearch] = useState('');
  const pending = useRef(false), alive = useRef(true), revision = useRef(0);
  const current = () => alive.current && isCurrent();
  async function load(token = null) {
    if (pending.current || !current()) return;
    const request = ++revision.current;
    const accepted = () => current() && request === revision.current;
    pending.current = true; setBusy(true); setError('');
    if (!token) { setRecords([]); setCursor(null); setHasMore(false); }
    try {
      let page;
      try { page = await adminRequest(`/coordinator/attendance-risk-notices${token ? `?cursor=${encodeURIComponent(token)}` : ''}`, { deadlineMs: 15000 }); }
      catch (failure) {
        if (!accepted()) return;
        if (failure.status !== 400 || !token) throw failure;
        setRecords([]); setCursor(null); setHasMore(false);
        // One first-page reload only; an invalid first page is surfaced, never retried.
        page = await adminRequest('/coordinator/attendance-risk-notices', { deadlineMs: 15000 });
        token = null;
      }
      if (!accepted()) return;
      setRecords(previous => [...new Map([...(token ? previous : []), ...page.records].map(item => [item.id, item])).values()].slice(-100));
      setCursor(page.cursor); setHasMore(page.hasMore);
    } catch (failure) {
      if (!accepted()) return;
      if ([401,403].includes(failure.status)) onDenied();
      else setError(failure.message);
    } finally { if (accepted()) { pending.current = false; setBusy(false); } }
  }
  useEffect(() => {
    alive.current = true; pending.current = false; load();
    return () => { alive.current = false; revision.current++; pending.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const sourceRefs = JSON.stringify([...new Map(records.map(item => [item.studentId, item.sectionId])).entries()].sort());
  useEffect(() => {
    let changed = false;
    const refresh = () => {
      if (changed || !current()) return;
      changed = true; revision.current++; pending.current = false;
      setRecords([]); setCursor(null); setHasMore(false); setSearch(''); load();
    };
    const stop = JSON.parse(sourceRefs).map(([studentId, sectionId]) => onSnapshot(doc(db, 'users', studentId), snapshot => {
      const student = snapshot.data();
      if (!student || student.role !== 'student' || student.sectionId !== sectionId) refresh();
    }, refresh));
    return () => { changed = true; stop.forEach(unsubscribe => unsubscribe()); };
  }, [sourceRefs]); // eslint-disable-line react-hooks/exhaustive-deps
  async function read(id) {
    if (pending.current || !current()) return;
    const request = ++revision.current;
    const accepted = () => current() && request === revision.current;
    pending.current = true; setBusy(true); setError('');
    try {
      const page = await adminRequest(`/coordinator/attendance-risk-notices/${encodeURIComponent(id)}/read`, { method: 'POST', body: '{}', deadlineMs: 15000 });
      if (accepted()) setRecords(previous => previous.map(record => record.id === id ? page.records[0] : record));
    } catch (failure) {
      if (accepted()) { if ([401,403].includes(failure.status)) onDenied(); else setError(failure.message); }
    } finally { if (accepted()) { pending.current = false; setBusy(false); } }
  }
  return <section className="attendance-risk-panel" aria-label="Attendance risk notices">
    <h3>Attendance risk notices</h3>
    <p>{records.length} loaded. Document ID order, not chronological. Search covers loaded notices only (up to 100; loading further pages drops earlier pages). Marking read only records that this notice was read; it does not acknowledge or resolve the risk.</p>
    <CoordinatorSearch value={search} onChange={setSearch} label="Search loaded attendance notices" placeholder="Search loaded notices by kind, tier, progress, data status or reason..." />
    <button type="button" disabled={busy} onClick={() => load()}>Refresh attendance notices</button>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">Loading attendance notices…</p>}
    {records.filter(item => matchesCoordinatorSearch(search, item.title, item.kind, attendanceNoticeKinds[item.kind], item.riskTier, item.progressStatus, item.dataStatus, ...(item.reasonCodes || []).flatMap(code => [code, attendanceReasonLabels[code]]))).map(item => <article key={item.id}>
      <h4>{item.title}</h4><p><span>{attendanceNoticeKinds[item.kind] || item.kind}</span> · Risk: {item.riskTier ?? 'Unavailable'} · Progress: {item.progressStatus} · Data: {item.dataStatus}</p>
      <p>As of {item.asOf} · Created {item.createdAt} · Rule {item.ruleVersion}</p>
      <ul>{item.reasonCodes.map(code => <li key={code}>{attendanceReasonLabels[code] || code}</li>)}</ul>
      <span>{item.read ? 'Read' : 'Unread'}</span>{!item.read && <button type="button" disabled={busy} onClick={() => read(item.id)}>Mark attendance notice read</button>}
      {onOpen && <button type="button" onClick={() => onOpen({ sectionId: item.sectionId, studentId: item.studentId })}>View attendance analytics</button>}
    </article>)}
    {!records.length && !busy && <p>No attendance notices loaded.</p>}
    {hasMore && <button type="button" disabled={busy} onClick={() => load(cursor)}>Load more attendance notices</button>}
  </section>;
}
