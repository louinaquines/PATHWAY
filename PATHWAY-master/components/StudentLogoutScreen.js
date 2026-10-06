import React from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import { COLORS, SHADOWS } from '../theme';

export default function StudentLogoutScreen() {
  return (
    <View style={styles.screen} accessible accessibilityLabel="Signing you out">
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.card}>
        <PathwayMark size={68} />
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.spinner}
          accessibilityLabel="Signing out"
        />
        <Text style={styles.title}>Signing you out</Text>
        <Text style={styles.description}>Please wait while we securely end your session.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: COLORS.background,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    ...SHADOWS.soft,
  },
  spinner: {
    marginTop: 26,
    marginBottom: 16,
  },
  title: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    maxWidth: 260,
    marginTop: 8,
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
