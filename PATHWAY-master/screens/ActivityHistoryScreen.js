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
      <Text variant="heading" style={s.heading}>Your recent activity</Text>
      <Text style={s.subtitle}>Attendance, weekly journals, and coordinator updates.</Text>
      {busy && !sources.length ? <ActivityIndicator color={COLORS.primary} /> : activities.slice(0, visible).map(item => {
        const Icon = item.type === 'attendance' ? ClockIcon : item.type === 'journal' ? LogbookIcon : BellIcon;
        const date = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
        return <View key={item.id} style={s.card}><View style={s.icon}><Icon size={18} color={COLORS.primary} /></View><View style={{ flex: 1 }}><Text style={s.body}>{item.text}</Text><Text style={s.date}>{Number.isNaN(date.getTime()) ? 'Recent' : date.toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></View></View>;
      })}
      {!busy && !error && !activities.length && <Text style={s.subtitle}>No activity yet.</Text>}
      <LoadMore hasMore={hasMore} error={error} loading={busy} onPress={() => load(!sources.length)} />
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.surface, flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  heading: { fontSize: 26, color: COLORS.textPrimary },
  subtitle: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, marginTop: 4, marginBottom: 20 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: RADIUS.lg, marginBottom: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 13, lineHeight: 19, color: COLORS.textPrimary },
  date: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
});
