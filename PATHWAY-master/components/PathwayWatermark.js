import React from 'react';
import { StyleSheet, View } from 'react-native';
import PathwayMark from './PathwayMark';

export default function PathwayWatermark({ size = 176, opacity = 0.055, style }) {
  return (
    <View pointerEvents="none" style={styles.clip}>
      <PathwayMark decorative size={size} style={[styles.mark, { opacity }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  mark: { position: 'absolute' },
});
