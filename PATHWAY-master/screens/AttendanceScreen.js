// screens/AttendanceScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { collection, getDocs, query, orderBy, doc, where, getCountFromServer } from 'firebase/firestore';
import { readRecordPage, mergeRecords } from '../services/recordPagination';
import LoadMore from '../components/LoadMore';
import { auth, db } from '../firebaseConfig';
import { punchAttendance } from '../services/attendanceLocation';
import { studentAlert as Alert } from '../services/studentAlert';
import { COLORS, RADIUS } from '../theme';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import {
  ChevronLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
} from '../components/Icons';

function formatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

function manilaDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function AttendanceScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState(null);
  const [historyPage, setHistoryPage] = useState({ cursor: null, hasMore: false });
  const [historyCount, setHistoryCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const uid = auth.currentUser.uid;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { getDoc } = await import('firebase/firestore');
      const userSnap = await getDoc(doc(db, 'users', uid));
      setUserData(userSnap.data());

      const todayStr = manilaDateKey();
      const historyQuery = query(collection(db, 'users', uid, 'attendance'), where('date', '<', todayStr), orderBy('date', 'desc'));
      const [page, count, current] = await Promise.all([
        readRecordPage(historyQuery, 10), getCountFromServer(historyQuery),
        getDocs(query(collection(db, 'users', uid, 'attendance'), where('date', '==', todayStr))),
      ]);
      setLogs(page.records);
      setHistoryPage(page);
      setHistoryCount(count.data().count);
      setHistoryError('');
      const todayLog = current.docs[0]?.data();
      setToday(todayLog ? { ...todayLog, id: current.docs[0].id } : null);
    } catch (e) {
      console.error('Attendance fetch error:', e);
      setHistoryError('Attendance could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    if (loadingMore || !historyPage.hasMore) return;
    setLoadingMore(true);
    setHistoryError('');
    try {
      const page = await readRecordPage(query(collection(db, 'users', uid, 'attendance'), where('date', '<', manilaDateKey()), orderBy('date', 'desc')), 10, historyPage.cursor);
      setLogs(previous => mergeRecords(previous, page.records));
      setHistoryPage(page);
    } catch { setHistoryError('Could not load older shifts. Please try again.'); }
    finally { setLoadingMore(false); }
  };

  const handleTimeIn = async () => {
    setSaving(true);
    try {
      const newLog = await punchAttendance('/attendance/time-in');
      setToday(newLog);
      setLogs(prev => [newLog, ...prev]);
    } catch (e) {
      Alert.alert('Attendance unavailable', e.message || 'Failed to record time-in.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTimeOut = async () => {
    if (!today || today.timeOut) return;
    setSaving(true);
    try {
      const result = await punchAttendance('/attendance/time-out');
      const updated = { ...today, ...result };
      setToday(updated);
      setLogs(prev => prev.map(l => (l.id === today.id ? updated : l)));
      setUserData(u => ({ ...u, hoursRendered: Number(u?.hoursRendered || 0) + Number(result.hoursToday || 0) }));
    } catch (e) {
      Alert.alert('Attendance unavailable', e.message || 'Failed to record time-out.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const hoursRendered = Number(userData?.hoursRendered || 0);
  const hoursRequired = Number(userData?.hoursRequired) > 0 ? Number(userData.hoursRequired) : 486;
  const progress = Math.min(hoursRendered / hoursRequired, 1);
  const todayStr = manilaDateKey();
  const hasTimedIn = today?.date === todayStr && today?.timeIn;
  const hasTimedOut = today?.date === todayStr && today?.timeOut;

  if (loading) {
    return <StudentScreenSkeleton variant="attendance" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Modern Top Header */}
      <SafeAreaView edges={['top', 'left', 'right']} style={{ backgroundColor: '#FFF' }}><View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
        >
          <ChevronLeftIcon size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter} pointerEvents="none">
          <CalendarIcon size={19} color={COLORS.primary} />
          <Text style={styles.headerTitle}>Attendance</Text>
        </View>
        <View style={{ width: 40 }} />
      </View></SafeAreaView>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: 24 + insets.bottom }]} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntro}><Text style={styles.progressSubHeader}>DAILY ATTENDANCE</Text><Text variant="heading" style={styles.pageTitle}>Your attendance</Text><Text style={styles.pageDescription}>Record your shift and track your OJT hours.</Text></View>
        {/* Hours Progress Hero Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View>
              <Text style={styles.progressTitle}>OJT progress</Text>
            </View>
            <View style={styles.hoursBadge}>
              <Text style={styles.hoursBadgeText}>
                {hoursRendered.toFixed(2)} / {hoursRequired} hrs
              </Text>
            </View>
          </View>

          <View style={styles.hoursRow}>
            <Text style={styles.hoursValue}>{hoursRendered.toFixed(2)}</Text>
            <Text style={styles.hoursLabel}>hours recorded</Text>
          </View>

          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.progressMeta}>
            <Text style={styles.progressSub}>
              {Math.max(0, hoursRequired - hoursRendered).toFixed(2)} hrs remaining
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}% Complete</Text>
          </View>
        </View>

        {/* Today's Punch Card */}
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <View style={styles.todayTag}>
              <ClockIcon size={17} color={COLORS.primary} />
              <Text style={styles.todayTagText}>Today's shift</Text>
            </View>
            <Text style={styles.todayDate}>{formatDate(new Date().toISOString())}</Text>
          </View>

          <View style={styles.timeRow}>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Time In</Text>
              <Text style={styles.timeValue}>
                {hasTimedIn ? formatTime(today.timeIn) : '--:--'}
              </Text>
            </View>

            <View style={styles.timeDivider} />

            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Time Out</Text>
              <Text style={styles.timeValue}>
                {hasTimedOut ? formatTime(today.timeOut) : '--:--'}
              </Text>
            </View>

            <View style={styles.timeDivider} />

            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Duration</Text>
              <Text style={[styles.timeValue, { color: COLORS.secondary }]}>
                {hasTimedOut ? `${Number(today.hoursToday || 0).toFixed(2)}h` : '--'}
              </Text>
            </View>
          </View>

          {/* Action Button: Time In / Time Out */}
          {!hasTimedIn && (
            <MotionTouchableOpacity
              style={[styles.actionBtn, styles.timeInBtn, saving && { opacity: 0.6 }]}
              onPress={handleTimeIn}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <CheckCircleIcon size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Time in</Text>
                </View>
              )}
            </MotionTouchableOpacity>
          )}

          {hasTimedIn && !hasTimedOut && (
            <MotionTouchableOpacity
              style={[styles.actionBtn, styles.timeOutBtn, saving && { opacity: 0.6 }]}
              onPress={handleTimeOut}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <View style={styles.btnContent}>
                  <ClockIcon size={18} color="#FFFFFF" />
                  <Text style={styles.actionBtnText}>Time out</Text>
                </View>
              )}
            </MotionTouchableOpacity>
          )}

          {hasTimedOut && (
            <View style={styles.doneBox}>
              <CheckCircleIcon size={20} color={COLORS.successDark} />
              <Text style={styles.doneText}>
                Shift completed. {Number(today.hoursToday || 0).toFixed(2)} hours recorded.
              </Text>
            </View>
          )}
        </View>

        {/* Attendance History Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Previous shifts</Text>
          <Text style={styles.sectionCount}>{historyCount} {historyCount === 1 ? 'record' : 'records'}</Text>
        </View>

        {historyCount === 0 && !historyError && (
          <View style={styles.emptyCard}>
            <CalendarIcon size={32} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No previous attendance records recorded yet.</Text>
          </View>
        )}

        {logs
          .filter(l => l.date !== todayStr)
          .map(log => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logLeft}>
                <Text style={styles.logDate}>{formatDate(log.date + 'T00:00:00')}</Text>
                <Text style={styles.logTime}>
                  {formatTime(log.timeIn)} — {formatTime(log.timeOut)}
                </Text>
              </View>

              <View style={styles.logRight}>
                <Text style={styles.logHours}>{log.hoursToday}h</Text>
                <View
                  style={[
                    styles.logStatus,
                    {
                      backgroundColor:
                        log.status === 'verified' ? COLORS.successLight : COLORS.warningLight,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.logStatusText,
                      {
                        color:
                          log.status === 'verified' ? COLORS.successDark : COLORS.warningDark,
                      },
                    ]}
                  >
                    {log.status === 'verified' ? 'Verified' : 'Pending review'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        <LoadMore onPress={historyPage.cursor ? loadMoreHistory : fetchData} loading={loadingMore} hasMore={historyPage.hasMore} error={historyError} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: COLORS.surface,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    position: 'relative',
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerCenter: { position: 'absolute', left: 64, right: 64, top: 12, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    paddingBottom: 40,
  },
  // Hours Card
  pageIntro: { marginBottom: 16 },
  pageTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', color: COLORS.textPrimary, marginTop: 3 },
  pageDescription: { fontSize: 13, lineHeight: 19, color: COLORS.textSecondary, marginTop: 3, maxWidth: 430 },
  hoursRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 16 },
  hoursValue: { fontSize: 30, fontWeight: '800', color: COLORS.primary },
  hoursLabel: { fontSize: 12, color: COLORS.textSecondary },
  progressCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  progressSubHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 1.2,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  hoursBadge: {
    backgroundColor: COLORS.primarySubtle,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  hoursBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.primary,
  },
  progressBg: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 9,
  },
  progressSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  progressPct: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  // Today's Card
  todayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  todayHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  todayTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayTagText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  todayDate: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
  },
  timeBox: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  timeDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.border,
  },
  actionBtn: {
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInBtn: {
    backgroundColor: COLORS.primary,
  },
  timeOutBtn: {
    backgroundColor: COLORS.primary,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  doneText: {
    flex: 1,
    color: COLORS.successDark,
    fontWeight: '700',
    fontSize: 13,
  },
  // History section
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionCount: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 8,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  logCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logLeft: {
    flex: 1,
  },
  logDate: {
    fontSize: 13.5,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  logTime: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  logRight: {
    alignItems: 'flex-end',
  },
  logHours: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.primary,
  },
  logStatus: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginTop: 4,
  },
  logStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
});
