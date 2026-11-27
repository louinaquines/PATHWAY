// components/AnimatedGuide.js
// One motion for every feedback character in the student app.
// error: pops in, small head-shake, then sways. success: pops in, happy hop, then sways.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import { useReducedMotion } from './Motion';

const SOURCES = {
  error: require('../assets/pathway-guide-error.png'),
  success: require('../assets/pathway-guide-success.png'),
};

export default function AnimatedGuide({ tone = 'success', style }) {
  const reduced = useReducedMotion();
  const native = Platform.OS !== 'web';
  const pop = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) { pop.setValue(1); return undefined; }
    pop.setValue(0); sway.setValue(0); hop.setValue(0);
    const t = (value, toValue, duration, easing) => Animated.timing(value, { toValue, duration, easing, useNativeDriver: native });
    const accent = tone === 'error'
      ? Animated.sequence([-1, 1, -0.6, 0.6, 0].map(v => t(sway, v, 90)))
      : Animated.sequence([t(hop, 1, 180, Easing.out(Easing.quad)), t(hop, 0, 260, Easing.bounce)]);
    const idle = Animated.loop(Animated.sequence([
      t(sway, 0.35, 1100, Easing.inOut(Easing.sin)),
      t(sway, -0.35, 1100, Easing.inOut(Easing.sin)),
    ]));
    const run = Animated.sequence([Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: native }), accent, idle]);
    run.start();
    return () => run.stop();
  }, [tone, reduced, pop, sway, hop, native]);
  const rotate = sway.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] });
  const swayY = sway.interpolate({ inputRange: [-1, 0, 1], outputRange: [-3, 0, -3] });
  const hopY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  return <Animated.Image source={SOURCES[tone] || SOURCES.success} resizeMode="contain" accessible={false}
    style={[style, { opacity: pop, transform: [
      { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
      { translateY: Animated.add(swayY, hopY) }, { rotate },
    ] }]} />;
}
