// screens/RegisterScreen.js
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { createUserWithEmailAndPassword, deleteUser, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { MotionTouchableOpacity } from '../components/Motion';
import AuthHero, { AuthPanel } from '../components/AuthHero';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import {
  ChevronIcon,
  UserIcon,
  MailIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  AlertCircleIcon,
  BuildingIcon,
  CheckIcon,
  CloseIcon,
} from '../components/Icons';

const DEPARTMENTS = [
  'College of Business and Accountancy',
  'College of Engineering',
  'College of Hospitality and Tourism Management',
  'College of Nursing',
  'College of Customs Administration',
  'College of Teacher Education',
  'College of Criminology',
  'College of Computer Studies',
];

export default function RegisterScreen({ navigation, startupProgress, startupTransition = false, onStartupLogoLayout }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    idNumber: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
  });
  const [showDepts, setShowDepts] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const validate = () => {
    if (!form.firstName.trim()) return 'Enter your first name.';
    if (!form.lastName.trim()) return 'Enter your last name.';
    if (!form.idNumber.trim()) return 'Enter your ID number.';
    if (!/^\d+$/.test(form.idNumber)) return 'ID number must be numbers only.';
    if (!form.department) return 'Select your department.';
    if (!form.email.trim()) return 'Enter your email address.';
    if (!form.password) return 'Enter a password.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleRegister = async () => {
    setError('');
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    let createdUser;
    try {
      // Create auth account first
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      createdUser = cred.user;

      // Verify the ID against the coordinator-managed authorized class list.
      await postBackend('/register-student', {
        idNumber: form.idNumber.trim(), department: form.department,
        firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
      });

      // Registration creates a temporary Firebase session. Return to the
      // sign-in flow after the profile has been saved.
      await signOut(auth);

      Alert.alert('Account created!', 'Your registration has been submitted. You can now log in.', [
        { text: 'OK', onPress: () => navigation.replace('Login') }
      ]);
    } catch (e) {
      if (createdUser && [400, 403, 409].includes(e.status)) {
        await deleteUser(createdUser).catch(() => null);
      }
      switch (e.code) {
        case 'auth/email-already-in-use': setError('That email is already registered.'); break;
        case 'auth/invalid-email': setError("That email doesn't look right."); break;
        case 'auth/weak-password': setError('Password is too weak (at least 6 characters).'); break;
      default:
          setError(e.message || 'Something went wrong. Try again.');
          console.error('Register error code:', e.code, 'message:', e.message);
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
          title="Begin your journey."
          subtitle="Create your student account to start OJT onboarding."
          onBack={() => navigation.goBack()}
          startupProgress={startupProgress}
          startupTransition={startupTransition}
          onStartupLogoLayout={onStartupLogoLayout}
        />
        <AuthPanel style={styles.sheet} startupProgress={startupProgress} startupTransition={startupTransition}>
          <View style={styles.authTabs}>
            <TouchableOpacity
              style={styles.authTab}
              onPress={() => navigation.replace('Login')}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
            >
              <Text style={styles.authTabText}>Sign In</Text>
            </TouchableOpacity>
            <View style={styles.authTabActive}><Text style={styles.authTabActiveText}>Create Account</Text></View>
          </View>
          <Text style={styles.formIntro}>Register with your institutional student ID.</Text>

        {error ? (
          <View style={styles.errorBanner}>
            <AlertCircleIcon size={18} color={COLORS.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Section: Personal Info */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Personal Information</Text>

          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>First Name</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="First name"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={form.firstName}
                  onChangeText={v => set('firstName', v)}
                  editable={!loading}
                />
              </View>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Last Name</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Last name"
                  placeholderTextColor={COLORS.textPlaceholder}
                  value={form.lastName}
                  onChangeText={v => set('lastName', v)}
                  editable={!loading}
                />
              </View>
            </View>
          </View>

          <Text style={styles.label}>Student ID Number</Text>
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <UserIcon size={18} color={COLORS.secondary} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. 202112345"
              placeholderTextColor={COLORS.textPlaceholder}
              value={form.idNumber}
              onChangeText={v => set('idNumber', v)}
              keyboardType="number-pad"
              editable={!loading}
            />
          </View>

          {/* Department Selector */}
          <Text style={styles.label}>College / Department</Text>
          <TouchableOpacity
            style={styles.deptSelector}
            onPress={() => setShowDepts(true)}
            activeOpacity={0.8}
            disabled={loading}
          >
            <View style={styles.inputIcon}>
              <BuildingIcon size={18} color={form.department ? COLORS.primary : COLORS.textMuted} />
            </View>
            <Text
              style={[
                styles.deptSelectorText,
                !form.department && { color: COLORS.textPlaceholder }
              ]}
              numberOfLines={1}
            >
              {form.department || 'Select your college department'}
            </Text>
            <ChevronIcon size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Section: Account Credentials */}
        <View style={styles.card}>
          <Text style={styles.cardSectionTitle}>Account Credentials</Text>

          <Text style={styles.label}>Institutional Email</Text>
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <MailIcon size={18} color={COLORS.secondary} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. student@uclm.edu.ph"
              placeholderTextColor={COLORS.textPlaceholder}
              value={form.email}
              onChangeText={v => set('email', v)}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <Text style={styles.label}>Password (min 6 characters)</Text>
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <LockIcon size={18} color={COLORS.secondary} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Create a strong password"
              placeholderTextColor={COLORS.textPlaceholder}
              value={form.password}
              onChangeText={v => set('password', v)}
              secureTextEntry={!showPass}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
              {showPass ? (
                <EyeOffIcon size={18} color={COLORS.textSecondary} />
              ) : (
                <EyeIcon size={18} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <LockIcon size={18} color={COLORS.secondary} />
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="Confirm password"
              placeholderTextColor={COLORS.textPlaceholder}
              value={form.confirmPassword}
              onChangeText={v => set('confirmPassword', v)}
              secureTextEntry={!showConfirm}
              editable={!loading}
            />
            <TouchableOpacity onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
              {showConfirm ? (
                <EyeOffIcon size={18} color={COLORS.textSecondary} />
              ) : (
                <EyeIcon size={18} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Button */}
        <MotionTouchableOpacity
          style={[styles.registerBtn, loading && { opacity: 0.7 }]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.registerBtnText}>Complete Registration</Text>
          )}
        </MotionTouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.replace('Login')}
          style={styles.loginPrompt}
          activeOpacity={0.7}
        >
          <Text style={styles.loginPromptText}>
            Already have an account? <Text style={styles.loginHighlight}>Sign In</Text>
          </Text>
        </TouchableOpacity>
        </AuthPanel>
      </ScrollView>

      {/* Department Picker Modal */}
      <Modal
        visible={showDepts}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDepts(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            onPress={() => setShowDepts(false)}
            activeOpacity={1}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Department</Text>
              <TouchableOpacity onPress={() => setShowDepts(false)} style={styles.modalCloseBtn}>
                <CloseIcon size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {DEPARTMENTS.map(dept => {
                const selected = form.department === dept;
                return (
                  <TouchableOpacity
                    key={dept}
                    style={[styles.deptItem, selected && styles.deptItemSelected]}
                    onPress={() => {
                      set('department', dept);
                      setShowDepts(false);
                    }}
                  >
                    <Text style={[styles.deptItemText, selected && styles.deptItemTextSelected]}>
                      {dept}
                    </Text>
                    {selected && <CheckIcon size={18} color={COLORS.secondary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  sheet: {
    flexGrow: 1,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 40,
    ...SHADOWS.floating,
  },
  authTabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceMuted,
    borderRadius: RADIUS.md,
    padding: 4,
  },
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
    marginTop: 20,
    marginBottom: 10,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dangerSubtle,
    borderLeftWidth: 3.5,
    borderLeftColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: COLORS.dangerDark,
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    backgroundColor: COLORS.surface,
    paddingVertical: 16,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cardSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  eyeBtn: {
    padding: 6,
  },
  deptSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.background,
    borderWidth: 1.2,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  deptSelectorText: {
    flex: 1,
    fontSize: 13.5,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  registerBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...SHADOWS.card,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  loginPrompt: {
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 6,
  },
  loginPromptText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  loginHighlight: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 22,
    ...SHADOWS.floating,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalCloseBtn: {
    padding: 4,
  },
  deptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    marginBottom: 6,
  },
  deptItemSelected: {
    backgroundColor: COLORS.secondarySubtle,
  },
  deptItemText: {
    fontSize: 13.5,
    color: COLORS.textSecondary,
    fontWeight: '500',
    flex: 1,
    paddingRight: 10,
  },
  deptItemTextSelected: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
});
