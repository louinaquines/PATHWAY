import { useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';

// Admin-only: rebuild demo data. Shown only when the backend has DEMO_SEED_ENABLED=1.
export default function DemoSeedCard() {
  const [enabled, setEnabled] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { adminRequest('/admin/demo-seed').then(data => setEnabled(!!data.enabled)).catch(() => setEnabled(false)); }, []);
  if (!enabled) return null;
  const run = async () => {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await adminRequest('/admin/demo-seed', { method: 'POST', body: JSON.stringify({ confirm }) })); setConfirm(''); }
    catch (failure) { setError(failure.message || 'Demo data could not be created.'); }
    finally { setBusy(false); }
  };
  return <section className="admin-settings-card demo-seed-card">
    <header className="admin-settings-card-head"><div><h3>Demo data</h3>
      <p>Deletes every student and their records, then creates a fresh demo section with 15 students, companies, attendance, journals, evaluations and messages. Admin and coordinator accounts stay.</p></div></header>
    <div className="demo-seed-row">
      <label>Type <strong>RESET DEMO</strong> to confirm<input value={confirm} disabled={busy} onChange={event => setConfirm(event.target.value)} placeholder="RESET DEMO" /></label>
      <button type="button" className="portal-primary" disabled={busy || confirm !== 'RESET DEMO'} onClick={run}>{busy ? 'Creating demo data… (about 1–2 min)' : 'Reset and load demo data'}</button>
    </div>
    {error && <p role="alert" className="demo-seed-error">{error}</p>}
    {result && <div role="status" className="demo-seed-result">
      <strong>Demo data is ready.</strong>
      <p>Coordinator: <code>{result.coordinator}</code> / <code>{result.coordinatorPassword}</code></p>
      <p>Students: <code>uclm-26200001</code> to <code>uclm-26200015</code> / <code>{result.studentPassword}</code></p>
      <p>Section {result.section} · {result.students} students · removed {result.wipedStudents} old students</p>
    </div>}
  </section>;
}
