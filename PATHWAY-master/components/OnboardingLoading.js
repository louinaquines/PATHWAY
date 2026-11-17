import React, { useEffect, useRef } from 'react';
import { Animated, Image, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from './AppText';
import { useReducedMotion } from './Motion';
import { markOnboardingCompleted } from '../services/onboardingStorage';

export default function OnboardingLoading({ navigation }) {
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const opacity = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const size = Math.min(300, width - 56, height * 0.43);

  useEffect(() => {
    let active = true;
    let holdTimer;
    const driver = Platform.OS !== 'web';
    const floating = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1200, useNativeDriver: driver }),
      Animated.timing(float, { toValue: 0, duration: 1200, useNativeDriver: driver }),
    ]));
    if (!reducedMotion) floating.start();
    const reveal = new Promise(resolve => Animated.timing(opacity, {
      toValue: 1, duration: reducedMotion ? 0 : 300, useNativeDriver: driver,
    }).start(resolve));
    const save = markOnboardingCompleted().catch(() => {
      // Saving a local first-run flag must never block sign-in.
    });
    const minimumDisplay = new Promise(resolve => {
      holdTimer = setTimeout(resolve, reducedMotion ? 3000 : 2740);
    });
    Promise.all([reveal, save, minimumDisplay]).then(() => {
      if (!active) return;
      Animated.timing(opacity, { toValue: 0, duration: reducedMotion ? 0 : 260, useNativeDriver: driver }).start(() => {
        if (active) navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      });
    });
    return () => { active = false; clearTimeout(holdTimer); floating.stop(); opacity.stopAnimation(); };
  }, [navigation, reducedMotion, opacity, float]);

  return <SafeAreaView style={styles.screen}>
    <Animated.View style={[styles.center, { opacity }]} accessibilityLiveRegion="polite">
      <Animated.View style={{ transform: [{ translateY: reducedMotion ? 0 : float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }] }}>
        <Image source={require('../assets/pathway-guide-headphones.png')} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />
      </Animated.View>
      <Text style={styles.title}>Getting things ready…</Text>
      <View style={styles.dots} accessible={false}>{[0, 1, 2].map(index => <Animated.View key={index} style={[styles.dot, { opacity: reducedMotion ? 0.7 : float.interpolate({ inputRange: [0, 0.5, 1], outputRange: index === 1 ? [0.4, 1, 0.4] : [1, 0.4, 1] }) }]} />)}</View>
    </Animated.View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  center: { alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', color: '#10213D', marginTop: 24, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 9, marginTop: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#1685FF' },
});
