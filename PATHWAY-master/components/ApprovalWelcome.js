import React, { useEffect, useRef } from 'react';
import { Animated, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import PathwayMark from './PathwayMark';
import { CheckCircleIcon } from './Icons';
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
    <Animated.View style={[styles.content, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 0 : 18, 0] }) }] }]}>
      <PathwayMark size={112} />
      <Text style={styles.brand}>PATHWAY</Text>
      <View style={styles.check}><CheckCircleIcon size={32} color={COLORS.successDark} /></View>
      <Text variant="heading" accessibilityRole="header" style={styles.title}>You’re ready to begin</Text>
      <Text style={styles.message}>Your coordinator approved your pre-deployment submission. Your OJT dashboard is now unlocked.</Text>
      <TouchableOpacity accessibilityRole="button" onPress={onComplete} style={styles.button}><Text style={styles.buttonText}>Open my dashboard</Text></TouchableOpacity>
    </Animated.View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F9FE', justifyContent: 'center', alignItems: 'center' },
  content: { width: '100%', maxWidth: 440, padding: 28, alignItems: 'center' },
  brand: { fontSize: 13, letterSpacing: 4, fontWeight: '700', color: COLORS.primary, marginTop: 18 },
  check: { marginTop: 40, marginBottom: 20, padding: 16, borderRadius: 22, backgroundColor: COLORS.successLight },
  title: { fontSize: 30, color: COLORS.textPrimary, textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 24, color: COLORS.textSecondary, textAlign: 'center', marginTop: 12 },
  button: { marginTop: 28, minHeight: 48, backgroundColor: COLORS.primary, borderRadius: 14, padding: 16, alignSelf: 'stretch', alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
});
