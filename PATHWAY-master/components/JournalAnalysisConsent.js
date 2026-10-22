import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText as Text } from './AppText';
import { COLORS, RADIUS } from '../theme';

export default function JournalAnalysisConsent({ client }) {
  const [consent, setConsent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true), inFlight = useRef(false);
  useEffect(() => { active.current = true; refresh(); return () => { active.current = false; }; }, [client]);
  async function refresh() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setConsent(null);
    try { const result = await client.readConsent(); if (active.current) setConsent(result); }
    catch { if (active.current) setError('Consent status unavailable. Retry to check your current choice.'); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  async function choose(granted) {
    if (!consent || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await client.saveConsent({ granted, disclosureVersion: 'workplace-journal-consent-v1', expectedRevision: consent.revision });
      if (active.current) setConsent(result);
    } catch (e) {
      if (active.current) {
        setConsent(null);
        setError(e.status === 409 ? 'Your choice changed. Refresh before choosing again.' : 'Could not confirm the change. Refresh to check your current choice.');
      }
    } finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  return <View style={styles.card}>
    <Text variant="heading" style={styles.title}>Journal workplace support analysis</Text>
    <Text style={styles.body}>Optional: allow original notes in future journal submissions to be shared with Anthropic to identify potential workplace concerns. Potential concerns go privately to your assigned coordinator for human review. Your company or supervisor will not be contacted automatically.</Text>
    <Text style={styles.body}>AI can miss or misunderstand concerns. PATHWAY is not continuously monitored or an emergency service. You may decline and still submit journals or contact your coordinator directly.</Text>
    <Text style={styles.body}>Withdrawal stops future sharing, including queued unsent entries. It cannot recall text already shared or erase existing review records. This release only prepares the queue; automatic analysis is not active.</Text>
    <Text style={styles.status} accessibilityLiveRegion="polite">{consent ? (consent.granted ? 'Your choice: allowed for future submissions.' : 'Your choice: analysis off.') : 'Your current consent choice is not loaded.'}</Text>
    {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {consent && !error ? <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => choose(!consent.granted)}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : consent.granted ? 'Withdraw consent' : 'Allow future analysis'}</Text>
      </TouchableOpacity>
      {!consent.granted && <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={() => choose(false)}><Text style={styles.secondaryText}>Keep analysis off</Text></TouchableOpacity>}
    </View> : <TouchableOpacity accessibilityRole="button" disabled={busy} style={styles.secondary} onPress={refresh}><Text style={styles.secondaryText}>{busy ? 'Checking…' : 'Refresh consent status'}</Text></TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface || '#fff', padding: 18, borderRadius: RADIUS.lg || 16, borderWidth: 1, borderColor: COLORS.border || '#DDE5EF', marginBottom: 18 },
  title: { fontSize: 18, color: COLORS.textPrimary, marginBottom: 10 },
  body: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20, marginBottom: 9 },
  status: { fontSize: 13, color: COLORS.textPrimary, marginVertical: 8 },
  error: { fontSize: 13, color: COLORS.dangerDark, marginBottom: 8 },
  actions: { gap: 8 }, button: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 12 },
  buttonText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
  secondary: { padding: 10 }, secondaryText: { color: COLORS.primary, textAlign: 'center', fontWeight: '600' },
});
