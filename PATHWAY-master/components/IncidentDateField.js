import React, { useState } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MotionTouchableOpacity } from './Motion';
import { AppText as Text } from './AppText';
import { CalendarIcon } from './Icons';
import { parseCalendarDate, calendarDateValue } from '../services/calendarDate';

export default function IncidentDateField({ value, onChange, disabled = false, maximumDate }) {
  const [open, setOpen] = useState(false);
  const selected = parseCalendarDate(value);
  const maximum = parseCalendarDate(maximumDate);
  const update = (event, date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (!disabled && event.type === 'set' && date) onChange(calendarDateValue(date));
  };
  return <View style={styles.group}>
    {Platform.OS === 'web' ? React.createElement('input', {
      type: 'date', 'aria-label': 'Incident date, optional', value, max: maximumDate, disabled,
      onChange: event => onChange(event.target.value),
      style: { boxSizing: 'border-box', width: '100%', minWidth: 0, minHeight: 48, border: '1px solid #DCE4EF', borderRadius: 12, padding: 12, font: 'inherit', color: '#172B44', background: '#FFFFFF' },
    }) : <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel={`Choose incident date${value ? `, ${value}` : ', optional'}`} accessibilityState={{ disabled, expanded: open }} disabled={disabled} onPress={() => { Keyboard.dismiss(); setOpen(true); }} style={[styles.field, disabled && styles.disabled]}>
      <Text style={selected ? styles.date : styles.placeholder}>{selected ? selected.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Choose a date'}</Text>
      <CalendarIcon size={20} color="#0765D4" />
    </MotionTouchableOpacity>}
    {open && !disabled && Platform.OS !== 'web' && <>
      <DateTimePicker value={selected || maximum} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} maximumDate={maximum} onChange={update} />
      {Platform.OS === 'ios' && <MotionTouchableOpacity accessibilityRole="button" onPress={() => setOpen(false)} style={styles.action}><Text style={styles.actionText}>Done</Text></MotionTouchableOpacity>}
    </>}
    {!!value && <MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Clear incident date" accessibilityState={{ disabled }} disabled={disabled} onPress={() => { setOpen(false); onChange(''); }} style={styles.action}><Text style={styles.actionText}>Clear date</Text></MotionTouchableOpacity>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  field: { minHeight: 48, borderWidth: 1, borderColor: '#DCE4EF', borderRadius: 12, padding: 12, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  date: { flex: 1, color: '#172B44', fontSize: 14 },
  placeholder: { flex: 1, color: '#60748F', fontSize: 14 },
  disabled: { opacity: 0.5 },
  action: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  actionText: { color: '#0765D4', fontSize: 13, fontWeight: '600' },
});
