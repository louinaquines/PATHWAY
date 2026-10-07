import React, { useState } from 'react';
import { Keyboard, Modal, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { AppText as Text } from './AppText';
import { CalendarIcon } from './Icons';
import { COLORS } from '../theme';
import { parseCalendarDate, calendarDateValue } from '../services/calendarDate';

export default function PlacementDateField({ label, value, onChangeText, editable, half, minimumDate }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(new Date());
  const minimum = parseCalendarDate(minimumDate);
  const choose = () => {
    Keyboard.dismiss();
    let initial = parseCalendarDate(value) || new Date();
    if (minimum && initial < minimum) initial = minimum;
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: initial, mode: 'date', minimumDate: minimum || undefined,
        onChange: (event, date) => { if (event.type === 'set' && date) onChangeText(calendarDateValue(date)); } });
    } else { setDraft(initial); setOpen(true); }
  };
  return <View style={[styles.wrap, half && { flex: 1 }]}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'Select date'}`} accessibilityState={{ disabled: !editable }} disabled={!editable} onPress={choose} style={styles.field}>
      <Text style={{ color: value ? COLORS.textPrimary : '#94A3B8', flex: 1 }}>{value || 'Select date'}</Text>
      <CalendarIcon size={18} color={COLORS.primary} />
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}><View style={styles.dialog}>
        <Text style={styles.label}>{label}</Text>
        <DateTimePicker value={draft} mode="date" display="spinner" minimumDate={minimum || undefined} onChange={(_, date) => { if (date) setDraft(date); }} />
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(false)} style={styles.action}><Text>Cancel</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => { onChangeText(calendarDateValue(draft)); setOpen(false); }} style={styles.action}><Text style={{ color: COLORS.primary }}>Done</Text></TouchableOpacity>
        </View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 }, label: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '700', marginBottom: 7 },
  field: { minHeight: 46, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF' },
  overlay: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.35)' },
  dialog: { backgroundColor: '#FFF', borderRadius: 18, padding: 18 }, actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16 }, action: { padding: 12 },
});
