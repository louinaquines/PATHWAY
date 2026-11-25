import { useEffect, useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { adminRequest } from '../adminApi';
import { showToast } from '../successFx';
import { formatPhone, validPhone, passwordRules } from './CoordinatorProfile';
import AlertDialog from './AlertDialog';
import Icon from './Icons';
import './CoordinatorProfile.css';

const initial = admin => ({ firstName: admin?.firstName || 'System', lastName: admin?.lastName || 'Administrator',
  department: admin?.department || 'System Administration', phone: formatPhone(admin?.phone || '') });

export default function AdminProfile({ admin, counts, onSaved, onGo, onSignedOut }) {
  const [form, setForm] = useState(() => initial(admin));
  const [saved, setSaved] = useState(() => initial(admin));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyAll, setBusyAll] = useState(false);
  useEffect(() => { const next = initial(admin); setForm(next); setSaved(next); }, [admin]);
  const dirty = ['firstName', 'lastName', 'department', 'phone'].some(k => form[k] !== saved[k]);
  const name = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'System Administrator';
  const initials = ((form.firstName[0] || '') + (form.lastName[0] || '')).toUpperCase() || 'A';
  const email = admin?.email || auth.currentUser?.email || '';
  const uid = auth.currentUser?.uid || '';
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); } catch { /* blocked */ } };

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
      const clean = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), department: form.department.trim(), phone: form.phone };
      await updateDoc(doc(db, 'users', auth.currentUser.uid), { ...clean, updatedAt: new Date().toISOString() });
      setSaved(clean); setForm(clean); showToast('Profile saved', 'Your details are up to date.'); onSaved?.();
    } catch (error) { setErrors({ form: error.message || 'Could not save your profile.' }); }
    finally { setSaving(false); }
  };
  const signOutAll = async () => {
    setBusyAll(true);
    try { await adminRequest('/admin/sign-out-everywhere', { method: 'POST' }); await signOut(auth); onSignedOut?.(); }
    catch (error) { setErrors({ session: error.message || 'Could not sign out other devices.' }); setBusyAll(false); setConfirmAll(false); }
  };

  return <div className="cpf">
    <aside className="cpf-side">
      <section className="cpf-card cpf-id">
        <span className="cpf-avatar" aria-hidden="true">{initials}</span>
        <h2>{name}</h2>
        <p className="cpf-role">System Administrator · {form.department || 'System Administration'}</p>
        <span className="cpf-active"><i aria-hidden="true" />Active</span>
        {email && <button type="button" className="cpf-email" onClick={() => copy(email, 'email')} title="Copy email">
          <Icon name="mail" size={15} /><span>{email}</span><small>{copied === 'email' ? 'Copied' : 'Copy'}</small></button>}
        {uid && <button type="button" className="cpf-uid" onClick={() => copy(uid, 'uid')}>{copied === 'uid' ? 'Account ID copied' : 'Copy account ID'}</button>}
      </section>
      <section className="cpf-card">
        <h3>At a glance</h3>
        <dl className="cpf-stats cpf-stats-4">
          {[['Students', counts.students], ['Coordinators', counts.coordinators], ['Companies', counts.companies], ['Sections', counts.sections]].map(([label, n]) =>
            <div key={label}><dt>{label}</dt><dd>{n ?? '—'}</dd></div>)}
        </dl>
      </section>
      <section className="cpf-card">
        <h3>Quick links</h3>
        <nav className="cpf-links">
          {[['audit', 'shield', 'Audit logs'], ['settings', 'settings', 'System settings'], ['create', 'userPlus', 'Create coordinator']].map(([tab, icon, label]) =>
            <button key={tab} type="button" onClick={() => onGo?.(tab)}><Icon name={icon} size={16} /><span>{label}</span><Icon name="chevronRight" size={15} /></button>)}
        </nav>
      </section>
    </aside>

    <div className="cpf-main">
      <form className="cpf-card" onSubmit={save} noValidate>
        <header className="cpf-head"><h3>Personal details</h3><p>Shown in audit logs and to coordinators.</p></header>
        <div className="cpf-grid">
          <label>First name<input value={form.firstName} maxLength={60} aria-invalid={!!errors.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />{errors.firstName && <em role="alert">{errors.firstName}</em>}</label>
          <label>Last name<input value={form.lastName} maxLength={60} aria-invalid={!!errors.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />{errors.lastName && <em role="alert">{errors.lastName}</em>}</label>
          <label>Mobile number <small>optional</small><input value={form.phone} inputMode="tel" placeholder="+63 912 345 6789" aria-invalid={!!errors.phone} onChange={e => setForm({ ...form, phone: formatPhone(e.target.value) })} />{errors.phone && <em role="alert">{errors.phone}</em>}</label>
          <label>Department or office<input value={form.department} maxLength={120} onChange={e => setForm({ ...form, department: e.target.value })} /></label>
        </div>
        <dl className="cpf-locked"><div><dt><Icon name="lock" size={13} />Email</dt><dd>{email || '—'}</dd></div><div><dt><Icon name="lock" size={13} />Role</dt><dd>System Administrator</dd></div></dl>
        {errors.form && <p role="alert" className="cpf-err">{errors.form}</p>}
        {dirty && <div className="cpf-savebar" role="region" aria-label="Unsaved changes"><span>You have unsaved changes</span>
          <button type="button" className="cpf-btn" disabled={saving} onClick={() => { setForm(saved); setErrors({}); }}>Discard</button>
          <button type="submit" className="cpf-btn cpf-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
      </form>

      <AdminPasswordCard />

      <section className="cpf-card">
        <header className="cpf-head"><h3>Session</h3><p>Sign out here, or end every open session for this account.</p></header>
        {errors.session && <p role="alert" className="cpf-err">{errors.session}</p>}
        <div className="cpf-session">
          <button type="button" className="cpf-btn" onClick={async () => { await signOut(auth); onSignedOut?.(); }}>Sign out of this device</button>
          <button type="button" className="cpf-btn cpf-danger" onClick={() => setConfirmAll(true)}>Sign out of all devices</button>
        </div>
      </section>
    </div>
    <AlertDialog open={confirmAll} title="Sign out of all devices?" busy={busyAll}
      description="Every browser signed in to this admin account, including this one, will be signed out." confirmLabel="Sign out everywhere"
      onCancel={() => setConfirmAll(false)} onConfirm={signOutAll} />
  </div>;
}

function AdminPasswordCard() {
  const empty = { current: '', next: '', confirm: '' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const rules = passwordRules(form.next);
  const ok = rules.every(([, pass]) => pass) && form.next === form.confirm && form.current && form.next !== form.current;
  const last = auth.currentUser?.metadata?.lastSignInTime;
  const submit = async event => {
    event.preventDefault(); setError('');
    if (form.next !== form.confirm) return setError('The new passwords do not match.');
    if (!ok) return setError('Check the password rules below.');
    const user = auth.currentUser; if (!user?.email) return;
    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, form.current));
      await updatePassword(user, form.next);
      adminRequest('/admin/password-changed', { method: 'POST' }).catch(() => {});
      setForm(empty); showToast('Password changed', 'Use your new password next time you sign in.');
    } catch (err) {
      setError(['auth/wrong-password', 'auth/invalid-credential'].includes(err.code) ? 'Your current password is incorrect.'
        : err.code === 'auth/too-many-requests' ? 'Too many attempts. Wait a moment and try again.' : 'Could not change your password. Try again.');
    } finally { setBusy(false); }
  };
  return <form className="cpf-card" onSubmit={submit} noValidate>
    <header className="cpf-head"><h3>Security</h3><p>{last ? `Last signed in ${new Date(last).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Change the password you use to sign in.'}</p></header>
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
