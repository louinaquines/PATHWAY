import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, ImageBackground, Platform, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Stop, Rect, Path } from 'react-native-svg';
import { COLORS } from '../theme';
import { ChevronLeftIcon } from './Icons';
import { FONTS, useCustomFontsAvailable } from './AppText';
import PathwayMark from './PathwayMark';

const CAMPUS_IMAGE = require('../assets/pathway-campus-auth.png');
const LOGIN_HERO_IMAGE = require('../assets/pathway-login-hero.jpg');

function revealStyle(progress, inputRange, opacityRange, offset = 0) {
  if (!progress) return { opacity: 1, transform: [{ translateY: 0 }] };
  const translateRange = inputRange.map((_, index) => (index < inputRange.length - 2 ? offset : 0));
  return {
    opacity: progress.interpolate({ inputRange, outputRange: opacityRange }),
    transform: [{
      translateY: progress.interpolate({ inputRange, outputRange: translateRange }),
    }],
  };
}

export default function AuthHero({
  title,
  subtitle,
  onBack,
  startupProgress,
  startupTransition = false,
  onStartupLogoLayout,
  illustrated = false,
  guideSource,
  heroHeight,
}) {
  const { height, width } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(width);
  const insets = useSafeAreaInsets();
  const logoRef = useRef(null);
  const customFontsAvailable = useCustomFontsAvailable();
  const fallbackBody = Platform.OS === 'web' ? 'system-ui' : Platform.OS === 'android' ? 'sans-serif' : undefined;
  const fallbackHeading = Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'android' ? 'serif' : undefined;
  const progress = startupTransition ? startupProgress : null;
  // Entrance: welcome copy, then the character, fade in while rising slightly.
  const copyIn = useRef(new Animated.Value(illustrated && !startupTransition ? 0 : 1)).current;
  const guideIn = useRef(new Animated.Value(illustrated && !startupTransition ? 0 : 1)).current;
  useEffect(() => {
    if (!illustrated || startupTransition) return undefined;
    let cancelled = false;
    const run = reduce => {
      if (cancelled) return;
      if (reduce) { copyIn.setValue(1); guideIn.setValue(1); return; }
      const ease = Easing.bezier(0.22, 1, 0.36, 1);
      Animated.parallel([
        Animated.timing(copyIn, { toValue: 1, duration: 620, delay: 120, easing: ease, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(guideIn, { toValue: 1, duration: 760, delay: 280, easing: ease, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    };
    AccessibilityInfo.isReduceMotionEnabled?.().then(run).catch(() => run(false));
    return () => { cancelled = true; };
  }, [illustrated, startupTransition, copyIn, guideIn]);
  const copyEnter = { opacity: copyIn, transform: [{ translateY: copyIn.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] };
  const guideEnter = { opacity: guideIn, transform: [{ translateY: guideIn.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }] };
  const heroH = (heroHeight ?? Math.min(360, Math.max(280, height * 0.4))) + insets.top;
  const wide = measuredWidth >= 600;
  // Welcome copy sits under the logo with breathing room, scaled for phones and tablets.
  const copyTop = insets.top + 24 + 40 + Math.max(28, Math.round(heroH * 0.1));
  const backdropOpacity = progress
    ? progress.interpolate({ inputRange: [0, 0.38, 0.84, 1], outputRange: [1, 1, 0, 0] })
    : 0;
  const logoStyle = revealStyle(progress, [0, 0.88, 0.95, 1], [0, 0, 1, 1]);
  const brandStyle = revealStyle(progress, [0, 0.9, 0.96, 1], [0, 0, 1, 1]);
  const titleStyle = revealStyle(progress, [0, 0.9, 0.97, 1], [0, 0, 1, 1], 9);
  const subtitleStyle = revealStyle(progress, [0, 0.93, 0.985, 1], [0, 0, 1, 1], 7);

  const reportLogoFrame = () => {
    if (!startupTransition || !onStartupLogoLayout) return;
    requestAnimationFrame(() => {
      logoRef.current?.measureInWindow?.((x, y, width, height) => {
        onStartupLogoLayout({ x, y, width, height });
      });
    });
  };

  return (
    <ImageBackground source={illustrated ? LOGIN_HERO_IMAGE : CAMPUS_IMAGE} resizeMode="cover" onLayout={event => setMeasuredWidth(event.nativeEvent.layout.width)} style={[styles.hero, illustrated && { height: (heroHeight ?? Math.min(360, Math.max(280, height * 0.4))) + insets.top, flexShrink: 0, overflow: 'hidden' }]} imageStyle={[styles.image, illustrated && styles.heroPhoto]}>
      {illustrated ? null : <View pointerEvents="none" style={styles.tint} />}
      {illustrated && <Animated.Image source={guideSource || require('../assets/pathway-guide-thumbsup-plain-laptop.png')} style={[styles.loginGuide, guideEnter, { width: Math.min(measuredWidth * 0.62, heroH * 1.05), height: heroH * 0.82 }]} resizeMode="contain" accessible={false} />}
      <Animated.View pointerEvents="none" style={[styles.deepCover, { opacity: backdropOpacity }]} />
      <View style={[styles.content, illustrated && styles.illustratedContent, illustrated && { paddingTop: copyTop, paddingHorizontal: wide ? 48 : 26 }]}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeftIcon size={22} color="#FFFFFF" />
          </TouchableOpacity>
        ) : null}
        <View style={[styles.brandRow, illustrated && styles.illustratedBrand, illustrated && { top: insets.top + 24, left: wide ? 48 : 26 }]}>
          <Animated.View style={[styles.logoFrame, logoStyle]}>
            <View ref={logoRef} onLayout={reportLogoFrame} style={styles.logoMeasureTarget}>
              <PathwayMark size={40} decorative />
            </View>
          </Animated.View>
        <Animated.Text style={[styles.brandName, brandStyle, { fontFamily: customFontsAvailable ? FONTS.bodySemiBold : fallbackBody }]}>PATHWAY</Animated.Text>
      </View>
        <Animated.View style={illustrated ? [styles.welcomeCopy, wide && { width: '45%' }, copyEnter] : undefined}>
          <Animated.Text style={[styles.title, illustrated && styles.illustratedTitle, titleStyle, illustrated && wide && { fontSize: 46 }, { fontFamily: customFontsAvailable ? FONTS.headingBold : fallbackHeading }]}>{title}</Animated.Text>
          <Animated.Text style={[styles.subtitle, illustrated && styles.illustratedSubtitle, subtitleStyle, illustrated && wide && { fontSize: 18, lineHeight: 26 }, { fontFamily: customFontsAvailable ? FONTS.body : fallbackBody }]}>{subtitle}</Animated.Text>
        </Animated.View>
      </View>
    </ImageBackground>
  );
}

export function AuthPanel({ children, style, startupProgress, startupTransition = false }) {
  const baseStyle = StyleSheet.flatten(style) || {};
  // Keep the host component stable when startup ends: replacing Animated.View
  // with View remounts the form and makes a focused native input lose its IME.
  const animate = startupTransition && startupProgress;
  const opacity = animate ? startupProgress.interpolate({ inputRange: [0, 0.6, 0.88, 1], outputRange: [0, 0, 1, 1] }) : 1;
  const translateY = animate ? startupProgress.interpolate({ inputRange: [0, 0.6, 0.88, 1], outputRange: [34, 34, 0, 0] }) : 0;
  return (
    <Animated.View style={[baseStyle, { opacity, transform: [...(baseStyle.transform || []), { translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  illustratedContent: { flex: 1, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 26, paddingBottom: 40 },
  illustratedBrand: { position: 'absolute', left: 26, top: 28 },
  welcomeCopy: { width: '52%', alignItems: 'stretch' },
  illustratedTitle: { fontSize: 34, textShadowColor: 'rgba(0,40,110,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 6, textAlign: 'left', includeFontPadding: false, padding: 0, marginLeft: 0 },
  illustratedSubtitle: { textShadowColor: 'rgba(0,40,110,0.35)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4, width: '100%', maxWidth: '100%', fontSize: 14, lineHeight: 20, textAlign: 'left', includeFontPadding: false, padding: 0, marginLeft: 0 },
  loginGuide: { position: 'absolute', right: -18, bottom: 0 },
  hero: {
    height: 270,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'flex-end',
  },
  image: { width: '100%', height: '100%' },
  heroPhoto: { resizeMode: 'cover' },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 69, 156, 0.72)',
  },
  deepCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.primaryDeep,
  },
  content: {
    paddingTop: Platform.OS === 'ios' ? 58 : 28,
    paddingHorizontal: 26,
    paddingBottom: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    marginBottom: 10,
    transform: [{ translateY: -18 }],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 69, 156, 0.42)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logoFrame: {
    width: 40,
    height: 40,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMeasureTarget: { width: 40, height: 40 },
  brandName: { color: '#FFFFFF', fontFamily: FONTS.bodySemiBold, fontSize: 15, fontWeight: '700', letterSpacing: 2.1 },
  title: { color: '#FFFFFF', fontFamily: FONTS.headingBold, fontSize: 30, fontWeight: '700', letterSpacing: -0.45 },
  subtitle: { color: '#E6F2FF', fontFamily: FONTS.body, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 340 },
});
