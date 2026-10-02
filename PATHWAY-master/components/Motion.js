import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MOTION } from '../theme';

const MotionPreferenceContext = createContext({ reducedMotion: false, ready: false });
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

export function MotionPreferenceProvider({ children }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    const fallback = setTimeout(() => {
      if (active) setReady(true);
    }, 300);
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (active) {
          setReducedMotion(Boolean(value));
          setReady(true);
        }
      })
      .catch(() => { if (active) setReady(true); })
      .finally(() => clearTimeout(fallback));

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged', value => {
        setReducedMotion(Boolean(value));
        setReady(true);
      },
    );

    return () => {
      active = false;
      clearTimeout(fallback);
      subscription?.remove?.();
    };
  }, []);

  return (
    <MotionPreferenceContext.Provider value={{ reducedMotion, ready }}>
      {children}
    </MotionPreferenceContext.Provider>
  );
}

export function useReducedMotion() {
  return useContext(MotionPreferenceContext).reducedMotion;
}

export function useMotionPreferenceReady() {
  return useContext(MotionPreferenceContext).ready;
}

export function ScreenEntrance({ children, style, ...viewProps }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    if (reducedMotion) {
      progress.setValue(1);
      return undefined;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: MOTION.screenDuration,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion]);

  const baseStyle = StyleSheet.flatten(style) || {};
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [MOTION.screenOffset, 0],
  });

  return (
    <Animated.View
      {...viewProps}
      style={[
        baseStyle,
        {
          opacity: progress,
          transform: [...(baseStyle.transform || []), { translateY }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function MotionTouchableOpacity({
  children,
  disabled,
  onPressIn,
  onPressOut,
  style,
  ...props
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const baseStyle = StyleSheet.flatten(style) || {};

  const animateScale = value => {
    if (reducedMotion || disabled) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      speed: MOTION.pressSpeed,
      bounciness: 0,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <AnimatedTouchableOpacity
      {...props}
      disabled={disabled}
      style={[baseStyle, { transform: [...(baseStyle.transform || []), { scale }] }]}
      onPressIn={event => {
        animateScale(MOTION.pressScale);
        onPressIn?.(event);
      }}
      onPressOut={event => {
        animateScale(1);
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedTouchableOpacity>
  );
}
