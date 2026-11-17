import React from 'react';
import { View, Image } from 'react-native';

export default function StudentGuidePose({ pose = 1, size = 150, extraWidth = 0 }) {
  const inset = pose === 1 ? size * 0.12 : 0;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size - inset * 2 + extraWidth, height: size, overflow: 'hidden' }}>
    <Image source={require('../assets/pathway-guide-poses.png')} resizeMode="stretch" style={{ position: 'absolute', width: size * 3, height: size, left: -size * pose - inset, top: 0 }} />
  </View>;
}
