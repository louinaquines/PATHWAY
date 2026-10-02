// screens/StudentDashboard.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { auth, db } from '../firebaseConfig';
import { requestBackend, postBackend } from '../services/backendApi';
import { uploadCloudinaryFile } from '../services/cloudinaryUpload';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import { MotionTouchableOpacity, useReducedMotion } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import PathwayMark from '../components/PathwayMark';
import {
  AlertCircleIcon,
  BellIcon,
  ChatBubbleIcon,
  BuildingIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronIcon,
  ChevronRightIcon,
  ClockIcon,
  FileIcon,
  HomeIcon,
  LogbookIcon,
  LogOutIcon,
  ProfileIcon,
  ProgressIcon,
  SettingsIcon,
  TasksIcon,
  PlusIcon,
  RefreshIcon,
} from '../components/Icons';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS = [
  { key: 'home', label: 'Home', Icon: HomeIcon },
  { key: 'logs', label: 'Logs', Icon: LogbookIcon },
  { key: 'progress', label: 'Progress', Icon: ProgressIcon },
  { key: 'profile', label: 'Profile', Icon: ProfileIcon },
];

const dateLabel = value => {
  if (!value) return 'Recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Recently'
    : date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

// Format ISO timestamp or time string → "8:45 AM"
const formatTime = value => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true });
};

// Format decimal hours → "2h 30m" or "0.5h"
const formatHours = h => {
  const n = Number(h);
  if (!n || Number.isNaN(n)) return '—';
  const hrs = Math.floor(n);
  const mins = Math.round((n - hrs) * 60);
  if (hrs === 0) return `${mins}m`;
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
};

const initials = student => {
  const f = student?.firstName?.[0] || '';
  const l = student?.lastName?.[0] || '';
  return (f + l).toUpperCase() || 'ST';
};

