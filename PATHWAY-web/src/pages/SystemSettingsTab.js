// src/pages/SystemSettingsTab.js
import { useEffect, useState, useCallback } from 'react';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { PageSkeleton } from '../components/LoadingSkeleton';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DEFAULTS = {
  defaultHoursRequired: 486,
  dailyTargetHours: 8,
  expectedStartTime: '08:00',
  lateGraceMinutes: 15,
  expectedWorkdays: DAYS.slice(0, 5),
  notificationsEnabled: true,
};

export default function SystemSettingsTab() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [message, setMessage]   = useState('');
  const [error, setError]       = useState('');

  const loadSettings = useCallback(() => {
    setLoading(true);
    adminRequest('/admin/settings')
      .then(data => setSettings({ ...DEFAULTS, ...data.settings }))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));

  const toggleDay = day => update('expectedWorkdays', settings.expectedWorkdays.includes(day)
    ? settings.expectedWorkdays.filter(item => item !== day)
    : [...settings.expectedWorkdays, day]);

  const save = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const data = await adminRequest('/admin/settings', { method: 'PUT', body: JSON.stringify(settings) });
      setSettings({ ...DEFAULTS, ...data.settings });
      setMessage('System configurations and schedule parameters saved successfully.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSkeleton label="Loading system settings" variant="form" />;
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>System Configuration & Attendance Defaults</h2>
        <p style={s.sub}>
          Global defaults for OJT section creations, automated attendance analytics, workday expectations, and notifications.
        </p>
      </div>

      {error   && <div style={s.error}>{error}</div>}
      {message && <div style={s.success}>{message}</div>}

      <form onSubmit={save} style={s.form}>
        <div style={s.grid}>
          <div style={s.field}>
            <label style={s.label}>Default Required OJT Hours</label>
            <input
              style={s.input}
              type="number"
              min="1"
              value={settings.defaultHoursRequired}
              onChange={e => update('defaultHoursRequired', e.target.value)}
              required
            />
            <span style={s.hint}>Standard hours assigned when creating new sections</span>
          </div>

          <div style={s.field}>
            <label style={s.label}>Daily Target Hours</label>
            <input
              style={s.input}
              type="number"
              min="0.1"
              max="24"
              step="0.1"
              value={settings.dailyTargetHours}
              onChange={e => update('dailyTargetHours', e.target.value)}
              required
            />
            <span style={s.hint}>Standard expected daily internship shift</span>
          </div>

          <div style={s.field}>
            <label style={s.label}>Expected Shift Start Time</label>
            <input
              style={s.input}
              type="time"
              value={settings.expectedStartTime}
              onChange={e => update('expectedStartTime', e.target.value)}
              required
            />
            <span style={s.hint}>Used to compute student arrival punctuality</span>
          </div>

          <div style={s.field}>
            <label style={s.label}>Late Arrival Grace Period (Minutes)</label>
            <input
              style={s.input}
              type="number"
              min="0"
              max="240"
              value={settings.lateGraceMinutes}
              onChange={e => update('lateGraceMinutes', e.target.value)}
              required
            />
            <span style={s.hint}>Buffer before marking an intern arrival as late</span>
          </div>
        </div>

        <div style={s.workdaysSection}>
          <label style={s.label}>Expected Internship Workdays</label>
          <p style={s.hint}>Selected days are factored into student attendance analytics and missed shift calculations.</p>
          <div style={s.daysGrid}>
            {DAYS.map(day => {
              const active = settings.expectedWorkdays.includes(day);
              return (
                <button
                  type="button"
                  key={day}
                  style={{
                    ...s.dayButton,
                    backgroundColor: active ? COLORS.sky600 : COLORS.white,
                    color: active ? COLORS.white : '#000000',
                    borderColor: active ? COLORS.sky600 : COLORS.slate300,
                  }}
                  onClick={() => toggleDay(day)}
                >
                  <Icon name={active ? 'check' : 'x'} size={14} /> {day}
                </button>
              );
            })}
          </div>
        </div>

        <div style={s.notificationsWrap}>
          <label style={s.checkboxLabel}>
            <input
              type="checkbox"
              checked={settings.notificationsEnabled}
              onChange={e => update('notificationsEnabled', e.target.checked)}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            <div>
              <div style={s.checkboxTitle}>Enable In-App Notifications System</div>
              <div style={s.checkboxSub}>Allow system triggers to send notices for logbook reviews and clearances</div>
            </div>
          </label>
        </div>

        <button
          style={s.saveButton}
          disabled={saving || settings.expectedWorkdays.length === 0}
        >
          <Icon name="save" size={15} />
          {saving ? 'Saving Configurations...' : 'Save Global Settings'}
        </button>
      </form>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 860,
  },
  header: {
    marginBottom: 4,
  },
  title: {
    margin: '0 0 4px',
    color: '#000000',
    fontSize: 20,
    fontWeight: 800,
  },
  sub: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
    lineHeight: 1.5,
  },
  form: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 28,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  hint: {
    fontSize: 12,
    color: '#000000',
    marginTop: 4,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
  },
  workdaysSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  daysGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: 8,
    marginTop: 10,
  },
  dayButton: {
    border: '1.5px solid',
    borderRadius: THEME.radius.md,
    padding: '9px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
    textAlign: 'center',
    fontFamily: THEME.fonts.main,
    transition: 'all 0.15s ease',
  },
  notificationsWrap: {
    padding: 16,
    backgroundColor: COLORS.sky50,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.sky200}`,
  },
  checkboxLabel: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    cursor: 'pointer',
  },
  checkboxTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
  },
  checkboxSub: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  saveButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    alignSelf: 'flex-start',
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  error: {
    backgroundColor: COLORS.rose50,
    color: '#000000',
    padding: 14,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.rose200}`,
    fontSize: 13,
  },
  success: {
    backgroundColor: COLORS.emerald50,
    color: '#000000',
    padding: 14,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.emerald200}`,
    fontSize: 13,
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 12,
    color: '#000000',
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
