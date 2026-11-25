import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '../firebase';
import { showToast } from '../successFx';
import { passwordRules } from './CoordinatorProfile';
import Icon from './Icons';
import './AdminStudentsDirectory.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
const validEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
function generatePassword() {
  const pick = (set, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), x => set[x % set.length]).join('');
  const chars = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2) + pick('abcdefghijkmnpqrstuvwxyz', 6) + pick('23456789', 2) + pick('!@#$%&*?', 2);
  return chars.split('').sort(() => crypto.getRandomValues(new Uint32Array(1))[0] - 2 ** 31).join('');
}

export default function CreateCoordinatorPanel({ departments, sections, coordinators, onCancel, onCreated, onOpen }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', department: '' });
  const [picked, setPicked] = useState([]);
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { const k = e => { if (e.key === 'Escape' && !busy) onCancel(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [onCancel, busy]);
  const active = id => coordinators.some(c => c.id === id && c.role === 'coordinator' && c.accountApproved !== false);
  const free = useMemo(() => sections.filter(s => s.department === form.department && !active(s.coordinatorId)), [sections, form.department]); // eslint-disable-line react-hooks/exhaustive-deps
  const rules = passwordRules(form.password);
  const valid = form.firstName.trim() && form.lastName.trim() && validEmail(form.email) && rules.every(([, ok]) => ok) && form.department;
  const set = key => e => { setForm({ ...form, [key]: e.target.value }); setErrors({ ...errors, [key]: '', form: '' }); if (key === 'department') setPicked([]); };
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* blocked */ } };

  const submit = async event => {
    event.preventDefault();
    setTouched({ email: true });
    if (!valid || busy) return;
    setBusy(true); setErrors({});
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/create-coordinator`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, sectionIds: picked }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErrors({ [data.field && data.field !== 'form' ? data.field : 'form']: data.error || 'The coordinator could not be created.' }); return; }
      showToast('Coordinator created', `${form.firstName} ${form.lastName}`);
      setDone({ uid: data.uid, email: form.email.trim().toLowerCase(), password: form.password, name: `${form.firstName.trim()} ${form.lastName.trim()}`, sections: data.sections || 0 });
      onCreated?.();
    } catch { setErrors({ form: 'Could not reach the server. Check your connection and try again.' }); }
    finally { setBusy(false); }
  };

  return createPortal(<div className="asd-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
    <aside className="asd-drawer ccp" role="dialog" aria-modal="true" aria-labelledby="ccp-title">
      <header><span className="asd-big" aria-hidden="true"><Icon name="userPlus" size={22} /></span>
        <div><h2 id="ccp-title">{done ? 'Coordinator created' : 'Create coordinator'}</h2>
          <p>{done ? 'Send these sign-in details privately.' : "They'll sign in to the coordinator portal with this email."}</p></div>
        <button type="button" className="asd-x" aria-label="Close" onClick={onCancel} disabled={busy}><Icon name="x" size={16} /></button></header>

      {done ? <>
        <dl className="asd-dl">
          <div><dt>Name</dt><dd>{done.name}</dd></div>
          <div><dt>Email</dt><dd>{done.email}</dd></div>
          <div><dt>Initial password</dt><dd className="ccp-mono">{done.password}</dd></div>
          <div><dt>Sections assigned</dt><dd>{done.sections}</dd></div>
        </dl>
        <p className="asd-note">They'll be asked to change the password the first time they sign in. This password won't be shown again.</p>
        <footer className="asd-foot-actions">
          <button type="button" className="asd-btn" onClick={() => copy(`PATHWAY coordinator portal\nEmail: ${done.email}\nInitial password: ${done.password}`, 'all')}>
            <Icon name={copied === 'all' ? 'check' : 'clipboard'} size={15} />{copied === 'all' ? 'Copied' : 'Copy sign-in details'}</button>
          <button type="button" className="asd-btn asd-primary" onClick={() => onOpen(done.uid)}>Open coordinator</button>
        </footer>
      </> : <form className="ccp-form" onSubmit={submit} noValidate>
        <h3>Name</h3>
        <div className="ccp-row">
          <label>First name<input required value={form.firstName} onChange={set('firstName')} autoComplete="off" maxLength={60} autoFocus /></label>
          <label>Last name<input required value={form.lastName} onChange={set('lastName')} autoComplete="off" maxLength={60} /></label>
        </div>
        <h3>Sign-in</h3>
        <label>Email<input required type="email" value={form.email} onChange={set('email')} onBlur={() => setTouched({ ...touched, email: true })} placeholder="name@uclm.edu.ph"
          aria-invalid={!!(errors.email || (touched.email && form.email && !validEmail(form.email)))} autoComplete="off" />
          {(errors.email || (touched.email && form.email && !validEmail(form.email))) && <em role="alert">{errors.email || 'Enter a valid email address.'}</em>}</label>
        <label>Initial password
          <div className="ccp-pass">
            <input required type={show ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete="new-password" aria-invalid={!!errors.password} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}><Icon name="eye" size={16} /></button>
            <button type="button" onClick={() => copy(form.password, 'pw')} disabled={!form.password} aria-label="Copy password"><Icon name={copied === 'pw' ? 'check' : 'clipboard'} size={16} /></button>
            <button type="button" className="ccp-gen" onClick={() => { setForm({ ...form, password: generatePassword() }); setShow(true); setErrors({ ...errors, password: '' }); }}>Generate</button>
          </div>
          {errors.password && <em role="alert">{errors.password}</em>}</label>
        {form.password && <ul className="cpf-rules ccp-rules">{rules.map(([label, ok]) => <li key={label} data-ok={ok}><Icon name={ok ? 'check' : 'x'} size={13} />{label}</li>)}</ul>}
        <p className="asd-note">They'll be asked to change it on first sign-in.</p>
        <h3>Assignment</h3>
        <label className="asd-select ccp-select">Department<select required value={form.department} onChange={set('department')}>
          <option value="">Choose a department</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select></label>
        {form.department && <div className="ccp-sections">
          <span>Sections without a coordinator <small>optional</small></span>
          {free.length ? free.map(s => <label key={s.id} className="ccp-check"><input type="checkbox" checked={picked.includes(s.id)}
            onChange={e => setPicked(e.target.checked ? [...picked, s.id] : picked.filter(x => x !== s.id))} />{s.name}{s.termName ? <small> · {s.termName}</small> : null}</label>)
            : <small className="asd-muted">Every section in this department already has a coordinator.</small>}
          {errors.sections && <em role="alert">{errors.sections}</em>}
        </div>}
        {errors.form && <p role="alert" className="asd-err">{errors.form}</p>}
        <footer className="asd-foot-actions">
          <button type="button" className="asd-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="asd-btn asd-primary" disabled={!valid || busy}>{busy ? 'Creating…' : 'Create coordinator'}</button>
        </footer>
      </form>}
    </aside>
  </div>, document.body);
}
