import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '../adminApi';
import Pager from './Pager';
import './CompanyEmailInbox.css';

const when = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
const day = value => value ? new Date(value).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }) : '';
const time = value => value ? new Date(value).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }) : '';
const initials = n => String(n || '?').split(/[\s,.-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const PER = 8;

// Emails companies sent to the shared PATHWAY mailbox, routed to this coordinator.
export default function CompanyEmailInbox({ onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
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
  const emails = data?.emails || [];
  const unread = emails.filter(email => !email.read).length;
  const needsReply = email => !!email.action;
  const shown = emails.filter(e => filter === 'all' || (filter === 'unread' ? !e.read : needsReply(e)));
  const pages = Math.max(1, Math.ceil(shown.length / PER)); const cur = Math.min(page, pages);
  const rows = shown.slice((cur - 1) * PER, cur * PER);
  const last = data?.lastCheck?.checkedAt || data?.lastCheck?.at || data?.lastCheck?.finishedAt;

  return <section className="cei" aria-label="Company emails">
    <header className="cei-head">
      <div className="cei-title">
        <h2>Company email {unread > 0 && <b className="cei-chip">{unread} unread</b>}</h2>
        {data?.mailbox && <p>{data.mailbox} <span className="cei-info" tabIndex={0} title="Companies email this address. Emails from a company where your students are placed show up here with a short AI summary.">ⓘ</span></p>}
      </div>
      {data?.connected && <button type="button" className="cei-btn" onClick={check} disabled={checking}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={checking ? 'cei-spin' : ''}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
        {checking ? 'Checking…' : 'Check now'}</button>}
      {onClose && <button type="button" className="cei-x" aria-label="Close company email" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>}
    </header>
    <div className="cei-content">
      {error && <p role="alert" className="cei-bar cei-bar-red">{error}</p>}
      {!data && !error && <p role="status" className="cei-note">Loading company emails…</p>}
      {data && !data.connected && <div className="cei-empty"><strong>Not set up yet</strong>
        <p>Once the PATHWAY mailbox is connected, emails from partner companies appear here with a short AI summary, and you get a notification.</p></div>}
      {data?.connected && <>
        {data.lastCheck?.ok === false
          ? <p className="cei-bar">⚠ Couldn’t reach the mailbox. Retrying soon{last ? ` · Last checked ${time(last)}` : ''}</p>
          : last && <p className="cei-note">Last checked {time(last)}</p>}
        <div className="cei-pills" role="group" aria-label="Filter emails">
          {[['all', 'All', emails.length], ['unread', 'Unread', unread], ['reply', 'Needs reply', emails.filter(needsReply).length]].map(([v, l, n]) =>
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setPage(1); }}>{l} {n}</button>)}
        </div>
        {emails.length === 0 && <div className="cei-empty"><strong>No company emails yet</strong><p>Emails from your students’ companies show up here.</p></div>}
        {emails.length > 0 && !shown.length && <div className="cei-empty"><p>Nothing in this view.</p></div>}
        {rows.length > 0 && <ul className="cei-list">
          {rows.map(email => { const name = email.companyName || email.from;
            return <li key={email.id} data-unread={!email.read || undefined} data-open={open === email.id || undefined}>
              <button type="button" className="cei-row" aria-expanded={open === email.id} onClick={() => toggle(email)}>
                <i className="cei-av" aria-hidden="true">{initials(name)}</i>
                <span className="cei-main">
                  <span className="cei-top"><strong>{name}</strong>{!email.read && <i className="cei-dot" aria-label="Unread" />}<time>{day(email.receivedAt)}</time></span>
                  <span className="cei-subject">{email.subject || 'No subject'}</span>
                  {email.summary && <span className="cei-summary"><b aria-label="AI summary">✦</b> {email.summary}</span>}
                  {email.studentNames?.length > 0 && <span className="cei-students">{email.studentNames.map(n => <em key={n}>{n}</em>)}</span>}
                </span>
              </button>
              {open === email.id && <div className="cei-body">
                {email.action && <p className="cei-action"><b>Suggested next step</b>{email.action}</p>}
                <dl><div><dt>From</dt><dd>{email.from} &lt;{email.fromEmail}&gt;</dd></div>
                  <div><dt>Received</dt><dd>{when(email.receivedAt)}</dd></div>
                  {email.attachments?.length > 0 && <div><dt>Attachments</dt><dd>{email.attachments.join(', ')} (open them in the mailbox)</dd></div>}</dl>
                <pre>{email.text}</pre>
                <div className="cei-actions"><a className="cei-btn cei-primary" href={`mailto:${email.fromEmail}?subject=${encodeURIComponent('Re: ' + (email.subject || ''))}`}>Reply by email</a></div>
              </div>}
            </li>; })}
        </ul>}
        {shown.length > PER && <div className="cei-pager"><span>{(cur - 1) * PER + 1}–{Math.min(cur * PER, shown.length)} of {shown.length}</span><Pager page={cur} pages={pages} onGo={setPage} label="Company emails" /></div>}
      </>}
    </div>
  </section>;
}
