import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './JournalFrequencySettings.css';
export default function JournalFrequencySettings() {
  const [open, setOpen] = useState(false), [settings, setSettings] = useState(null);
  const [frequency, setFrequency] = useState('weekly'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), trigger = useRef(null), firstChoice = useRef(null);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (open && settings) firstChoice.current?.focus(); }, [open, settings]);
  async function load() {
    const version = ++generation.current; setBusy(true); setError(''); setSettings(null);
    try {
      const value = await adminRequest('/coordinator/journal-settings/read', { method: 'POST', body: '{}' });
      if (version === generation.current) { setSettings(value); setFrequency(value.frequency); }
    } catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) setBusy(false); }
  }
  function close() { if (!busy) { generation.current++; setOpen(false); trigger.current?.focus(); } }
  async function save() {
    const version = ++generation.current; setBusy(true); setError('');
    try {
      const value = await adminRequest('/coordinator/journal-settings', { method: 'POST', body: JSON.stringify({ frequency, expectedRevision: settings.revision }) });
      if (version === generation.current) { setSettings(value); setOpen(false); trigger.current?.focus(); }
    } catch (failure) { if (version === generation.current) setError(failure.message); }
    finally { if (version === generation.current) setBusy(false); }
  }
  return <>
    <button ref={trigger} type="button" className="journal-frequency-trigger" onClick={() => { setOpen(true); load(); }}>Journal settings{settings ? ` · ${settings.frequency === 'daily' ? 'Daily' : 'Weekly'}` : ''}</button>
    {open && <div className="journal-frequency-backdrop" onKeyDown={event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = [...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled)')];
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}><section role="dialog" aria-modal="true" aria-labelledby="journal-frequency-title" className="journal-frequency-dialog">
      <h2 id="journal-frequency-title">Journal settings</h2>
      <fieldset disabled={busy || !settings}><legend>Journal frequency</legend>
        {['daily', 'weekly'].map((value, index) => <label key={value}><input ref={index === 0 ? firstChoice : undefined} type="radio" name="journal-frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />{value === 'daily' ? 'Daily' : 'Weekly'}</label>)}
      </fieldset>
      {busy && <p role="status">{settings ? 'Saving…' : 'Loading…'}</p>}
      {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={load}>Refresh</button></p>}
      <footer><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy || !settings} onClick={save}>Save</button></footer>
    </section></div>}
  </>;
}
