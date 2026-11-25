import { useEffect, useMemo, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';
import { showToast } from '../successFx';
import Icon from './Icons';
import './CoordinatorProfile.css';

const digits = value => String(value || '').replace(/\D/g, '');
// Philippine mobile: +63 9XX XXX XXXX. Accepts 09…, 9…, 639… input.
export function formatPhone(value) {
  let d = digits(value);
  if (d.startsWith('63')) d = d.slice(2); else if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 10);
  if (!d) return '';
  return ['+63', d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');
}
export const validPhone = value => !value || /^\+63 9\d{2} \d{3} \d{4}$/.test(value);
export const passwordRules = value => [
  ['At least 8 characters', value.length >= 8],
  ['One uppercase letter', /[A-Z]/.test(value)],
  ['One special character', /[^A-Za-z0-9]/.test(value)],
];

function initialForm(coordinator) {
  const parts = (auth.currentUser?.displayName || '').trim().split(/\s+/).filter(Boolean);
  return { firstName: coordinator?.firstName || parts[0] || '', lastName: coordinator?.lastName || parts.slice(1).join(' ') || '', phone: formatPhone(coordinator?.phone || '') };
}

export default function CoordinatorProfile({ coordinator, sections = [], activeTerm = '', onSaved, onOpenSection, onGo }) {
  const [form, setForm] = useState(() => initialForm(coordinator));
  const [saved, setSaved] = useState(() => initialForm(coordinator));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { const next = initialForm(coordinator); setForm(next); setSaved(next); }, [coordinator]);

  const dirty = form.firstName !== saved.firstName || form.lastName !== saved.lastName || form.phone !== saved.phone;
  const name = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'OJT Coordinator';
  const initials = ((form.firstName[0] || '') + (form.lastName[0] || '')).toUpperCase() || 'C';
  const email = coordinator?.email || auth.currentUser?.email || '';
  const department = coordinator?.department || 'Not assigned';
  const totalStudents = useMemo(() => sections.reduce((sum, s) => sum + (Array.isArray(s.studentIds) ? s.studentIds.length : 0), 0), [sections]);
  const lastSignIn = auth.currentUser?.metadata?.lastSignInTime;

  const save = async event => {
    event.preventDefault();
    const next = {};
    if (!form.firstName.trim()) next.firstName = 'Enter your first name.';
    if (!form.lastName.trim()) next.lastName = 'Enter your last name.';
    if (!validPhone(form.phone)) next.phone = 'Use a mobile number like +63 912 345 6789.';
    setErrors(next);
    if (Object.keys(next).length || !auth.currentUser) return;
    setSaving(true);
    try {
      const clean = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), phone: form.phone };
      await updateDoc(doc(db, 'users', auth.currentUser.uid), clean);
      setSaved({ ...clean }); setForm({ ...clean });
      showToast('Profile saved', 'Your details are up to date.');
      onSaved?.();
    } catch (error) {
      setErrors({ form: error.message || 'Could not save your profile.' });
    } finally { setSaving(false); }
  };

  const copy = async () => { try { await navigator.clipboard.writeText(email); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ } };

  return <div className="cpf">
    <aside className="cpf-side">
      <section className="cpf-card cpf-id">
        <span className="cpf-avatar" aria-hidden="true">{initials}</span>
        <h2>{name}</h2>
        <p className="cpf-role">OJT Coordinator · {department}</p>
        <span className="cpf-active"><i aria-hidden="true" />Active</span>
        {email && <button type="button" className="cpf-email" onClick={copy} title="Copy email">
          <Icon name="mail" size={15} /><span>{email}</span><small>{copied ? 'Copied' : 'Copy'}</small>
        </button>}
      </section>
      <section className="cpf-card">
        <h3>At a glance</h3>
        <dl className="cpf-stats">
          <div><dt>Sections</dt><dd>{sections.length}</dd></div>
          <div><dt>Students</dt><dd>{totalStudents}</dd></div>
          <div><dt>Active term</dt><dd className="cpf-term">{activeTerm || '—'}</dd></div>
        </dl>
      </section>
      <section className="cpf-card">
        <h3>Quick links</h3>
        <nav className="cpf-links">
          {[['sections', 'layers', 'Sections & requirements'], ['registrations', 'users', 'Class list & accounts'], ['companies', 'building', 'Companies']].map(([tab, icon, label]) =>
            <button key={tab} type="button" onClick={() => onGo?.(tab)}><Icon name={icon} size={16} /><span>{label}</span><Icon name="chevronRight" size={15} /></button>)}
        </nav>
      </section>
    </aside>

    <div className="cpf-main">
      <form className="cpf-card" onSubmit={save} noValidate>
        <header className="cpf-head"><h3>Personal details</h3><p>Shown to your students and the administrator.</p></header>
        <div className="cpf-grid">
          <label>First name<input value={form.firstName} maxLength={60} aria-invalid={!!errors.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            {errors.firstName && <em role="alert">{errors.firstName}</em>}</label>
          <label>Last name<input value={form.lastName} maxLength={60} aria-invalid={!!errors.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            {errors.lastName && <em role="alert">{errors.lastName}</em>}</label>
          <label>Mobile number <small>optional</small><input value={form.phone} inputMode="tel" placeholder="+63 912 345 6789" aria-invalid={!!errors.phone}
            onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} />{errors.phone && <em role="alert">{errors.phone}</em>}</label>
        </div>
        <dl className="cpf-locked">
          <div><dt><Icon name="lock" size={13} />Email</dt><dd>{email || '—'}</dd></div>
          <div><dt><Icon name="lock" size={13} />Department</dt><dd>{department}</dd></div>
        </dl>
        <p className="cpf-note">Only the administrator can change your email or department.</p>
        {errors.form && <p role="alert" className="cpf-err">{errors.form}</p>}
        {dirty && <div className="cpf-savebar" role="region" aria-label="Unsaved changes">
          <span>You have unsaved changes</span>
          <button type="button" className="cpf-btn" disabled={saving} onClick={() => { setForm(saved); setErrors({}); }}>Discard</button>
          <button type="submit" className="cpf-btn cpf-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>}
      </form>

      <section className="cpf-card">
        <header className="cpf-head"><h3>Your sections</h3><p>{sections.length ? 'Open a section to go to its dashboard.' : 'No sections assigned yet.'}</p></header>
        {sections.length > 0 && <ul className="cpf-sections">
          {sections.map(section => <li key={section.id}>
            <span className="cpf-sec-icon" aria-hidden="true"><Icon name="layers" size={16} /></span>
            <div><strong>{section.name}</strong><small>{[section.termName, `${Array.isArray(section.studentIds) ? section.studentIds.length : 0} students`].filter(Boolean).join(' · ')}</small></div>
            <button type="button" className="cpf-btn" onClick={() => onOpenSection?.(section)}>Open</button>
          </li>)}
        </ul>}
      </section>

      <PasswordCard lastSignIn={lastSignIn} required={!!coordinator?.mustChangePassword} onChanged={onSaved} />
    </div>
  </div>;
}

function PasswordCard({ lastSignIn, required, onChanged }) {
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const rules = passwordRules(form.next);
  const ok = rules.every(([, pass]) => pass) && form.next === form.confirm && form.current && form.next !== form.current;

  const submit = async event => {
    event.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    if (!ok) return setError('Check the password rules below.');
    const user = auth.currentUser;
    if (!user?.email) return;
    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.current));
      await updatePassword(user, form.next);
      await adminRequest('/coordinator/password-changed', { method: 'POST' }).catch(() => {});
      onChanged?.();
      setForm(empty);
      showToast('Password changed', 'Use your new password next time you sign in.');
    } catch (err) {
      setError(['auth/wrong-password', 'auth/invalid-credential'].includes(err.code) ? 'Your current password is incorrect.'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Wait a moment and try again.' : 'Could not change your password. Try again.');
    } finally { setBusy(false); }
  };

  return <form className="cpf-card" id="cpf-security" onSubmit={submit} noValidate>
    {required && <p className="cpf-required" role="alert">Change the initial password your administrator gave you before using the portal.</p>}
    <header className="cpf-head"><h3>Security</h3><p>{lastSignIn ? `Last signed in ${new Date(lastSignIn).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Change the password you use to sign in.'}</p></header>
    <div className="cpf-grid">
      <label>Current password<input type="password" autoComplete="current-password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} /></label>
      <span aria-hidden="true" />
      <label>New password<input type="password" autoComplete="new-password" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></label>
    </div>
    {form.next && <ul className="cpf-rules">{rules.map(([label, pass]) => <li key={label} data-ok={pass}><Icon name={pass ? 'check' : 'x'} size={13} />{label}</li>)}</ul>}
    {error && <p role="alert" className="cpf-err">{error}</p>}
    <div className="cpf-actions"><button type="submit" className="cpf-btn cpf-primary" disabled={busy || !ok}>{busy ? 'Changing…' : 'Change password'}</button></div>
  </form>;
}
