import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { buildActivity, mergeRecords, readRecordPage } from '../services/recordPagination';
import { getStudentNotificationsEnabled } from '../services/studentPreferences';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import { ChevronLeftIcon, CalendarIcon, ClockIcon, LogbookIcon, BellIcon } from '../components/Icons';
import LoadMore from '../components/LoadMore';
import StudentGuidePose from '../components/StudentGuidePose';
import StudentSurface from '../components/StudentSurface';
import { COLORS, RADIUS } from '../theme';

export default function ActivityHistoryScreen({ navigation }) {
  const uid = auth.currentUser?.uid;
  const [sources, setSources] = useState([]);
  const [visible, setVisible] = useState(10);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const alive = useRef(true);
  const initialQueries = async () => {
    const enabled = await getStudentNotificationsEnabled(uid);
    return [
      query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc')),
      query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc')),
      enabled ? query(collection(db, 'notifications'), where('recipientId', '==', uid), orderBy('createdAt', 'desc')) : null,
    ];
  };
  const load = async (initial = false) => {
    if (lock.current || !uid) return;
    lock.current = true;
    setBusy(true); setError('');
    try {
      const queries = initial ? await initialQueries() : sources.map(source => source.query);
      const next = await Promise.all(queries.map(async (base, index) => {
        const previous = initial ? null : sources[index];
        if (!base || (previous && !previous.hasMore)) return previous || { query: base, records: [], hasMore: false };
        const page = await readRecordPage(base, 10, previous?.cursor);
        return { ...page, query: base, records: mergeRecords(previous?.records || [], page.records) };
      }));
      if (alive.current) { setSources(next); setVisible(value => initial ? 10 : value + 10); }
    } catch { if (alive.current) setError('Could not load activity history. Check your connection and try again.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  useEffect(() => { alive.current = true; load(true); return () => { alive.current = false; }; }, [uid]);
  const activities = buildActivity(...[0, 1, 2].map(index => sources[index]?.records || []));
  const hasMore = sources.some(source => source.hasMore) || activities.length > visible;
  return <SafeAreaView style={s.page} edges={['top', 'bottom', 'left', 'right']}>
    <View style={s.header}><MotionTouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Home" onPress={() => navigation.goBack()} style={s.back}><ChevronLeftIcon size={21} color={COLORS.primary} /></MotionTouchableOpacity><View style={s.headerTitle}><CalendarIcon size={18} color={COLORS.primary} /><Text style={s.title}>Activity history</Text></View><View style={{ width: 40 }} /></View>
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.hero}>
        <StudentSurface tone="welcome" waves />
        <Text style={s.eyebrow}>YOUR OJT RECORD</Text>
        <Text variant="heading" style={s.heading}>Your recent activity</Text>
        <Text style={s.subtitle}>Attendance, journals, and coordinator updates.</Text>
      </View>
      {busy && !sources.length ? <ActivityIndicator color={COLORS.primary} /> : activities.slice(0, visible).map(item => {
        const Icon = item.type === 'attendance' ? ClockIcon : item.type === 'journal' ? LogbookIcon : BellIcon;
        const color = item.type === 'attendance' ? '#0765D4' : item.type === 'journal' ? '#986511' : '#6E49C7';
        const tint = item.type === 'attendance' ? '#EAF3FF' : item.type === 'journal' ? '#FFF5D9' : '#F1EBFF';
        const date = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return <View key={item.id} style={s.card}><View style={[s.icon, { backgroundColor: tint }]}><Icon size={20} color={color} /></View><View style={s.cardCopy}><Text style={s.body}>{item.text}</Text><Text style={s.date}>{Number.isNaN(date.getTime()) ? 'Recent' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View></View>;
      })}
      {!busy && !error && !activities.length && <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 300 }}><StudentGuidePose size={156} /><Text style={s.subtitle}>No activity yet.</Text></View>}
      <LoadMore hasMore={hasMore} error={error} loading={busy} onPress={() => load(!sources.length)} />
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  title: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, flexShrink: 1, textAlign: 'center' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, marginBottom: 18, minHeight: 136, justifyContent: 'center' },
  eyebrow: { fontSize: 9, fontWeight: '600', letterSpacing: 1.2, color: COLORS.primary, marginBottom: 7 },
  heading: { fontSize: 25, fontWeight: '600', color: COLORS.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, marginTop: 6 },
  card: { flexDirection: 'row', gap: 13, alignItems: 'center', padding: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#E3ECF8', borderRadius: RADIUS.lg, marginBottom: 10, minHeight: 84 },
  icon: { width: 42, height: 42, flexShrink: 0, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  body: { fontSize: 14, fontWeight: '600', lineHeight: 21, color: COLORS.textPrimary },
  date: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted, marginTop: 5 },
});
