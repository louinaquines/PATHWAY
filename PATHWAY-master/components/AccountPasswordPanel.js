// components/AccountPasswordPanel.js
// Change password from Settings for students who already set their own password.
// Stays inside Settings; asks for the current password (not a temporary one).
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { postBackend } from '../services/backendApi';
import { auth } from '../firebaseConfig';
import { COLORS, SHADOWS } from '../theme';
import { AppText as Text } from './AppText';
import { AlertCircleIcon, ChevronRightIcon, LockIcon } from './Icons';
import { MotionTouchableOpacity } from './Motion';
import StudentSurface from './StudentSurface';
import { showStudentSuccess } from '../services/studentSuccess';
import { Field, Rule } from '../screens/ChangePasswordScreen';

export default function AccountPasswordPanel({ onBack, onSignedOut }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revealed, setRevealed] = useState({});
  const [focused, setFocused] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rules = {
    length: next.length >= 8 && next.length <= 128,
    upper: /[A-Z]/.test(next),
    special: /[^A-Za-z0-9\s]/.test(next),
    different: next.length > 0 && next !== current,
  };
  const matches = confirm.length > 0 && confirm === next;
  const canSubmit = !busy && current.length > 0 && Object.values(rules).every(Boolean) && matches;
  const field = (key, label, value, setter) => (
    <Field label={label} value={value} busy={busy} revealed={!!revealed[key]} focused={focused === key}
      onChangeText={text => { setError(''); setter(text); }}
      onToggle={() => setRevealed(prev => ({ ...prev, [key]: !prev[key] }))}
      onFocus={() => setFocused(key)} onBlur={() => setFocused(f => (f === key ? null : f))}
      invalid={key === 'confirm' && confirm.length > 0 && !matches} />
  );
  async function save() {
    if (!canSubmit) return;
    setBusy(true); setError('');
    try {
      await postBackend('/student/change-password', { currentPassword: current, newPassword: next, apiKey: auth.app.options.apiKey });
      showStudentSuccess('Password updated', 'Sign in again with your new password.');
      setTimeout(onSignedOut, 2600);
    } catch (e) {
      setError(/wrong|invalid|incorrect|credential/i.test(e.message || '') ? 'Your current password is incorrect.' : (e.message || 'Could not save your password. Try again.'));
      setBusy(false);
    }
  }
  return (
    <View>
      <MotionTouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to settings" style={styles.back}>
        <View style={styles.backArrow}><ChevronRightIcon size={15} color={COLORS.secondary} /></View>
        <Text style={styles.backText}>Settings</Text>
      </MotionTouchableOpacity>
      <Text style={styles.title}>Change password</Text>
      <Text style={styles.sub}>Enter your current password, then choose a new one. You'll sign in again after saving.</Text>
      <View style={styles.card}>
        <StudentSurface tone="blue" waves />
        {field('current', 'Current password', current, setCurrent)}
        {field('next', 'New password', next, setNext)}
        <View style={styles.rules}>
          <Rule ok={rules.length}>At least 8 characters</Rule>
          <Rule ok={rules.upper}>One uppercase letter</Rule>
          <Rule ok={rules.special}>One special character</Rule>
          <Rule ok={rules.different}>Different from your current password</Rule>
        </View>
        {field('confirm', 'Confirm new password', confirm, setConfirm)}
        {confirm.length > 0 && !matches && <Text style={styles.mismatch}>Passwords don't match.</Text>}
        {!!error && <View style={styles.error}><AlertCircleIcon size={16} color={COLORS.danger} /><Text style={styles.errorText}>{error}</Text></View>}
        <MotionTouchableOpacity disabled={!canSubmit} onPress={save} accessibilityRole="button" accessibilityLabel="Save new password"
          style={[styles.save, !canSubmit && { opacity: 0.45 }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <><LockIcon size={16} color="#FFFFFF" /><Text style={styles.saveText}>Save new password</Text></>}
        </MotionTouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 10 },
  backArrow: { transform: [{ rotate: '180deg' }] },
  backText: { color: COLORS.secondary, fontSize: 15, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary },
  sub: { marginTop: 6, marginBottom: 16, fontSize: 14, lineHeight: 21, color: COLORS.textSecondary },
  card: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: '#E5EDF8', backgroundColor: COLORS.surface, overflow: 'hidden', ...SHADOWS.soft },
  rules: { gap: 6, marginTop: -4, marginBottom: 12 },
  mismatch: { marginTop: -6, marginBottom: 10, fontSize: 12.5, color: COLORS.danger },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 12, borderRadius: 10, backgroundColor: '#FEF2F2' },
  errorText: { flex: 1, color: COLORS.danger, fontSize: 13 },
  save: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 14, backgroundColor: COLORS.primary, marginTop: 4 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
