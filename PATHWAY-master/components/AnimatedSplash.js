import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import { COLORS } from '../theme';
import { useMotionPreferenceReady, useReducedMotion } from './Motion';
import { AppText as Text } from './AppText';
import PathwayWatermark from './PathwayWatermark';
import PathwayMark from './PathwayMark';

export default function AnimatedSplash({
  appReady,
  destination,
  progress: sharedProgress,
  targetFrame,
  onComplete,
}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const preferenceReady = useMotionPreferenceReady();
  const rootRef = useRef(null);
  const [rootFrame, setRootFrame] = useState(null);
  const [rootMeasured, setRootMeasured] = useState(false);
  const [revealReady, setRevealReady] = useState(false);
  const localProgress = useRef(new Animated.Value(0)).current;
  const progress = sharedProgress || localProgress;
  const completed = useRef(false);
  const transitionStarted = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const needsLogoTarget = destination === 'Login';
  const hasLogoTarget = !needsLogoTarget || Boolean(targetFrame && rootFrame && rootMeasured);

  const measureRoot = () => {
    rootRef.current?.measureInWindow?.((x, y, measuredWidth, measuredHeight) => {
      setRootFrame(current => {
        const measured = { x, y, width: measuredWidth, height: measuredHeight };
        if (
          current
          && Math.abs(current.x - measured.x) < 0.5
          && Math.abs(current.y - measured.y) < 0.5
          && Math.abs(current.width - measured.width) < 0.5
          && Math.abs(current.height - measured.height) < 0.5
        ) return current;
        return measured;
      });
      setRootMeasured(true);
    });
  };

  const handleRootLayout = event => {
    const { width, height } = event.nativeEvent.layout;
    setRootFrame(current => current || { x: 0, y: 0, width, height });
    if (rootRef.current?.measureInWindow) requestAnimationFrame(measureRoot);
    else setRootMeasured(true);
  };

  useEffect(() => {
    if (!preferenceReady) return undefined;
    if (reducedMotion) {
      progress.setValue(0.24);
      setRevealReady(true);
      return undefined;
    }

    progress.setValue(0);
    const reveal = Animated.timing(progress, {
      toValue: 0.24,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    reveal.start(({ finished }) => {
      if (finished) setRevealReady(true);
    });
    return () => reveal.stop();
  }, [preferenceReady, progress, reducedMotion]);

  useEffect(() => {
    if (!preferenceReady || !revealReady || !appReady || !hasLogoTarget || transitionStarted.current) return undefined;
    transitionStarted.current = true;

    if (reducedMotion) {
      progress.setValue(1);
      completed.current = true;
      onCompleteRef.current?.();
      return undefined;
    }

    const transition = Animated.timing(progress, {
      toValue: 1,
      duration: needsLogoTarget ? 1420 : 390,
      easing: needsLogoTarget ? Easing.linear : Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    transition.start(({ finished }) => {
      if (!finished || completed.current) return;
      completed.current = true;
      onCompleteRef.current?.();
    });
    return () => transition.stop();
  }, [appReady, hasLogoTarget, needsLogoTarget, preferenceReady, progress, reducedMotion, revealReady]);

  const width = rootFrame?.width || windowWidth;
  const height = rootFrame?.height || windowHeight;
  const logoSize = Math.min(224, Math.max(176, width * 0.56));
  const targetSize = targetFrame?.width || 34;
  const startLeft = (width - logoSize) / 2;
  const startTop = (height - logoSize - 48) / 2;
  const targetLeft = targetFrame && rootFrame ? targetFrame.x - rootFrame.x : startLeft;
  const targetTop = targetFrame && rootFrame ? targetFrame.y - rootFrame.y : startTop;

  const logoLeft = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.24, 0.48, 0.88, 1], outputRange: [startLeft, startLeft, startLeft, targetLeft, targetLeft] })
    : progress.interpolate({ inputRange: [0, 0.24, 0.7, 1], outputRange: [startLeft, startLeft, startLeft, startLeft] });
  const logoTop = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.24, 0.48, 0.88, 1], outputRange: [startTop, startTop, startTop, targetTop, targetTop] })
    : progress.interpolate({ inputRange: [0, 0.24, 0.7, 1], outputRange: [startTop, startTop, startTop, startTop] });
  const logoWidth = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.34, 0.52, 0.88, 1], outputRange: [logoSize * 0.88, logoSize * 1.02, logoSize, logoSize, targetSize, targetSize, targetSize] })
    : progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.72, 1], outputRange: [logoSize * 0.88, logoSize * 1.02, logoSize, logoSize, logoSize * 0.82] });
  const logoHeight = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.34, 0.52, 0.88, 1], outputRange: [logoSize * 0.88, logoSize * 1.02, logoSize, logoSize, targetSize, targetSize, targetSize] })
    : progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.72, 1], outputRange: [logoSize * 0.88, logoSize * 1.02, logoSize, logoSize, logoSize * 0.82] });
  const logoOpacity = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.04, 0.12, 1], outputRange: [0, 1, 1, 1] })
    : progress.interpolate({ inputRange: [0, 0.04, 0.12, 0.64, 0.92, 1], outputRange: [0, 1, 1, 1, 0, 0] });
  const logoRadius = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.24, 0.52, 0.88, 1], outputRange: [42, 42, 9, 9, 9] })
    : 42;
  const backdropOpacity = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.24, 0.38, 0.84, 1], outputRange: [1, 1, 0.94, 0, 0] })
    : progress.interpolate({ inputRange: [0, 0.24, 0.32, 0.9, 1], outputRange: [1, 1, 0.9, 0, 0] });
  const wordmarkOpacity = needsLogoTarget
    ? progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.36, 0.52], outputRange: [0, 1, 1, 0.85, 0] })
    : progress.interpolate({ inputRange: [0, 0.12, 0.24, 0.74, 0.96], outputRange: [0, 1, 1, 0.8, 0] });
  const wordmarkOffset = progress.interpolate({ inputRange: [0, 0.24], outputRange: [8, 0] });
  const sweepX = progress.interpolate({ inputRange: [0, 0.04, 0.12, 0.21, 0.27], outputRange: [-width, -width, 0, width, width] });
  const sweepOpacity = progress.interpolate({ inputRange: [0, 0.04, 0.1, 0.18, 0.25, 0.28], outputRange: [0, 0, 0.88, 0.55, 0, 0] });
  const logoCenterY = startTop + logoSize / 2;

  return (
    <View
      ref={rootRef}
      onLayout={handleRootLayout}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityLabel="PATHWAY starting"
      style={styles.root}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDeep} />
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <PathwayWatermark size={340} opacity={0.028} style={{ right: -150, top: -135 }} />

      <Animated.View
        pointerEvents="none"
        style={[styles.sweepGlow, { top: logoCenterY - 6, opacity: sweepOpacity, transform: [{ translateX: sweepX }] }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.sweepCore, { top: logoCenterY - 1, opacity: sweepOpacity, transform: [{ translateX: sweepX }] }]}
      />

      <Animated.View
        accessible={false}
        pointerEvents="none"
        style={[
          styles.logoTile,
          {
            left: logoLeft,
            top: logoTop,
            width: logoWidth,
            height: logoHeight,
            borderRadius: logoRadius,
            opacity: logoOpacity,
          },
        ]}
      >
        <PathwayMark size="100%" decorative />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.wordmarkFrame, { top: startTop + logoSize + 18, opacity: wordmarkOpacity, transform: [{ translateY: wordmarkOffset }] }]}>
        <Text style={styles.wordmark}>PATHWAY</Text>
        <Text style={styles.tagline}>STUDENT OJT PORTAL</Text>
      </Animated.View>
    </View>
  );
}

export function StartupMarkHold() {
  const { width } = useWindowDimensions();
  const size = Math.min(224, Math.max(176, width * 0.56));
  return (
      <View style={styles.holdRoot}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDeep} />
      <PathwayWatermark size={340} opacity={0.028} style={{ right: -150, top: -135 }} />
      <PathwayMark size={size} decorative style={styles.holdLogoTile} />
      <Text style={styles.wordmark}>PATHWAY</Text>
      <Text style={styles.tagline}>STUDENT OJT PORTAL</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primaryDeep,
  },
  logoTile: {
    position: 'absolute',
  },

  sweepGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: 'rgba(16,184,254,0.3)',
  },
  sweepCore: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: COLORS.brandYellow,
  },
  wordmarkFrame: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  wordmark: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
  },
  tagline: {
    color: '#BFDFFF',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.2,
    textAlign: 'center',
    marginTop: 8,
  },
  holdRoot: {
    flex: 1,
    backgroundColor: COLORS.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdLogoTile: {
    marginBottom: 18,
  },
});
