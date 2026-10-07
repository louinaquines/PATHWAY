// screens/ProgressScreen.js
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  StatusBar,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { doc, getDoc, getDocs, collection, query, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import {
  ChevronLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  CalendarIcon,
  FileIcon,
  BuildingIcon,
  ProgressIcon,
} from '../components/Icons';

export default function ProgressScreen({ navigation }) {
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [logbook, setLogbook] = useState([]);
  const [loading, setLoading] = useState(true);

  const uid = auth.currentUser.uid;

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [userSnap, attSnap, logSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc'))),
      ]);
      setStudent(userSnap.data());
      setAttendance(attSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLogbook(logSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error('Fetch progress data error:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <StudentScreenSkeleton variant="progress" />;
  }

  const hoursRendered = student?.hoursRendered || 0;
  const hoursRequired = student?.hoursRequired || 540;
  const progress = Math.min(hoursRendered / hoursRequired, 1);
  const hoursRemaining = Math.max(hoursRequired - hoursRendered, 0);

  const totalDays = attendance.length;
  const verifiedDays = attendance.filter(a => a.status === 'verified').length;
  const pendingDays = attendance.filter(a => a.status === 'pending').length;

  const totalEntries = logbook.length;
  const approvedEntries = logbook.filter(l => l.status === 'approved').length;
  const pendingEntries = logbook.filter(l => l.status === 'pending').length;
  const rejectedEntries = logbook.filter(l => l.status === 'rejected').length;

  const reqStatus = student?.requirementsStatus || 'not_submitted';
  const clearanceReady = Boolean(student?.accountApproved && reqStatus === 'approved' && hoursRendered >= hoursRequired);
  const clearanceComplete = student?.clearanceStatus === 'cleared';

  const REQ_STATUS_CONFIG = {
    not_submitted: {
      bg: COLORS.borderLight,
      text: COLORS.textMuted,
      label: 'Not Submitted',
      icon: AlertCircleIcon,
    },
    pending: {
      bg: COLORS.warningLight,
      text: COLORS.warningDark,
      label: 'Under Review',
      icon: ClockIcon,
    },
    approved: {
      bg: COLORS.successLight,
      text: COLORS.successDark,
      label: 'Approved',
      icon: CheckCircleIcon,
    },
  };

  const currentReqConfig = REQ_STATUS_CONFIG[reqStatus] || REQ_STATUS_CONFIG.not_submitted;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Modern Top Header */}
      <View style={styles.header}>
        <MotionTouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityLabel="Go back"
        >
          <ChevronLeftIcon size={22} color={COLORS.primaryDark} />
        </MotionTouchableOpacity>
        <Text style={styles.headerTitle}>OJT Progress</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hours Progress Hero Card */}
        <View style={styles.hoursCard}>
          <Text style={styles.hoursTitle}>TOTAL OJT HOURS</Text>

          <View style={styles.hoursRow}>
            <View style={styles.hoursStat}>
              <Text style={styles.hoursNum}>{hoursRendered.toFixed(1)}</Text>
              <Text style={styles.hoursLabel}>Rendered</Text>
            </View>

            <View style={styles.hoursDivider} />

            <View style={styles.hoursStat}>
              <Text style={styles.hoursNum}>{hoursRequired}</Text>
              <Text style={styles.hoursLabel}>Required</Text>
            </View>

            <View style={styles.hoursDivider} />

            <View style={styles.hoursStat}>
              <Text
                style={[
                  styles.hoursNum,
                  { color: hoursRemaining > 0 ? COLORS.accent : COLORS.success },
                ]}
              >
                {hoursRemaining.toFixed(1)}
              </Text>
              <Text style={styles.hoursLabel}>Remaining</Text>
            </View>
          </View>

          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>

          <View style={styles.progressMeta}>
            <Text style={styles.progressSub}>Training Target</Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}% Complete</Text>
          </View>
        </View>

        {/* Clearance Status Card */}
        <View
          style={[
            styles.clearanceCard,
            {
              backgroundColor:
                clearanceComplete || clearanceReady ? COLORS.successSubtle : COLORS.warningSubtle,
              borderColor:
                clearanceComplete || clearanceReady ? '#A7F3D0' : '#FDE68A',
            },
          ]}
        >
          <View style={styles.clearanceHeader}>
            {clearanceComplete || clearanceReady ? (
              <CheckCircleIcon size={22} color={COLORS.successDark} />
            ) : (
              <ClockIcon size={22} color={COLORS.warningDark} />
            )}
            <Text
              style={[
                styles.clearanceStatus,
                { color: clearanceComplete || clearanceReady ? COLORS.successDark : COLORS.warningDark },
              ]}
            >
              {clearanceComplete
                ? 'Official OJT Clearance Granted'
                : clearanceReady
                ? 'Ready for Clearance Review'
                : 'Requirements In Progress'}
            </Text>
          </View>
          <Text style={styles.clearanceSub}>
            {clearanceComplete
              ? 'Your coordinator has approved your OJT records and issued final clearance.'
              : clearanceReady
              ? 'All required documents and training hours are complete. Awaiting coordinator final sign-off.'
              : 'Complete all approved documents and required OJT hours to become eligible for clearance.'}
          </Text>
        </View>

        {/* Requirements Status Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleLeft}>
              <FileIcon size={18} color={COLORS.secondary} />
              <Text style={styles.sectionTitle}>Pre-Deployment Requirements</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: currentReqConfig.bg }]}>
              <currentReqConfig.icon size={12} color={currentReqConfig.text} />
              <Text style={[styles.statusBadgeText, { color: currentReqConfig.text }]}>
                {currentReqConfig.label}
              </Text>
            </View>
          </View>

          {student?.requirements && (
            <View style={styles.reqBreakdown}>
              {Object.entries(student.requirements).map(([id, req]) => {
                const isAppr = req.status === 'approved';
                const isSub = req.status === 'submitted';
                const isRej = req.status === 'rejected';

                return (
                  <View key={id} style={styles.reqItem}>
                    <View
                      style={[
                        styles.reqDot,
                        {
                          backgroundColor: isAppr
                            ? COLORS.success
                            : isSub
                            ? COLORS.warning
                            : isRej
                            ? COLORS.danger
                            : COLORS.textMuted,
                        },
                      ]}
                    />
                    <Text style={styles.reqItemText} numberOfLines={1}>
                      {id.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.reqItemStatus,
                        {
                          color: isAppr
                            ? COLORS.successDark
                            : isSub
                            ? COLORS.warningDark
                            : isRej
                            ? COLORS.dangerDark
                            : COLORS.textMuted,
                        },
                      ]}
                    >
                      {isAppr ? 'Approved' : isSub ? 'Submitted' : isRej ? 'Revision' : 'Missing'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Attendance Summary */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleLeft}>
            <CalendarIcon size={18} color={COLORS.secondary} />
            <Text style={styles.sectionTitle}>Attendance Summary</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{totalDays}</Text>
              <Text style={styles.statLabel}>Total Days</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: COLORS.success }]}>{verifiedDays}</Text>
              <Text style={styles.statLabel}>Verified</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: COLORS.warning }]}>{pendingDays}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
          </View>

          {attendance.slice(0, 4).map(log => (
            <View key={log.id} style={styles.logRow}>
              <Text style={styles.logDate}>
                {new Date(log.date + 'T00:00:00').toLocaleDateString('en-PH', {
                  month: 'short',
                  day: 'numeric',
                  weekday: 'short',
                })}
              </Text>
              <Text style={styles.logHours}>{log.hoursToday}h</Text>
              <View
                style={[
                  styles.logBadge,
                  {
                    backgroundColor:
                      log.status === 'verified' ? COLORS.successLight : COLORS.warningLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.logBadgeText,
                    {
                      color:
                        log.status === 'verified' ? COLORS.successDark : COLORS.warningDark,
                    },
                  ]}
                >
                  {log.status === 'verified' ? 'Verified' : 'Pending'}
                </Text>
              </View>
            </View>
          ))}
          {attendance.length > 4 && (
            <MotionTouchableOpacity onPress={() => navigation.navigate('LogToday')} accessibilityRole="button">
              <Text style={styles.seeMore}>View all {attendance.length} attendance records →</Text>
            </MotionTouchableOpacity>
          )}
        </View>

        {/* Logbook Summary */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleLeft}>
            <FileIcon size={18} color={COLORS.secondary} />
            <Text style={styles.sectionTitle}>Logbook Submissions</Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNum}>{totalEntries}</Text>
              <Text style={styles.statLabel}>Entries</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: COLORS.success }]}>{approvedEntries}</Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: COLORS.warning }]}>{pendingEntries}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statNum, { color: COLORS.danger }]}>{rejectedEntries}</Text>
              <Text style={styles.statLabel}>Revision</Text>
            </View>
          </View>

          {logbook.slice(0, 3).map(entry => (
            <View key={entry.id} style={styles.logRow}>
              <Text style={styles.logDate}>
                Week {entry.weekNum} · {entry.weekRange}
              </Text>
              <View
                style={[
                  styles.logBadge,
                  {
                    backgroundColor:
                      entry.status === 'approved'
                        ? COLORS.successLight
                        : entry.status === 'rejected'
                        ? COLORS.dangerLight
                        : COLORS.warningLight,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.logBadgeText,
                    {
                      color:
                        entry.status === 'approved'
                          ? COLORS.successDark
                          : entry.status === 'rejected'
                          ? COLORS.dangerDark
                          : COLORS.warningDark,
                    },
                  ]}
                >
                  {entry.status === 'approved'
                    ? 'Approved'
                    : entry.status === 'rejected'
                    ? 'Revision'
                    : 'Pending'}
                </Text>
              </View>
            </View>
          ))}
          {logbook.length > 3 && (
            <MotionTouchableOpacity onPress={() => navigation.navigate('Logbook')} accessibilityRole="button">
              <Text style={styles.seeMore}>Open logbook ({logbook.length} entries) →</Text>
            </MotionTouchableOpacity>
          )}
        </View>

        {/* OJT Placement Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionTitleLeft}>
            <BuildingIcon size={18} color={COLORS.secondary} />
            <Text style={styles.sectionTitle}>Institutional Placement</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Department</Text>
            <Text style={styles.infoValue}>{student?.department || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Host Company</Text>
            <Text style={styles.infoValue}>{student?.company || 'Not yet assigned'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Training Status</Text>
            <Text style={styles.infoValue}>{student?.status || 'Active'}</Text>
          </View>
        </View>
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
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 18,
    paddingBottom: 24,
  },
  // Hours card
  hoursCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  hoursTitle: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  hoursStat: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  hoursNum: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  hoursLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 4,
    fontWeight: '600',
  },
  hoursDivider: {
    width: 1,
    height: 34,
    backgroundColor: COLORS.border,
  },
  progressBg: {
    height: 9,
    backgroundColor: COLORS.secondaryLight,
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
    marginTop: 10,
  },
  progressSub: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  progressPct: {
    fontSize: 12,
    color: COLORS.primaryDark,
    fontWeight: '700',
  },
  // Clearance card
  clearanceCard: {
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    ...SHADOWS.soft,
  },
  clearanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  clearanceStatus: {
    fontSize: 15,
    fontWeight: '800',
  },
  clearanceSub: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  // Section cards
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  // Requirements breakdown
  reqBreakdown: {
    gap: 8,
    marginTop: 4,
  },
  reqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  reqDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
  },
  reqItemText: {
    flex: 1,
    fontSize: 12.5,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  reqItemStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 14,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    marginTop: 10,
  },
  statBox: {
    alignItems: 'center',
  },
  statNum: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 10.5,
    color: COLORS.textMuted,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Log rows
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  logDate: {
    fontSize: 12.5,
    color: COLORS.textPrimary,
    fontWeight: '600',
    flex: 1,
  },
  logHours: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginRight: 10,
  },
  logBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  logBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  seeMore: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  infoLabel: {
    fontSize: 12.5,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'right',
  },
});
