import React from 'react';
import Svg, { Path, Rect, Circle } from 'react-native-svg';

export default function HelpPrivacyArtwork({ privacy }) {
  return <Svg width="100%" height="100%" viewBox="0 0 120 110">
    <Path d="M87 99Q80 64 107 61Q110 86 87 99M91 101Q95 79 116 84Q111 103 91 101" fill="#ACDBCC" />
    {privacy ? <>
      <Path d="M65 8L99 22V49Q98 77 65 94Q32 77 31 49V22Z" fill="#BBDFFF" />
      <Path d="M65 14L93 26V49Q92 72 65 86Q38 72 37 49V26Z" fill="#2485EF" stroke="#0864D2" strokeWidth="3" />
      <Rect x="52" y="43" width="27" height="26" rx="6" fill="#FFFFFF" />
      <Path d="M57 43V36a8 8 0 0 1 16 0v7" fill="none" stroke="#FFFFFF" strokeWidth="5" />
      <Circle cx="65.5" cy="54" r="3" fill="#1977DF" /><Path d="M65.5 56v6" stroke="#1977DF" strokeWidth="3" />
    </> : <>
      <Path d="M48 27Q48 20 55 20H98Q105 20 105 27V57Q105 64 98 64H77L63 75V64H55Q48 64 48 57Z" fill="#4485F4" stroke="#BBD8FF" strokeWidth="3" />
      <Path d="M70 35a7 7 0 1 1 11 6q-5 2-5 7" stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" /><Circle cx="76" cy="55" r="2" fill="white" />
      <Path d="M39 15l-5-8M49 10l1-8" stroke="#FFBE29" strokeWidth="4" strokeLinecap="round" />
    </>}
    <Rect x="12" y="52" width="43" height="50" rx="7" fill="#EDF5FF" stroke="#D6E7FC" strokeWidth="2" transform="rotate(-9 34 77)" />
    <Path d="M23 66l23-3M23 77l23-3M23 88l17-2" stroke="#A9CCF9" strokeWidth="4" strokeLinecap="round" />
  </Svg>;
}
