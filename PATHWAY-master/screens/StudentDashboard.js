// screens/StudentDashboard.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Image,
  Platform,
  Pressable,
  StatusBar,
  Switch,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import * as DocumentPicker from 'expo-document-picker';
import { auth, db } from '../firebaseConfig';
import { studentHours } from '../services/studentHours';
import { requestBackend, postBackend } from '../services/backendApi';
import { studentAlert as Alert } from '../services/studentAlert';
import { punchAttendance } from '../services/attendanceLocation';
import usePlacementEligibility, { PLACEMENT_REQUIRED } from '../services/usePlacementEligibility';
import { uploadCloudinaryFile } from '../services/cloudinaryUpload';
import { nextPreDeploymentAction, hasCompletedPreDeployment } from '../services/preDeploymentStatus';
import { getStudentNotificationsEnabled, setStudentNotificationsEnabled } from '../services/studentPreferences';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import { MotionTouchableOpacity, ScreenEntrance, useReducedMotion } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import ScrollView, { StudentRefreshContext } from '../components/RefreshableScrollView';
import ApprovalWelcome from '../components/ApprovalWelcome';
import HomePanel from '../components/ApprovedStudentHome';
import StudentSurface from '../components/StudentSurface';
import LogsCalendarArtwork from '../components/LogsCalendarArtwork';
import ProgressCardArtwork from '../components/ProgressCardArtwork';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PathwayMark from '../components/PathwayMark';
import PreDeploymentTopBar from '../components/PreDeploymentTopBar';
import PreDeploymentDrawer from '../components/PreDeploymentDrawer';
import PreDeploymentNotificationsSheet from '../components/PreDeploymentNotificationsSheet';
import StudentLogoutScreen from '../components/StudentLogoutScreen';
import useStudentLogout from '../hooks/useStudentLogout';
import { buildActivity } from '../services/recordPagination';
import { attendanceHistoryForDate } from '../services/attendanceHistory';
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
  InfoIcon,
  LogbookIcon,
  LogOutIcon,
  MailIcon,
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
  { key: 'settings', label: 'Settings', Icon: SettingsIcon },
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

const DEFAULT_PREDEPLOYMENT_REQUIREMENT_IDS = [
  'application_form',
  'updated_resume',
  'medical_certificate',
  'endorsement_letter',
  'signed_moa',
];

const toTimestamp = value => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

async function loadPreDeploymentSummary(uid, profile) {
  const optionalRead = promise => promise.catch(error => {
    console.warn('Unable to load one pre-deployment summary section.', error);
    return null;
  });
  const [configuredRequirements, proposalSnapshot, reviewSnapshot] = await Promise.all([
    profile.sectionId
      ? optionalRead(getDocs(collection(db, 'sections', profile.sectionId, 'requirements')))
      : Promise.resolve(null),
    optionalRead(getDocs(query(collection(db, 'companyProposals'), where('studentId', '==', uid)))),
    optionalRead(getDocs(query(collection(db, 'finalReviewRequests'), where('studentId', '==', uid)))),
  ]);

  const latestRecord = snapshot => (snapshot?.docs || [])
    .map(item => ({ id: item.id, ...item.data() }))
    .sort((a, b) => toTimestamp(b.updatedAt || b.createdAt) - toTimestamp(a.updatedAt || a.createdAt))[0] || null;
  const latestProposal = latestRecord(proposalSnapshot);
  const latestReview = latestRecord(reviewSnapshot);
  const assignedRequirements = configuredRequirements?.docs?.length
    ? configuredRequirements.docs.map(item => ({ id: item.id, ...item.data() }))
    : DEFAULT_PREDEPLOYMENT_REQUIREMENT_IDS.map(id => ({ id, required: true, category: 'Pre-OJT' }));
  const requiredRequirements = assignedRequirements.filter(item =>
    item.required !== false && (!item.category || /pre|deploy/i.test(item.category))
  );
  const savedRequirements = profile.requirements || {};
  const submittedCount = profile.requirementsStatus === 'approved'
    ? requiredRequirements.length
    : requiredRequirements.filter(item => ['submitted', 'approved'].includes(savedRequirements[item.id]?.status)).length;
  const needsChangesCount = requiredRequirements.filter(item =>
    ['needs_revision', 'rejected'].includes(savedRequirements[item.id]?.status)
  ).length;
  const reviewStatus = latestReview?.status
    || (!reviewSnapshot && ['pending_review', 'needs_revision', 'rejected'].includes(profile.preDeploymentStatus)
      ? profile.preDeploymentStatus
      : 'not_submitted');
  const submittedAt = latestReview?.submittedAt;

  return {
    accountApproved: profile.accountApproved === true,
    requirements: {
      status: profile.requirementsStatus || 'not_submitted',
      received: submittedCount,
      total: requiredRequirements.length,
      needsChanges: needsChangesCount,
    },
    placement: {
      status: profile.placementStatus === 'approved' ? 'approved'
        : (latestProposal?.status === 'approved' ? 'not_started' : latestProposal?.status || profile.placementStatus || 'not_started'),
      companyName: profile.company || profile.companyName || latestProposal?.companyName || '',
      supervisorName: profile.supervisorName || latestProposal?.supervisorName || '',
    },
    review: {
      status: reviewStatus,
      submittedAt: typeof submittedAt?.toDate === 'function' ? submittedAt.toDate().toISOString() : submittedAt || '',
      reviewReason: latestReview?.reviewReason || '',
    },
  };
}

// Remember whether the student last saw the pre-deployment gate or the approved workspace,
// so the loading skeleton matches the screen that is about to appear.
const SKELETON_KIND_KEY = 'pathway.dashboardSkeletonKind';
let lastSkeletonKind = null;

