import React, { useState } from 'react';
import { ScrollView, View, TouchableOpacity, Platform, KeyboardAvoidingView } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { EyeIcon, EyeOffIcon } from '../components/Icons';

export default function ChangePasswordScreen({ navigation }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState(null);
  const [revealed, setRevealed] = useState({});
  async function leave() { await signOut(auth); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); }
  async function submit() {
    setError('');
    if (newPassword !== confirm) { setError('The new passwords do not match.'); return; }
    if (newPassword.length < 8 || newPassword.length > 128 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { setError('Use 8–128 characters, including letters and numbers.'); return; }
    setBusy(true);
    try {
      await postBackend('/student/change-password', { currentPassword, newPassword, apiKey: auth.app.options.apiKey });
      await leave();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={{ flexGrow: 1, padding: 28, paddingTop: 70, gap: 20, backgroundColor: '#f5f7fb' }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 26, fontWeight: '700' }}>Secure your account</Text>
    <Text>Replace your coordinator-issued password before accessing student records. After saving, sign in with your new password.</Text>
    <Text>Use 8–128 characters, including letters and numbers.</Text>
    {error ? <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text> : null}
    {[['Current or temporary password', currentPassword, setCurrent], ['New password', newPassword, setNew], ['Confirm new password', confirm, setConfirm]].map(([label, value, setter]) => <View key={label}>
      <Text>{label}</Text><View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: focusedField === label ? '#0064d9' : '#dbe5f1' }}><TextInput accessibilityLabel={label} value={value} onChangeText={setter} secureTextEntry={!revealed[label]} autoCapitalize="none" autoCorrect={false} editable={!busy} selectionColor="#0864CE" cursorColor="#0864CE" onFocus={() => setFocusedField(label)} onBlur={() => setFocusedField(null)} style={{ flex: 1, minWidth: 0, color: '#0F172A', fontSize: 16, padding: 14, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) }} /><TouchableOpacity disabled={busy} onPress={() => setRevealed(previous => ({ ...previous, [label]: !previous[label] }))} accessibilityRole="button" accessibilityLabel={`${revealed[label] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} style={{ width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }}>{revealed[label] ? <EyeOffIcon size={20} color="#475569" /> : <EyeIcon size={20} color="#475569" />}</TouchableOpacity></View>
    </View>)}
    <TouchableOpacity disabled={busy} onPress={submit} style={{ padding: 16, backgroundColor: '#0064d9', borderRadius: 12, alignItems: 'center' }}><Text style={{ color: '#fff' }}>{busy ? 'Saving…' : 'Save password and sign out'}</Text></TouchableOpacity>
    <TouchableOpacity disabled={busy} onPress={leave}><Text>Sign out</Text></TouchableOpacity>
  </ScrollView></KeyboardAvoidingView>;
}
