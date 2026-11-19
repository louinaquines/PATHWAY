// screens/ChangePasswordScreen.js
import { showStudentSuccess } from '../services/studentSuccess';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { COLORS, RADIUS, SHADOWS } from '../theme';
import AuthHero from '../components/AuthHero';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { AlertCircleIcon, CheckCircleIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from '../components/Icons';

const POINTING_GUIDE = require('../assets/pathway-guide-thoughtful.png');

function Field({ label, value, onChangeText, revealed, onToggle, focused, onFocus, onBlur, busy, invalid, autoFocus }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputRow, focused && styles.inputRowFocused, invalid && styles.inputRowInvalid]}>
        <LockIcon size={18} color={focused ? COLORS.primary : COLORS.textMuted} />
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!revealed}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={!busy}
          onFocus={onFocus}
          onBlur={onBlur}
          selectionColor={COLORS.primary}
          cursorColor={COLORS.primary}
          style={[styles.input, Platform.OS === 'web' && { outlineStyle: 'none' }]}
        />
        <TouchableOpacity disabled={busy} onPress={onToggle} accessibilityRole="button"
          accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label.toLowerCase()}`} style={styles.eye} hitSlop={8}>
          {revealed ? <EyeOffIcon size={20} color={COLORS.textSecondary} /> : <EyeIcon size={20} color={COLORS.textSecondary} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Rule({ ok, children }) {
  return (
    <View style={styles.rule} accessible accessibilityLabel={`${children}${ok ? ', done' : ''}`}>
      <View style={[styles.ruleDot, ok && styles.ruleDotOk]}>{ok ? <CheckIcon size={10} color="#FFFFFF" /> : null}</View>
      <Text style={[styles.ruleText, ok && styles.ruleTextOk]}>{children}</Text>
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(null);
  const [revealed, setRevealed] = useState({});

  const rules = {
    length: newPassword.length >= 8 && newPassword.length <= 128,
    upper: /[A-Z]/.test(newPassword),
    special: /[^A-Za-z0-9\s]/.test(newPassword),
    different: newPassword.length > 0 && newPassword !== currentPassword,
  };
  const allRules = Object.values(rules).every(Boolean);
  const matches = confirm.length > 0 && confirm === newPassword;
  const canSubmit = !busy && currentPassword.length > 0 && allRules && matches;
  const compact = height < 760;

  async function leave() {
    await signOut(auth).catch(() => {});
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  async function submit() {
    if (!canSubmit) return;
    setError('');
    setBusy(true);
    try {
      await postBackend('/student/change-password', { currentPassword, newPassword, apiKey: auth.app.options.apiKey });
      setDone(true);
      showStudentSuccess('Password updated', 'Use your new password next time you sign in.');
      setTimeout(leave, 1600);
    } catch (e) {
      setError(/wrong|invalid|incorrect|credential/i.test(e.message || '') ? 'Your temporary password is incorrect.' : (e.message || 'Could not save your password. Try again.'));
      setBusy(false);
    }
  }

  // Bring the focused field and the Save button into view above the keyboard.
  const scrollRef = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', e => setKeyboardHeight(e?.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const contentH = useRef(0);
  const viewportH = useRef(0);
  const kbRef = useRef(0);
  kbRef.current = keyboardHeight;
  // Scroll so the bottom of the form (Save button) sits just above the keyboard; never past it.
  const revealFocused = key => {
    if (key === 'current') return;
    setTimeout(() => {
      const y = Math.max(0, contentH.current - (viewportH.current - kbRef.current) + 12);
      scrollRef.current?.scrollTo({ y, animated: true });
    }, 320);
  };

  const field = (key, label, value, setter, extra = {}) => (
    <Field label={label} value={value} onChangeText={text => { setError(''); setter(text); }} busy={busy}
      revealed={!!revealed[key]} onToggle={() => setRevealed(previous => ({ ...previous, [key]: !previous[key] }))}
      focused={focused === key} onFocus={() => { setFocused(key); revealFocused(key); }} onBlur={() => setFocused(current => (current === key ? null : current))} {...extra} />
  );

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0A5BC4" />
      <ScrollView ref={scrollRef} onLayout={e => { viewportH.current = e.nativeEvent.layout.height; }} contentContainerStyle={[styles.scroll, keyboardHeight ? { paddingBottom: keyboardHeight } : null]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" bounces={false} showsVerticalScrollIndicator={false}>
        <View onLayout={e => { contentH.current = e.nativeEvent.layout.height; }} style={{ flexGrow: 1 }}>
        <AuthHero
          illustrated
          guideSource={POINTING_GUIDE}
          heroHeight={Math.min(320, Math.max(200, height * (compact ? 0.26 : 0.3)))}
          title="Secure your account"
          subtitle="Set your own password to continue."
        />
        <View style={[styles.card, { paddingBottom: 24 + insets.bottom, paddingHorizontal: width < 360 ? 18 : 24 }]}>
          <View style={styles.inner}>
            {done ? (
              <View style={styles.done} accessibilityLiveRegion="polite">
                <CheckCircleIcon size={44} color={COLORS.success || '#16A34A'} />
                <Text style={styles.doneTitle}>Password updated</Text>
                <Text style={styles.doneText}>Sign in again with your new password.</Text>
                <ActivityIndicator color={COLORS.primary} style={{ marginTop: 6 }} />
              </View>
            ) : (
              <>
                <Text variant="heading" style={styles.title}>Create a new password</Text>
                <Text style={styles.intro}>Replace the temporary password from your coordinator. You'll sign in again after saving.</Text>

                {error ? (
                  <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
                    <AlertCircleIcon size={18} color={COLORS.dangerDark} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {field('current', 'Temporary password', currentPassword, setCurrent)}
                {field('new', 'New password', newPassword, setNew)}
                {newPassword.length > 0 && (focused === 'new' || !allRules) && (
                  <View style={styles.rules}>
                    <Rule ok={rules.length}>At least 8 characters</Rule>
                    <Rule ok={rules.upper}>One uppercase letter</Rule>
                    <Rule ok={rules.special}>One special character</Rule>
                    <Rule ok={rules.different}>Different from the temporary one</Rule>
                  </View>
                )}
                {field('confirm', 'Confirm new password', confirm, setConfirm, { invalid: confirm.length > 0 && !matches })}
                {confirm.length > 0 ? (
                  <Text style={[styles.matchText, matches && styles.matchOk]}>{matches ? 'Passwords match' : "Passwords don't match yet"}</Text>
                ) : null}

                <TouchableOpacity disabled={!canSubmit} onPress={submit} accessibilityRole="button"
                  accessibilityState={{ disabled: !canSubmit, busy }} style={[styles.button, !canSubmit && styles.buttonDisabled]}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Save new password</Text>}
                </TouchableOpacity>

                <TouchableOpacity disabled={busy} onPress={leave} accessibilityRole="button" style={styles.signOut}>
                  <Text style={styles.signOutText}>Sign out instead</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FBFF' },
  scroll: { flexGrow: 1 },
  card: { flexGrow: 1, backgroundColor: '#F9FBFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, marginTop: -28, paddingTop: 24, ...SHADOWS.floating },
  inner: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary },
  intro: { fontSize: 13, lineHeight: 20, color: COLORS.textSecondary, marginTop: 6, marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingLeft: 14, borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  inputRowFocused: { borderColor: COLORS.primary },
  inputRowInvalid: { borderColor: '#F59E0B' },
  input: { flex: 1, minWidth: 0, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 12 },
  eye: { width: 46, height: 50, alignItems: 'center', justifyContent: 'center' },
  rules: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 8, marginTop: -4, marginBottom: 18 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  ruleDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  ruleDotOk: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  ruleText: { fontSize: 12.5, color: COLORS.textSecondary },
  ruleTextOk: { color: '#15803D' },
  matchText: { fontSize: 12.5, color: '#B45309', marginTop: -6, marginBottom: 14 },
  matchOk: { color: '#15803D' },
  button: { minHeight: 54, borderRadius: RADIUS.lg, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonDisabled: { backgroundColor: '#9DB8DE' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  signOut: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 12, marginTop: 4 },
  signOutText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: '#FECACA', backgroundColor: COLORS.dangerSubtle },
  errorText: { flex: 1, fontSize: 13, color: COLORS.dangerDark },
  done: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  doneTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary },
  doneText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center' },
});
