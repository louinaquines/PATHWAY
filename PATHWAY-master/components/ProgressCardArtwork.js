import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, G } from 'react-native-svg';

// Decorative vectors only: all status and metric text stays in the real card.
export default function ProgressCardArtwork({ kind }) {
  const id = `progress-art-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (kind === 'requirements') return <Svg width="100%" height="100%" viewBox="0 0 240 100" accessible={false}>
    <Path d="M0 100 L88 7 Q96 0 104 8 L199 100Z" fill="#CBF5E5" opacity="0.65" />
    <Path d="M83 100 C91 72 119 30 155 20 C172 53 162 80 142 100Z" fill="#E1F9EF" />
    <Path d="M116 92 C97 79 94 58 100 43 C117 51 123 68 116 92 M125 100 C126 78 140 64 153 65 C153 82 143 96 125 100" fill="#AEECD5" opacity="0.65" />
    <Path d="M164 100 C165 83 180 75 193 78 C189 92 181 97 164 100" fill="#BCEFDA" opacity="0.6" />
  </Svg>;
  if (kind === 'journal') return <Svg width="100%" height="100%" viewBox="0 0 150 110" accessible={false}>
    <G transform="rotate(-10 75 55)">
      <Rect x="40" y="10" width="83" height="111" rx="10" fill="#E6C779" />
      <Rect x="25" y="3" width="83" height="111" rx="10" fill="#F6E5B5" />
      <Rect x="25" y="3" width="12" height="111" rx="6" fill="#EDD595" />
      <Path d="M48 32 H91 M48 49 H88 M48 66 H79" stroke="#D9B75D" strokeWidth="6" strokeLinecap="round" />
    </G>
  </Svg>;
  return <Svg width="100%" height="100%" viewBox="0 0 140 130" accessible={false}>
    <Defs>
      <LinearGradient id={`${id}-paper`} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#E3EFFF" /></LinearGradient>
      <LinearGradient id={`${id}-bar`} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor="#58B9FF" /><Stop offset="1" stopColor="#086BD8" /></LinearGradient>
      <LinearGradient id={`${id}-light`} x1="0%" y1="0%" x2="100%" y2="100%"><Stop offset="0" stopColor="#C8E9FF" /><Stop offset="1" stopColor="#68B5F6" /></LinearGradient>
    </Defs>
    <G transform="rotate(-8 72 69)">
      <Rect x="33" y="14" width="91" height="117" rx="13" fill="#B9D1F7" opacity="0.25" />
      <Rect x="27" y="10" width="91" height="117" rx="13" fill={`url(#${id}-paper)`} stroke="#E1EDFC" strokeWidth="1.5" />
      <Path d="M43 31 H72 M43 43 H65" stroke="#C8DDFC" strokeWidth="6" strokeLinecap="round" />
      <Rect x="42" y="88" width="14" height="22" rx="5" fill="#BED8FA" opacity="0.4" transform="translate(2 3)" />
      <Rect x="64" y="65" width="14" height="45" rx="5" fill="#BED8FA" opacity="0.4" transform="translate(2 3)" />
      <Rect x="86" y="40" width="14" height="70" rx="5" fill="#BED8FA" opacity="0.4" transform="translate(2 3)" />
      <Rect x="42" y="88" width="14" height="22" rx="5" fill={`url(#${id}-light)`} />
      <Rect x="64" y="65" width="14" height="45" rx="5" fill={`url(#${id}-bar)`} opacity="0.7" />
      <Rect x="86" y="40" width="14" height="70" rx="5" fill={`url(#${id}-bar)`} />
    </G>
  </Svg>;
}
