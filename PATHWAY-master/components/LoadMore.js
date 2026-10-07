import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { MotionTouchableOpacity } from './Motion';
import { AppText as Text } from './AppText';
import { COLORS } from '../theme';

export default function LoadMore({ onPress, loading, hasMore, error, label = 'Load more' }) {
  if (!hasMore && !error) return null;
  return <View style={{ alignItems: 'center', marginVertical: 12, gap: 8 }}>
    {!!error && <Text accessibilityRole="alert" style={{ color: COLORS.dangerDark, fontSize: 12, textAlign: 'center' }}>{error}</Text>}
    <MotionTouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: loading, busy: loading }} disabled={loading} onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {loading && <ActivityIndicator size="small" color={COLORS.primary} />}
      <Text style={{ color: COLORS.primary, fontWeight: '600', fontSize: 13 }}>{loading ? 'Loading…' : error ? 'Try again' : label}</Text>
    </MotionTouchableOpacity>
  </View>;
}
