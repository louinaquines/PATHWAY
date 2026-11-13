import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import './CompanyEmailInbox.css';

const when = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

// Emails companies sent to the shared PATHWAY mailbox, routed to this coordinator.
export default function CompanyEmailInbox() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [checking, setChecking] = useState(false);
  const load = useCallback(async () => {
    try { setData(await adminRequest('/coordinator/company-emails')); setError(''); }
    catch (failure) { setError(failure.message || 'Could not load company emails.'); }
  }, []);
  useEffect(() => { load(); const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [load]);
  const check = async () => {
    setChecking(true);
    try { await adminRequest('/coordinator/company-emails/check', { method: 'POST' }); await load(); }
    catch (failure) { setError(failure.message || 'Could not check the mailbox.'); }
    finally { setChecking(false); }
  };
  const toggle = email => {
    setOpen(current => current === email.id ? '' : email.id);
    if (!email.read) {
      setData(current => ({ ...current, emails: current.emails.map(item => item.id === email.id ? { ...item, read: true } : item) }));
      adminRequest(`/coordinator/company-emails/${encodeURIComponent(email.id)}/read`, { method: 'POST' }).catch(() => {});
    }
  };

  if (error && !data) return <p role="alert" className="cei-note">{error}</p>;
  if (!data) return <p role="status" className="cei-note">Loading company emails…</p>;
  if (!data.connected) return <div className="cei-empty"><strong>Not set up yet</strong>
    <p>Once the PATHWAY mailbox is connected, emails from partner companies appear here with a short AI summary, and you get a notification.</p></div>;
  const unread = data.emails.filter(email => !email.read).length;
  return <section className="cei" aria-label="Company emails">
    <header className="cei-head">
      <div><strong>{unread ? `${unread} unread` : 'All caught up'}</strong>
        <span>Companies email {data.mailbox}. Emails from a company where your students are placed show up here.</span></div>
      <button type="button" className="portal-secondary" onClick={check} disabled={checking}>{checking ? 'Checking…' : 'Check now'}</button>
    </header>
    {error && <p role="alert" className="cei-note">{error}</p>}
    {data.lastCheck?.ok === false && <p className="cei-note cei-warn">The mailbox could not be read on the last check. It will try again shortly.</p>}
    {data.emails.length === 0 && <div className="cei-empty"><strong>No company emails yet</strong><p>When a supervisor emails the PATHWAY address, it appears here.</p></div>}
    <ul className="cei-list">
      {data.emails.map(email => <li key={email.id} data-unread={!email.read} data-open={open === email.id}>
        <button type="button" className="cei-row" aria-expanded={open === email.id} onClick={() => toggle(email)}>
          <span className="cei-from"><strong>{email.companyName || email.from}</strong>{!email.read && <i aria-label="Unread" />}</span>
          <span className="cei-subject">{email.subject || 'No subject'}</span>
          {email.summary && <span className="cei-summary"><b>AI summary</b>{email.summary}</span>}
          <time>{when(email.receivedAt)}</time>
        </button>
        {open === email.id && <div className="cei-body">
          {email.action && <p className="cei-action"><b>Suggested next step:</b> {email.action}</p>}
          <dl><dt>From</dt><dd>{email.from} &lt;{email.fromEmail}&gt;</dd>
            {email.studentNames.length > 0 && <><dt>Students there</dt><dd>{email.studentNames.join('; ')}</dd></>}
            {email.attachments.length > 0 && <><dt>Attachments</dt><dd>{email.attachments.join(', ')} (open them in the mailbox)</dd></>}</dl>
          <pre>{email.text}</pre>
          <a className="portal-secondary" href={`mailto:${email.fromEmail}?subject=${encodeURIComponent('Re: ' + (email.subject || ''))}`}>Reply by email</a>
        </div>}
      </li>)}
    </ul>
  </section>;
}
