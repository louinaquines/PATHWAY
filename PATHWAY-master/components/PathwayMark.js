import React from 'react';
import { Animated, Image } from 'react-native';

const PATHWAY_LOGO = require('../assets/pathway-logo-2026-cutout.png');

/** Shared rendering for the approved PATHWAY logo artwork. */
export default function PathwayMark({ size = 224, pReveal, decorative = false, style }) {
  const pScale = pReveal?.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) || 1;

  return (
    <Animated.View
      pointerEvents={decorative ? 'none' : 'auto'}
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : 'PATHWAY logo'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[{ width: size, height: size, opacity: pReveal || 1, backgroundColor: 'transparent', transform: [{ scale: pScale }] }, style]}
    >
      <Image
        accessible={false}
        source={PATHWAY_LOGO}
        resizeMode="contain"
        style={{ width: '100%', height: '100%' }}
      />
    </Animated.View>
  );
}
