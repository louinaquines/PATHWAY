import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

// Filled gradient bar for the done part, thin vertical ticks for what is left.
export default function TickProgress({ progress = 0, height = 34, accessibilityLabel, percent }) {
  const [w, setW] = useState(0);
  const p = Math.max(0, Math.min(1, progress));
  const gap = 8, tick = 3, radius = Math.round(height / 3);
  const fillW = p > 0 ? Math.max(height * 0.6, (w - gap) * p) : 0;
  const tickStart = fillW ? fillW + gap : 0;
  const ticks = [];
  for (let x = tickStart; x + tick <= w; x += tick + 7) ticks.push(x);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={{ height }} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: percent }}>
      {w > 0 && <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id="pwTickFill" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#3FB6F5" />
            <Stop offset="0.5" stopColor="#1D6FE8" />
            <Stop offset="1" stopColor="#0B4FC2" />
          </LinearGradient>
        </Defs>
        {fillW > 0 && <Rect x="0" y="0" width={Math.min(fillW, w)} height={height} rx={radius} ry={radius} fill="url(#pwTickFill)" />}
        {ticks.map(x => <Rect key={x} x={x} y={2} width={tick} height={height - 4} rx={1.5} fill="#D5DDEA" />)}
      </Svg>}
    </View>
  );
}
