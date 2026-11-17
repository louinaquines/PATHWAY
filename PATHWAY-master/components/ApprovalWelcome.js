import React, { useEffect, useRef } from 'react';
import { Animated, Image, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import { CheckCircleIcon, ArrowRightIcon } from './Icons';
import { useReducedMotion } from './Motion';
import { COLORS } from '../theme';
import StudentSurface from './StudentSurface';

export default function ApprovalWelcome({ onComplete }) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const characterSize = Math.max(100, Math.min(210, width - 120, height * 0.25));
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
    <ScrollView contentContainerStyle={styles.centerStage} showsVerticalScrollIndicator={false}>
    <Animated.View style={[styles.content, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 18, 0] }) }] }]}>
      <View style={styles.card}>
      <View style={styles.illustration}>
        <StudentSurface tone="welcome" waves />
        <Image source={require('../assets/pathway-guide-progress.png')} style={{ width: characterSize, height: characterSize }} resizeMode="contain" accessible={false} />
      </View>
      <View style={styles.approvedBadge}><CheckCircleIcon size={15} color={COLORS.successDark} /><Text style={styles.badgeText}>Approved</Text></View>
      <Text style={styles.eyebrow}>PRE-DEPLOYMENT APPROVED</Text>
      <Text variant="heading" accessibilityRole="header" style={styles.title}>You’re ready to begin</Text>
      <Text style={styles.message}>Your coordinator approved your pre-deployment submission. Your OJT dashboard is now unlocked.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onComplete} style={styles.button}><Text style={styles.buttonText}>Open my dashboard</Text><ArrowRightIcon size={18} color="#FFF" /></TouchableOpacity>
      </View>
    </Animated.View>
    </ScrollView>
    </View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F9FE' },
  layout: { flex: 1 },
  brandHeader: { paddingTop: 16, paddingHorizontal: 24, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  centerStage: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  content: { width: '100%', maxWidth: 440, padding: 22, alignItems: 'center' },
  brand: { fontSize: 12, letterSpacing: 3, fontWeight: '700', color: COLORS.primary },
  card: { width: '100%', padding: 22, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 26, borderWidth: 1, borderColor: '#E2EAF4', overflow: 'hidden' },
  illustration: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'flex-end', borderRadius: 20, overflow: 'hidden', marginBottom: 18, paddingTop: 12 },
  approvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.successLight, marginBottom: 14 },
  badgeText: { fontSize: 12, fontWeight: '600', color: COLORS.successDark },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: '700', color: COLORS.successDark, textAlign: 'center', marginBottom: 12 },
  title: { fontSize: 25, lineHeight: 32, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 22, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  button: { marginTop: 24, minHeight: 52, backgroundColor: COLORS.primary, borderRadius: 14, padding: 14, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
