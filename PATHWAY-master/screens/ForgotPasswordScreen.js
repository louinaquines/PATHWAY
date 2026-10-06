// screens/ForgotPasswordScreen.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import AuthHero, { AuthPanel } from '../components/AuthHero';
import { MailIcon, AlertCircleIcon, CheckCircleIcon } from '../components/Icons';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleReset = async () => {
    setError('');
    if (!email.trim()) { setError('Enter your email address.'); return; }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e) {
      switch (e.code) {
        case 'auth/user-not-found':  setError('No account found with that email.'); break;
        case 'auth/invalid-email':   setError("That email doesn't look right."); break;
        case 'auth/too-many-requests': setError('Too many attempts. Try again later.'); break;
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
          title="Reset your password."
          subtitle="We'll send recovery instructions to your institutional email."
          onBack={() => navigation.goBack()}
        />

        <AuthPanel style={styles.card}>
          {sent ? (
            <View style={styles.successState}>
              <View style={styles.successIconCircle}>
                <CheckCircleIcon size={34} color={COLORS.successDark} />
              </View>
              <Text variant="heading" style={styles.successTitle}>Email sent!</Text>
              <Text style={styles.successSub}>
                Check your inbox at{' '}
                <Text style={styles.successEmail}>{email}</Text>
                {' '}for the password reset link. It may take a moment to arrive.
              </Text>
              <MotionTouchableOpacity
                style={styles.btn}
                onPress={() => navigation.goBack()}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Return to sign in"
              >
                <Text style={styles.btnText}>Back to Sign In</Text>
              </MotionTouchableOpacity>
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => { setSent(false); }}
                activeOpacity={0.7}
              >
                <Text style={styles.resendBtnText}>Didn't receive it? Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.iconCircle}>
                <MailIcon size={28} color={COLORS.secondary} />
              </View>
              <Text variant="heading" style={styles.title}>Forgot your password?</Text>
              <Text style={styles.sub}>
                Enter your registered institutional email address and we will send you secure recovery instructions.
              </Text>

              {error ? (
                <View style={styles.errorBanner}>
                  <AlertCircleIcon size={18} color={COLORS.danger} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email Address</Text>
              <View style={[styles.inputContainer, isFocused && styles.inputContainerFocused]}>
                <View style={styles.inputIcon}>
                  <MailIcon size={18} color={isFocused ? COLORS.secondary : COLORS.textMuted} />
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. student@uclm.edu.ph"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  accessibilityLabel="Institutional email address"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="send"
                  onSubmitEditing={handleReset}
                  editable={!loading}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />
              </View>

              <MotionTouchableOpacity
                style={[styles.btn, loading && { opacity: 0.7 }]}
                onPress={handleReset}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send reset link"
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.btnText}>Send Reset Link</Text>
                )}
              </MotionTouchableOpacity>

              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.cancelBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back to sign in"
              >
                <Text style={styles.cancelBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
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
    paddingTop: 28,
    paddingBottom: 40,
    ...SHADOWS.floating,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  sub: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 7,
    marginBottom: 24,
    lineHeight: 19,
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
    marginBottom: 6,
  },
  inputContainer: {
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
    paddingVertical: 13,
    fontSize: 14.5,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  btn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    ...SHADOWS.hover,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 8,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Success state
  successState: {
    alignItems: 'center',
    paddingTop: 8,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  successSub: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
    lineHeight: 21,
    maxWidth: 340,
  },
  successEmail: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  resendBtn: {
    marginTop: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  resendBtnText: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
});
