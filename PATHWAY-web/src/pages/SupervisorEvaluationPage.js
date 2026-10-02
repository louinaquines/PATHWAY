// src/pages/SupervisorEvaluationPage.js
import { useEffect, useState } from 'react';
import PathwayLogo from '../components/PathwayLogo';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { setPageMetadata } from '../pageMetadata';
import { PageSkeleton } from '../components/LoadingSkeleton';

const API = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';
const criteria = ['technicalSkills', 'workQuality', 'professionalism', 'communication', 'attendance'];

export default function SupervisorEvaluationPage() {
  const token = new URLSearchParams(window.location.search).get('token');
  const [info, setInfo] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comments, setComments] = useState('');
  const [message, setMessage] = useState('Loading evaluation...');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPageMetadata('evaluate');
  }, []);

  useEffect(() => {
    if (!token) {
      setMessage('Missing evaluation link or invalid token.');
      return;
    }
    fetch(`${API}/evaluation/${token}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Invalid or expired link');
        setInfo(d);
        setMessage('');
      })
      .catch((e) => setMessage(e.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      const r = await fetch(`${API}/evaluation/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings, comments }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Submission failed');
      setDone(true);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <div style={s.successIconWrap}><Icon name="check" size={28} label="Submitted" /></div>
          <h1 style={s.successTitle}>Evaluation Submitted</h1>
          <p style={s.successText}>
            Thank you for completing the student evaluation. Your feedback has been securely recorded by the PATHWAY OJT Coordination Office.
          </p>
          <div style={s.tokenNote}>This single-use evaluation link is now complete and deactivated.</div>
        </div>
      </main>
    );
  }

  if (message === 'Loading evaluation...' && !info) {
    return <PageSkeleton label="Loading evaluation" variant="form" />;
  }

  return (
    <main style={s.page}>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.logoWrap}>
            <PathwayLogo style={s.logoImg} />
          </div>
          <div>
            <h1 style={s.title}>PATHWAY Supervisor Evaluation</h1>
            <p style={s.sub}>OJT Industry Partner Performance Review</p>
          </div>
        </div>

        {message && (
          <div style={message.includes('Loading') ? s.infoBox : s.errorBox}>
            {message}
          </div>
        )}

        {info && (
          <>
            <div style={s.infoGrid}>
              <div style={s.infoItem}>
                <span style={s.infoLabel}>Student Intern</span>
                <span style={s.infoValue}>{info.studentName}</span>
              </div>
              <div style={s.infoItem}>
                <span style={s.infoLabel}>Company / Organization</span>
                <span style={s.infoValue}>{info.companyName}</span>
              </div>
              <div style={s.infoItem}>
                <span style={s.infoLabel}>Supervisor Name</span>
                <span style={s.infoValue}>{info.supervisorName}</span>
              </div>
            </div>

            <form onSubmit={submit} style={s.form}>
              <h2 style={s.sectionHeading}>Evaluation Criteria (1 = Poor, 5 = Excellent)</h2>
              
              <div style={s.criteriaList}>
                {criteria.map((key) => {
                  const label = key.replace(/([A-Z])/g, ' $1');
                  return (
                    <div key={key} style={s.criteriaCard}>
                      <div style={s.criteriaTitle}>{label}</div>
                      <select
                        required
                        style={s.select}
                        value={ratings[key] || ''}
                        onChange={(e) => setRatings({ ...ratings, [key]: Number(e.target.value) })}
                      >
                        <option value="">Select rating (1 - 5)</option>
                        <option value="5">5 — Excellent (Far exceeds expectations)</option>
                        <option value="4">4 — Very Satisfactory (Exceeds expectations)</option>
                        <option value="3">3 — Satisfactory (Meets all standards)</option>
                        <option value="2">2 — Fair (Needs improvement)</option>
                        <option value="1">1 — Poor (Unsatisfactory)</option>
                      </select>
                    </div>
                  );
                })}
              </div>

              <div style={s.commentGroup}>
                <label style={s.commentLabel}>
                  Supervisor Comments & Overall Assessment
                </label>
                <textarea
                  required
                  rows={4}
                  style={s.textarea}
                  placeholder="Provide qualitative feedback regarding the intern's strengths, areas for improvement, and overall conduct..."
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                />
              </div>

              <button
                type="submit"
                style={{ ...s.button, opacity: submitting ? 0.7 : 1 }}
                disabled={submitting}
              >
                {submitting ? 'Submitting Evaluation...' : 'Submit Official Evaluation'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

const s = {
  page: {
    minHeight: '100vh',
    padding: '36px 16px',
    backgroundColor: COLORS.slate50,
    backgroundImage: `radial-gradient(circle at top right, rgba(2, 132, 199, 0.08) 0%, transparent 40%)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    maxWidth: 680,
    width: '100%',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: '36px 32px',
    border: `1px solid ${COLORS.slate200}`,
    boxShadow: THEME.shadows.lg,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    paddingBottom: 24,
    borderBottom: `1px solid ${COLORS.slate200}`,
    marginBottom: 24,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.sky50,
    border: `1.5px solid ${COLORS.sky200}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  logoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 800,
    color: '#000000',
  },
  sub: {
    margin: '4px 0 0',
    fontSize: 13,
    fontWeight: 600,
    color: '#000000',
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    backgroundColor: COLORS.sky50,
    border: `1px solid ${COLORS.sky200}`,
    borderRadius: THEME.radius.md,
    padding: 16,
    marginBottom: 24,
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 16px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  criteriaList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  criteriaCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    flexWrap: 'wrap',
    gap: 10,
  },
  criteriaTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: '#000000',
    textTransform: 'capitalize',
  },
  select: {
    padding: '8px 12px',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    fontSize: 13,
    color: '#000000',
    backgroundColor: COLORS.white,
    minWidth: 220,
    fontFamily: THEME.fonts.main,
  },
  commentGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  commentLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: 12,
    fontSize: 14,
    color: '#000000',
    fontFamily: THEME.fonts.main,
  },
  button: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '14px 20px',
    fontSize: 15,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)',
  },
  successIconWrap: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    backgroundColor: COLORS.emerald100,
    color: COLORS.emerald700,
    fontSize: 32,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  successTitle: {
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 10px',
  },
  successText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#000000',
    lineHeight: 1.6,
    margin: '0 0 20px',
  },
  tokenNote: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 600,
    color: '#000000',
    backgroundColor: COLORS.sky50,
    padding: '10px 14px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.sky200}`,
  },
  infoBox: {
    padding: 14,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.sky50,
    color: '#000000',
    fontSize: 13,
    marginBottom: 16,
    border: `1px solid ${COLORS.sky200}`,
  },
  errorBox: {
    padding: 14,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    fontSize: 13,
    marginBottom: 16,
    border: `1px solid ${COLORS.rose200}`,
  },
};
