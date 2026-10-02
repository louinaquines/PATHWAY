// src/pages/LoginPage.js
import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import PathwayLogo from '../components/PathwayLogo';
import { COLORS, THEME } from '../theme';
import { setPageMetadata } from '../pageMetadata';
import { InlineSkeleton } from '../components/LoadingSkeleton';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate                = useNavigate();

  useEffect(() => {
    setPageMetadata('login');
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      const role = snap.data()?.role;
      if (role === 'coordinator') navigate('/coordinator');
      else if (role === 'admin')  navigate('/admin');
      else {
        setError('Access denied. This portal is for staff and coordinators only.');
        await auth.signOut();
      }
    } catch (e) {
      switch (e.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          setError('Email or password is incorrect.');
          break;
        case 'auth/invalid-email':
          setError("That email doesn't look right.");
          break;
        default:
          setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.glowSky} />
      <div style={styles.glowYellow} />

      <div style={styles.card}>
        <div style={styles.brandHeader}>
          <div style={styles.logoWrap}>
            <PathwayLogo style={styles.logoImg} />
          </div>
          <h1 style={styles.title}>PATHWAY</h1>
          <div style={styles.badgeRow}>
            <span style={styles.badgeDot} />
            <span style={styles.sub}>Staff & Coordinator Portal</span>
          </div>
        </div>

        {error && (
          <div style={styles.error}>
            <span style={{ fontWeight: 800, marginRight: 6, color: '#000000' }}>Error:</span>
            <span style={{ color: '#000000' }}>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email Address</label>
            <input
              style={styles.input}
              type="email"
              placeholder="name@uclm.edu.ph"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            style={{
              ...styles.btn,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
            disabled={loading}
          >
            {loading ? (
              <span style={styles.loadingRow}>
                <InlineSkeleton label="Signing in" />
                Signing in...
              </span>
            ) : (
              'Sign In to Dashboard'
            )}
          </button>
        </form>

        <div style={styles.footer}>
          <span>UC Lapu-Lapu & Mandaue · On-the-Job Training System</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    backgroundColor: COLORS.white,
    backgroundImage: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.xl,
    padding: '40px 36px',
    width: '100%',
    maxWidth: 420,
    boxShadow: THEME.shadows.lg,
    border: `1px solid ${COLORS.slate200}`,
    position: 'relative',
    zIndex: 1,
  },
  brandHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: 28,
  },
  logoWrap: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: COLORS.sky50,
    border: `2px solid ${COLORS.sky200}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    boxShadow: '0 8px 16px -4px rgba(2, 132, 199, 0.2)',
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.12em',
    margin: '0 0 6px',
  },
  badgeRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    backgroundColor: COLORS.sky50,
    padding: '4px 12px',
    borderRadius: THEME.radius.full,
    border: `1px solid ${COLORS.sky200}`,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: COLORS.yellow500,
  },
  sub: {
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
  },
  error: {
    backgroundColor: COLORS.rose50,
    borderLeft: `4px solid ${COLORS.rose600}`,
    borderRadius: THEME.radius.sm,
    padding: '12px 14px',
    marginBottom: 20,
    color: '#000000',
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: '#000000',
    marginBottom: 7,
  },
  input: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '12px 16px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
  },
  btn: {
    width: '100%',
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '14px',
    fontSize: 15,
    fontWeight: 800,
    marginTop: 6,
    boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
  },
  loadingRow: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(255, 255, 255, 0.4)',
    borderTopColor: COLORS.white,
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.8s linear infinite',
  },
  footer: {
    marginTop: 28,
    paddingTop: 18,
    borderTop: `1px solid ${COLORS.slate200}`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 600,
    color: '#000000',
  },
};
