import { useEffect, useRef, useState } from 'react';
import { adminRequest } from '../adminApi';
import './AnnouncementEmailDelivery.css';
const labels = { pending: 'Not emailed', failed_before_send: 'Failed before sending — retry allowed', sending: 'Unconfirmed — review mailbox',
  delivery_unknown: 'Unconfirmed — review mailbox', provider_accepted: 'Accepted — delivery unconfirmed',
  blocked_known_bounce: 'Blocked — previous bounce', blocked_invalid_address: 'Blocked — invalid email' };
export default function AnnouncementEmailDelivery({ announcementId }) {
  const [data, setData] = useState(null), [selected, setSelected] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const path = `/coordinator/announcements/${encodeURIComponent(announcementId)}/email`;
  const generation = useRef(0), runLock = useRef(false);
  useEffect(() => {
    generation.current++; runLock.current = false;
    let active = true; setData(null); setSelected([]); setError(''); setBusy(false);
    adminRequest(path).then(result => { if (active) setData(result); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; generation.current++; };
  }, [path]);
  async function run(send) {
    if (runLock.current || (send && (!data?.connected || !selected.length))) return;
    const current = generation.current; runLock.current = true;
    setBusy(true); setError('');
    try {
      if (send) await adminRequest(path, { method: 'POST', body: JSON.stringify({ recipientIds: selected }) });
      const updated = await adminRequest(path);
      if (current === generation.current) { setData(updated); setSelected([]); }
    } catch (failure) { if (current === generation.current) setError(failure.message || 'Could not update email status. In-app notices are unchanged.'); }
    finally { if (current === generation.current) { setBusy(false); runLock.current = false; } }
  }
  return <section className="announcement-email-card" aria-label="Announcement email delivery">
    <header><div><h3>Optional email delivery</h3><p>In-app notices are already saved. Email acceptance does not confirm inbox delivery.</p></div>
      <button type="button" disabled={busy} onClick={() => run(false)}>Refresh email status</button></header>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading email recipients…</p>}
    {data && <><h4>{data.title}</h4>{!data.connected && <p>Connect an authorized announcement sender to enable email.</p>}
      <div className="announcement-email-table"><table><thead><tr><th>Select</th><th>Student</th><th>Email</th><th>Status</th></tr></thead>
        <tbody>{Object.entries(data.recipients || {}).map(([id, recipient]) => <tr key={id}>
          <td><input type="checkbox" aria-label={`Email ${recipient.name}`} checked={selected.includes(id)}
            disabled={busy || !data.connected || !['pending', 'failed_before_send'].includes(recipient.status) || (selected.length >= 20 && !selected.includes(id))}
            onChange={event => setSelected(current => event.target.checked ? [...current, id] : current.filter(value => value !== id))} /></td>
          <td>{recipient.name}</td><td>{recipient.email || 'No email'}</td><td>{labels[recipient.status] || 'Status unavailable'}</td>
        </tr>)}</tbody></table></div>
      <footer><small>Select up to 20 recipients. Unconfirmed sends cannot be retried here.</small>
        <button type="button" disabled={busy || !data.connected || !selected.length} onClick={() => run(true)}>{busy ? 'Updating…' : `Email selected (${selected.length})`}</button></footer></>}
  </section>;
}
