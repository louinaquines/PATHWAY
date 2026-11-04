import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text, AppTextInput as TextInput } from './AppText';
import { auth } from '../firebaseConfig';
import { BACKEND_URL } from '../services/backendApi';
import { COLORS, SHADOWS } from '../theme';

export default function PlacementPreferences({ studentId }) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locked, setLocked] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [companyIds, setCompanyIds] = useState([]);
  const [location, setLocation] = useState('');
  const [message, setMessage] = useState('');
  const session = useRef(null);

  async function request(method, controller, payload) {
    const user = auth.currentUser;
    if (!user || user.uid !== studentId) throw new Error('Please sign in again.');
    const token = await user.getIdToken();
    if (controller.signal.aborted) return null;
    const response = await fetch(`${BACKEND_URL}/student/placement-preferences`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || 'Please check your connection and try again.');
      error.locked = result.locked === true || response.status === 409;
      throw error;
    }
    return result;
  }

  useEffect(() => {
    const current = { active: true, busy: false, controller: new AbortController() };
    session.current = current;
    setLoading(true);
    setLoaded(false);
    setMessage('');
    request('GET', current.controller).then(result => {
      if (!current.active) return;
      if (!Array.isArray(result?.companies) || !Array.isArray(result?.preferences?.companyIds)
        || result.preferences.companyIds.length > 3 || typeof result.preferences.location !== 'string'
        || typeof result.locked !== 'boolean') throw new Error('Preferences could not load. Please retry.');
      setCompanies(result.companies);
      setCompanyIds([...new Set(result.preferences.companyIds)]);
      setLocation(result.preferences.location);
      setLocked(result.locked);
      setLoaded(true);
    }).catch(error => {
      if (current.active) setMessage(`Unable to load preferences. ${error.message}`);
    }).finally(() => {
      if (current.active) setLoading(false);
    });
    return () => { current.active = false; current.controller.abort(); };
  }, [studentId, attempt]);

  const save = async () => {
    const current = session.current;
    if (!current?.active || current.busy || !loaded || locked || loading) return;
    current.busy = true;
    current.controller = new AbortController();
    setSaving(true);
    setMessage('');
    try {
      const result = await request('PUT', current.controller, { companyIds, location: location.trim() });
      if (!current.active) return;
      if (result?.locked === true) setLocked(true);
      setMessage('Preferences saved.');
    } catch (error) {
      if (!current.active) return;
      if (error.locked) setLocked(true);
      setMessage(`Unable to save preferences. ${error.message}`);
    } finally {
      current.busy = false;
      if (current.active) setSaving(false);
    }
  };

  const disabled = locked || saving;
  // Keep saved selections removable even if a company has left the directory.
  const options = [...companies, ...companyIds.filter(id => !companies.some(company => company.id === id))
    .map(id => ({ id, name: 'Previously preferred company (unavailable)' }))];
  return <View style={styles.card}>
    <Text style={styles.title}>Placement preferences (optional)</Text>
    <Text style={styles.copy}>Preferences help suggestions and do not guarantee assignment. Your coordinator confirms your official company. You can skip this panel.</Text>
    {loading && <Text style={styles.copy}>Loading preferences...</Text>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.copy}>{message}</Text>}
    {!loading && !loaded && <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)}><Text style={styles.link}>Retry preferences</Text></TouchableOpacity>}
    {loaded && <>
      <Text style={styles.copy}>Preferred companies: {companyIds.length}/3. Choose up to three.</Text>
      {options.map(company => {
        const selected = companyIds.includes(company.id);
        const unavailable = disabled || (!selected && companyIds.length >= 3);
        return <TouchableOpacity key={company.id} accessibilityRole="checkbox" accessibilityLabel={company.name}
          accessibilityState={{ checked: selected, disabled: unavailable }} disabled={unavailable}
          style={[styles.option, selected && styles.selected, unavailable && styles.disabled]}
          onPress={() => {
            setCompanyIds(previous => previous.includes(company.id) ? previous.filter(id => id !== company.id)
              : previous.length < 3 ? [...previous, company.id] : previous);
            setMessage('');
          }}>
          <Text style={styles.copy}>{selected ? '✓ ' : ''}{company.name}{company.location ? ` · ${company.location}` : ''}</Text>
        </TouchableOpacity>;
      })}
      {!companies.length && <Text style={styles.copy}>No companies available. You may still save a preferred city or area.</Text>}
      <Text style={styles.copy}>Preferred city or area (optional). Do not enter your home address.</Text>
      <TextInput accessibilityLabel="Preferred city or area (optional)" placeholder="City or area" style={styles.input}
        value={location} editable={!disabled} onChangeText={value => { setLocation(value); setMessage(''); }} />
      {locked && <Text style={styles.copy}>Preferences are locked and cannot be changed.</Text>}
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
        style={[styles.button, disabled && styles.disabled]} onPress={save}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save preferences'}</Text>
      </TouchableOpacity>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight, padding: 16, marginBottom: 14, ...SHADOWS.soft },
  title: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  copy: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginVertical: 5 },
  option: { padding: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginVertical: 3 },
  selected: { backgroundColor: COLORS.primarySubtle, borderColor: COLORS.primary },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, color: COLORS.textPrimary },
  button: { backgroundColor: COLORS.primary, borderRadius: 11, padding: 14, alignItems: 'center', marginTop: 10 },
  buttonText: { color: COLORS.textOnPrimary, fontWeight: '800', fontSize: 13 },
  link: { color: COLORS.primary, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
