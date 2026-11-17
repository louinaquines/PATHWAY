import React, { useId } from 'react';
import Svg, { Defs, LinearGradient, Stop, Path, Rect, Circle, G } from 'react-native-svg';

export default function LogsCalendarArtwork() {
  const id = `calendar-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <Svg width="100%" height="100%" viewBox="0 0 140 130" accessible={false}>
    <Defs>
      <LinearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#8AB5FF" /><Stop offset="1" stopColor="#4568DA" /></LinearGradient>
      <LinearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#FFFFFF" /><Stop offset="1" stopColor="#DCE8FE" /></LinearGradient>
    </Defs>
    <Path d="M102 114 C94 75 107 42 130 37 C134 66 124 95 102 114" fill="#AFD8C8" />
    <Path d="M108 120 C115 91 126 78 139 80 C139 100 128 117 108 120" fill="#C0DECD" />
    <Path d="M30 120 C14 107 9 87 16 72 C32 84 38 103 30 120" fill="#B2D7C6" />
    <G transform="rotate(9 72 78)">
      <Rect x="29" y="46" width="82" height="76" rx="11" fill="#CFDAF5" opacity="0.5" />
      <Rect x="25" y="41" width="82" height="76" rx="10" fill={`url(#${id}-paper)`} stroke="#D4DFF5" strokeWidth="2" />
      <Path d="M35 41 H97 Q107 41 107 51 V64 H25 V51 Q25 41 35 41" fill={`url(#${id}-blue)`} />
      <Rect x="39" y="30" width="7" height="26" rx="3.5" fill="#F9FCFF" stroke="#C5D9F5" strokeWidth="2" />
      <Rect x="85" y="30" width="7" height="26" rx="3.5" fill="#F9FCFF" stroke="#C5D9F5" strokeWidth="2" />
      <Rect x="37" y="75" width="13" height="12" rx="3" fill="#DFE8FA" />
      <Rect x="60" y="75" width="13" height="12" rx="3" fill="#DCE7FB" />
      <Rect x="83" y="75" width="13" height="12" rx="3" fill="#E2EAFB" />
      <Rect x="37" y="95" width="13" height="12" rx="3" fill="#E0E9FB" />
      <Circle cx="66.5" cy="101" r="6" fill="#F5BD32" />
      <Rect x="83" y="95" width="13" height="12" rx="3" fill="#E2EAFB" />
    </G>
    <Path d="M108 23 L113 8 M122 29 L132 17" stroke="#F7C12C" strokeWidth="6" strokeLinecap="round" />
  </Svg>;
}
