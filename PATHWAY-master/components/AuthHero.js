import React, { useRef } from 'react';
import { Animated, ImageBackground, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';
import { ChevronLeftIcon } from './Icons';
import PathwayWatermark from './PathwayWatermark';
import { FONTS, useCustomFontsAvailable } from './AppText';
import PathwayMark from './PathwayMark';

const CAMPUS_IMAGE = require('../assets/pathway-campus-auth.png');

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
}) {
  const logoRef = useRef(null);
  const customFontsAvailable = useCustomFontsAvailable();
  const fallbackBody = Platform.OS === 'web' ? 'system-ui' : Platform.OS === 'android' ? 'sans-serif' : undefined;
  const fallbackHeading = Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'android' ? 'serif' : undefined;
  const progress = startupTransition ? startupProgress : null;
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
    <ImageBackground source={CAMPUS_IMAGE} resizeMode="cover" style={styles.hero} imageStyle={styles.image}>
      <View pointerEvents="none" style={styles.tint} />
      <Animated.View pointerEvents="none" style={[styles.deepCover, { opacity: backdropOpacity }]} />
      <PathwayWatermark size={224} opacity={0.055} style={{ right: -72, top: -34 }} />
      <View style={styles.content}>
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
        <View style={styles.brandRow}>
          <Animated.View style={[styles.logoTile, logoStyle]}>
            <View ref={logoRef} onLayout={reportLogoFrame} style={styles.logoMeasureTarget}>
              <PathwayMark size={34} decorative />
            </View>
          </Animated.View>
        <Animated.Text style={[styles.brandName, brandStyle, { fontFamily: customFontsAvailable ? FONTS.bodySemiBold : fallbackBody }]}>PATHWAY</Animated.Text>
      </View>
        <Animated.Text style={[styles.title, titleStyle, { fontFamily: customFontsAvailable ? FONTS.headingBold : fallbackHeading }]}>{title}</Animated.Text>
        <Animated.Text style={[styles.subtitle, subtitleStyle, { fontFamily: customFontsAvailable ? FONTS.body : fallbackBody }]}>{subtitle}</Animated.Text>
      </View>
    </ImageBackground>
  );
}

export function AuthPanel({ children, style, startupProgress, startupTransition = false }) {
  const baseStyle = StyleSheet.flatten(style) || {};
  if (!startupTransition || !startupProgress) {
    return <View style={baseStyle}>{children}</View>;
  }

  const opacity = startupProgress.interpolate({ inputRange: [0, 0.6, 0.88, 1], outputRange: [0, 0, 1, 1] });
  const translateY = startupProgress.interpolate({ inputRange: [0, 0.6, 0.88, 1], outputRange: [34, 34, 0, 0] });
  return (
    <Animated.View style={[baseStyle, { opacity, transform: [...(baseStyle.transform || []), { translateY }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  hero: {
    height: 270,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'flex-end',
  },
  image: { width: '100%', height: '100%' },
  tint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 24, 50, 0.72)',
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
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(4, 24, 50, 0.38)',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  logoTile: {
    width: 34,
    height: 34,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMeasureTarget: { width: 34, height: 34 },
  brandName: { color: '#FFFFFF', fontFamily: FONTS.bodySemiBold, fontSize: 15, fontWeight: '700', letterSpacing: 2.1 },
  title: { color: '#FFFFFF', fontFamily: FONTS.headingBold, fontSize: 30, fontWeight: '700', letterSpacing: -0.45 },
  subtitle: { color: '#E6F2FF', fontFamily: FONTS.body, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 340 },
});
