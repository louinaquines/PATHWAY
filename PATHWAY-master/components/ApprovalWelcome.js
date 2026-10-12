import React, { useEffect, useRef } from 'react';
import { Animated, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import { CheckCircleIcon, ArrowRightIcon } from './Icons';
import { useReducedMotion } from './Motion';
import { COLORS } from '../theme';

export default function ApprovalWelcome({ onComplete }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const complete = useRef(onComplete);
  complete.current = onComplete;
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: reducedMotion ? 0 : 650, useNativeDriver: true });
    animation.start();
    const timer = setTimeout(() => complete.current(), reducedMotion ? 1200 : 2600);
    return () => { animation.stop(); clearTimeout(timer); };
  }, [progress, reducedMotion]);
  return <SafeAreaView style={styles.screen}>
    <StatusBar barStyle="dark-content" backgroundColor="#F6F9FE" />
    <View style={styles.layout}>
    <View style={styles.brandHeader}>
      <PathwayMark size={42} />
      <Text style={styles.brand}>PATHWAY</Text>
    </View>
    <View style={styles.centerStage}>
    <Animated.View style={[styles.content, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 18, 0] }) }] }]}>
      <View style={styles.card}>
      <View style={styles.check}><CheckCircleIcon size={32} color={COLORS.successDark} /></View>
      <Text style={styles.eyebrow}>PRE-DEPLOYMENT APPROVED</Text>
      <Text variant="heading" accessibilityRole="header" style={styles.title}>You’re ready to begin</Text>
      <Text style={styles.message}>Your coordinator approved your pre-deployment submission. Your OJT dashboard is now unlocked.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onComplete} style={styles.button}><Text style={styles.buttonText}>Open my dashboard</Text><ArrowRightIcon size={18} color="#FFF" /></TouchableOpacity>
      </View>
    </Animated.View>
    </View>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F9FE' },
  layout: { flex: 1 },
  brandHeader: { position: 'absolute', top: 16, left: 24, right: 24, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 1 },
  centerStage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  content: { width: '100%', maxWidth: 440, padding: 22, alignItems: 'center' },
  brand: { fontSize: 12, letterSpacing: 3, fontWeight: '700', color: COLORS.primary },
  card: { width: '100%', padding: 24, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 26, borderWidth: 1, borderColor: '#E2EAF4' },
  check: { marginBottom: 18, padding: 14, borderRadius: 20, backgroundColor: COLORS.successLight },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: COLORS.successDark, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 27, lineHeight: 34, color: COLORS.textPrimary, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 22, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  button: { marginTop: 24, minHeight: 52, backgroundColor: COLORS.primary, borderRadius: 14, padding: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