export default function StudentDashboard({ navigation }) {
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [logbook, setLogbook] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('home');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoadError('Your student session is unavailable. Sign in again to continue.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [user, att, logs, notices] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc'))),
        getDocs(query(collection(db, 'notifications'), where('recipientId', '==', uid))),
      ]);
      if (!user.exists()) {
        setStudent(null);
        setLoadError('Your student profile could not be found. Sign out and sign in again, or contact your coordinator.');
        return;
      }
      setStudent(user.data());
      setAttendance(att.docs.map(item => ({ id: item.id, ...item.data() })));
      setLogbook(logs.docs.map(item => ({ id: item.id, ...item.data() })));
      setNotifications(notices.docs.map(item => ({ id: item.id, ...item.data() })));
    } catch (error) {
      console.error('Unable to load student dashboard', error);
      setLoadError('Failed to load dashboard data. Check your network connection.');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const handleBack = () => {
      if (settingsVisible) {
        setSettingsVisible(false);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [settingsVisible]);

  const metrics = useMemo(() => {
    const rendered = Number(student?.hoursRendered || 0);
    const required = Number(student?.hoursRequired || 486);
    const verified = attendance.filter(item => item.status === 'verified').length;
    return {
      rendered,
      required,
      progress: Math.min(rendered / Math.max(required, 1), 1),
      remaining: Math.max(required - rendered, 0),
      attendancePercent: attendance.length
        ? Math.round((verified / attendance.length) * 100)
        : null,
      pendingLogs: logbook.filter(item => item.status === 'pending').length,
      unread: notifications.filter(item => !item.read).length,
    };
  }, [student, attendance, logbook, notifications]);

  const switchTab = next => {
    if (next === tab) return;
    setTab(next);
    if (reducedMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0.78);
    Animated.spring(fade, {
      toValue: 1,
      useNativeDriver: Platform.OS !== 'web',
      speed: 22,
      bounciness: 2,
    }).start();
  };

  const logout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const updateProfilePhoto = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      const authorization = await requestBackend('/profile/photo/upload-signature');
      const uploaded = await uploadCloudinaryFile(asset, authorization);
      const saved = await requestBackend('/profile/photo', { method: 'PUT', payload: uploaded });
      setStudent(current => ({ ...current, profilePhotoUrl: saved.profilePhotoUrl }));
    } catch (error) { Alert.alert('Profile photo', error.message || 'Unable to update your profile photo.'); }
  };

  if (loading && !student) {
    return <StudentScreenSkeleton variant="dashboard" />;
  }

  if (loadError && !student) {
    return <DashboardLoadError message={loadError} onRetry={load} onLogout={logout} />;
  }

  if (!student?.accountApproved) {
    return (
      <Gate
        logout={logout}
        title="Account under review"
        message="Your registration is being verified by your OJT Coordinator. You will gain access once your account is authorized."
        icon={<ClockIcon size={46} color={COLORS.accent} />}
      />
    );
  }

  if (
    student.preDeploymentStatus !== 'approved' &&
    (!student.requirementsStatus || student.requirementsStatus === 'not_submitted')
  ) {
    return (
      <Gate
        logout={logout}
        title="Submit your requirements first"
        message="Before you can log your OJT hours, your coordinator needs to verify your pre-deployment documents."
        icon={<FileIcon size={46} color={COLORS.secondary} />}
        button="Go to Requirements"
        onPress={() => navigation.navigate('Requirements')}
      />
    );
  }

  if (
    student.preDeploymentStatus !== 'approved' &&
    student.requirementsStatus === 'pending'
  ) {
    return (
      <Gate
        logout={logout}
        title="Requirements under review"
        message="Your coordinator is reviewing your submitted documents. You will get full workspace access once approved."
        icon={<ClockIcon size={46} color={COLORS.accent} />}
        button="View Requirements Progress"
        onPress={() => navigation.navigate('Requirements')}
      />
    );
  }

  if (student.preDeploymentStatus !== 'approved') {
    return (
      <Gate
        logout={logout}
        title="Final approval pending"
        message="Your pre-deployment information is ready or under final review. OJT tracking will unlock after your coordinator approves Step 4."
        icon={<ClockIcon size={46} color={COLORS.accent} />}
        button="View Approval Status"
        onPress={() => navigation.navigate('Approval')}
      />
    );
  }

  const recent = [
    ...attendance.slice(0, 2).map(item => ({
      id: `a-${item.id}`,
      Icon: ClockIcon,
      text: `Attendance logged · ${item.hoursToday || 0} hrs`,
      date: dateLabel(item.date),
      color: COLORS.secondary,
    })),
    ...logbook.slice(0, 2).map(item => ({
      id: `l-${item.id}`,
      Icon: FileIcon,
      text: `Week ${item.weekNum || ''} logbook submitted`,
      date: dateLabel(item.createdAt),
      color: COLORS.accent,
    })),
    ...notifications.slice(0, 2).map(item => ({
      id: `n-${item.id}`,
      Icon: BellIcon,
      text: item.title || 'New notification',
      date: dateLabel(item.createdAt),
      color: COLORS.primary,
    })),
  ].slice(0, 4);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />

      {/* Modern Dashboard Header */}
      <View style={[styles.header, { paddingTop: Math.max(14, insets.top) }]}>
        <PathwayWatermark size={176} opacity={0.075} style={{ right: -58, top: -70 }} />
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoBadge}><PathwayMark size={40} decorative /></View>
          <View>
            <Text style={styles.brand}>PATHWAY</Text>
            <Text style={styles.headerCampus}>UC Lapu-Lapu & Mandaue</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <MotionTouchableOpacity
            onPress={() => navigation.navigate('Notifications', { initialTab: 'notifications' })}
            style={styles.headerIconBtn}
            accessibilityLabel="Notifications"
          >
            <BellIcon size={20} color="#FFFFFF" hasUnread={metrics.unread > 0} />
          </MotionTouchableOpacity>

          <MotionTouchableOpacity
            onPress={() => { setSettingsVisible(true); switchTab('profile'); }}
            style={styles.headerSettingsBtn}
            accessibilityLabel="Open settings"
          >
            <SettingsIcon size={20} color="#FFFFFF" />
          </MotionTouchableOpacity>
        </View>
      </View>

      {/* Main Tab Panel Content */}
      <Animated.View style={[styles.content, { opacity: fade }]}>
        {loading && student ? (
          <View style={styles.refreshStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={COLORS.secondary} />
            <Text style={styles.refreshStatusText}>Updating your workspace</Text>
          </View>
        ) : null}
        {loadError && student ? (
          <View style={styles.dashboardErrorBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <AlertCircleIcon size={18} color={COLORS.dangerDark} />
            <Text style={styles.dashboardErrorText}>
              Some information may be out of date. {loadError}
            </Text>
            <MotionTouchableOpacity onPress={load} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry loading dashboard data">
              <RefreshIcon size={16} color={COLORS.dangerDark} />
              <Text style={styles.retryButtonText}>Retry</Text>
            </MotionTouchableOpacity>
          </View>
        ) : null}
        {tab === 'home' && (
          <HomePanel
            student={student}
            metrics={metrics}
            recent={recent}
            width={width}
            go={screen => navigation.navigate(screen)}
          />
        )}
        {tab === 'logs' && (
          <LogsPanel
            logbook={() => navigation.navigate('Logbook')}
            logbookRecords={logbook}
            student={student}
            metrics={metrics}
            onHoursUpdate={load}
          />
        )}
        {tab === 'progress' && (
          <ProgressPanel
            student={student}
            metrics={metrics}
            attendance={attendance}
            logbook={logbook}
            openAttendance={() => navigation.navigate('LogToday')}
            openLogbook={() => navigation.navigate('Logbook')}
            openRequirements={() => navigation.navigate('Requirements')}
            openProgress={() => navigation.navigate('Progress')}
          />
        )}
        {tab === 'profile' && (settingsVisible
          ? <SettingsPanel student={student} onBack={() => setSettingsVisible(false)} onLogout={logout} />
          : <ProfilePanel student={student} onLogout={logout} onSettings={() => setSettingsVisible(true)} onPhotoPress={updateProfilePhoto} onRequestPlacementChange={() => navigation.navigate('Company')} />)}
      </Animated.View>

      <View style={[styles.floatingActions, { bottom: 72 + insets.bottom }]} pointerEvents="box-none">
        <MotionTouchableOpacity style={styles.quickMessageButton} onPress={() => navigation.navigate('Notifications', { initialTab: 'messages' })} accessibilityRole="button" accessibilityLabel="Open messages">
          <ChatBubbleIcon size={18} color={COLORS.primary} /><Text style={styles.quickMessageText}>Messages</Text>
        </MotionTouchableOpacity>
        <MotionTouchableOpacity style={styles.quickLogButton} onPress={() => navigation.navigate('Logbook')} accessibilityRole="button" accessibilityLabel="Add logbook entry">
          <PlusIcon size={18} color="#FFFFFF" /><Text style={styles.quickLogText}>New log</Text>
        </MotionTouchableOpacity>
      </View>

      {/* Elevated Bottom Navigation Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
        {TABS.map(({ key, label, Icon }) => {
          const active = key === tab;
          return (
            <MotionTouchableOpacity
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => switchTab(key)}
              style={styles.tabButton}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconContainer, active && styles.tabIconContainerActive]}>
                <Icon
                  size={19}
                  color={active ? '#FFFFFF' : 'rgba(255, 255, 255, 0.65)'}
                  hasUnread={key === 'notifications' && metrics.unread > 0}
                />
              </View>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
            </MotionTouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function DashboardLoadError({ message, onRetry, onLogout }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={[styles.errorHeader, { paddingTop: Math.max(14, insets.top) }]}>
        <PathwayMark size={42} decorative style={styles.headerLogoBadge} />
        <Text style={styles.brand}>PATHWAY</Text>
      </View>
      <View style={styles.dashboardErrorScreen}>
        <View style={styles.errorIconCircle}><AlertCircleIcon size={25} color={COLORS.dangerDark} /></View>
        <Text variant="heading" style={styles.dashboardErrorTitle}>We couldn’t load your workspace</Text>
        <Text style={styles.dashboardErrorDescription}>{message}</Text>
        <MotionTouchableOpacity onPress={onRetry} style={styles.errorRetryButton} accessibilityRole="button">
          <RefreshIcon size={17} color="#FFFFFF" />
          <Text style={styles.errorRetryButtonText}>Try again</Text>
        </MotionTouchableOpacity>
        <MotionTouchableOpacity onPress={onLogout} style={styles.errorSignOutButton} accessibilityRole="button">
          <Text style={styles.errorSignOutText}>Sign out</Text>
        </MotionTouchableOpacity>
      </View>
    </View>
  );
}

function Gate({ logout, title, message, icon, button, onPress }) {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primaryDark} />
      <View style={styles.header}>
        <PathwayWatermark size={176} opacity={0.075} style={{ right: -58, top: -70 }} />
        <View style={styles.headerLeft}>
          <View style={styles.headerLogoBadge}><PathwayMark size={40} decorative /></View>
          <Text style={styles.brand}>PATHWAY</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn} activeOpacity={0.75}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.centered}>
        <View style={styles.gateIconCircle}>{icon}</View>
        <Text variant="heading" style={styles.gateTitle}>{title}</Text>
        <Text style={styles.gateSub}>{message}</Text>
        {button && (
          <TouchableOpacity style={styles.gateBtn} onPress={onPress} activeOpacity={0.85}>
            <Text style={styles.gateBtnText}>{button}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function CardTitle({ Icon, title, action, onPress }) {
  return (
    <View style={styles.cardTitleRow}>
      <View style={styles.cardTitleLeft}>
        <Icon size={18} color={COLORS.secondary} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {action && (
        <MotionTouchableOpacity onPress={onPress} activeOpacity={0.7}>
          <Text style={styles.cardAction}>{action}</Text>
        </MotionTouchableOpacity>
      )}
    </View>
  );
}

function HomePanel({ student, metrics, recent, width, go }) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingHorizontal: width < 380 ? 16 : 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.homeWelcome}>
        <View style={styles.homeWelcomeCopy}>
          <Text style={styles.homeEyebrow}>STUDENT WORKSPACE</Text>
          <Text variant="heading" style={styles.greeting}>Welcome, {student?.firstName || 'Student'}</Text>
          <Text style={styles.profileDepartment}>{student?.department || student?.course || 'OJT Student'}</Text>
        </View>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(student)}</Text></View>
      </View>

      <View style={styles.homeProgressHero}>
        <View style={styles.homeProgressHeader}>
          <View style={styles.homeProgressLabelWrap}><ClockIcon size={15} color={COLORS.brandGold} /><Text style={styles.homeProgressLabel}>OJT HOURS</Text></View>
          <Text style={styles.homeProgressPercent}>{Math.round(metrics.progress * 100)}%</Text>
        </View>
        <Text variant="heading" style={styles.homeHoursValue}>{metrics.rendered.toFixed(1)}<Text style={styles.homeHoursTotal}> / {metrics.required} hrs</Text></Text>
        <View style={styles.homeProgressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(metrics.progress * 100) }}>
          <View style={[styles.homeProgressFill, { width: `${Math.min(metrics.progress * 100, 100)}%` }]} />
        </View>
        <View style={styles.homeProgressFooter}>
          <Text style={styles.homeProgressRemaining}>{metrics.remaining.toFixed(1)} hours to go</Text>
          <MotionTouchableOpacity onPress={() => go('Progress')} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.homeProgressLink}><Text style={styles.homeProgressLinkText}>View progress</Text><ChevronRightIcon size={14} color={COLORS.brandGold} /></View>
          </MotionTouchableOpacity>
        </View>
      </View>

      <View style={styles.homeStatsStrip}>
        <View style={styles.homeStatCell}>
          <Text style={styles.homeStatLabel}>ATTENDANCE</Text>
          <Text style={styles.homeStatValue}>{metrics.attendancePercent === null ? '—' : `${metrics.attendancePercent}%`}</Text>
          <Text style={styles.homeStatHint}>verified shifts</Text>
        </View>
        <View style={styles.homeStatDivider} />
        <View style={styles.homeStatCell}>
          <Text style={styles.homeStatLabel}>PENDING LOGS</Text>
          <Text style={styles.homeStatValue}>{metrics.pendingLogs}</Text>
          <Text style={styles.homeStatHint}>awaiting coordinator</Text>
        </View>
      </View>

      <View style={styles.homeSectionHeading}>
        <Text style={styles.homeSectionTitle}>Your placement</Text>
        <BuildingIcon size={18} color={COLORS.secondary} />
      </View>
      <View style={styles.homePlacementRow}>
        <View style={styles.homePlacementMark}><BuildingIcon size={18} color={COLORS.primary} /></View>
        <View style={styles.homePlacementCopy}>
          <Text style={styles.companyName}>{student?.company || 'Company not assigned yet'}</Text>
          <Text style={styles.detailText} numberOfLines={2}>{student?.supervisorName ? `Supervisor · ${student.supervisorName}` : 'Official placement details will appear after coordinator approval.'}</Text>
        </View>
        <View style={[styles.homePlacementStatus, student?.company ? styles.homePlacementConfirmed : styles.homePlacementPending]}>
          <View style={[styles.homePlacementDot, student?.company ? styles.homePlacementDotConfirmed : styles.homePlacementDotPending]} />
          <Text style={[styles.homePlacementStatusText, student?.company ? styles.homePlacementStatusConfirmedText : styles.homePlacementStatusPendingText]}>{student?.company ? 'Confirmed' : 'Pending'}</Text>
        </View>
      </View>

      <View style={styles.homeActivityHeading}>
        <View style={styles.homeSectionHeading}>
          <Text style={styles.homeSectionTitle}>Recent activity</Text>
          <CalendarIcon size={17} color={COLORS.secondary} />
        </View>
        <MotionTouchableOpacity onPress={() => go('Notifications')} accessibilityRole="button" style={styles.homeSeeAll}>
          <Text style={styles.cardAction}>See all</Text><ChevronRightIcon size={14} color={COLORS.secondary} />
        </MotionTouchableOpacity>
      </View>
      <View style={styles.activityList}>
        {recent.length ? recent.map((item, index) => (
          <View style={[styles.activityRow, index === 0 && styles.activityRowFirst]} key={item.id}>
            <View style={[styles.activityIcon, { backgroundColor: `${item.color}15` }]}><item.Icon size={16} color={item.color} /></View>
            <Text style={styles.activityText} numberOfLines={2}>{item.text}</Text>
            <Text style={styles.activityDate}>{item.date}</Text>
          </View>
        )) : (
          <View style={styles.activityEmpty}><Text style={styles.emptyText}>Your attendance, logbook, and coordinator updates will appear here.</Text></View>
        )}
      </View>
    </ScrollView>
  );
}

// ── Attendance helpers (scoped to LogsPanel) ─────────────────────────────────
function attFormatTime(iso) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}
function attFormatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}
function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekStartFor(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function addDays(value, amount) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function LogsPanel({ logbook, logbookRecords = [], student, metrics, onHoursUpdate }) {
  const uid = auth.currentUser?.uid;
  const todayStr = localDateKey(new Date());

  // Attendance state owned by this panel
  const [attLogs, setAttLogs]     = useState([]);
  const [todayLog, setTodayLog]   = useState(null);
  const [attLoading, setAttLoading] = useState(true);
  const [saving, setSaving]       = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [weekStart, setWeekStart] = useState(() => weekStartFor(new Date()));

  useEffect(() => { fetchAtt(); }, []);

  const fetchAtt = async () => {
    setAttLoading(true);
    try {
      const q = query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAttLogs(all);
      setTodayLog(all.find(l => l.date === todayStr) || null);
    } catch (e) { console.error('Att fetch:', e); }
    finally { setAttLoading(false); }
  };

  const handleTimeIn = async () => {
    setSaving(true);
    try {
      const newLog = await postBackend('/attendance/time-in');
      setTodayLog(newLog);
      setAttLogs(prev => [newLog, ...prev]);
    } catch (e) {
      Alert.alert('Error', 'Failed to record time-in. Check your connection.');
    } finally { setSaving(false); }
  };

  const handleTimeOut = async () => {
    if (!todayLog || todayLog.timeOut) return;
    setSaving(true);
    try {
      const result = await postBackend('/attendance/time-out');
      const updated = { ...todayLog, ...result };
      setTodayLog(updated);
      setAttLogs(prev => prev.map(l => l.id === todayLog.id ? updated : l));
      if (onHoursUpdate) onHoursUpdate(); // refresh parent metrics
    } catch (e) {
      Alert.alert('Error', 'Failed to record time-out.');
    } finally { setSaving(false); }
  };

  const hasTimeIn  = Boolean(todayLog?.date === todayStr && todayLog?.timeIn);
  const hasTimeOut = Boolean(todayLog?.date === todayStr && todayLog?.timeOut);
  const shiftDone  = hasTimeIn && hasTimeOut;
  const selectedLog = attLogs.find(log => log.date === selectedDate) || null;
  const selectedLogbook = logbookRecords.filter(item => {
    const recordDate = item.date || item.createdAt || item.updatedAt;
    return recordDate && localDateKey(recordDate) === selectedDate;
  });
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const selectedDateLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  const selectedMonthLabel = weekStart.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const selectedIsToday = selectedDate === todayStr;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* ── Page header ── */}
      <View style={styles.logsPageHeader}>
        <Text variant="heading" style={styles.pageTitle}>Training Logs</Text>
        <Text style={styles.pageSub}>Daily attendance and weekly logbook in one place.</Text>
      </View>

      {/* ── OJT Hours hero card ── */}
      <View style={styles.attHeroCard}>
        <View style={styles.attHeroRow}>
          <View>
            <Text style={styles.attHeroSub}>OJT ACCUMULATION</Text>
            <Text style={styles.attHeroTitle}>Total Hours Rendered</Text>
          </View>
          <View style={styles.attHoursBadge}>
            <Text style={styles.attHoursBadgeText}>
              {metrics.rendered.toFixed(1)} / {metrics.required} hrs
            </Text>
          </View>
        </View>
        <View style={styles.attProgressBg}>
          <View style={[styles.attProgressFill, { width: `${Math.min(metrics.progress * 100, 100)}%` }]} />
        </View>
        <View style={styles.attProgressMeta}>
          <Text style={styles.attProgressSub}>{metrics.remaining.toFixed(1)} hrs remaining</Text>
          <Text style={styles.attProgressPct}>{Math.round(metrics.progress * 100)}% Complete</Text>
        </View>
      </View>

      {/* ── Attendance calendar ── */}
      <Card style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <MotionTouchableOpacity onPress={() => { setWeekStart(weekStartFor(new Date())); setSelectedDate(todayStr); }} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Return to today">
            <Text style={styles.calendarMonth}>{selectedMonthLabel}</Text>
          </MotionTouchableOpacity>
          <View style={styles.calendarNav}>
            <MotionTouchableOpacity style={styles.calendarNavButton} onPress={() => setWeekStart(current => addDays(current, -7))} accessibilityRole="button" accessibilityLabel="Previous week">
              <View style={styles.calendarChevronLeft}><ChevronIcon size={15} color={COLORS.textSecondary} /></View>
            </MotionTouchableOpacity>
            <MotionTouchableOpacity style={styles.calendarNavButton} onPress={() => setWeekStart(current => addDays(current, 7))} accessibilityRole="button" accessibilityLabel="Next week">
              <View style={styles.calendarChevronRight}><ChevronIcon size={15} color={COLORS.textSecondary} /></View>
            </MotionTouchableOpacity>
          </View>
        </View>
        <View style={styles.calendarWeekRow}>
          {weekDays.map(day => {
            const key = localDateKey(day);
            const active = key === selectedDate;
            const isToday = key === todayStr;
            const hasRecord = attLogs.some(log => log.date === key) || logbookRecords.some(item => localDateKey(item.date || item.createdAt || item.updatedAt) === key);
            return (
              <MotionTouchableOpacity key={key} style={styles.calendarDay} onPress={() => setSelectedDate(key)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Select ${key}`}>
                <Text style={styles.calendarWeekday}>{day.toLocaleDateString('en-PH', { weekday: 'short' }).slice(0, 1)}</Text>
                <View style={[styles.calendarDateCircle, active && styles.calendarDateActive, isToday && !active && styles.calendarDateToday]}>
                  <Text style={[styles.calendarDateText, active && styles.calendarDateTextActive]}>{day.getDate()}</Text>
                </View>
                <View style={[styles.calendarRecordDot, !hasRecord && styles.calendarRecordDotHidden]} />
              </MotionTouchableOpacity>
            );
          })}
        </View>
      </Card>

      {/* ── Today's shift card ── */}
      <Card>
        <View style={styles.attTodayHeader}>
          <View style={styles.attTodayTag}>
            <ClockIcon size={13} color={COLORS.secondaryDark} />
            <Text style={styles.attTodayTagText}>{selectedIsToday ? "TODAY'S SHIFT" : 'SELECTED DAY'}</Text>
          </View>
          <Text style={styles.attTodayDate}>{selectedDateLabel}</Text>
        </View>

        {/* TIME IN / OUT / DURATION columns */}
        <View style={styles.attTimeRow}>
          <View style={styles.attTimeBox}>
            <Text style={styles.attTimeLabel}>TIME IN</Text>
            <Text style={[styles.attTimeValue, !(selectedLog?.timeIn) && styles.attTimeMuted]}>
              {selectedLog?.timeIn ? attFormatTime(selectedLog.timeIn) : '--:--'}
            </Text>
          </View>
          <View style={styles.attTimeDivider} />
          <View style={styles.attTimeBox}>
            <Text style={styles.attTimeLabel}>TIME OUT</Text>
            <Text style={[styles.attTimeValue, !(selectedLog?.timeOut) && styles.attTimeMuted]}>
              {selectedLog?.timeOut ? attFormatTime(selectedLog.timeOut) : '--:--'}
            </Text>
          </View>
          <View style={styles.attTimeDivider} />
          <View style={styles.attTimeBox}>
            <Text style={styles.attTimeLabel}>DURATION</Text>
            <Text style={[styles.attTimeValue, { color: COLORS.secondary }, !(selectedLog?.timeIn && selectedLog?.timeOut) && styles.attTimeMuted]}>
              {selectedLog?.timeIn && selectedLog?.timeOut ? formatHours(selectedLog.hoursToday) : '--'}
            </Text>
          </View>
        </View>

        {/* Punch buttons */}
        {!selectedIsToday ? (
          selectedLog ? <View style={styles.selectedDayStatus}><Text style={styles.selectedDayStatusText}>{selectedLog.status === 'verified' ? 'Attendance verified' : 'Attendance pending coordinator review'}</Text></View> : <Text style={styles.selectedDayEmpty}>No logs recorded for this day.</Text>
        ) : attLoading ? (
          <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 12 }} />
        ) : !hasTimeIn ? (
          <MotionTouchableOpacity
            style={[styles.attPunchBtn, styles.attPunchIn, saving && { opacity: 0.6 }]}
            onPress={handleTimeIn} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><CheckCircleIcon size={18} color="#fff" /><Text style={styles.attPunchText}>Punch Time In</Text></>}
          </MotionTouchableOpacity>
        ) : !hasTimeOut ? (
          <MotionTouchableOpacity
            style={[styles.attPunchBtn, styles.attPunchOut, saving && { opacity: 0.6 }]}
            onPress={handleTimeOut} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <><ClockIcon size={18} color="#fff" /><Text style={styles.attPunchText}>Log Time Out</Text></>}
          </MotionTouchableOpacity>
        ) : (
          <View style={styles.attDoneBox}>
            <CheckCircleIcon size={18} color={COLORS.successDark} />
            <Text style={styles.attDoneText}>
              Shift complete · {formatHours(todayLog.hoursToday)} logged
            </Text>
          </View>
        )}
      </Card>

      {/* ── Attendance History ── */}
      <View style={styles.attSectionRow}>
        <Text style={styles.attSectionTitle}>ATTENDANCE HISTORY</Text>
        <Text style={styles.attSectionCount}>{attLogs.length} Total Records</Text>
      </View>

      {attLogs.filter(l => selectedIsToday ? l.date !== todayStr : l.date === selectedDate).length === 0 && !attLoading && (
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
            <CalendarIcon size={30} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{selectedIsToday ? 'No previous attendance records yet.' : 'No logs recorded for this day.'}</Text>
          </View>
        </Card>
      )}

      {attLogs.filter(l => selectedIsToday ? l.date !== todayStr : l.date === selectedDate).map(log => (
        <View key={log.id} style={styles.attLogCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.attLogDate}>{attFormatDate(log.date + 'T00:00:00')}</Text>
            <Text style={styles.attLogTime}>
              {attFormatTime(log.timeIn)} — {attFormatTime(log.timeOut)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={styles.attLogHours}>{log.hoursToday ? formatHours(log.hoursToday) : '--'}</Text>
            <View style={[styles.attLogStatus, log.status === 'verified' && styles.attLogStatusVerified]}>
              <Text style={[styles.attLogStatusText, log.status === 'verified' && { color: COLORS.successDark }]}>
                {log.status === 'verified' ? '✓ Verified' : '• Pending'}
              </Text>
            </View>
          </View>
        </View>
      ))}

      {/* ── Weekly Logbook CTA ── */}
      <ActionCard
        Icon={FileIcon}
        title="Weekly Logbook Entries"
        sub="Submit and monitor weekly work summaries with AI enhancement"
        onPress={logbook}
      />

      {/* ── Recent logbook entries ── */}
      <Card>
        <CardTitle Icon={FileIcon} title="Recent logbook entries" />
        {selectedDate === todayStr && !selectedLogbook.length ? (
          <Text style={styles.emptyText}>No logbook entries recorded for this day.</Text>
        ) : selectedLogbook.length ? (
          selectedLogbook.slice(0, 3).map(item => {
            const isApproved = item.status === 'approved';
            const isPending  = !item.status || item.status === 'pending';
            return (
              <View style={styles.logSummaryRow} key={item.id}>
                <View style={[styles.logSummaryDot,
                  { backgroundColor: isApproved ? COLORS.success : isPending ? COLORS.warning : COLORS.danger }]} />
                <View style={styles.logSummaryCopy}>
                  <Text style={styles.logSummaryTitle}>Week {item.weekNum || '—'}</Text>
                  <Text style={styles.logSummarySub}>{item.weekRange || 'Weekly entry'}</Text>
                </View>
                <View style={[
                  styles.logStatusPill,
                  isApproved && styles.logStatusApprovedPill,
                  !isPending && !isApproved && styles.logStatusRejectedPill,
                ]}>
                  <Text style={[
                    styles.logStatusText,
                    isApproved && { color: COLORS.successDark },
                    !isPending && !isApproved && { color: COLORS.dangerDark },
                  ]}>
                    {isApproved ? 'Good' : isPending ? 'Review' : 'Revision'}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>{selectedIsToday ? 'No logbook entries recorded for this day.' : 'No logs recorded for this day.'}</Text>
        )}
      </Card>

    </ScrollView>
  );
}

function ActionCard({ Icon, title, sub, onPress, primary }) {
  return (
    <MotionTouchableOpacity
      style={[styles.actionCard, primary && styles.actionPrimary]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.actionIconContainer,
          primary && { backgroundColor: 'rgba(255, 255, 255, 0.2)' },
        ]}
      >
        <Icon size={22} color={primary ? '#FFFFFF' : COLORS.secondary} />
      </View>
      <View style={styles.actionCopy}>
        <Text style={[styles.actionTitle, primary && { color: '#FFFFFF' }]}>{title}</Text>
        <Text style={[styles.actionSub, primary && { color: 'rgba(255, 255, 255, 0.85)' }]}>
          {sub}
        </Text>
      </View>
      <ChevronRightIcon size={20} color={primary ? '#FFFFFF' : COLORS.textMuted} />
    </MotionTouchableOpacity>
  );
}

function SimplePanel({ title, description, action, onPress, Icon }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text variant="heading" style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSub}>{description}</Text>
      <Card>
        <CardTitle Icon={Icon} title={title} />
        <Text style={styles.detailText}>{description}</Text>
        <MotionTouchableOpacity style={styles.outlineAction} onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
          <Text style={styles.outlineActionText}>{action}</Text>
        </MotionTouchableOpacity>
      </Card>
    </ScrollView>
  );
}

function ProgressPanel({ student, metrics, attendance, logbook, openAttendance, openLogbook, openRequirements, openProgress }) {
  const verifiedDays = attendance.filter(item => item.status === 'verified').length;
  const completedDays = attendance.filter(item => item.timeIn && item.timeOut).length;
  const missingOuts = attendance.filter(item => item.timeIn && !item.timeOut).length;
  const approvedLogs = logbook.filter(item => item.status === 'approved').length;
  const pendingLogs = logbook.filter(item => item.status === 'pending').length;
  const requirementEntries = Object.entries(student?.requirements || {});
  const approvedRequirements = requirementEntries.filter(([, item]) => item?.status === 'approved').length;
  const requirementTotal = requirementEntries.length;
  const clearanceComplete = student?.clearanceStatus === 'cleared';
  const requirementsApproved = student?.requirementsStatus === 'approved';

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.progressPageHeader}><Text variant="heading" style={styles.pageTitle}>Progress Analytics</Text><Text style={styles.pageSub}>Track your OJT hours, attendance, requirements, and performance.</Text></View>

      <Card style={styles.progressHeroCard}>
        <Text style={styles.progressHeroLabel}>TOTAL OJT HOURS</Text>
        <View style={styles.progressHeroStats}><View><Text style={styles.progressHeroNumber}>{metrics.rendered.toFixed(1)}</Text><Text style={styles.progressHeroCaption}>Rendered</Text></View><View style={styles.progressHeroDivider} /><View><Text style={styles.progressHeroNumber}>{metrics.required}</Text><Text style={styles.progressHeroCaption}>Required</Text></View><View style={styles.progressHeroDivider} /><View><Text style={styles.progressHeroNumberAccent}>{metrics.remaining.toFixed(1)}</Text><Text style={styles.progressHeroCaption}>Remaining</Text></View></View>
        <View style={styles.progressHeroTrack}><View style={[styles.progressHeroFill, { width: `${metrics.progress * 100}%` }]} /></View><View style={styles.progressHeroMeta}><Text style={styles.progressHeroCaption}>Training target</Text><Text style={styles.progressHeroPercent}>{Math.round(metrics.progress * 100)}% Complete</Text></View>
      </Card>

      <View style={styles.progressInsight}>
        <ProgressIcon size={18} color={COLORS.primary} />
        <Text style={styles.progressInsightText}>{metrics.remaining > 0 ? `${metrics.remaining.toFixed(1)} hours remain in your OJT requirement.` : 'You have completed your required OJT hours.'} {attendance.length ? `${verifiedDays} attendance day${verifiedDays === 1 ? '' : 's'} verified.` : 'Log attendance to begin building your verified record.'}</Text>
      </View>

      <View style={styles.progressSectionHeader}><Text style={styles.homeSectionTitle}>Your records</Text><Text style={styles.progressSectionCaption}>Updated from your submissions</Text></View>
      <View style={styles.progressRowsPanel}>
        <View style={styles.progressRecordGroup}>
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: COLORS.secondaryLight }]}><CalendarIcon size={17} color={COLORS.primary} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Attendance</Text><Text style={styles.progressRecordSub}>{completedDays} completed shifts · {verifiedDays} verified</Text></View><MotionTouchableOpacity onPress={openAttendance} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Details</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
          <View style={styles.analyticsGrid}><MetricLine label="Attendance days" value={attendance.length} /><MetricLine label="Missing time-outs" value={missingOuts} warning={missingOuts > 0} /></View>
        </View>

        <View style={styles.progressRecordGroup}>
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: requirementsApproved ? COLORS.successLight : COLORS.warningLight }]}><FileIcon size={17} color={requirementsApproved ? COLORS.successDark : COLORS.warningDark} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Requirements</Text><Text style={styles.progressRecordSub}>{requirementsApproved ? 'All documents approved' : requirementTotal ? `${approvedRequirements} of ${requirementTotal} documents approved` : 'Document status will appear here'}</Text></View><MotionTouchableOpacity onPress={openRequirements} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Open</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
        </View>

        <View style={styles.progressRecordGroup}>
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: COLORS.accentLight }]}><LogbookIcon size={17} color={COLORS.accentDark} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Logbook</Text><Text style={styles.progressRecordSub}>{approvedLogs} approved · {pendingLogs} awaiting review</Text></View><MotionTouchableOpacity onPress={openLogbook} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Open</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
          <View style={styles.analyticsGrid}><MetricLine label="Total entries" value={logbook.length} /><MetricLine label="Approved entries" value={approvedLogs} /></View>
        </View>
      </View>

      <View style={[styles.clearanceNotice, clearanceComplete ? styles.clearanceSuccess : styles.clearancePending]}>
        <CheckCircleIcon size={20} color={clearanceComplete ? COLORS.successDark : COLORS.warningDark} />
        <View style={styles.statusSummaryCopy}><Text style={[styles.statusSummaryTitle, { color: clearanceComplete ? COLORS.successDark : COLORS.warningDark }]}>{clearanceComplete ? 'Official OJT clearance granted' : 'Clearance not yet complete'}</Text><Text style={styles.statusSummarySub}>{clearanceComplete ? 'Your coordinator has approved your OJT records.' : 'Complete approved requirements and required hours to become eligible.'}</Text></View>
      </View>

      <MotionTouchableOpacity style={styles.outlineAction} onPress={openProgress} accessibilityRole="button"><Text style={styles.outlineActionText}>Open detailed progress screen</Text></MotionTouchableOpacity>
    </ScrollView>
  );
}

function MetricLine({ label, value, warning }) { return <View style={styles.metricLine}><Text style={styles.metricLineLabel}>{label}</Text><Text style={[styles.metricLineValue, warning && { color: COLORS.warningDark }]}>{value}</Text></View>; }

function ProfilePanel({ student, onLogout, onSettings, onPhotoPress, onRequestPlacementChange }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text variant="heading" style={styles.pageTitle}>Profile</Text>
      <Text style={styles.pageSub}>Institutional student information and preferences.</Text>

      <Card style={styles.profileLarge}>
        <MotionTouchableOpacity onPress={onPhotoPress} accessibilityRole="button" accessibilityLabel="Change profile picture" style={styles.avatarLarge}>
          {student?.profilePhotoUrl ? <Image source={{ uri: student.profilePhotoUrl }} style={styles.avatarImageLarge} /> : <Text style={styles.avatarLargeText}>{initials(student)}</Text>}
          <View style={styles.avatarEditBadge}><Text style={styles.avatarEditText}>+</Text></View>
        </MotionTouchableOpacity>
        <Text style={styles.photoHint}>Tap your photo to change it</Text>
        <Text style={styles.profileLargeName}>
          {student?.firstName} {student?.lastName || ''}
        </Text>
        <Text style={styles.profileLargeDept}>
          {student?.department || student?.course || 'Student'}
        </Text>
        <View style={styles.profileBadge}>
          <Text style={styles.profileBadgeText}>
            {student?.accountApproved ? '✓ Active Student' : 'Account Under Review'}
          </Text>
        </View>
      </Card>

      <Card>
        <CardTitle Icon={ProfileIcon} title="Student Details" />
        <InfoRow label="Student ID" value={student?.idNumber || student?.studentId || '—'} />
        <InfoRow label="Email" value={student?.email || '—'} />
        <InfoRow label="Department" value={student?.department || '—'} />
        <InfoRow
          label="Required Hours"
          value={`${student?.hoursRequired || 486} Hours`}
        />
      </Card>

      <Card>
        <CardTitle Icon={BuildingIcon} title="OJT Placement" />
        <InfoRow label="Company" value={student?.company || 'Not yet assigned'} />
        <InfoRow label="Supervisor" value={student?.supervisorName || '—'} />
        <Text style={styles.placementReadOnlyNote}>Official placement details are verified and managed by your coordinator.</Text>
        {student?.company && <MotionTouchableOpacity style={styles.placementRequestButton} onPress={onRequestPlacementChange} activeOpacity={0.85} accessibilityRole="button"><Text style={styles.placementRequestText}>Request placement change</Text><ChevronRightIcon size={16} color={COLORS.secondary} /></MotionTouchableOpacity>}
      </Card>

      <MotionTouchableOpacity style={styles.settingsCard} onPress={onSettings} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open settings">
        <View style={styles.settingIcon}><SettingsIcon size={18} color={COLORS.secondary} /></View>
        <View style={styles.settingCopy}><Text style={styles.settingTitle}>Settings</Text><Text style={styles.settingValue}>Account, notifications, appearance, help, and privacy</Text></View>
        <ChevronRightIcon size={18} color={COLORS.textMuted} />
      </MotionTouchableOpacity>

      <MotionTouchableOpacity
        style={styles.profileLogoutBtn}
        onPress={onLogout}
        activeOpacity={0.85}
      >
        <LogOutIcon size={18} color="#FFFFFF" />
        <Text style={styles.profileLogoutBtnText}>Sign Out</Text>
      </MotionTouchableOpacity>
    </ScrollView>
  );
}

function SettingsPanel({ student, onBack, onLogout }) {
  const fullName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';
  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <MotionTouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to profile" style={styles.settingsBack}>
        <ChevronIcon size={16} color={COLORS.secondary} expanded />
        <Text style={styles.settingsBackText}>Profile</Text>
      </MotionTouchableOpacity>
      <Text variant="heading" style={styles.pageTitle}>Settings</Text>
      <Text style={styles.pageSub}>Manage your account and app preferences.</Text>
      <Card><CardTitle Icon={ProfileIcon} title="Account" /><InfoRow label="Student" value={fullName} /><InfoRow label="Account status" value={student?.accountApproved ? 'Approved' : 'Under review'} /><InfoRow label="Email" value={student?.email || '—'} /></Card>
      <Card><CardTitle Icon={BellIcon} title="App preferences" /><SettingRow Icon={BellIcon} title="Notifications" value="Coordinator updates enabled" /><SettingRow Icon={SettingsIcon} title="Appearance" value="System default" /></Card>
      <Card><CardTitle Icon={FileIcon} title="Support and privacy" /><SettingRow Icon={FileIcon} title="Help center" value="PATHWAY support information" /><SettingRow Icon={FileIcon} title="Privacy" value="Review how your records are used" /></Card>
      <MotionTouchableOpacity onPress={onLogout} style={styles.profileLogoutBtn} accessibilityRole="button"><LogOutIcon size={18} color="#FFFFFF" /><Text style={styles.profileLogoutBtnText}>Sign Out</Text></MotionTouchableOpacity>
    </ScrollView>
  );
}

function SettingRow({ Icon, title, value }) {
  return <View style={styles.settingRow}><View style={styles.settingIcon}><Icon size={16} color={COLORS.secondary} /></View><View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingValue}>{value}</Text></View><ChevronRightIcon size={15} color={COLORS.textMuted} /></View>;
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
    padding: 28,
  },
  errorHeader: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: COLORS.primaryDark,
  },
  dashboardErrorScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 28 },
  errorIconCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.dangerLight },
  dashboardErrorTitle: { maxWidth: 330, marginTop: 18, color: COLORS.textPrimary, fontSize: 27, lineHeight: 34, fontWeight: '700', textAlign: 'center' },
  dashboardErrorDescription: { maxWidth: 330, marginTop: 9, marginBottom: 24, color: COLORS.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  errorRetryButton: { minHeight: 48, minWidth: 156, paddingHorizontal: 20, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primary },
  errorRetryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  errorSignOutButton: { minHeight: 44, paddingHorizontal: 16, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  errorSignOutText: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600' },
  content: {
    flex: 1,
  },
  refreshStatus: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20 },
  refreshStatusText: { color: COLORS.textMuted, fontSize: 12 },
  dashboardErrorBanner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: 10, padding: 11, borderRadius: 12, backgroundColor: COLORS.dangerSubtle, borderWidth: 1, borderColor: COLORS.dangerLight },
  dashboardErrorText: { flex: 1, minWidth: 150, color: COLORS.dangerDark, fontSize: 12, lineHeight: 17 },
  retryButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  retryButtonText: { color: COLORS.dangerDark, fontSize: 12, fontWeight: '700' },
  // Top Header
  header: {
    backgroundColor: COLORS.primaryDark,
    paddingTop: Platform.OS === 'ios' ? 48 : 16,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogoBadge: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogoLetter: {
    color: COLORS.primaryDark,
    fontWeight: '900',
    fontSize: 19,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  headerCampus: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSettingsBtn: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 18,
    paddingBottom: 112,
    gap: 18,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 15,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...SHADOWS.soft,
  },
  profileHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
  },
  profileCopy: {
    flex: 1,
  },
  homeWelcome: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, paddingBottom: 2 },
  homeWelcomeCopy: { flex: 1, gap: 3 },
  homeEyebrow: { color: COLORS.secondaryDark, fontSize: 10, fontWeight: '600', letterSpacing: 0.55 },
  greeting: {
    color: COLORS.textPrimary,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  homeProgressHero: { backgroundColor: COLORS.primaryDark, borderRadius: 20, padding: 20, borderWidth: 0 },
  homeProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  homeProgressLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  homeProgressLabel: { color: '#BBD3EA', fontSize: 10, fontWeight: '800', letterSpacing: 0.9 },
  homeProgressPercent: { color: COLORS.brandGold, fontSize: 12, fontWeight: '800' },
  homeHoursValue: { color: '#FFFFFF', fontSize: 34, lineHeight: 42, fontWeight: '700', letterSpacing: -0.6, marginTop: 12 },
  homeHoursTotal: { color: '#BBD3EA', fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  homeProgressTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF25', overflow: 'hidden', marginTop: 14 },
  homeProgressFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.brandGold },
  homeProgressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  homeProgressRemaining: { color: '#D5E3F1', fontSize: 12, fontWeight: '600' },
  homeProgressLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  homeProgressLinkText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  homeStatsStrip: { flexDirection: 'row', backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingVertical: 6, paddingHorizontal: 2 },
  homeStatCell: { flex: 1, gap: 4 },
  homeStatDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  homeStatLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.45 },
  homeStatValue: { color: COLORS.textPrimary, fontSize: 21, fontWeight: '700', lineHeight: 27 },
  homeStatHint: { color: COLORS.textSecondary, fontSize: 11 },
  homeSectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  homeSectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: -0.15 },
  homePlacementRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: 'transparent', borderRadius: 0, paddingVertical: 13, paddingHorizontal: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.borderLight },
  homePlacementMark: { width: 30, height: 34, borderRadius: 0, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  homePlacementCopy: { flex: 1, minWidth: 0 },
  homePlacementStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 6, borderRadius: RADIUS.full },
  homePlacementConfirmed: { backgroundColor: COLORS.successLight },
  homePlacementPending: { backgroundColor: COLORS.warningLight },
  homePlacementDot: { width: 6, height: 6, borderRadius: 3 },
  homePlacementDotConfirmed: { backgroundColor: COLORS.successDark },
  homePlacementDotPending: { backgroundColor: COLORS.warningDark },
  homePlacementStatusText: { fontSize: 10, fontWeight: '800' },
  homePlacementStatusConfirmedText: { color: COLORS.successDark },
  homePlacementStatusPendingText: { color: COLORS.warningDark },
  homeActivityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  homeSeeAll: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  activityList: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingHorizontal: 0 },
  activityRowFirst: { borderTopWidth: 0 },
  activityEmpty: { paddingVertical: 14 },
  profileCompany: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  profileDepartment: {
    color: COLORS.textMuted,
    fontSize: 11.5,
    marginTop: 1,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minHeight: 96,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: COLORS.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 10,
  },
  metricMuted: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 14.5,
    fontWeight: '800',
  },
  cardAction: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  taskText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  progressTrack: {
    height: 9,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.secondaryLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.secondary,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  progressCaption: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  companyName: {
    color: COLORS.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  detailText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  pillRow: {
    marginTop: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
    color: COLORS.textSecondary,
    fontSize: 12.5,
    fontWeight: '500',
  },
  activityDate: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
  },
  // ── Logs Panel ──────────────────────────────────────────────────────────────
  logsPageHeader: { gap: 4 },
  attHeroCard: { backgroundColor: COLORS.primaryDark, borderRadius: RADIUS.lg, padding: 18, ...SHADOWS.card },
  calendarCard: { marginTop: -4, padding: 14 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  calendarMonth: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  calendarNav: { flexDirection: 'row', gap: 4 },
  calendarNavButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  calendarChevronLeft: { transform: [{ rotate: '90deg' }] },
  calendarChevronRight: { transform: [{ rotate: '-90deg' }] },
  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  calendarDay: { flex: 1, alignItems: 'center', gap: 4 },
  calendarWeekday: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  calendarDateCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  calendarDateActive: { backgroundColor: COLORS.secondary },
  calendarDateToday: { borderWidth: 1, borderColor: COLORS.secondary },
  calendarDateText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  calendarDateTextActive: { color: '#FFFFFF', fontWeight: '900' },
  calendarRecordDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.secondary },
  calendarRecordDotHidden: { opacity: 0 },
  attHeroRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  attHeroSub: { color: '#93C5FD', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  attHeroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', marginTop: 5 },
  attHoursBadge: { backgroundColor: '#FFFFFF18', borderRadius: RADIUS.full, paddingHorizontal: 10, paddingVertical: 6 },
  attHoursBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  attProgressBg: { height: 9, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF24', overflow: 'hidden' },
  attProgressFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.brandGold },
  attProgressMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 },
  attProgressSub: { color: '#CBD5E1', fontSize: 11 },
  attProgressPct: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  attTodayHeader: { marginBottom: 14 },
  attTodayTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attTodayTagText: { color: COLORS.secondary, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  attTodayDate: { color: COLORS.textMuted, fontSize: 12, marginTop: 5 },
  attTimeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  attTimeBox: { flex: 1, alignItems: 'center' },
  attTimeDivider: { width: 1, height: 38, backgroundColor: COLORS.borderLight },
  attTimeLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  attTimeValue: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 6 },
  attTimeMuted: { color: COLORS.textMuted },
  attPunchBtn: { minHeight: 48, borderRadius: RADIUS.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  attPunchIn: { backgroundColor: COLORS.secondary },
  attPunchOut: { backgroundColor: COLORS.primary },
  attPunchText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  attDoneBox: { backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selectedDayStatus: { backgroundColor: COLORS.secondarySubtle, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 9, marginTop: 2 },
  selectedDayStatusText: { color: COLORS.secondaryDark, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  selectedDayEmpty: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2 },
  attDoneText: { color: COLORS.successDark, fontSize: 13, fontWeight: '800' },
  placementReadOnlyNote: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  placementRequestButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  placementRequestText: { color: COLORS.secondary, fontSize: 12, fontWeight: '800' },
  attSectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  attSectionTitle: { color: COLORS.textPrimary, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  attSectionCount: { color: COLORS.textMuted, fontSize: 11 },
  attLogCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.md, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.soft },
  attLogDate: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  attLogTime: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  attLogHours: { color: COLORS.secondary, fontSize: 13, fontWeight: '900' },
  attLogStatus: { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  attLogStatusVerified: { backgroundColor: COLORS.successLight },
  attLogStatusText: { color: COLORS.warningDark, fontSize: 10, fontWeight: '800' },
  // Hero OJT Hours card
  logsHeroCard: { paddingBottom: 16 },
  logsHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  logsHeroLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  logsHeroBig: { color: COLORS.textPrimary, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  logsHeroOf: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  logsHeroPct: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: RADIUS.full },
  logsHeroPctText: { fontSize: 13, fontWeight: '800' },
  logsProgressTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.secondaryLight, overflow: 'hidden', marginBottom: 8 },
  logsProgressFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.secondary },
  logsHeroCaption: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  // Shift columns
  shiftColumns: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  shiftCol: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  shiftColDivider: { width: 1, height: 40, backgroundColor: COLORS.borderLight },
  shiftLabel: { color: COLORS.textMuted, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase' },
  shiftValue: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  shiftValueMuted: { color: COLORS.textMuted, fontWeight: '600' },
  shiftWarning: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: COLORS.warningSubtle, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 8, marginTop: 10 },
  shiftInfoBg: { backgroundColor: COLORS.secondarySubtle },
  shiftWarningText: { color: COLORS.warningDark, fontSize: 11.5, fontWeight: '700', flex: 1 },
  // Log summary rows
  logSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  logSummaryDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logSummaryCopy: { flex: 1 },
  logSummaryTitle: { color: COLORS.textPrimary, fontSize: 12.5, fontWeight: '800' },
  logSummarySub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  logSummaryHours: { color: COLORS.secondary, fontSize: 12.5, fontWeight: '800' },
  logStatusPill: { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4 },
  logStatusApprovedPill: { backgroundColor: COLORS.successLight },
  logStatusRejectedPill: { backgroundColor: COLORS.dangerLight },
  logStatusText: { color: COLORS.warningDark, fontSize: 10.5, fontWeight: '800', overflow: 'hidden' },
  // Logs panel
  pageTitle: {
    color: COLORS.textPrimary,
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: -0.35,
  },
  pageSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 1,
    marginBottom: 4,
  },
  actionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  actionPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
    ...SHADOWS.card,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    color: COLORS.textPrimary,
    fontWeight: '800',
    fontSize: 15,
  },
  actionSub: {
    color: COLORS.textSecondary,
    fontSize: 11.5,
    marginTop: 2,
    lineHeight: 16,
  },
  outlineAction: {
    borderWidth: 1.5,
    borderColor: COLORS.secondary,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  outlineActionText: {
    color: COLORS.secondary,
    fontWeight: '800',
    fontSize: 13,
  },
  // Profile panel
  progressPageHeader: { gap: 4 },
  progressHeroCard: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.primaryDark },
  progressHeroLabel: { color: '#93C5FD', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  progressHeroStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginVertical: 18 },
  progressHeroNumber: { color: '#FFFFFF', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  progressHeroNumberAccent: { color: COLORS.brandGold, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  progressHeroCaption: { color: '#BBD3EA', fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  progressHeroDivider: { width: 1, height: 38, backgroundColor: '#FFFFFF25' },
  progressHeroTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: '#FFFFFF25', overflow: 'hidden' },
  progressHeroFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.brandGold },
  progressHeroMeta: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  progressHeroPercent: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  progressMetricGrid: { flexDirection: 'row', gap: 12 },
  progressMetricCard: { flex: 1, minHeight: 100 },
  progressMetricNumber: { color: COLORS.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 9 },
  progressMetricLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginTop: 3 },
  insightCard: { backgroundColor: COLORS.secondarySubtle || COLORS.primaryLight, borderColor: COLORS.secondaryLight },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightTitle: { color: COLORS.primary, fontSize: 15, fontWeight: '900' },
  insightText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  progressInsight: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 13, borderRadius: 12, backgroundColor: COLORS.secondarySubtle, borderWidth: 1, borderColor: COLORS.borderLight },
  progressInsightText: { flex: 1, color: COLORS.textSecondary, fontSize: 12.5, lineHeight: 19 },
  progressSectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  progressSectionCaption: { color: COLORS.textMuted, fontSize: 10.5 },
  progressRowsPanel: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, borderRadius: 15, paddingHorizontal: 14 },
  progressRecordGroup: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  progressRecordHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressRecordIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  progressRecordCopy: { flex: 1, minWidth: 0 },
  progressRecordTitle: { color: COLORS.textPrimary, fontSize: 13.5, fontWeight: '800' },
  progressRecordSub: { color: COLORS.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  progressRecordAction: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 4 },
  progressRecordActionText: { color: COLORS.primary, fontSize: 11.5, fontWeight: '800' },
  clearanceNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 13, borderWidth: 1, padding: 14 },
  analyticsGrid: { gap: 0 },
  metricLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  metricLineLabel: { color: COLORS.textSecondary, fontSize: 12 },
  metricLineValue: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '900' },
  statusSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDotLarge: { width: 11, height: 11, borderRadius: 6 },
  statusSummaryCopy: { flex: 1 },
  statusSummaryTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '900' },
  statusSummarySub: { color: COLORS.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 2 },
  clearanceSuccess: { backgroundColor: COLORS.successLight, borderColor: '#A7F3D0' },
  clearancePending: { backgroundColor: COLORS.warningLight, borderColor: '#FDE68A' },
  profileLarge: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatarLarge: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
    ...SHADOWS.soft,
  },
  avatarImageLarge: { width: '100%', height: '100%', borderRadius: 24 },
  avatarEditBadge: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  avatarEditText: { color: '#FFFFFF', fontSize: 18, lineHeight: 20, fontWeight: '800' },
  photoHint: { color: COLORS.secondary, fontSize: 11, fontWeight: '700', marginTop: -4, marginBottom: 10 },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },
  profileLargeName: {
    color: COLORS.textPrimary,
    fontWeight: '900',
    fontSize: 18,
  },
  profileLargeDept: {
    color: COLORS.textSecondary,
    fontSize: 12.5,
    marginTop: 2,
  },
  profileBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 8,
  },
  profileBadgeText: {
    color: COLORS.successDark,
    fontSize: 11.5,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  infoLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  infoValue: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 12.5,
    maxWidth: '65%',
    textAlign: 'right',
  },
  settingsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  settingValue: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  settingsBack: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: -4 },
  settingsBackText: { color: COLORS.secondary, fontSize: 13, fontWeight: '800' },
  profileLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: 6,
    ...SHADOWS.soft,
  },
  profileLogoutBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  // Bottom Bar
  floatingActions: { position: 'absolute', right: 14, bottom: 72, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 4 },
  quickMessageButton: { minHeight: 44, paddingHorizontal: 13, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, ...SHADOWS.soft },
  quickMessageText: { color: COLORS.primaryDark, fontSize: 12, fontWeight: '700' },
  quickLogButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, ...SHADOWS.soft },
  quickLogText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.primaryDark,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minHeight: 46,
    justifyContent: 'center',
  },
  tabIconContainer: {
    minWidth: 42,
    height: 30,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainerActive: {
    backgroundColor: COLORS.secondary,
  },
  tabLabel: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  // Gate
  gateIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  gateTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 20,
  },
  gateSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 320,
  },
  gateBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 24,
    ...SHADOWS.hover,
  },
  gateBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  logoutBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
