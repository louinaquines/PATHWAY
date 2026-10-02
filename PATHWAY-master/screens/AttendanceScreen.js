// screens/AttendanceScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { collection, getDocs, query, orderBy, doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import {
  ChevronLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  CalendarIcon,
  AlertCircleIcon,
} from '../components/Icons';

function formatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
  const [logs, setLogs] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState(null);

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

      const q = query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(all);

      const todayStr = manilaDateKey();
      const todayLog = all.find(l => l.date === todayStr);
      setToday(todayLog || null);
    } catch (e) {
      console.error('Attendance fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeIn = async () => {
    setSaving(true);
    try {
      const newLog = await postBackend('/attendance/time-in');
      setToday(newLog);
      setLogs(prev => [newLog, ...prev]);
    } catch (e) {
      Alert.alert('Error', 'Failed to record time-in. Please check your connection.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleTimeOut = async () => {
    if (!today || today.timeOut) return;
    setSaving(true);
    try {
      const result = await postBackend('/attendance/time-out');
      const updated = { ...today, ...result };
      setToday(updated);
      setLogs(prev => prev.map(l => (l.id === today.id ? updated : l)));
      setUserData(u => ({ ...u, hoursRendered: Number(u?.hoursRendered || 0) + Number(result.hoursToday || 0) }));
    } catch (e) {
      Alert.alert('Error', 'Failed to record time-out.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const hoursRendered = userData?.hoursRendered || 0;
  const hoursRequired = userData?.hoursRequired || 486;
  const progress = Math.min(hoursRendered / hoursRequired, 1);
  const todayStr = manilaDateKey();
  const hasTimedIn = today?.date === todayStr && today?.timeIn;
  const hasTimedOut = today?.date === todayStr && today?.timeOut;

  if (loading) {
    return <StudentScreenSkeleton variant="attendance" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Modern Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
        >
          <ChevronLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Attendance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hours Progress Hero Card */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <View>
              <Text style={styles.progressSubHeader}>OJT ACCUMULATION</Text>
              <Text style={styles.progressTitle}>Total Hours Rendered</Text>
            </View>
            <View style={styles.hoursBadge}>
              <Text style={styles.hoursBadgeText}>
                {hoursRendered.toFixed(1)} / {hoursRequired} hrs
              </Text>
            </View>
          </View>

          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.progressMeta}>
            <Text style={styles.progressSub}>
              {(hoursRequired - hoursRendered).toFixed(1)} hrs remaining
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}% Complete</Text>
          </View>
        </View>

        {/* Today's Punch Card */}
        <View style={styles.todayCard}>
          <View style={styles.todayHeader}>
            <View style={styles.todayTag}>
              <ClockIcon size={14} color={COLORS.secondary} />
              <Text style={styles.todayTagText}>TODAY'S SHIFT</Text>
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
                {hasTimedOut ? `${today.hoursToday}h` : '--'}
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
                  <Text style={styles.actionBtnText}>Punch Time In</Text>
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
                  <Text style={styles.actionBtnText}>Punch Time Out</Text>
                </View>
              )}
            </MotionTouchableOpacity>
          )}

          {hasTimedOut && (
            <View style={styles.doneBox}>
              <CheckCircleIcon size={20} color={COLORS.successDark} />
              <Text style={styles.doneText}>
                Shift completed for today · {today.hoursToday} hrs logged
              </Text>
            </View>
          )}
        </View>

        {/* Attendance History Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>ATTENDANCE HISTORY</Text>
          <Text style={styles.sectionCount}>{logs.length} Total Records</Text>
        </View>

        {logs.filter(l => l.date !== todayStr).length === 0 && (
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
                    {log.status === 'verified' ? '✓ Verified' : '• Pending'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
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
    backgroundColor: COLORS.primaryDark,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 18,
    paddingBottom: 40,
  },
  // Hours Card
  progressCard: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    ...SHADOWS.card,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  progressSubHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1.2,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  hoursBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    borderWidth: 1,
    borderColor: COLORS.brandGold,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  hoursBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: COLORS.brandGold,
  },
  progressBg: {
    height: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.brandGold,
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
    color: '#BAE6FD',
    fontWeight: '500',
  },
  progressPct: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Today's Card
  todayCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  todayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  todayTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.secondaryLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  todayTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: COLORS.secondaryDark,
    letterSpacing: 0.8,
  },
  todayDate: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
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
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.primaryDark,
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
    ...SHADOWS.soft,
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInBtn: {
    backgroundColor: COLORS.success,
  },
  timeOutBtn: {
    backgroundColor: COLORS.danger,
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
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
    letterSpacing: 1.2,
  },
  sectionCount: {
    fontSize: 11.5,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
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
    borderRadius: RADIUS.md,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
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
