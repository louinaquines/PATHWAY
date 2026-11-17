import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { ScreenEntrance } from './Motion';

export default function DashboardLoading() {
  return <SafeAreaView style={styles.screen}>
    <ScreenEntrance style={styles.content}>
      <View style={styles.scene}>
        <Image source={require('../assets/pathway-guide-pointing.png')} style={styles.character} resizeMode="contain" accessible={false} />
        <View style={styles.spark} /><View style={styles.dot} />
      </View>
      <Text style={styles.title}>Opening your dashboard</Text>
      <Text style={styles.subtitle}>Getting your account ready.</Text>
      <ActivityIndicator style={styles.spinner} color="#0765D4" accessibilityLabel="Signing in" />
    </ScreenEntrance>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', backgroundColor: '#FFFFFF' },
  content: { alignItems: 'center', padding: 24 },
  scene: { width: '100%', maxWidth: 300, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  character: { width: '100%', height: '100%' },
  spark: { position: 'absolute', width: 9, height: 9, borderRadius: 2, backgroundColor: '#FFD047', left: 12, top: 40, transform: [{ rotate: '45deg' }] },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, backgroundColor: '#349CFF', right: 20, bottom: 18 },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '600', color: '#10213D', marginTop: 28, textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 20, color: '#60748F', marginTop: 8, textAlign: 'center' },
  spinner: { marginTop: 22 },
});
