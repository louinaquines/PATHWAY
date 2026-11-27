// components/EvaluationCard.js
// Compact supervisor-evaluation card for the Progress screen. The card stays the same size;
// the full evaluation (any length, any number of questions) opens in a scrollable sheet.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { postBackend } from '../services/backendApi';
import { COLORS, RADIUS, SHADOWS } from '../theme';
import { AppText as Text } from './AppText';
import { CheckCircleIcon, ClockIcon, CloseIcon } from './Icons';
import Modal from './BackdropModal';

const dateLabel = value => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export default function EvaluationCard({ refreshKey = 0, openOnLoad = false, onOpened }) {
  const [state, setState] = useState({ loading: true, error: '', evaluation: null });
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: '' }));
    try {
      const data = await postBackend('/student/evaluations');
      setState({ loading: false, error: '', evaluation: (data.evaluations || [])[0] || null });
    } catch (error) {
      setState({ loading: false, error: error.message || 'Could not load your evaluation.', evaluation: null });
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    if (openOnLoad && state.evaluation) { setOpen(true); onOpened?.(); }
  }, [openOnLoad, state.evaluation]); // eslint-disable-line react-hooks/exhaustive-deps

  const e = state.evaluation;
  return <View style={styles.card} accessibilityLabel="Supervisor evaluation">
    <View style={styles.headRow}>
      {e ? <CheckCircleIcon size={18} color={COLORS.successDark} /> : <ClockIcon size={18} color={COLORS.textMuted} />}
      <Text style={styles.title}>Supervisor evaluation</Text>
    </View>
    {state.loading ? <View style={styles.note}><ActivityIndicator size="small" color={COLORS.primary} /><Text style={styles.noteText}>Checking for your evaluation…</Text></View>
    : state.error ? <View style={styles.note}>
        <Text style={[styles.noteText, { color: COLORS.dangerDark || COLORS.danger }]}>{state.error}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={load}><Text style={styles.link}>Retry</Text></TouchableOpacity>
      </View>
    : e ? <View style={[styles.note, styles.noteDone]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.doneText}>Your supervisor submitted your evaluation.</Text>
          <Text style={styles.meta}>{[e.supervisorName, dateLabel(e.submittedAt)].filter(Boolean).join(' · ')}</Text>
          {e.average != null && <View style={styles.chip}><Text style={styles.chipText}>Average {e.average} / 5</Text></View>}
        </View>
      </View>
    : <View style={styles.note}><ClockIcon size={16} color={COLORS.textMuted} />
        <Text style={styles.noteText}>Your supervisor's evaluation will appear here once they submit it. Your coordinator sends the request near the end of your OJT.</Text></View>}
    {e && <TouchableOpacity accessibilityRole="button" style={styles.button} onPress={() => setOpen(true)}>
      <Text style={styles.buttonText}>View evaluation</Text></TouchableOpacity>}
    {e && <EvaluationSheet evaluation={e} visible={open} onClose={() => setOpen(false)} />}
  </View>;
}

function EvaluationSheet({ evaluation: e, visible, onClose }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom), marginTop: insets.top + 8 }]}>
        <View style={styles.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sheetTitle}>{e.title}</Text>
            <Text style={styles.meta}>{[e.supervisorName, e.companyName, dateLabel(e.submittedAt)].filter(Boolean).join(' · ')}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close evaluation" style={styles.close} onPress={onClose}>
            <CloseIcon size={18} color={COLORS.textSecondary} /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator>
          {e.average != null && <View style={styles.avg}><Text style={styles.avgNum}>{e.average}</Text><Text style={styles.avgText}>out of 5 · overall average</Text></View>}
          {e.items.map((item, i) => <View key={i} style={styles.item}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            {item.type === 'rating'
              ? item.value == null ? <Text style={styles.empty}>No answer</Text>
                : <View style={styles.ratingRow}>
                    <View style={styles.bar}>{[1, 2, 3, 4, 5].map(n => <View key={n} style={[styles.seg, n <= item.value && styles.segOn]} />)}</View>
                    <Text style={styles.ratingNum}>{item.value} / 5</Text>
                  </View>
              : item.value ? <Text style={styles.answer} selectable>{item.value}</Text> : <Text style={styles.empty}>No answer</Text>}
          </View>)}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, padding: 13, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.card },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.surfaceMuted, borderRadius: 10, padding: 11 },
  noteDone: { backgroundColor: COLORS.successSubtle },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: COLORS.textSecondary },
  doneText: { fontSize: 13, fontWeight: '600', color: COLORS.successDark },
  meta: { marginTop: 2, fontSize: 12, color: COLORS.textSecondary },
  chip: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, backgroundColor: COLORS.surface },
  chipText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  link: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  button: { marginTop: 10, borderWidth: 1, borderColor: COLORS.border, borderRadius: 11, paddingVertical: 12, alignItems: 'center', backgroundColor: COLORS.surface },
  buttonText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', justifyContent: 'flex-end' },
  sheet: { flex: 1, width: '100%', maxWidth: 620, alignSelf: 'center', overflow: 'hidden', backgroundColor: COLORS.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: COLORS.textPrimary },
  close: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: 18, gap: 12 },
  avg: { flexDirection: 'row', alignItems: 'baseline', gap: 8, backgroundColor: COLORS.primarySubtle || '#E6F1FB', borderRadius: 12, padding: 12 },
  avgNum: { fontSize: 26, fontWeight: '800', color: COLORS.primaryDark || COLORS.primary },
  avgText: { fontSize: 12, color: COLORS.primary },
  item: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, padding: 12, gap: 8 },
  itemLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, lineHeight: 19 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bar: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceMuted || '#EEF2F7' },
  segOn: { backgroundColor: COLORS.primary },
  ratingNum: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, minWidth: 34, textAlign: 'right' },
  answer: { fontSize: 13, lineHeight: 20, color: COLORS.textSecondary },
  empty: { fontSize: 12, fontStyle: 'italic', color: COLORS.textMuted },
});
