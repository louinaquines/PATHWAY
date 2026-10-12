import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import { COLORS } from '../theme';

export default function StudentLogoutScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F9FE" />
      <View style={styles.layout}>
      <View style={styles.brandHeader}>
        <PathwayMark size={42} />
        <Text style={styles.brand}>PATHWAY</Text>
      </View>
      <View style={styles.centerStage} accessible accessibilityLabel="Signing you out">
      <View style={styles.card}>
        <View style={styles.spinnerTile}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.spinner}
          accessibilityLabel="Signing out"
        />
        </View>
        <Text style={styles.eyebrow}>ENDING YOUR SESSION</Text>
        <Text variant="heading" style={styles.title}>Signing you out</Text>
        <Text style={styles.description}>Please wait while we securely end your session.</Text>
        <View style={styles.statusStrip}><Text style={styles.statusText}>Returning to sign in…</Text></View>
      </View>
      </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: '100%',
    backgroundColor: '#F6F9FE',
  },
  layout: { flex: 1 },
  brandHeader: { position: 'absolute', top: 16, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  brand: { fontSize: 12, letterSpacing: 3, fontWeight: '700', color: COLORS.primary },
  centerStage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 80 },
  spinnerTile: { padding: 14, borderRadius: 20, backgroundColor: '#EFF6FF', marginBottom: 18 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: COLORS.primary, marginBottom: 12 },
  statusStrip: { marginTop: 24, alignSelf: 'stretch', padding: 16, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center' },
  statusText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
  card: {
    width: '100%',
    maxWidth: 396,
    alignItems: 'center',
    padding: 24,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E2EAF4',
    backgroundColor: COLORS.surface,
  },
  spinner: {
    width: 32,
    height: 32,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 27,
    lineHeight: 34,
    textAlign: 'center',
  },
  description: {
    maxWidth: 260,
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
});
