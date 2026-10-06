// screens/LoginScreen.js
import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { destinationForProfile } from '../services/authDestination';
import { postBackend } from '../services/backendApi';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import AuthHero, { AuthPanel } from '../components/AuthHero';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { UserIcon, LockIcon, EyeIcon, EyeOffIcon, AlertCircleIcon, ChevronRightIcon } from '../components/Icons';

export default function LoginScreen({ navigation, initialError = '', onClearInitialError, startupProgress, startupTransition = false, onStartupLogoLayout }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isFocusedEmail, setIsFocusedEmail] = useState(false);
  const [isFocusedPass, setIsFocusedPass] = useState(false);
  const passwordInputRef = useRef(null);

  const handleLogin = async () => {
    setError('');
    onClearInitialError?.();
    if (!email.trim()) { setError('Enter your username.'); return; }
    if (!password) { setError('Enter your password.'); return; }

    setLoading(true);
    try {
      const login = email.trim().toLowerCase();
      const identifier = /^uclm-[a-z0-9-]{4,20}$/.test(login) ? `${login}@students.pathway.invalid` : login;
      await signInWithEmailAndPassword(auth, identifier, password);

      const { profile: userData } = await postBackend('/auth/profile');
      if (!userData) {
        setError('Account not found. Contact your OJT Coordinator.');
        await auth.signOut();
        return;
      }

      const destination = destinationForProfile(userData);
      if (!destination) {
        setError('Unrecognized role. Contact your OJT Coordinator.');
        await auth.signOut();
        return;
      }
      navigation.reset({ index: 0, routes: [{ name: destination }] });
    } catch (err) {
      switch (err.code) {
        case 'auth/invalid-email':          setError('Enter your coordinator-issued username.'); break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':     setError('Username or password is incorrect.'); break;
        case 'auth/too-many-requests':      setError('Too many attempts. Try again later.'); break;
        case 'auth/network-request-failed': setError('No internet connection.'); break;
        default: setError('Something went wrong. Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthHero
          title="Welcome"
          subtitle="Your OJT journey continues here."
          startupProgress={startupProgress}
          startupTransition={startupTransition}
          onStartupLogoLayout={onStartupLogoLayout}
        />

        <AuthPanel style={styles.card} startupProgress={startupProgress} startupTransition={startupTransition}>
          <Text variant="heading" style={styles.formTitle}>Sign in</Text>
          <Text style={styles.formIntro}>Sign in with your coordinator-issued account.</Text>

          {(error || initialError) ? (
            <View style={styles.errorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <AlertCircleIcon size={18} color={COLORS.danger} />
              <Text style={styles.errorText}>{error || initialError}</Text>
            </View>
          ) : null}

          {/* Coordinator-issued username */}
          <Text style={styles.label}>Username</Text>
          <View style={[styles.inputContainer, isFocusedEmail && styles.inputContainerFocused]}>
            <View style={styles.inputIcon}>
              <UserIcon size={19} color={isFocusedEmail ? COLORS.secondary : COLORS.textMuted} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. uclm-24228132"
              placeholderTextColor={COLORS.textPlaceholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              accessibilityLabel="Username"
              returnKeyType="next"
              editable={!loading}
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              onFocus={() => setIsFocusedEmail(true)}
              onBlur={() => setIsFocusedEmail(false)}
            />
          </View>

          {/* Password Input */}
          <Text style={styles.label}>Password</Text>
          <View style={[styles.inputContainer, isFocusedPass && styles.inputContainerFocused]}>
            <View style={styles.inputIcon}>
              <LockIcon size={19} color={isFocusedPass ? COLORS.secondary : COLORS.textMuted} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Enter your password"
              placeholderTextColor={COLORS.textPlaceholder}
              value={password}
              onChangeText={setPassword}
              ref={passwordInputRef}
              secureTextEntry={!showPassword}
              accessibilityLabel="Password"
              autoComplete="current-password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              editable={!loading}
              onFocus={() => setIsFocusedPass(true)}
              onBlur={() => setIsFocusedPass(false)}
            />
            <TouchableOpacity
              onPress={() => setShowPassword(v => !v)}
              disabled={loading}
              style={styles.eyeBtn}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOffIcon size={20} color={COLORS.textSecondary} />
              ) : (
                <EyeIcon size={20} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('ForgotPassword')}
            style={styles.forgotBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            disabled={loading}
          >
            <Text style={styles.forgotBtnText}>Forgot password?</Text>
          </TouchableOpacity>

          <MotionTouchableOpacity
            style={[styles.signInBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign In"
          >
            {loading ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <><Text style={styles.signInBtnText}>Sign in</Text><ChevronRightIcon size={19} color="#FFFFFF" /></>
            )}
          </MotionTouchableOpacity>

          <View style={styles.securityNote}><LockIcon size={15} color={COLORS.textMuted} /><Text style={styles.securityText}>First time here? You’ll set a new password after signing in.</Text></View>
          <Text style={styles.formIntro}>Need an account? Contact your assigned OJT coordinator.</Text>
        </AuthPanel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  card: {
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 38,
    ...SHADOWS.floating,
  },
  authTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: 4,
  },
  formTitle: { fontSize: 23, fontWeight: '700', color: COLORS.textPrimary },
  securityNote: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: COLORS.border },
  securityText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  authTabActive: {
    flex: 1,
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTab: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authTabActiveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  authTabText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '700' },
  formIntro: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerSubtle,
    borderLeftWidth: 3.5,
    borderLeftColor: COLORS.danger,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: COLORS.dangerDark,
    fontSize: 13,
    fontWeight: '600',
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 7,
    marginTop: 10,
    letterSpacing: 0.2,
  },
  inputContainer: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
  },
  inputContainerFocused: {
    borderColor: COLORS.secondary,
    backgroundColor: '#FFFFFF',
    ...SHADOWS.soft,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
    paddingVertical: 13,
    fontSize: 14.5,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  eyeBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotBtn: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 12,
  },
  forgotBtnText: {
    fontSize: 12.5,
    color: COLORS.secondary,
    fontWeight: '700',
  },
  signInBtn: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    ...SHADOWS.hover,
  },
  signInBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  registerPrompt: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  registerPromptText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  registerHighlight: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
