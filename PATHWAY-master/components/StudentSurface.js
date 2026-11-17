import React, { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Rect, Path } from 'react-native-svg';
const styles = { surfaceArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' } };

// Vector washes stay sharp on native and web without baking text/data into a screenshot.
export default function StudentSurface({ tone = 'blue', waves = false, ambient = false }) {
  const id = `home-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const colors = tone === 'welcome' ? ['#EAF4FF', '#D8E9FF']
    : tone === 'mint' ? ['#FFFFFF', '#EAFBF3']
    : tone === 'gold' ? ['#FFFEFA', '#FFF8E9']
    : tone === 'peach' ? ['#FFFFFF', '#FFF2E4']
    : tone === 'page' ? ['#FFFFFF', '#F5F8FF'] : ['#FFFFFF', '#F1F6FF'];
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.surfaceArtwork}>
    <Svg width="100%" height="100%" viewBox="0 0 600 260" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={`${id}-wash`} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor={colors[0]} /><Stop offset="1" stopColor={colors[1]} /></LinearGradient>
        <RadialGradient id={`${id}-glow`} cx="15%" cy="25%" rx="80%" ry="90%"><Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" /><Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></RadialGradient>
        <LinearGradient id={`${id}-wave`} x1="0%" y1="0%" x2="100%" y2="70%"><Stop offset="0" stopColor="#DFEBFF" stopOpacity="0" /><Stop offset="1" stopColor="#DBE9FF" stopOpacity="0.55" /></LinearGradient>
        {ambient && <RadialGradient id={`${id}-ambient`} cx="82%" cy="48%" rx="66%" ry="49%"><Stop offset="0" stopColor="#CFE4FF" stopOpacity="0.65" /><Stop offset="0.55" stopColor="#E8F2FF" stopOpacity="0.35" /><Stop offset="1" stopColor="#E8F2FF" stopOpacity="0" /></RadialGradient>}
      </Defs>
      {ambient ? <Rect width="600" height="260" fill={`url(#${id}-ambient)`} /> : <>
        <Rect width="600" height="260" fill={`url(#${id}-wash)`} />
        <Rect width="600" height="260" fill={`url(#${id}-glow)`} />
      </>}
      {waves && <>
        {tone === 'welcome' && <Path d="M0 260 L0 218 C85 205 134 146 206 139 C280 132 315 183 381 151 C450 118 480 45 539 55 C566 60 585 80 600 86 L600 260 Z" fill="#BBD7FF" opacity="0.48" />}
        <Path d="M100 260 C270 255 326 185 420 150 C487 123 532 94 600 106 L600 260 Z" fill={`url(#${id}-wave)`} />
        <Path d="M260 260 C400 247 423 203 463 171 C510 130 558 120 600 130 L600 260 Z" fill="#DCEAFF" opacity="0.42" />
        <Path d="M363 260 C474 246 487 223 522 207 C551 192 580 191 600 196 L600 260 Z" fill="#F8FBFF" opacity="0.85" />
      </>}
    </Svg>
  </View>;
}

