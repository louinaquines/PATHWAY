import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from './AppText';
import { COLORS } from '../theme';

export default function PlacementDateField({ label, value, onChangeText, editable, half, minimumDate }) {
  return <View style={[styles.wrap, half && { flex: 1 }]}>
    <Text style={styles.label}>{label}</Text>
    <input type="date" aria-label={label} disabled={!editable} value={value || ''} min={minimumDate || undefined}
      onClick={event => { try { event.currentTarget.showPicker?.(); } catch (_) { /* Browser provides its own date control. */ } }}
      onChange={event => onChangeText(event.target.value)}
      style={{ boxSizing: 'border-box', width: '100%', minHeight: 46, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '10px 12px', fontFamily: 'inherit', color: COLORS.textPrimary, background: '#FFF', cursor: editable ? 'pointer' : 'default' }} />
  </View>;
}
const styles = StyleSheet.create({ wrap: { marginBottom: 14 }, label: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700', marginBottom: 7 } });
