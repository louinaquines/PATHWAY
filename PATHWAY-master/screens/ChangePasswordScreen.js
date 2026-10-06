import React, { useState } from 'react';
import { ScrollView, View, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';

export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  async function leave() { await signOut(auth); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }
  async function submit() {
    setError('');
    if (newPassword !== confirm) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await postBackend('/student/change-password', { currentPassword, newPassword, apiKey: auth.app.options.apiKey });
      await leave();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={{ flexGrow: 1, padding: 28, paddingTop: 70, gap: 20, backgroundColor: '#f5f7fb' }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 26, fontWeight: '700' }}>Secure your account</Text>
    <Text>Replace your coordinator-issued password before accessing student records. After saving, sign in with your new password.</Text>
    <Text>Use 12–128 characters, including letters and numbers.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text> : null}
    {[['Current or temporary password', currentPassword, setCurrent], ['New password', newPassword, setNew], ['Confirm new password', confirm, setConfirm]].map(([label, value, setter]) => <View key={label}>
      <Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={setter} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} onFocus={() => setFocusedField(label)} onBlur={() => setFocusedField(null)} style={{ padding: 14, backgroundColor: '#fff', borderRadius: 12, marginTop: 8, borderWidth: 1.5, borderColor: focusedField === label ? '#0064d9' : '#dbe5f1', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} />
    </View>)}
    <TouchableOpacity disabled={busy} onPress={submit} style={{ padding: 16, backgroundColor: '#0064d9', borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#fff' }}>{busy ? 'Saving…' : 'Save password and sign out'}</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} onPress={leave}><Text>Sign out</Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView>;
}