export default function StudentDashboard({ navigation }) {
  const [skeletonKind, setSkeletonKind] = useState(lastSkeletonKind || 'dashboard');
  useEffect(() => {
    if (lastSkeletonKind) return;
    AsyncStorage.getItem(SKELETON_KIND_KEY).then(kind => {
      if (kind === 'gate' || kind === 'dashboard') { lastSkeletonKind = kind; setSkeletonKind(kind); }
    }).catch(() => {});
  }, []);
  const [student, setStudent] = useState(null);
  const [preDeploymentSummary, setPreDeploymentSummary] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [logbook, setLogbook] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('home');
  const [hoveredTab, setHoveredTab] = useState(null);
  const [focusedTab, setFocusedTab] = useState(null);
  const [hoveredMessage, setHoveredMessage] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationPreferenceLoaded, setNotificationPreferenceLoaded] = useState(false);
  const { loggingOut, logout } = useStudentLogout(navigation);
  const fade = useRef(new Animated.Value(1)).current;
  const summaryRequestRef = useRef(0);
  const reducedMotion = useReducedMotion();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const studentUid = auth.currentUser?.uid;
  const approvedForOjt = hasCompletedPreDeployment(student);
  useEffect(() => {
    if (!studentUid || loggingOut) return;
    return onSnapshot(query(collection(db, 'notifications'), where('recipientId', '==', studentUid)), snapshot => {
      if (auth.currentUser?.uid === studentUid) setNotifications(snapshot.docs.map(item => ({ ...item.data(), id: item.id })));
    }, () => {
      if (auth.currentUser?.uid === studentUid) console.warn('Live notification updates could not connect.');
    });
  }, [studentUid, loggingOut]);

  const approvalWelcomeKey = approvedForOjt && studentUid
    ? `pathway:approval-welcome:v1:${studentUid}:${student.placementProposalId || 'initial'}` : null;
  const [welcomeCheckedKey, setWelcomeCheckedKey] = useState(null);
  const [showApprovalWelcome, setShowApprovalWelcome] = useState(false);
  const completedWelcomeKeys = useRef(new Set());
  useEffect(() => {
    if (!approvalWelcomeKey) { setShowApprovalWelcome(false); setWelcomeCheckedKey(null); return; }
    let active = true;
    AsyncStorage.getItem(approvalWelcomeKey).then(seen => {
      if (!active) return;
      setShowApprovalWelcome(seen !== 'true' && !completedWelcomeKeys.current.has(approvalWelcomeKey));
      setWelcomeCheckedKey(approvalWelcomeKey);
    }).catch(() => {
      if (active) { setShowApprovalWelcome(false); setWelcomeCheckedKey(approvalWelcomeKey); }
    });
    return () => { active = false; };
  }, [approvalWelcomeKey]);
  const finishApprovalWelcome = () => {
    if (!approvalWelcomeKey || completedWelcomeKeys.current.has(approvalWelcomeKey)) return;
    completedWelcomeKeys.current.add(approvalWelcomeKey);
    setShowApprovalWelcome(false);
    AsyncStorage.setItem(approvalWelcomeKey, 'true').catch(() => {});
  };

  useEffect(() => {
    let active = true;
    if (!studentUid) {
      setNotificationPreferenceLoaded(true);
      return () => { active = false; };
    }
    getStudentNotificationsEnabled(studentUid)
      .then(value => {
        if (!active) return;
        setNotificationsEnabled(value);
        setNotificationPreferenceLoaded(true);
      })
      .catch(error => {
        console.warn('Unable to read student notification preference; using enabled by default.', error);
        if (active) setNotificationPreferenceLoaded(true);
      });
    return () => { active = false; };
  }, [studentUid]);

  const changeNotificationsPreference = async enabled => {
    const previous = notificationsEnabled;
    setNotificationsEnabled(enabled);
    try {
      await setStudentNotificationsEnabled(studentUid, enabled);
    } catch (error) {
      setNotificationsEnabled(previous);
      Alert.alert('Preference not saved', 'Your notification setting could not be saved. Please try again.');
    }
  };

  const load = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoadError('Your student session is unavailable. Sign in again to continue.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    setPreDeploymentSummary(null);
    const summaryRequestId = ++summaryRequestRef.current;
    try {
      const [user, att, logs] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(query(collection(db, 'users', uid, 'attendance'), orderBy('date', 'desc'))),
        getDocs(query(collection(db, 'users', uid, 'logbook'), orderBy('createdAt', 'desc'))),
      ]);
      if (!user.exists()) {
        setStudent(null);
        setLoadError('Your student profile could not be found. Sign out and sign in again, or contact your coordinator.');
        return;
      }
      const profile = user.data();
      setStudent(profile);
      if (!hasCompletedPreDeployment(profile)) {
        loadPreDeploymentSummary(uid, profile)
          .then(summary => {
            if (summaryRequestRef.current === summaryRequestId) setPreDeploymentSummary(summary);
          })
          .catch(error => console.warn('Unable to build the pre-deployment dashboard summary.', error));
      }
      setAttendance(att.docs.map(item => ({ id: item.id, ...item.data() })));
      setLogbook(logs.docs.map(item => ({ id: item.id, ...item.data() })));
    } catch (error) {
      console.error('Unable to load student dashboard', error);
      setLoadError('Failed to load dashboard data. Check your network connection.');
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation]);

  useEffect(() => {
    if (!studentUid || loggingOut) return;
    let firstSnapshot = true;
    return onSnapshot(doc(db, 'users', studentUid), () => {
      if (firstSnapshot) { firstSnapshot = false; return; }
      load();
    }, error => {
      // Revoking the session can race the listener cleanup during sign-out.
      if (auth.currentUser?.uid === studentUid) console.warn('Unable to watch student approval updates.', error);
    });
  }, [studentUid, loggingOut]);

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
    const { rendered, required } = studentHours(student);
    const verified = attendance.filter(item => item.status === 'verified').length;
    return {
      rendered,
      required,
      progress: Math.min(rendered / Math.max(required, 1), 1),
      remaining: Math.max(required - rendered, 0),
      verifiedShifts: verified,
      totalShifts: attendance.length,
      attendancePercent: attendance.length
        ? Math.round((verified / attendance.length) * 100)
        : null,
      pendingLogs: logbook.filter(item => item.status === 'pending').length,
      unread: notificationsEnabled ? notifications.filter(item => !item.read).length : 0,
    };
  }, [student, attendance, logbook, notifications, notificationsEnabled]);

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

  const gateProps = {
    logout,
    navigation,
    student,
    summary: preDeploymentSummary,
    onRequirementsPress: () => navigation.navigate('StudentRequirements'),
    onCompanyPress: () => navigation.navigate('Company'),
    onReviewPress: () => navigation.navigate('Review'),
    onApprovalPress: () => navigation.navigate('Approval'),
  };

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading && !student) {
    return <StudentScreenSkeleton variant={skeletonKind} />;
  }

  if (loadError && !student) {
    return <DashboardLoadError message={loadError} onRetry={load} onLogout={logout} />;
  }

  if (approvalWelcomeKey && welcomeCheckedKey !== approvalWelcomeKey) return <StudentScreenSkeleton variant="dashboard" />;
  if (approvedForOjt && showApprovalWelcome) return <ApprovalWelcome onComplete={finishApprovalWelcome} />;

  if (!hasCompletedPreDeployment(student)) {
    if (lastSkeletonKind !== 'gate') { lastSkeletonKind = 'gate'; AsyncStorage.setItem(SKELETON_KIND_KEY, 'gate').catch(() => {}); }
    const next = nextPreDeploymentAction(student || {}, preDeploymentSummary);
    return (
      <Gate
        {...gateProps}
        {...next}
        icon={next.waiting ? <ClockIcon size={46} color={COLORS.accent} /> : <FileIcon size={46} color={COLORS.secondary} />}
        iconBg={next.waiting ? COLORS.accentLight : COLORS.secondaryLight}
        onPress={next.route ? () => navigation.navigate(next.route) : undefined}
      />
    );
  }

  if (lastSkeletonKind !== 'dashboard') { lastSkeletonKind = 'dashboard'; AsyncStorage.setItem(SKELETON_KIND_KEY, 'dashboard').catch(() => {}); }
  const recent = buildActivity(attendance, logbook, notificationsEnabled ? notifications : []).slice(0, 5).map(item => ({
    ...item, date: dateLabel(item.createdAt),
    Icon: item.type === 'attendance' ? ClockIcon : item.type === 'journal' ? FileIcon : BellIcon,
    color: item.type === 'attendance' ? COLORS.secondary : item.type === 'journal' ? COLORS.accent : COLORS.primary,
  }));

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

      {/* Student workspace top bar */}
      <View style={[styles.header, styles.homeHeader, { paddingTop: Math.max(14, insets.top) }]}>
        <Pressable
          onPress={() => { setSettingsVisible(false); switchTab('profile'); }}
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerActionPressed]}
          accessibilityLabel="Open profile"
          accessibilityRole="button"
        >
          <ProfileIcon size={20} color={COLORS.primaryDark} />
        </Pressable>
        <View pointerEvents="none" style={styles.headerBrandCenter}><PathwayMark size={38} decorative /></View>
        <Pressable
          onPress={() => navigation.navigate('Notifications', { initialTab: 'notifications' })}
          style={({ pressed }) => [styles.headerIconBtn, pressed && styles.headerActionPressed]}
          accessibilityLabel="Notifications"
          accessibilityRole="button"
        >
          <BellIcon size={20} color={COLORS.primaryDark} hasUnread={metrics.unread > 0} />
        </Pressable>
      </View>

      {/* Main Tab Panel Content */}
      <StudentRefreshContext.Provider value={{ reload: load, variant: tab === 'progress' ? 'progress' : tab === 'logs' ? 'logbook' : tab === 'profile' ? 'profile' : 'dashboard' }}>
      <Animated.View style={[styles.content, { opacity: fade }]}>
        {loading && student ? (
          <View style={styles.refreshStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={COLORS.secondary} />
            <Text style={styles.refreshStatusText}>Updating...</Text>
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
            openAttendance={() => navigation.navigate('LogToday')}
            openProgress={() => navigation.navigate('Progress')}
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
            openRequirements={() => navigation.navigate('StudentRequirements')}
            openProgress={() => navigation.navigate('Progress')}
          />
        )}
        {tab === 'profile' && (settingsVisible
          ? <SettingsPanel
            student={student}
            notificationsEnabled={notificationsEnabled}
            notificationPreferenceLoaded={notificationPreferenceLoaded}
            onNotificationsEnabledChange={changeNotificationsPreference}
            onBack={() => setSettingsVisible(false)}
            onLogout={logout}
            onChangePassword={() => navigation.navigate('ChangePassword')}
            onOpenScreen={name => navigation.navigate(name)}
          />
          : <ProfilePanel student={student} onLogout={logout} onSettings={() => setSettingsVisible(true)} onPhotoPress={updateProfilePhoto} onViewPlacement={() => navigation.navigate('Company')} />)}
      </Animated.View>
      </StudentRefreshContext.Provider>

      {tab !== 'profile' && (
        <View style={[styles.floatingActions, { bottom: 84 + insets.bottom }]} pointerEvents="box-none">
          <Pressable
            style={({ pressed }) => [
              styles.quickMessageButton,
              hoveredMessage && styles.quickMessageHover,
              pressed && styles.quickMessagePressed,
              pressed && !reducedMotion && styles.quickMessagePressMotion,
              reducedMotion && styles.motionDisabledWeb,
            ]}
            onPress={() => navigation.navigate('Notifications', { initialTab: 'messages' })}
            onHoverIn={() => setHoveredMessage(true)}
            onHoverOut={() => setHoveredMessage(false)}
            onFocus={() => setHoveredMessage(true)}
            onBlur={() => setHoveredMessage(false)}
            accessibilityRole="button"
            accessibilityLabel="Open messages"
          >
            <ChatBubbleIcon size={28} color={COLORS.primary} />
          </Pressable>
        </View>
      )}

      {/* Floating student navigation dock */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <View style={styles.bottomDock}>
          {TABS.map(({ key, label, Icon }, index) => {
            const active = key === 'settings' ? tab === 'profile' && settingsVisible : key === tab;
            const hovered = key === hoveredTab;
            const focused = key === focusedTab;
            const emphasized = active || hovered || focused;
            return (
              <React.Fragment key={key}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={label}
                  onPress={() => { if (key === 'settings') { setSettingsVisible(true); switchTab('profile'); } else { setSettingsVisible(false); switchTab(key); } }}
                  onHoverIn={() => setHoveredTab(key)}
                  onHoverOut={() => setHoveredTab(current => current === key ? null : current)}
                  onFocus={() => setFocusedTab(key)}
                  onBlur={() => setFocusedTab(current => current === key ? null : current)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    active && styles.tabButtonActive,
                    hovered && !active && styles.tabButtonHover,
                    hovered && active && styles.tabButtonActiveHover,
                    hovered && !reducedMotion && styles.tabButtonHoverMotion,
                    focused && styles.tabButtonFocus,
                    pressed && styles.tabButtonPressed,
                    pressed && !reducedMotion && styles.tabButtonPressMotion,
                    reducedMotion && styles.motionDisabledWeb,
                  ]}
                >
                  <View style={[styles.tabIconContainer, emphasized && styles.tabIconContainerEmphasized]}>
                    <Icon
                      size={21}
                      color={emphasized ? COLORS.primaryDark : COLORS.textMuted}
                      hasUnread={key === 'notifications' && metrics.unread > 0}
                    />
                  </View>
                  {emphasized && <View style={styles.tabIndicatorDot} />}
                </Pressable>
                {index === 1 && (
                  <View style={styles.centerNavSlot}>
                    <View pointerEvents="none" style={styles.centerNavHalo} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Add logbook entry"
                      onPress={() => navigation.navigate('Logbook')}
                      onHoverIn={() => setHoveredTab('new-log')}
                      onHoverOut={() => setHoveredTab(current => current === 'new-log' ? null : current)}
                      onFocus={() => setFocusedTab('new-log')}
                      onBlur={() => setFocusedTab(current => current === 'new-log' ? null : current)}
                      style={({ pressed }) => [
                        styles.centerNavButton,
                        hoveredTab === 'new-log' && styles.centerNavButtonHover,
                        focusedTab === 'new-log' && styles.centerNavButtonFocus,
                        hoveredTab === 'new-log' && !reducedMotion && styles.centerNavButtonHoverMotion,
                        pressed && styles.centerNavButtonPressed,
                        pressed && !reducedMotion && styles.centerNavButtonPressMotion,
                        reducedMotion && styles.motionDisabledWeb,
                      ]}
                    >
                      <PlusIcon size={25} color="#FFFFFF" />
                    </Pressable>
                  </View>
                )}
              </React.Fragment>
            );
          })}
        </View>
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
        <Text variant="heading" style={styles.dashboardErrorTitle}>Could not load your dashboard</Text>
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

function Gate({
  logout,
  navigation,
  student,
  summary,
  title,
  message,
  icon,
  iconBg,
  button,
  onPress,
  totalSteps = 4,
  statusLabel,
  onRequirementsPress,
  onCompanyPress,
  onReviewPress,
  onApprovalPress,
}) {
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { width } = useWindowDimensions();
  const isNarrow = width < 380;
  const firstName = student?.firstName || 'Student';
  const requirements = summary?.requirements;
  const placement = summary?.placement;
  const review = summary?.review;
  const requirementsStatus = requirements?.status || student?.requirementsStatus || 'not_submitted';
  const placementStatus = placement?.status || student?.placementStatus || 'not_started';
  const reviewStatus = review?.status
    || (['pending_review', 'needs_revision', 'rejected'].includes(student?.preDeploymentStatus)
      ? student.preDeploymentStatus
      : 'not_submitted');
  const accountApproved = summary?.accountApproved ?? (student?.accountApproved === true);
  const requirementsSubmitted = requirementsStatus === 'approved'
    || (requirements?.total > 0 && requirements.received === requirements.total);
  const activeStep = !accountApproved
    ? null
    : !requirementsSubmitted
      ? 0
      : placementStatus !== 'approved'
        ? 1
        : ['pending_review', 'approved'].includes(reviewStatus)
          ? 3
          : 2;
  const progressPercent = activeStep == null ? 0 : Math.round((activeStep / totalSteps) * 100);
  const canOpenCompany = accountApproved && requirementsSubmitted;
  const canOpenReview = canOpenCompany && placementStatus === 'approved';
  const formatStatus = value => ({
    approved: 'Approved',
    pending: 'Under review',
    pending_review: 'Under review',
    needs_revision: 'Needs updates',
    rejected: 'Needs updates',
    superseded: 'Review needed',
    draft: 'Draft saved',
    not_submitted: 'Not submitted',
    not_started: 'Not started',
  }[value] || 'In progress');
  const statusTone = value => {
    if (value === 'approved') return 'success';
    if (['needs_revision', 'rejected', 'superseded'].includes(value)) return 'danger';
    if (['pending', 'pending_review'].includes(value)) return 'info';
    if (['draft', 'not_submitted', 'not_started'].includes(value)) return 'warning';
    return 'neutral';
  };
  const documentValue = requirements?.total
    ? `${requirements.received} / ${requirements.total}`
    : formatStatus(requirementsStatus);
  const companyName = placement?.companyName || student?.company || student?.companyName || '';
  const supervisorName = placement?.supervisorName || student?.supervisorName || '';
  const reviewDetail = review?.reviewReason
    || (reviewStatus === 'pending_review'
      ? 'Your submission is with your coordinator.'
      : reviewStatus === 'approved'
        ? 'Final approval is recorded in PATHWAY.'
        : ['needs_revision', 'rejected', 'superseded'].includes(reviewStatus)
          ? 'Check your coordinator’s notes and update your submission.'
          : requirementsStatus === 'approved' && placementStatus === 'approved'
            ? 'Your application is ready for final review.'
            : 'Available after your documents and placement are approved.');

  useEffect(() => {
    if (!showMenuDrawer && !showNotifications) return undefined;
    const handleBack = () => {
      if (showMenuDrawer) {
        setShowMenuDrawer(false);
        return true;
      }
      if (showNotifications) {
        setShowNotifications(false);
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [showMenuDrawer, showNotifications]);

  const summaryItems = [
    {
      title: 'Student account',
      value: accountApproved ? 'Verified' : 'Under review',
      detail: accountApproved ? 'Your student account is approved.' : 'Waiting for coordinator verification.',
      status: accountApproved ? 'approved' : 'pending_review',
      Icon: ProfileIcon,
    },
    {
      title: 'Required documents',
      value: documentValue,
      detail: requirements?.total
        ? `${requirements.received === 1 ? 'required item' : 'required items'} received${requirements.needsChanges ? ` · ${requirements.needsChanges} need updates` : ''}`
        : 'Open your checklist to see the required files.',
      status: requirementsStatus,
      Icon: FileIcon,
      onPress: accountApproved ? onRequirementsPress : null,
    },
    {
      title: 'Company placement',
      value: companyName || formatStatus(placementStatus),
      detail: supervisorName ? `Supervisor · ${supervisorName}` : 'Placement details and coordinator status.',
      status: placementStatus,
      Icon: BuildingIcon,
      onPress: canOpenCompany ? onCompanyPress : null,
    },
    {
      title: 'Final review',
      value: formatStatus(reviewStatus),
      detail: reviewDetail,
      status: reviewStatus,
      Icon: ClockIcon,
      onPress: reviewStatus === 'not_submitted'
        ? (canOpenReview ? onReviewPress : null)
        : (accountApproved ? onApprovalPress : null),
    },
  ];

  const renderSummaryItem = item => {
    const ItemIcon = item.Icon;
    const tone = statusTone(item.status);
    const content = (
      <>
        <StudentSurface tone={item.title === 'Student account' ? 'mint' : 'blue'} waves />
        <View pointerEvents="none" style={styles.gateSummaryWatermark}><ItemIcon size={72} color="#D4E7FA" /></View>
        <View style={styles.gateSummaryTopRow}>
          <View style={styles.gateSummaryIcon}><ItemIcon size={17} color={COLORS.primary} /></View>
          {item.onPress ? <ChevronRightIcon size={16} color={COLORS.textMuted} /> : null}
        </View>
        <Text style={styles.gateSummaryTitle}>{item.title}</Text>
        <Text numberOfLines={2} style={styles.gateSummaryValue}>{item.value}</Text>
        <Text numberOfLines={2} style={styles.gateSummaryDetail}>{item.detail}</Text>
        <View style={[styles.gateSummaryBadge, styles[`gateSummaryBadge_${tone}`]]}>
          <Text style={[styles.gateSummaryBadgeText, styles[`gateSummaryBadgeText_${tone}`]]}>{formatStatus(item.status)}</Text>
        </View>
      </>
    );

    return item.onPress ? (
      <TouchableOpacity
        key={item.title}
        style={[styles.gateSummaryTile, isNarrow && styles.gateSummaryTileNarrow]}
        onPress={item.onPress}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}: ${item.value}. ${formatStatus(item.status)}. Open details.`}
      >
        {content}
      </TouchableOpacity>
    ) : (
      <View key={item.title} style={[styles.gateSummaryTile, isNarrow && styles.gateSummaryTileNarrow]}>
        {content}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
      <PreDeploymentTopBar
        onMenuPress={() => setShowMenuDrawer(true)}
        onNotificationsPress={() => setShowNotifications(true)}
      />
      <ScrollView
        style={styles.gateScroll}
        contentContainerStyle={styles.gatePage}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.gateDashboard}>
          <View style={styles.gateWelcomeRow}>
            <StudentSurface tone="welcome" waves />
            <View style={styles.gateWelcomeCopy}>
              <Text style={styles.gateEyebrow}>STUDENT DASHBOARD</Text>
              <Text style={styles.gateWelcomeTitle}>Welcome, {firstName}</Text>
              <Text style={styles.gateWelcomeSub}>Check your application status.</Text>
            </View>
            <Image source={require('../assets/pathway-guide-waving.png')} style={styles.gateWelcomeCharacter} resizeMode="contain" accessible={false} />
          </View>

          <View style={styles.gateHeroCard}>
            <StudentSurface waves />
            <View style={styles.gateHeroTopRow}>
              <View style={[styles.gateIconCircle, iconBg && { backgroundColor: iconBg }]}>{icon}</View>
              <View style={styles.gateHeroStatusCopy}>
                <Text style={styles.gateHeroOverline}>CURRENT STATUS</Text>
                <View style={styles.gateStatusBadge}>
                  <Text style={styles.gateStatusLabel}>{statusLabel || 'IN PROGRESS'}</Text>
                </View>
              </View>
            </View>
            <Text style={styles.gateTitle}>{title}</Text>
            <Text style={styles.gateSub}>{message}</Text>
            <View style={styles.gateHeroProgressHeader}>
              <Text style={styles.gateHeroProgressLabel}>Overall progress</Text>
              <Text style={styles.gateHeroProgressValue}>{progressPercent}%</Text>
            </View>
            <View style={styles.gateHeroProgressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progressPercent }}>
              <View style={[styles.gateHeroProgressFill, { width: `${progressPercent}%` }]} />
            </View>
            {button ? (
              <TouchableOpacity
                style={styles.gateBtn}
                onPress={onPress}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={styles.gateBtnText}>{button}</Text>
                <ChevronRightIcon size={17} color="#FFFFFF" />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.gateSummarySection}>
            <View style={styles.gateSummaryHeadingRow}>
              <View>
                <Text style={styles.gateSummarySectionTitle}>Application summary</Text>
                <Text style={styles.gateSummarySectionSub}>Your saved application details.</Text>
              </View>
              {student?.idNumber ? <Text style={styles.gateStudentId}>ID · {student.idNumber}</Text> : null}
            </View>
            <View style={styles.gateSummaryGrid}>{summaryItems.map(item => <React.Fragment key={item.title}>
              {renderSummaryItem(item)}
              {item.title === 'Company placement' && <MotionTouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('WorkplaceSupport')} style={[styles.gateSummaryTile, { flexBasis: '100%', minHeight: 48 }]}><Text style={styles.cardAction}>Get workplace support</Text></MotionTouchableOpacity>}
            </React.Fragment>)}</View>
          </View>
        </View>
      </ScrollView>
      <PreDeploymentNotificationsSheet
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
      <PreDeploymentDrawer
        visible={showMenuDrawer}
        activeRoute="StudentDashboard"
        onClose={() => setShowMenuDrawer(false)}
        onNavigate={(route, params) => navigation.replace(route, params)}
        onSignOut={logout}
      />
    </View>
  );
}

function Card({ children, style, entrance = false, delay = 0 }) {
  return entrance ? <ScreenEntrance delay={delay} style={[styles.card, style]}>{children}</ScreenEntrance> : <View style={[styles.card, style]}>{children}</View>;
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

function LogsPanel({ logbook, openAttendance, openProgress, logbookRecords = [], student, metrics, onHoursUpdate }) {
  const { width } = useWindowDimensions();
  const { eligible } = usePlacementEligibility();
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

  const changeWeek = offset => {
    const dayOffset = offset * 7;
    setWeekStart(current => addDays(current, dayOffset));
    setSelectedDate(current => localDateKey(addDays(new Date(`${current}T00:00:00`), dayOffset)));
  };

  const handleTimeIn = async () => {
    setSaving(true);
    try {
      const newLog = await punchAttendance('/attendance/time-in');
      setTodayLog(newLog);
      setAttLogs(prev => [newLog, ...prev]);
      showStudentSuccess('Time-in recorded', 'Your shift has started.');
    } catch (e) {
      Alert.alert('Attendance unavailable', e.message || 'Failed to record time-in.');
    } finally { setSaving(false); }
  };

  const handleTimeOut = async () => {
    if (!todayLog || todayLog.timeOut) return;
    setSaving(true);
    try {
      const result = await punchAttendance('/attendance/time-out');
      const updated = { ...todayLog, ...result };
      setTodayLog(updated);
      setAttLogs(prev => prev.map(l => l.id === todayLog.id ? updated : l));
      if (onHoursUpdate) onHoursUpdate(); // refresh parent metrics
      showStudentSuccess('Time-out recorded', 'Your shift has been saved.');
    } catch (e) {
      Alert.alert('Attendance unavailable', e.message || 'Failed to record time-out.');
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
  const visibleAttendanceLogs = attendanceHistoryForDate(attLogs, selectedDate, todayStr);
  const progressPercent = Math.round(Math.max(0, Math.min(Number(metrics.progress) || 0, 1)) * 100);

  return (
    <ScrollView onRefresh={async () => { await Promise.all([fetchAtt(), onHoursUpdate?.()]); }} skeletonVariant="attendance" style={styles.logsPage} contentContainerStyle={[styles.scroll, styles.logsScroll]} showsVerticalScrollIndicator={false}>
      <StudentSurface tone="page" />

      {/* ── Page header ── */}
      <View style={styles.logsPageHeader}>
        <StudentSurface waves />
        <View style={styles.logsHeadingCopy}><Text variant="heading" style={styles.logsTitle}>Logs</Text><Text style={styles.pageSub}>Record attendance and journal reports.</Text></View>
        <ScreenEntrance delay={100} style={[styles.logsGuide, width < 370 && styles.logsGuideCompact]}><Image source={require('../assets/pathway-guide-writing.png')} resizeMode="contain" accessible={false} style={{ width: '100%', height: '100%' }} /></ScreenEntrance>
      </View>

      {/* Hours retain their existing attendance-backed values. */}
      <ScreenEntrance style={styles.logsAccumulationCard}>
        <StudentSurface waves />
        <View style={styles.logsAccumulationHeader}>
          <View style={styles.logsAccumulationLabelGroup}>
            <View style={styles.logsAccumulationIcon}><ClockIcon size={18} color={COLORS.primary} /></View>
            <Text style={styles.logsAccumulationLabel}>OJT HOURS</Text>
          </View>
          <View style={styles.logsAccumulationPercent}>
            <Text style={styles.logsAccumulationPercentValue}>{progressPercent}%</Text>
            <Text style={styles.logsAccumulationPercentLabel}>complete</Text>
          </View>
        </View>

        <View>
          <Text variant="heading" style={styles.logsAccumulationValue}>{metrics.rendered.toFixed(1)}<Text style={styles.logsAccumulationUnit}> / {metrics.required} hrs</Text></Text>
        </View>

        <View style={styles.logsAccumulationFooter}>
          <View style={styles.logsMeterCopy}>
            <View style={styles.logsAccumulationTrack} accessible accessibilityRole="progressbar" accessibilityLabel="OJT hours completed" accessibilityValue={{ min: 0, max: 100, now: progressPercent }}>
              <View style={[styles.logsAccumulationFill, { width: `${Math.max(0, Math.min(Number(metrics.progress) || 0, 1)) * 100}%` }]} />
            </View>
          </View>
        </View>
        <View style={styles.heroBottomRow}>
          <Text style={styles.logsAccumulationRemaining}>{metrics.remaining.toFixed(1)} hours to go</Text>
          <MotionTouchableOpacity onPress={openProgress} accessibilityRole="button" accessibilityLabel="View OJT progress" style={styles.progressCardCue}><Text style={styles.logsAccumulationGoal}>{metrics.required}h goal</Text><ChevronRightIcon size={18} color={COLORS.primary} /></MotionTouchableOpacity>
        </View>
      </ScreenEntrance>

      {/* ── Calendar and shift grouped as one attendance workspace ── */}
      <Card entrance delay={90} style={styles.calendarCard}>
        <StudentSurface />
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.logsCalendarArtwork}><LogsCalendarArtwork /></View>
        <View style={styles.calendarHeader}>
          <View style={styles.calendarTitleGroup}>
          <MotionTouchableOpacity onPress={() => { setWeekStart(weekStartFor(new Date())); setSelectedDate(todayStr); }} activeOpacity={0.75} accessibilityRole="button" accessibilityLabel="Return to today">
            <Text style={styles.calendarMonth}>{selectedMonthLabel}</Text>
          </MotionTouchableOpacity>
          </View>
          <View style={styles.calendarNav}>
            <MotionTouchableOpacity style={styles.calendarNavButton} onPress={() => changeWeek(-1)} accessibilityRole="button" accessibilityLabel="Previous week">
              <View style={styles.calendarChevronLeft}><ChevronIcon size={15} color={COLORS.textSecondary} /></View>
            </MotionTouchableOpacity>
            <MotionTouchableOpacity style={styles.calendarNavButton} onPress={() => changeWeek(1)} accessibilityRole="button" accessibilityLabel="Next week">
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
              <MotionTouchableOpacity key={key} style={styles.calendarDay} onPress={() => setSelectedDate(key)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={`Select ${key}`} accessibilityState={{ selected: active }}>
                <Text style={styles.calendarWeekday}>{day.toLocaleDateString('en-PH', { weekday: 'short' }).slice(0, 1)}</Text>
                <View style={[styles.calendarDateCircle, active && styles.calendarDateActive, isToday && !active && styles.calendarDateToday]}>
                  <Text style={[styles.calendarDateText, active && styles.calendarDateTextActive]}>{day.getDate()}</Text>
                </View>
                <View style={[styles.calendarRecordDot, !hasRecord && styles.calendarRecordDotHidden]} />
              </MotionTouchableOpacity>
            );
          })}
        </View>

        <View style={styles.attShiftDivider} />
        <View style={styles.attTodayHeader}>
          <View style={styles.attTodayTag}>
            <ClockIcon size={13} color={COLORS.secondaryDark} />
            <Text style={styles.attTodayTagText}>{selectedIsToday ? "TODAY'S SHIFT" : 'SELECTED DAY'}</Text>
          </View>
          <Text style={styles.attTodayDate} numberOfLines={1}>{selectedDateLabel}</Text>
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
          selectedLog ? <View style={styles.selectedDayStatus}><Text style={styles.selectedDayStatusText}>{selectedLog.status === 'verified' ? 'Attendance verified' : 'Attendance under review'}</Text></View> : <Text style={styles.selectedDayEmpty}>No attendance for this date.</Text>
        ) : attLoading ? (
          <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 12 }} />
        ) : !hasTimeIn ? (
          <MotionTouchableOpacity
            style={[styles.attPunchBtn, styles.attPunchIn, (saving || !eligible) && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel="Record time in"
            onPress={handleTimeIn} disabled={saving || !eligible} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <><ClockIcon size={19} color="#FFFFFF" /><Text style={styles.attPunchText}>Time in</Text></>}
          </MotionTouchableOpacity>
        ) : !hasTimeOut ? (
          <MotionTouchableOpacity
            style={[styles.attPunchBtn, styles.attPunchOut, saving && { opacity: 0.6 }]}
            accessibilityRole="button" accessibilityLabel="Record time out"
            onPress={handleTimeOut} disabled={saving} activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#FFFFFF" size="small" />
              : <><ClockIcon size={19} color="#FFFFFF" /><Text style={styles.attPunchText}>Time out</Text></>}
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

      {!eligible && <Text style={styles.pageSub}>{PLACEMENT_REQUIRED}</Text>}
      {/* ── Attendance History ── */}
      <View style={styles.attSectionRow}>
        <Text style={styles.homeSectionTitle}>Attendance history</Text>
        <MotionTouchableOpacity onPress={openAttendance} accessibilityRole="button" accessibilityLabel="View all attendance records" style={styles.logsSectionAction}><Text style={styles.homeProgressLinkText}>View all</Text><ChevronRightIcon size={16} color={COLORS.primary} /></MotionTouchableOpacity>
      </View>

      <Card style={styles.attHistoryCard}>
        {attLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ paddingVertical: 14 }} />
        ) : visibleAttendanceLogs.length === 0 ? (
          <View style={styles.attHistoryEmpty}>
            <View style={styles.attHistoryEmptyIcon}><CalendarIcon size={18} color={COLORS.primary} /></View>
            <Text style={styles.emptyText}>{selectedIsToday ? 'No previous attendance records yet.' : 'No attendance for this date.'}</Text>
          </View>
        ) : visibleAttendanceLogs.slice(0, 5).map((log, index) => (
          <View key={log.id} style={[styles.attLogRow, index > 0 && styles.attLogRowDivider]}>
            <View style={styles.logsHistoryIcon}><CalendarIcon size={23} color={COLORS.primary} /></View>
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
                  {log.status === 'verified' ? 'Verified' : 'Pending'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </Card>

      {/* ── Recent logbook entries ── */}
      <View style={styles.logsSectionHeader}>
        <Text style={styles.homeSectionTitle}>Recent logbook entries</Text>
        <MotionTouchableOpacity onPress={logbook} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Open all logbook entries">
          <View style={styles.homeProgressLink}><Text style={styles.homeProgressLinkText}>Open logbook</Text><ChevronRightIcon size={14} color={COLORS.primary} /></View>
        </MotionTouchableOpacity>
      </View>
      <Card style={styles.logsJournalCard}>
        {selectedDate === todayStr && !selectedLogbook.length ? (
          <View style={styles.logsEmptyState}>
            <View style={styles.attHistoryEmptyIcon}><FileIcon size={18} color={COLORS.primary} /></View>
            <Text style={styles.emptyText}>No logbook entries for this date.</Text>
          </View>
        ) : selectedLogbook.length ? (
          selectedLogbook.slice(0, 3).map((item, index) => {
            const isApproved = item.status === 'approved';
            const isPending  = !item.status || item.status === 'pending';
            return (
              <View style={[styles.logSummaryRow, index > 0 && styles.logSummaryDivider]} key={item.id}>
                <View style={styles.logsJournalIcon}><LogbookIcon size={23} color={COLORS.warningDark} /></View>
                <View style={styles.logSummaryCopy}>
                  <Text style={styles.logSummaryTitle}>{item.frequency === 'daily' ? 'Daily journal' : item.frequency === 'weekly' ? 'Weekly journal' : `Week ${item.weekNum || '—'}`}</Text>
                  <Text style={styles.logSummarySub}>{item.frequency === 'daily' ? item.periodStart : item.weekRange || 'Weekly entry'}</Text>
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
                    {isApproved ? 'Approved' : isPending ? 'In review' : item.status === 'rejected' ? 'Rejected' : 'Needs revision'}
                  </Text>
                </View>
              </View>
            );
          })
        ) : (
          <View style={styles.logsEmptyState}>
            <View style={styles.attHistoryEmptyIcon}><FileIcon size={18} color={COLORS.primary} /></View>
            <Text style={styles.emptyText}>No logbook entries for this date.</Text>
          </View>
        )}
      </Card>

    </ScrollView>
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
  const progressPercent = Math.round(Math.max(0, Math.min(Number(metrics.progress) || 0, 1)) * 100);

  return (
    <ScrollView style={styles.logsPage} contentContainerStyle={[styles.scroll, styles.progressScroll]} showsVerticalScrollIndicator={false}>
      <StudentSurface tone="page" />
      <View style={styles.progressScreenHeader}>
        <StudentSurface waves />
        <View style={styles.progressScreenCopy}><Text variant="heading" style={styles.logsTitle}>Progress</Text><Text style={styles.pageSub}>Check your hours, attendance, and requirements.</Text></View>
        <ScreenEntrance delay={100} style={styles.progressGuide}><Image source={require('../assets/pathway-guide-progress.png')} resizeMode="contain" accessible={false} style={{ width: '100%', height: '100%' }} /></ScreenEntrance>
      </View>

      <MotionTouchableOpacity onPress={openProgress} accessibilityRole="button" accessibilityLabel={`OJT hours: ${metrics.rendered.toFixed(1)} rendered, ${metrics.required} required, ${metrics.remaining.toFixed(1)} remaining. View detailed OJT progress.`}>
      <Card style={styles.progressHeroCard}>
        <StudentSurface waves />
        <View style={styles.progressHeroHeader}>
          <View style={styles.progressHeroLabelGroup}>
            <View style={styles.progressHeroIcon}><ClockIcon size={22} color={COLORS.primary} /></View>
            <Text style={styles.progressHeroLabel}>OJT HOURS</Text>
          </View>
          <Text style={styles.progressHeroPercent}>{progressPercent}% complete</Text>
        </View>

        <View style={styles.progressHeroStats}>
          <View style={styles.progressHeroStat}>
            <Text style={styles.progressHeroNumber}>{metrics.rendered.toFixed(1)}</Text>
            <Text style={styles.progressHeroCaption}>Rendered</Text>
          </View>
          <View style={styles.progressHeroDivider} />
          <View style={styles.progressHeroStat}>
            <Text style={styles.progressHeroNumber}>{metrics.required}</Text>
            <Text style={styles.progressHeroCaption}>Required</Text>
          </View>
          <View style={styles.progressHeroDivider} />
          <View style={styles.progressHeroStat}>
            <Text style={styles.progressHeroNumberAccent}>{metrics.remaining.toFixed(1)}</Text>
            <Text style={styles.progressHeroCaption}>Remaining</Text>
          </View>
        </View>

        <View
          style={styles.progressHeroTrack}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="OJT hours completed"
          accessibilityValue={{ min: 0, max: 100, now: progressPercent }}
        >
          <View style={[styles.progressHeroFill, { width: `${Math.max(0, Math.min(Number(metrics.progress) || 0, 1)) * 100}%` }]} />
        </View>
        <View style={styles.progressHeroMeta}>
          <Text style={styles.progressHeroMetaLabel}>{metrics.remaining.toFixed(1)} hours to go</Text>
          <View style={styles.progressCardCue}><Text style={styles.progressHeroMetaText}>{metrics.required} hours goal</Text><ChevronRightIcon size={20} color={COLORS.primary} /></View>
        </View>
      </Card>
      </MotionTouchableOpacity>

      <ScreenEntrance style={styles.progressInsight}>
        <StudentSurface waves />
        <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progressSnapshotArtwork}><ProgressCardArtwork kind="snapshot" /></View>
        <View style={styles.progressInsightIcon}>
          <ProgressIcon size={16} color={COLORS.primary} />
        </View>
        <View style={[styles.progressInsightCopy, styles.progressSnapshotCopy]}>
          <Text style={styles.progressInsightEyebrow}>CURRENT SNAPSHOT</Text>
          <Text style={styles.progressInsightText}>
            {metrics.remaining > 0 ? `${metrics.remaining.toFixed(1)} hours remaining.` : 'Required hours completed.'} {attendance.length ? `${verifiedDays} attendance day${verifiedDays === 1 ? '' : 's'} verified.` : 'Record attendance to track your hours.'}
          </Text>
        </View>
      </ScreenEntrance>

      <View style={styles.progressSectionHeader}><Text style={styles.homeSectionTitle}>Your records</Text><Text style={styles.progressSectionCaption}>Updated from your submissions</Text></View>
      <View style={styles.progressRowsPanel}>
        <View style={styles.progressRecordGroup}>
          <StudentSurface />
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: COLORS.secondaryLight }]}><CalendarIcon size={17} color={COLORS.primary} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Attendance</Text><Text style={styles.progressRecordSub}>{completedDays} completed shifts · {verifiedDays} verified</Text></View><MotionTouchableOpacity onPress={openAttendance} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Details</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
          <View style={[styles.analyticsGrid, styles.attendanceRecordMetrics]}><MetricLine label="Attendance days" value={attendance.length} /><MetricLine label="Missing time-outs" value={missingOuts} warning={missingOuts > 0} /></View>
        </View>

        <View style={styles.progressRequirementsCard}>
          <StudentSurface tone={requirementsApproved ? 'mint' : 'peach'} />
          {requirementsApproved && <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progressRequirementsArtwork}><ProgressCardArtwork kind="requirements" /></View>}
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: requirementsApproved ? COLORS.successLight : COLORS.warningLight }]}><FileIcon size={17} color={requirementsApproved ? COLORS.successDark : COLORS.warningDark} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Requirements</Text><Text style={styles.progressRecordSub}>{requirementsApproved ? 'All documents approved' : requirementTotal ? `${approvedRequirements} of ${requirementTotal} documents approved` : 'No document status'}</Text></View><MotionTouchableOpacity onPress={openRequirements} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Open</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
        </View>

        <View style={styles.progressJournalCard}>
          <StudentSurface tone="gold" />
          <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.progressJournalArtworkClip}><View style={styles.progressJournalArtwork}><ProgressCardArtwork kind="journal" /></View></View>
          <View style={styles.progressRecordHeading}><View style={[styles.progressRecordIcon, { backgroundColor: COLORS.accentLight }]}><LogbookIcon size={17} color={COLORS.accentDark} /></View><View style={styles.progressRecordCopy}><Text style={styles.progressRecordTitle}>Logbook</Text><Text style={styles.progressRecordSub}>{approvedLogs} approved · {pendingLogs} awaiting review</Text></View><MotionTouchableOpacity onPress={openLogbook} accessibilityRole="button" style={styles.progressRecordAction}><Text style={styles.progressRecordActionText}>Open</Text><ChevronRightIcon size={14} color={COLORS.primary} /></MotionTouchableOpacity></View>
          <View style={[styles.analyticsGrid, styles.attendanceRecordMetrics]}><MetricLine label="Total entries" value={logbook.length} /><MetricLine label="Approved entries" value={approvedLogs} /></View>
        </View>
      </View>

      <View style={[styles.clearanceNotice, clearanceComplete ? styles.clearanceSuccess : styles.clearancePending]}>
        {clearanceComplete ? <CheckCircleIcon size={23} color={COLORS.successDark} /> : <AlertCircleIcon size={23} color={COLORS.warningDark} />}
        <View style={styles.statusSummaryCopy}><Text style={[styles.statusSummaryTitle, { color: clearanceComplete ? COLORS.successDark : COLORS.warningDark }]}>{clearanceComplete ? 'OJT cleared' : 'Clearance pending'}</Text><Text style={styles.statusSummarySub}>{clearanceComplete ? 'Your coordinator has approved your OJT records.' : 'Your coordinator confirms clearance after reviewing your completion requirements.'}</Text></View>
      </View>

    </ScrollView>
  );
}

function MetricLine({ label, value, warning }) { return <View style={styles.metricLine}><Text style={styles.metricLineLabel}>{label}</Text><Text style={[styles.metricLineValue, warning && { color: COLORS.warningDark }]}>{value}</Text></View>; }

function ProfilePanel({ student, onLogout, onSettings, onPhotoPress, onViewPlacement }) {
  const fullName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';
  const approved = Boolean(student?.accountApproved);

  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.profileScroll, styles.profileRedesignScroll]} showsVerticalScrollIndicator={false}>
      <StudentSurface tone="page" />
      <View style={styles.progressPageHeader}>
        <Text variant="heading" style={styles.pageTitle}>Profile</Text>
        <Text style={styles.pageSub}>Student and placement details.</Text>
      </View>

      <Card entrance style={styles.profileIdentityCard}>
        <StudentSurface waves />
        <MotionTouchableOpacity onPress={onPhotoPress} accessibilityRole="button" accessibilityLabel="Change profile photo" accessibilityHint="Opens the image picker" style={styles.avatarLarge}>
          {student?.profilePhotoUrl ? <Image source={{ uri: student.profilePhotoUrl }} style={styles.avatarImageLarge} /> : <Text style={styles.avatarLargeText}>{initials(student)}</Text>}
          <View style={styles.avatarEditBadge}><PlusIcon size={12} color="#FFFFFF" /></View>
        </MotionTouchableOpacity>
        <View style={styles.profileIdentityCopy}>
          <Text style={styles.profileLargeName} numberOfLines={2}>{fullName}</Text>
          <Text style={styles.profileLargeDept} numberOfLines={2}>
            {student?.department || student?.course || 'OJT Student'}
          </Text>
          <View style={[styles.profileBadge, !approved && styles.profileBadgePending]}>
            {approved
              ? <CheckCircleIcon size={14} color={COLORS.success} />
              : <TasksIcon size={14} color={COLORS.warningDark} />}
            <Text style={[styles.profileBadgeText, !approved && styles.profileBadgePendingText]}>
              {approved ? 'Active student' : 'Approval in progress'}
            </Text>
          </View>
        </View>
      </Card>

      <Card entrance delay={70} style={styles.profileDetailsCard}>
        <View style={styles.profileSectionBanner}>
          <StudentSurface waves />
          <View pointerEvents="none" style={styles.profileWatermark}><ProfileIcon filled size={76} color="#C8E3FF" /></View>
          <View style={styles.profileBannerHeading}><View style={styles.profileBannerIcon}><ProfileIcon size={23} color={COLORS.primary} /></View><Text style={styles.profileBannerTitle}>Student details</Text></View>
        </View>
        <InfoRow label="Student ID" value={student?.idNumber || student?.studentId || '—'} />
        <InfoRow label="Email" value={student?.email || '—'} />
        <InfoRow label="Department" value={student?.department || student?.course || '—'} />
        <InfoRow
          label="Required hours"
          value={`${studentHours(student).required} hours`}
        />
      </Card>

      <Card entrance delay={130} style={styles.profilePlacementCard}>
        <View style={styles.profileSectionBanner}>
          <StudentSurface waves />
          <View pointerEvents="none" style={styles.profileWatermark}><BuildingIcon filled size={76} color="#C8E3FF" /></View>
          <View style={styles.profileBannerHeading}><View style={styles.profileBannerIcon}><BuildingIcon size={23} color={COLORS.primary} /></View><Text style={styles.profileBannerTitle}>Official placement</Text></View>
        </View>
        <InfoRow label="Company" value={student?.company || 'Not assigned yet'} />
        <InfoRow label="Supervisor" value={student?.supervisorName || '—'} />
        <View style={styles.profileManagedNotice}>
          <CheckCircleIcon size={15} color={COLORS.primary} />
          <Text style={styles.placementReadOnlyNote}>
            {student?.company
              ? 'Contact your coordinator to change these details.'
              : 'Your coordinator will add the official assignment here.'}
          </Text>
        </View>
        {student?.company && (
          <MotionTouchableOpacity
            style={styles.placementRequestButton}
            onPress={onViewPlacement}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="View company placement"
          >
            <Text style={styles.placementRequestText}>View company placement</Text>
            <ChevronRightIcon size={16} color={COLORS.secondary} />
          </MotionTouchableOpacity>
        )}
      </Card>

      <MotionTouchableOpacity style={[styles.settingsCard, styles.profileSettingsSurface]} onPress={onSettings} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Open settings">
        <StudentSurface waves />
        <View style={styles.settingIcon}><SettingsIcon size={18} color={COLORS.secondary} /></View>
        <View style={styles.settingCopy}><Text style={styles.settingTitle}>Settings</Text><Text style={styles.settingValue}>Account, notifications, and support</Text></View>
        <ChevronRightIcon size={18} color={COLORS.textMuted} />
      </MotionTouchableOpacity>

      <MotionTouchableOpacity
        style={styles.profileLogoutBtn}
        onPress={onLogout}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Sign out of PATHWAY"
      >
        <LogOutIcon size={18} color={COLORS.dangerDark} />
        <Text style={styles.profileLogoutBtnText}>Sign Out</Text>
      </MotionTouchableOpacity>
    </ScrollView>
  );
}

function SettingsPanel({ student, notificationsEnabled, notificationPreferenceLoaded, onNotificationsEnabledChange, onBack, onLogout, onChangePassword, onOpenScreen }) {
  const fullName = `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Student';
  const approved = Boolean(student?.accountApproved);
  return (
    <ScrollView contentContainerStyle={[styles.scroll, styles.profileScroll, styles.settingsScroll]} showsVerticalScrollIndicator={false}>
      <StudentSurface tone="page" />
      <MotionTouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to profile" style={styles.settingsBack}>
        <View style={styles.settingsBackArrow}><ChevronRightIcon size={15} color={COLORS.secondary} /></View>
        <Text style={styles.settingsBackText}>Profile</Text>
      </MotionTouchableOpacity>
      <View style={styles.settingsPageHeader}>
        <Text style={styles.settingsScreenTitle}>Settings</Text>
        <Text style={styles.pageSub}>Manage your account and notifications.</Text>
      </View>

      <Card style={styles.settingsAccountCard}>
        <StudentSurface waves />
        <View style={styles.settingsIdentityHeader}>
          <View style={styles.settingsAvatar} accessibilityLabel={`${fullName} ${student?.profilePhotoUrl ? 'profile photo' : 'initials'}`}>
            {student?.profilePhotoUrl
              ? <Image source={{ uri: student.profilePhotoUrl }} style={styles.settingsAvatarImage} />
              : <Text style={styles.settingsAvatarText}>{initials(student)}</Text>}
          </View>
          <View style={styles.settingsIdentityCopy}>
            <Text style={styles.settingsName} numberOfLines={1}>{fullName}</Text>
            <View style={styles.settingsEmailLine}>
              <MailIcon size={13} color={COLORS.textMuted} />
              <Text style={styles.settingsEmail} numberOfLines={1}>{student?.username || student?.email || 'No email on file'}</Text>
            </View>
          </View>
        </View>
        <View style={styles.settingsStatusRow}>
          <Text style={styles.settingsStatusLabel}>ACCOUNT STATUS</Text>
          <View style={[styles.settingsStatusPill, approved ? styles.settingsStatusApproved : styles.settingsStatusPending]}>
            {approved
              ? <CheckCircleIcon size={13} color={COLORS.successDark} />
              : <ClockIcon size={13} color={COLORS.warningDark} />}
            <Text style={[styles.settingsStatusText, approved ? styles.settingsStatusApprovedText : styles.settingsStatusPendingText]}>
              {approved ? 'Approved' : 'Under review'}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.settingsGroupCard}>
        <View style={styles.settingsSectionBanner}>
          <StudentSurface waves />
          <View pointerEvents="none" style={styles.settingsSectionWatermark}><SettingsIcon filled size={65} color="#C8E3FF" /></View>
          <View style={styles.profileBannerHeading}><View style={styles.settingsPreferenceIcon}><BellIcon size={19} color={COLORS.primary} /></View><Text style={styles.settingsSectionTitle}>App preferences</Text></View>
        </View>
        <SettingRow
          Icon={BellIcon}
          title="Notifications"
          value="Coordinator updates on this device"
          trailing={(
            <Switch
              value={notificationsEnabled}
              onValueChange={onNotificationsEnabledChange}
              disabled={!notificationPreferenceLoaded}
              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
              thumbColor={notificationsEnabled ? COLORS.primary : '#FFFFFF'}
              ios_backgroundColor={COLORS.border}
              accessibilityRole="switch"
              accessibilityLabel="Coordinator updates"
              accessibilityHint="Controls whether coordinator updates appear in PATHWAY on this device. Messages remain available."
              accessibilityState={{ checked: notificationsEnabled, disabled: !notificationPreferenceLoaded }}
            />
          )}
        />
        <SettingRow Icon={SettingsIcon} title="Appearance" value="Light" onPress={() => onOpenScreen('Appearance')} />
        {student.username && <MotionTouchableOpacity onPress={onChangePassword} accessibilityRole="button" accessibilityLabel="Change password" style={{ paddingVertical: 16 }}><Text style={{ color: COLORS.primary }}>Change password</Text></MotionTouchableOpacity>}
      </Card>

      <Card style={styles.settingsGroupCard}>
        <View style={styles.settingsSectionBanner}>
          <StudentSurface waves />
          <View pointerEvents="none" style={styles.settingsSectionWatermark}><FileIcon filled size={65} color="#C8E3FF" /></View>
          <View style={styles.profileBannerHeading}><View style={styles.settingsPreferenceIcon}><FileIcon size={19} color={COLORS.primary} /></View><Text style={styles.settingsSectionTitle}>Support and privacy</Text></View>
        </View>
        <SettingRow Icon={FileIcon} title="Help center" value="PATHWAY support information" onPress={() => onOpenScreen('HelpCenter')} />
        <SettingRow Icon={InfoIcon} title="Privacy" value="Review how your records are used" onPress={() => onOpenScreen('Privacy')} />
      </Card>

      <View style={styles.settingsSignOutGroup}>
        <Text style={styles.settingsSignOutHint}>You can sign back in at any time.</Text>
        <MotionTouchableOpacity
          onPress={onLogout}
          style={styles.settingsSignOutButton}
          accessibilityRole="button"
          accessibilityLabel="Sign out of PATHWAY"
        >
          <LogOutIcon size={17} color={COLORS.dangerDark} />
          <Text style={styles.profileLogoutBtnText}>Sign out</Text>
        </MotionTouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SettingRow({ Icon, title, value, trailing, onPress }) {
  const Row = onPress ? MotionTouchableOpacity : View;
  return (
    <Row style={styles.settingsPreferenceRow} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={onPress ? `Open ${title}` : undefined}>
      <View style={styles.settingsPreferenceIcon}><Icon size={16} color={COLORS.secondary} /></View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingValue}>{value}</Text>
      </View>
      {trailing || (onPress ? <ChevronRightIcon size={18} color={COLORS.textMuted} /> : null)}
    </Row>
  );
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
  headerBrandCenter: { position: 'absolute', left: 0, right: 0, bottom: 10, height: 40, alignItems: 'center', justifyContent: 'center' },
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
    minHeight: 0,
    overflow: 'hidden',
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
  homeHeader: {
    flexShrink: 0,
    zIndex: 2,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerBrandCopy: { flexShrink: 1, minWidth: 0 },
  headerLogoBadge: {
    width: 44,
    height: 44,
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
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: 2.35,
  },
  homeBrand: { color: COLORS.primaryDark },
  headerRight: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 10,
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transitionProperty: 'background-color, border-color, transform, box-shadow',
        transitionDuration: '150ms',
      },
      default: {},
    }),
  },
  headerSettingsBtn: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.secondaryLight,
  },
  headerActionHover: { backgroundColor: COLORS.secondarySubtle, borderColor: COLORS.secondary, ...SHADOWS.soft },
  headerActionHoverMotion: { transform: [{ translateY: -1 }] },
  headerActionFocus: { borderColor: COLORS.focusRing, borderWidth: 2 },
  headerActionPressed: { backgroundColor: COLORS.secondaryLight },
  headerActionPressMotion: { transform: [{ scale: 0.96 }] },
  motionDisabledWeb: Platform.select({ web: { transitionDuration: '0ms' }, default: {} }),
  scroll: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 18,
    // Navigation is outside the scroll viewport. Only clear the 64px message FAB.
    paddingBottom: 80,
    gap: 18,
  },
  profileScroll: { paddingBottom: 26, gap: 14 },
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
  homeEyebrow: { color: COLORS.secondaryDark, fontSize: 10, fontWeight: '700', letterSpacing: 0.7 },
  greeting: {
    color: COLORS.textPrimary,
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  homeAvatar: { width: 60, height: 60, borderRadius: 30, overflow: 'hidden', backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  homeAvatarImage: { width: '100%', height: '100%', borderRadius: 30 },
  homeAvatarText: { color: COLORS.primaryDark, fontSize: 15, fontWeight: '700' },
  homeProgressHero: { backgroundColor: COLORS.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: COLORS.border, ...SHADOWS.soft },
  homeProgressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  homeProgressLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  homeProgressLabel: { color: COLORS.primaryDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.85 },
  homeProgressPercentBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySubtle },
  homeProgressPercent: { color: COLORS.primaryDark, fontSize: 10, fontWeight: '700' },
  homeHoursValue: { color: COLORS.textPrimary, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: -0.6, marginTop: 6 },
  homeHoursTotal: { color: COLORS.textSecondary, fontSize: 14, fontWeight: '600', letterSpacing: 0 },
  homeProgressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  homeProgressRemaining: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  homeProgressLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  homeProgressLinkText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
  homeStatsStrip: { flexDirection: 'row', backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingVertical: 6, paddingHorizontal: 2 },
  homeStatCell: { flex: 1, gap: 4 },
  homeStatDivider: { width: 1, backgroundColor: COLORS.border, marginHorizontal: 16 },
  homeStatLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.45 },
  homeStatValue: { color: COLORS.textPrimary, fontSize: 21, fontWeight: '700', lineHeight: 27 },
  homeStatHint: { color: COLORS.textSecondary, fontSize: 11 },
  homeSectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  homeSectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800', letterSpacing: -0.15 },
  homePlacementRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.borderLight },
  homePlacementMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  homePlacementCopy: { flex: 1, minWidth: 0 },
  homePlacementName: { fontSize: 15, lineHeight: 21, fontWeight: '700', color: COLORS.textPrimary },
  homePlacementPlaceholder: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  homePlacementDetail: { fontSize: 12, lineHeight: 18, color: COLORS.textMuted, marginTop: 5 },
  homePlacementStatus: { flexShrink: 0, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  homePlacementConfirmed: { backgroundColor: COLORS.successLight },
  homePlacementPending: { backgroundColor: COLORS.warningLight },
  homePlacementStatusText: { fontSize: 10, fontWeight: '800' },
  homePlacementStatusConfirmedText: { color: COLORS.successDark },
  homePlacementStatusPendingText: { color: COLORS.warningDark },
  homeActivityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  homeSeeAll: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  activityList: { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, paddingHorizontal: 0 },
  activityRowFirst: { borderTopWidth: 0 },
  activityEmpty: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, padding: 14, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight },
  activityEmptyIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  activityEmptyCopy: { flex: 1, gap: 3 },
  activityEmptyTitle: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '700' },
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
  logsPage: { backgroundColor: '#F9FBFF' },
  logsScroll: { maxWidth: 656, paddingTop: 4, paddingBottom: 88 },
  logsPageHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 126, overflow: 'hidden', marginBottom: -30 },
  logsHeadingCopy: { flex: 1, minWidth: 0, gap: 5, paddingVertical: 4 },
  logsTitle: { fontSize: 35, lineHeight: 44, fontWeight: '700', color: '#0A1631' },
  logsGuide: { width: 140, height: 131, alignSelf: 'flex-end' },
  logsGuideCompact: { width: 105, height: 125 },
  logsAccumulationCard: { backgroundColor: COLORS.surface, borderRadius: 22, padding: 14, borderWidth: 1, borderColor: '#E7EEF8', gap: 4, overflow: 'hidden', shadowColor: '#56729E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  logsAccumulationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  logsAccumulationLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  logsAccumulationIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EDF5FF', alignItems: 'center', justifyContent: 'center' },
  logsAccumulationLabel: { color: COLORS.primaryDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.75 },
  logsAccumulationPercent: { flexDirection: 'row', alignItems: 'baseline', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.primarySubtle },
  logsAccumulationPercentValue: { color: COLORS.primaryDark, fontSize: 12, fontWeight: '800' },
  logsAccumulationPercentLabel: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '600' },
  logsAccumulationValueRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logsAccumulationValue: { color: '#0A1631', fontSize: 36, lineHeight: 40, fontWeight: '700', marginTop: 2, flexShrink: 1, minWidth: 0, transform: [{ translateY: 6 }] },
  logsAccumulationUnit: { color: COLORS.textMuted, fontSize: 16, fontWeight: '600', flexShrink: 1 },
  logsAccumulationSubline: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  logsAccumulationTrack: { width: '100%', height: 8, borderRadius: 6, backgroundColor: '#E7EDF7', overflow: 'hidden' },
  logsAccumulationFill: { height: '100%', borderRadius: 6, backgroundColor: '#0874E8' },
  logsAccumulationFooter: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: -11, transform: [{ translateY: 6 }] },
  heroBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -2, minHeight: 44, transform: [{ translateY: 6 }] },
  logsMeterCopy: { flex: 1, minWidth: 0, gap: 11 },
  logsAccumulationRemaining: { color: COLORS.textSecondary, fontSize: 13 },
  logsAccumulationGoal: { color: COLORS.textMuted, fontSize: 11 },
  logsProgressAction: { minHeight: 44, alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  logsProgressCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F9FBFF', alignItems: 'center', justifyContent: 'center', ...SHADOWS.card },
  logsSectionAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  logsHistoryIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#EAF4FF', alignItems: 'center', justifyContent: 'center' },
  logsJournalIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFF2DC', alignItems: 'center', justifyContent: 'center' },
  logsJournalCard: { borderRadius: 21, borderColor: '#E7EEF8', ...SHADOWS.card },
  calendarCard: { padding: 16, overflow: 'hidden', borderRadius: 22, borderColor: '#E0EBFC', ...SHADOWS.card },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  calendarTitleGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  logsCalendarArtwork: { position: 'absolute', width: 230, height: 220, right: -18, top: -42, opacity: 0.10 },
  calendarMonth: { color: '#0A1631', fontSize: 19, fontWeight: '700' },
  calendarNav: { flexDirection: 'row', gap: 2, padding: 2, borderRadius: 24, backgroundColor: '#EDF4FF', flexShrink: 0 },
  calendarNavButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  calendarChevronLeft: { transform: [{ rotate: '90deg' }] },
  calendarChevronRight: { transform: [{ rotate: '-90deg' }] },
  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  calendarDay: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  calendarWeekday: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  calendarDateCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calendarDateActive: { backgroundColor: COLORS.secondary },
  calendarDateToday: { borderWidth: 1, borderColor: COLORS.secondary },
  calendarDateText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' },
  calendarDateTextActive: { color: '#FFFFFF', fontWeight: '900' },
  calendarRecordDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: COLORS.secondary },
  calendarRecordDotHidden: { opacity: 0 },
  attShiftDivider: { height: 1, backgroundColor: COLORS.borderLight, marginVertical: 14 },
  attTodayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  attTodayTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  attTodayTagText: { color: COLORS.secondaryDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.75 },
  attTodayDate: { color: COLORS.textMuted, flexShrink: 1, fontSize: 11, textAlign: 'right' },
  attTimeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  attTimeBox: { flex: 1, alignItems: 'center' },
  attTimeDivider: { width: 1, height: 38, backgroundColor: COLORS.borderLight },
  attTimeLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  attTimeValue: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 6 },
  attTimeMuted: { color: COLORS.textMuted },
  attPunchBtn: { minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, ...SHADOWS.soft },
  attPunchIn: { backgroundColor: '#0874E8', borderColor: '#0874E8' },
  attPunchOut: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  attPunchText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  attDoneBox: { backgroundColor: COLORS.successLight, borderRadius: RADIUS.md, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  selectedDayStatus: { backgroundColor: COLORS.secondarySubtle, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 9, marginTop: 2 },
  selectedDayStatusText: { color: COLORS.secondaryDark, fontSize: 11.5, fontWeight: '700', textAlign: 'center' },
  selectedDayEmpty: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2 },
  attDoneText: { color: COLORS.successDark, fontSize: 13, fontWeight: '800' },
  placementReadOnlyNote: { flex: 1, color: COLORS.textMuted, fontSize: 11, lineHeight: 16 },
  placementRequestButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.secondaryLight, backgroundColor: COLORS.secondarySubtle },
  placementRequestText: { color: COLORS.secondary, fontSize: 12, fontWeight: '800' },
  profileManagedNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: RADIUS.sm, backgroundColor: COLORS.secondarySubtle },
  attSectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  attSectionCount: { color: COLORS.textMuted, fontSize: 11 },
  attHistoryCard: { paddingVertical: 4, paddingHorizontal: 14, borderRadius: 21, borderColor: '#E7EEF8', ...SHADOWS.card },
  attHistoryEmpty: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  attHistoryEmptyIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center' },
  attLogRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  attLogRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  attLogDate: { color: COLORS.textPrimary, fontSize: 13, fontWeight: '800' },
  attLogTime: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  attLogHours: { color: COLORS.secondary, fontSize: 13, fontWeight: '900' },
  attLogStatus: { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.full, paddingHorizontal: 8, paddingVertical: 4 },
  attLogStatusVerified: { backgroundColor: COLORS.successLight },
  attLogStatusText: { color: COLORS.warningDark, fontSize: 10, fontWeight: '800' },
  // Log summary rows
  logSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 10 },
  logSummaryDivider: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  logSummaryDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  logSummaryCopy: { flex: 1 },
  logSummaryTitle: { color: COLORS.textPrimary, fontSize: 12.5, fontWeight: '800' },
  logSummarySub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  logSummaryHours: { color: COLORS.secondary, fontSize: 12.5, fontWeight: '800' },
  logStatusPill: { backgroundColor: COLORS.warningLight, borderRadius: RADIUS.full, paddingHorizontal: 9, paddingVertical: 4 },
  logStatusApprovedPill: { backgroundColor: COLORS.successLight },
  logStatusRejectedPill: { backgroundColor: COLORS.dangerLight },
  logStatusText: { color: COLORS.warningDark, fontSize: 10.5, fontWeight: '800', overflow: 'hidden' },
  logsSectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  logsEmptyState: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  progressScroll: { maxWidth: 656, paddingTop: 4, paddingBottom: 88 },
  progressScreenHeader: { minHeight: 128, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', marginBottom: -34 },
  progressScreenCopy: { flex: 1, minWidth: 0, gap: 5 },
  progressGuide: { width: 128, height: 134, alignSelf: 'flex-end' },
  progressHeroCard: { backgroundColor: COLORS.surface, borderColor: '#E3ECFA', borderRadius: 22, overflow: 'hidden', ...SHADOWS.card },
  progressHeroIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EAF4FF', alignItems: 'center', justifyContent: 'center' },
  progressHeroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  progressHeroLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  progressHeroLabel: { color: COLORS.primaryDark, fontSize: 10, fontWeight: '800', letterSpacing: 0.75 },
  progressHeroStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 13, paddingVertical: 13, paddingHorizontal: 3, borderRadius: 15, backgroundColor: '#F4F7FD', borderWidth: 1, borderColor: '#E7EDFA' },
  progressHeroStat: { flex: 1, minWidth: 0, alignItems: 'center' },
  progressHeroNumber: { color: '#0A1631', fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  progressHeroNumberAccent: { color: COLORS.warningDark, fontSize: 24, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  progressHeroCaption: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  progressHeroDivider: { width: 1, height: 34, backgroundColor: COLORS.border },
  progressHeroTrack: { height: 9, borderRadius: RADIUS.full, backgroundColor: COLORS.secondaryLight, overflow: 'hidden' },
  progressHeroFill: { height: '100%', borderRadius: RADIUS.full, backgroundColor: COLORS.primary },
  progressHeroMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  progressHeroPercent: { fontSize: 11, color: COLORS.primaryDark, fontWeight: '700', backgroundColor: '#EAF4FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 18 },
  progressHeroMetaLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600' },
  progressHeroMetaText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '600' },
  progressMetricGrid: { flexDirection: 'row', gap: 12 },
  progressMetricCard: { flex: 1, minHeight: 100 },
  progressMetricNumber: { color: COLORS.textPrimary, fontSize: 23, fontWeight: '900', marginTop: 9 },
  progressMetricLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginTop: 3 },
  insightCard: { backgroundColor: COLORS.secondarySubtle || COLORS.primaryLight, borderColor: COLORS.secondaryLight },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  insightTitle: { color: COLORS.primary, fontSize: 15, fontWeight: '900' },
  insightText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  progressInsight: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 21, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#DFE9FA', overflow: 'hidden', ...SHADOWS.soft },
  progressSnapshotArtwork: { position: 'absolute', width: 70, height: 67, right: 3, bottom: -7, opacity: 0.85 },
  progressSnapshotCopy: { paddingRight: 48 },
  progressRequirementsArtwork: { position: 'absolute', width: 190, height: 80, right: 44, bottom: -3, opacity: 0.55 },
  progressJournalArtworkClip: { position: 'absolute', top: 0, left: 0, right: 0, height: 70, overflow: 'hidden' },
  progressJournalArtwork: { position: 'absolute', width: 100, height: 76, right: 61, top: 18, opacity: 0.18 },
  progressInsightIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: COLORS.secondaryLight, alignItems: 'center', justifyContent: 'center' },
  progressInsightCopy: { flex: 1, minWidth: 0, gap: 3 },
  progressInsightEyebrow: { color: COLORS.primaryDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.65 },
  progressInsightText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  progressSectionHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 2 },
  progressSectionCaption: { color: COLORS.textMuted, fontSize: 10.5 },
  progressRowsPanel: { gap: 12 },
  progressRecordGroup: { padding: 14, borderWidth: 1, borderColor: '#E2EBFA', borderRadius: 21, backgroundColor: COLORS.surface, overflow: 'hidden', ...SHADOWS.soft },
  progressRequirementsCard: { padding: 14, borderWidth: 1, borderColor: '#DDF2E9', borderRadius: 21, backgroundColor: '#F1FCF6', overflow: 'hidden', ...SHADOWS.soft },
  progressJournalCard: { padding: 14, borderWidth: 1, borderColor: '#FAECD7', borderRadius: 21, backgroundColor: '#FFFAF2', overflow: 'hidden', ...SHADOWS.soft },
  progressCardCue: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attendanceRecordMetrics: { marginTop: 12 },
  progressRecordHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressRecordIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  progressRecordCopy: { flex: 1, minWidth: 0 },
  progressRecordTitle: { color: COLORS.textPrimary, fontSize: 13.5, fontWeight: '800' },
  progressRecordSub: { color: COLORS.textMuted, fontSize: 11, lineHeight: 15, marginTop: 2 },
  progressRecordAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 1, paddingHorizontal: 4 },
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
  profileRedesignScroll: { paddingBottom: 88, gap: 14 },
  profileSectionBanner: { marginHorizontal: -16, marginTop: -16, marginBottom: 2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, overflow: 'hidden', minHeight: 52 },
  profileWatermark: { position: 'absolute', right: 14, top: 5, opacity: 0.65 },
  profileBannerHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileBannerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#E3F0FF', alignItems: 'center', justifyContent: 'center' },
  profileBannerTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: '#0A1631' },
  profileSettingsSurface: { borderRadius: 20, borderColor: '#E5EDF8', overflow: 'hidden' },
  profileIdentityCard: { flexDirection: 'row', alignItems: 'center', gap: 15, paddingVertical: 17, borderRadius: 20, borderColor: '#E5EDF8', overflow: 'hidden' },
  profileIdentityCopy: { flex: 1, minWidth: 0, gap: 4 },
  profileDetailsCard: { paddingBottom: 8, borderRadius: 20, borderColor: '#E5EDF8', overflow: 'hidden' },
  profilePlacementCard: { paddingBottom: 14, borderRadius: 20, borderColor: '#E5EDF8', overflow: 'hidden' },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
    ...SHADOWS.soft,
  },
  avatarImageLarge: { width: '100%', height: '100%', borderRadius: 40 },
  avatarEditBadge: { position: 'absolute', right: -4, bottom: -4, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.surface },
  avatarLargeText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },
  profileLargeName: {
    color: COLORS.textPrimary,
    fontWeight: '900',
    fontSize: 17,
    lineHeight: 22,
  },
  profileLargeDept: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  profileBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    marginTop: 3,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  profileBadgePending: { backgroundColor: COLORS.warningLight },
  profileBadgePendingText: { color: COLORS.warningDark },
  profileBadgeText: {
    color: COLORS.successDark,
    fontSize: 10.5,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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
    lineHeight: 17,
    flex: 1,
    minWidth: 0,
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
  settingsScroll: { paddingTop: 8, paddingBottom: 88, gap: 12 },
  settingsScreenTitle: { fontSize: 25, lineHeight: 32, fontWeight: '600', color: '#0A1631' },
  settingsSectionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: '#0A1631' },
  settingsSectionBanner: { marginHorizontal: -15, marginTop: -15, paddingHorizontal: 15, paddingVertical: 10, overflow: 'hidden' },
  settingsSectionWatermark: { position: 'absolute', right: 8, top: 0, opacity: 0.55 },
  settingsPageHeader: { gap: 3, marginBottom: 1 },
  settingsBack: {
    alignSelf: 'flex-start',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    marginLeft: -7,
    borderRadius: 10,
    ...Platform.select({ web: { cursor: 'pointer' }, default: {} }),
  },
  settingsBackArrow: { transform: [{ rotate: '180deg' }] },
  settingsBackText: { color: COLORS.secondaryDark, fontSize: 12.5, fontWeight: '700' },
  settingsAccountCard: {
    padding: 16,
    borderRadius: 19,
    borderColor: COLORS.border,
    gap: 14,
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  settingsIdentityHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsAvatarText: { color: COLORS.textOnPrimary, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  settingsAvatarImage: { width: '100%', height: '100%', borderRadius: 24 },
  settingsIdentityCopy: { flex: 1, minWidth: 0, gap: 4 },
  settingsName: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700' },
  settingsEmailLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  settingsEmail: { flex: 1, minWidth: 0, color: COLORS.textMuted, fontSize: 11.5 },
  settingsStatusRow: {
    minHeight: 34,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  settingsStatusLabel: { color: COLORS.textMuted, fontSize: 9, fontWeight: '800', letterSpacing: 0.9 },
  settingsStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: RADIUS.full },
  settingsStatusApproved: { backgroundColor: COLORS.successLight },
  settingsStatusPending: { backgroundColor: COLORS.warningLight },
  settingsStatusText: { fontSize: 10.5, fontWeight: '700' },
  settingsStatusApprovedText: { color: COLORS.successDark },
  settingsStatusPendingText: { color: COLORS.warningDark },
  settingsGroupCard: { padding: 15, paddingBottom: 4, borderRadius: 18, borderColor: '#E5EDF8', overflow: 'hidden', ...SHADOWS.soft },
  settingsPreferenceRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  settingsPreferenceIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: COLORS.secondarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsSignOutGroup: { gap: 8, marginTop: 1 },
  settingsSignOutHint: { color: COLORS.textMuted, fontSize: 11, textAlign: 'center' },
  settingsSignOutButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF3F3',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.dangerLight,
  },
  profileLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.dangerLight,
    marginTop: 2,
  },
  profileLogoutBtnText: {
    color: COLORS.dangerDark,
    fontWeight: '800',
    fontSize: 13,
  },
  // Bottom Bar
  floatingActions: { position: 'absolute', right: 14, bottom: 84, flexDirection: 'column', alignItems: 'center', gap: 10, zIndex: 4 },
  quickMessageButton: { width: 64, height: 64, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', zIndex: 4, ...SHADOWS.soft, ...Platform.select({ web: { cursor: 'pointer', transitionProperty: 'background-color, border-color, transform, box-shadow', transitionDuration: '180ms' }, default: {} }) },
  quickMessageHover: { backgroundColor: COLORS.primarySubtle, borderColor: COLORS.secondary, transform: [{ translateY: -2 }, { scale: 1.06 }], ...SHADOWS.card },
  quickMessagePressed: { backgroundColor: COLORS.secondaryLight, borderColor: COLORS.primary },
  quickMessagePressMotion: { transform: [{ scale: 0.94 }] },
  bottomBar: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  bottomDock: {
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 5,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    minHeight: 54,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 16,
    paddingHorizontal: 3,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transitionProperty: 'background-color, border-color, transform, box-shadow',
        transitionDuration: '170ms',
      },
      default: {},
    }),
  },
  tabButtonActive: { backgroundColor: 'transparent', borderColor: 'transparent' },
  tabButtonHover: { backgroundColor: COLORS.secondarySubtle, borderColor: COLORS.secondaryLight, ...SHADOWS.soft },
  tabButtonHoverMotion: { transform: [{ translateY: -2 }, { scale: 1.04 }] },
  tabButtonActiveHover: { backgroundColor: COLORS.primarySubtle, borderColor: COLORS.secondaryLight },
  tabButtonFocus: { borderColor: COLORS.focusRing, borderWidth: 2 },
  tabButtonPressed: { backgroundColor: COLORS.secondaryLight },
  tabButtonPressMotion: { transform: [{ scale: 0.96 }] },
  tabIconContainer: {
    minWidth: 42,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconContainerEmphasized: { transform: [{ translateY: -1 }] },
  tabIndicatorDot: { width: 5, height: 5, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, marginTop: 1 },
  centerNavSlot: { flex: 1, minHeight: 54, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  centerNavHalo: { position: 'absolute', top: -32, left: '50%', marginLeft: -38, width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.background, zIndex: 2 },
  centerNavButton: { position: 'absolute', top: -26, left: '50%', marginLeft: -31, width: 62, height: 62, borderRadius: RADIUS.full, backgroundColor: COLORS.primary, borderWidth: 4, borderColor: COLORS.background, alignItems: 'center', justifyContent: 'center', zIndex: 3, ...SHADOWS.card, ...Platform.select({ web: { cursor: 'pointer', transitionProperty: 'background-color, border-color, transform, box-shadow', transitionDuration: '180ms' }, default: {} }) },
  centerNavButtonHover: { backgroundColor: COLORS.primaryDark, borderColor: COLORS.surface, ...SHADOWS.card },
  centerNavButtonFocus: { borderColor: COLORS.focusRing },
  centerNavButtonHoverMotion: { transform: [{ translateY: -3 }, { scale: 1.07 }] },
  centerNavButtonPressed: { backgroundColor: COLORS.primaryDark },
  centerNavButtonPressMotion: { transform: [{ scale: 0.94 }] },
  // Gate
  gateScroll: { flex: 1 },
  gatePage: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 32,
  },
  gateDashboard: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  gateWelcomeRow: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 22,
    minHeight: 148,
    padding: 18,
    paddingRight: 125,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  gateWelcomeCharacter: { position: 'absolute', right: -2, bottom: -10, width: 132, height: 142 },
  gateWelcomeCopy: { flex: 1, minWidth: 0 },
  gateEyebrow: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  gateWelcomeTitle: {
    color: COLORS.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
  },
  gateWelcomeSub: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  gateAvatar: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1,
    borderColor: COLORS.secondaryLight,
  },
  gateAvatarText: { color: COLORS.primaryDark, fontSize: 14, fontWeight: '800' },
  gateHeroCard: {
    position: 'relative',
    overflow: 'hidden',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    ...SHADOWS.soft,
  },
  gateHeroTopRow: { flexDirection: 'row', alignItems: 'center' },
  gateHeroStatusCopy: { flex: 1, alignItems: 'flex-start', gap: 7, marginLeft: 12 },
  gateHeroOverline: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  gateStatusBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 11,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primarySubtle,
  },
  gateStatusLabel: {
    color: COLORS.primaryDark,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.65,
  },
  gateIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 17,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateTitle: {
    color: COLORS.textPrimary,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    marginTop: 16,
  },
  gateSub: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 5,
  },
  gateHeroProgressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  gateHeroProgressLabel: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  gateHeroProgressValue: { color: COLORS.primaryDark, fontSize: 12, fontWeight: '800' },
  gateHeroProgressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceMuted,
  },
  gateHeroProgressFill: {
    height: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  gateBtn: {
    minHeight: 50,
    width: '100%',
    maxWidth: 350,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 15,
    paddingHorizontal: 18,
    marginTop: 17,
    ...SHADOWS.hover,
  },
  gateBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  gateSummarySection: { marginTop: 24 },
  gateSummaryHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  gateSummarySectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '600' },
  gateSummarySectionSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 3 },
  gateStudentId: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700' },
  gateSummaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gateSummaryTile: {
    position: 'relative',
    overflow: 'hidden',
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 150,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
    ...SHADOWS.soft,
  },
  gateSummaryTileNarrow: { flexBasis: '100%' },
  gateSummaryWatermark: { position: 'absolute', right: -7, bottom: -10, opacity: 0.45 },
  gateSummaryTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gateSummaryIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.primarySubtle,
  },
  gateSummaryTitle: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700' },
  gateSummaryValue: { color: COLORS.textPrimary, fontSize: 15, lineHeight: 20, fontWeight: '800', marginTop: 4 },
  gateSummaryDetail: { color: COLORS.textMuted, fontSize: 10, lineHeight: 15, marginTop: 4, flexGrow: 1 },
  gateSummaryBadge: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: RADIUS.full },
  gateSummaryBadgeText: { fontSize: 9, fontWeight: '800' },
  gateSummaryBadge_success: { backgroundColor: COLORS.successSubtle },
  gateSummaryBadgeText_success: { color: COLORS.successDark },
  gateSummaryBadge_info: { backgroundColor: COLORS.primarySubtle },
  gateSummaryBadgeText_info: { color: COLORS.primaryDark },
  gateSummaryBadge_warning: { backgroundColor: COLORS.warningSubtle },
  gateSummaryBadgeText_warning: { color: COLORS.warningDark },
  gateSummaryBadge_danger: { backgroundColor: COLORS.dangerSubtle },
  gateSummaryBadgeText_danger: { color: COLORS.dangerDark },
  gateSummaryBadge_neutral: { backgroundColor: COLORS.surfaceMuted },
  gateSummaryBadgeText_neutral: { color: COLORS.textMuted },
});
import { showStudentSuccess } from '../services/studentSuccess';
