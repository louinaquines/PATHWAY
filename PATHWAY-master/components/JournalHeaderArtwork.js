import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export default function JournalHeaderArtwork() {
  return <Svg width="100%" height="100%" viewBox="0 0 120 100">
    <Path d="M30 94Q7 76 17 62Q35 70 30 94M91 94Q86 67 111 63Q112 86 91 94" fill="#94D8C4" />
    <Rect x="33" y="20" width="57" height="73" rx="8" fill="#D8E9FF" transform="rotate(-12 60 56)" />
    <Rect x="29" y="16" width="57" height="73" rx="8" fill="#FFFFFF" stroke="#E0ECFC" strokeWidth="2" transform="rotate(-12 60 56)" />
    <Path d="M42 35l27-6M44 47l27-6M47 59l22-5M49 71l17-4" stroke="#A7CDFF" strokeWidth="4" strokeLinecap="round" />
    <Circle cx="91" cy="76" r="19" fill="#76A6FF" /><Circle cx="91" cy="76" r="13" fill="#F8FBFF" />
    <Path d="M91 67v10l5 4" stroke="#267CEC" strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M88 14l2-10M99 22l9-5" stroke="#FFBE29" strokeWidth="4" strokeLinecap="round" />
  </Svg>;
}
