import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import PathwayLogo from '../components/PathwayLogo';
import Icon from '../components/Icons';
import { setPageMetadata } from '../pageMetadata';
import campusPhoto from '../assets/uc-campus.jpg';
import './LoginPage.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setPageMetadata('login'); }, []);

  const handleLogin = async event => {
    event.preventDefault();
    if (loading) return;
    setError(''); setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      const role = snap.data()?.role;
      if (role === 'coordinator') navigate('/coordinator');
      else if (role === 'admin') navigate('/admin');
      else {
        setError('Access denied. This portal is for staff and coordinators only.');
        await auth.signOut();
      }
    } catch (error) {
      switch (error.code) {
        case 'auth/invalid-credential': case 'auth/user-not-found': case 'auth/wrong-password':
          setError('Email or password is incorrect.'); break;
        case 'auth/invalid-email': setError('Enter a valid email address.'); break;
        case 'auth/network-request-failed': setError('Unable to connect. Check your connection and try again.'); break;
        case 'auth/too-many-requests': setError('Too many attempts. Please wait before trying again.'); break;
        default: setError('Something went wrong. Please try again.');
      }
    } finally { setLoading(false); }
  };

  return <main className="staff-login-page">
    <div className="staff-login-visual" aria-hidden="true">
      <img className="staff-login-photo" src={campusPhoto} alt="" />
      <svg className="staff-login-hex" preserveAspectRatio="xMidYMid slice"><defs><pattern id="staff-hex" width="174" height="100" patternUnits="userSpaceOnUse"><path d="M29 0h58l29 50-29 50H29L0 50zM116 50h58" fill="none" stroke="#f3d27a" strokeWidth="3" /></pattern></defs><rect width="100%" height="100%" fill="url(#staff-hex)" /></svg>
      <span className="staff-login-ray" />
    </div>
    <svg className="staff-login-shape" viewBox="0 0 1920 1080" preserveAspectRatio="none" aria-hidden="true">
      <path className="blue" d="M0 0H760C790 90 785 170 770 225 700 205 610 125 500 95 330 50 170 80 0 0Z" />
      <path className="blue" d="M940 500C1080 540 1150 700 1135 860 1122 975 1075 1045 1050 1080H0V880C120 900 260 960 380 1080H700C820 1000 900 760 940 500Z" />
      <path className="white" d="M0 0C130 15 240 105 390 95 540 85 610 150 700 200 770 238 880 190 960 265 1030 330 995 440 965 525 935 615 925 705 935 805 945 910 870 1015 740 1070L700 1080H0Z" />
    </svg>
    <p className="staff-login-tag">STAFF PORTAL</p>
    <section className="staff-login-panel" aria-labelledby="staff-login-title">
        <div className="staff-login-logo"><PathwayLogo size={78} /></div>
        <div className="staff-login-intro"><h1 id="staff-login-title">Sign in</h1><p>Use your coordinator or administrator account.</p></div>
        {error && <div className="staff-login-error" id="staff-login-error" role="alert"><Icon name="alert" size={18} /><span>{error}</span></div>}
        <form onSubmit={handleLogin} aria-busy={loading}>
          <label htmlFor="staff-email">Email address</label>
          <div className="staff-login-input"><Icon name="mail" size={19} /><input id="staff-email" type="email" autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} placeholder="Enter your email address" value={email} onChange={event => setEmail(event.target.value)} disabled={loading} required aria-describedby={error ? 'staff-login-error' : undefined} /></div>
          <label htmlFor="staff-password">Password</label>
          <div className="staff-login-input"><Icon name="shield" size={19} /><input id="staff-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} disabled={loading} required aria-describedby={error ? 'staff-login-error' : undefined} /><button className="staff-login-visibility" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={loading} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
          <button className="staff-login-submit" type="submit" disabled={loading}>{loading ? <><span className="staff-login-spinner" aria-hidden="true" /> Signing in…</> : <>Sign In <Icon name="chevronRight" size={19} /></>}</button>
        </form>
        <p className="staff-login-help">Need access? Contact your PATHWAY administrator.</p>
        <div className="staff-login-security"><Icon name="shield" size={15} /><span>Authorized coordinator and administrator access only.</span></div>
      </section>
    <footer className="staff-login-footer">PATHWAY OJT Management System</footer>
  </main>;
}
