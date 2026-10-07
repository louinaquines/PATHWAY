import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { registerStudentSuccess } from '../services/studentSuccess';
import { MotionTouchableOpacity, useReducedMotion } from './Motion';
import { AppText as Text } from './AppText';
import { CheckCircleIcon } from './Icons';
import { COLORS } from '../theme';

export default function StudentSuccessHost() {
  const [feedback, setFeedback] = useState(null);
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const opening = useRef(null);
  useEffect(() => {
    const unregister = registerStudentSuccess(value => {
      clearTimeout(opening.current);
      // Let a submission form finish closing before opening the feedback modal.
      opening.current = setTimeout(() => setFeedback({ ...value, key: Date.now() }), 150);
    });
    return () => { unregister(); clearTimeout(opening.current); };
  }, []);
  useEffect(() => {
    if (!feedback) return undefined;
    progress.setValue(reducedMotion ? 1 : 0);
    const animation = Animated.spring(progress, {
      toValue: 1, damping: 18, stiffness: 160, mass: 1,
      useNativeDriver: Platform.OS !== 'web',
    });
    if (!reducedMotion) animation.start();
    const timer = setTimeout(() => setFeedback(null), 2400);
    return () => { clearTimeout(timer); animation.stop(); };
  }, [feedback, reducedMotion, progress]);
  const close = () => setFeedback(null);
  return (
    <Modal visible={!!feedback} transparent animationType="none" onRequestClose={close}>
      <SafeAreaView style={styles.overlay}>
        <Animated.View style={[styles.card, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.body}>
            <Animated.View style={{ transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] }}>
              <CheckCircleIcon size={64} color={COLORS.successDark} />
            </Animated.View>
            <Text accessibilityRole="header" style={styles.title}>{feedback?.title}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.message}>{feedback?.message}</Text>
          </ScrollView>
          <MotionTouchableOpacity style={styles.button} onPress={close} accessibilityRole="button" accessibilityLabel="Continue">
            <Text style={styles.buttonText}>Continue</Text>
          </MotionTouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.35)' },
  card: { width: '100%', maxWidth: 360, maxHeight: '80%', borderRadius: 24, padding: 24, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  body: { alignItems: 'center', paddingVertical: 12 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', color: COLORS.textPrimary, marginTop: 20 },
  message: { fontSize: 15, lineHeight: 22, textAlign: 'center', color: COLORS.textSecondary, marginTop: 10 },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
