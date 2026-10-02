// screens/ApprovalScreen.js
import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import PathwayMark from '../components/PathwayMark';
import {
  AlertCircleIcon,
  BellIcon,
  CheckCircleIcon,
  MenuIcon,
  ClockIcon,
  CloseIcon,
  LogOutIcon,
  ArrowRightIcon,
} from '../components/Icons';

export default function ApprovalScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState(false);

  const uid = auth?.currentUser?.uid;

  useEffect(() => {
    (async () => {
      try {
        if (!uid) return;
        const snap = await getDocs(
          query(collection(db, 'finalReviewRequests'), where('studentId', '==', uid))
        );
        const latest = snap.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
        setRequest(latest || null);
      } catch (e) {
        console.error('Approval fetch error:', e);
        Alert.alert('Unable to load approval status', 'Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [uid]);

  useEffect(() => {
    const back = () => {
      if (menu) {
        setMenu(false);
        return true;
      }
      if (notifications) {
        setNotifications(false);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [menu, notifications]);

  const status = request?.status || 'not_submitted';

  const logout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  if (loading) {
    return <StudentScreenSkeleton variant="review" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <PathwayWatermark size={152} opacity={0.045} style={{ right: -47, top: -56 }} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setMenu(true)}
          accessibilityLabel="Open menu"
        >
          <MenuIcon size={20} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <PathwayMark size={42} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setNotifications(true)}
          accessibilityLabel="Open notifications"
        >
          <BellIcon size={21} color={COLORS.primaryDark} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.subheading}>Pre-deployment Pipeline</Text>
        <Text variant="heading" style={styles.heading}>Approval &amp; Clearance</Text>

        {/* 4-Step Stepper */}
        <View style={styles.stepper}>
          <View style={styles.track} />
          <View style={styles.progress} />
          {['Doc Submission', 'Company', 'Review', 'Approval'].map((label, index) => (
            <TouchableOpacity
              key={label}
              style={styles.stepItem}
              onPress={() => {
                if (index === 0) navigation.replace('Requirements');
                if (index === 1) navigation.replace('Company');
                if (index === 2) navigation.replace('Review');
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label} step`}
            >
              <View
                style={[
                  styles.circle,
                  index < 3 ? styles.done : styles.active,
                  status === 'approved' && index === 3 && styles.done,
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    index < 3 && styles.doneNumber,
                    index === 3 && styles.activeNumber,
                    status === 'approved' && index === 3 && styles.doneNumber,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, index === 3 && styles.activeLabel]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Status Presentation Card */}
        {status === 'approved' ? (
          <View style={styles.approvedCard}>
            <View style={styles.successIcon}>
              <CheckCircleIcon size={44} color="#FFFFFF" />
            </View>
            <Text style={styles.approvedTitle}>Application Approved!</Text>
            <Text style={styles.approvedText}>
              Congratulations! Your pre-deployment requirements and company placement are fully approved by your OJT Coordinator. You are officially cleared to begin logging your OJT hours.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.replace('StudentDashboard')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryText}>Enter Student Dashboard</Text>
              <ArrowRightIcon size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusCard}>
            <View
              style={[
                styles.statusIcon,
                {
                  backgroundColor:
                    status === 'needs_revision' || status === 'rejected' || status === 'superseded'
                      ? COLORS.dangerSubtle
                      : COLORS.secondarySubtle,
                },
              ]}
            >
              {status === 'needs_revision' || status === 'rejected' || status === 'superseded' ? (
                <AlertCircleIcon size={32} color={COLORS.danger} />
              ) : (
                <ClockIcon size={32} color={COLORS.secondary} />
              )}
            </View>

            <Text style={styles.statusTitle}>
              {status === 'pending_review'
                ? 'Application Under Coordinator Review'
                : status === 'needs_revision'
                ? 'Changes Required'
                : status === 'rejected'
                ? 'Application Not Approved'
                : status === 'superseded'
                ? 'New Placement Review Required'
                : 'Review Not Yet Submitted'}
            </Text>

            <Text style={styles.statusText}>
              {status === 'pending_review'
                ? 'Your coordinator is reviewing your pre-deployment documents and company placement details.'
                : status === 'needs_revision'
                ? 'Please review the coordinator notes below and update your submission in Step 3.'
                : status === 'rejected'
                ? 'Your coordinator did not approve this application. Check the notes below for further instructions.'
                : status === 'superseded'
                ? 'Your approved company placement changed. The previous final review no longer applies; submit a new package for this placement.'
                : 'Submit your Final Review in Step 3 before checking the coordinator approval status.'}
            </Text>

            {request?.reviewedAt && (
              <Text style={styles.muted}>
                Last updated on {new Date(request.reviewedAt).toLocaleDateString('en-PH')}
              </Text>
            )}

            {request?.reviewReason ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonHeader}>COORDINATOR NOTES</Text>
                <Text style={styles.reason}>{request.reviewReason}</Text>
              </View>
            ) : null}

            {(status === 'needs_revision' ||
              status === 'rejected' ||
              status === 'superseded' ||
              status === 'not_submitted') && (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => navigation.replace('Review')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryText}>Open Final Review</Text>
                <ArrowRightIcon size={16} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Notifications Modal */}
      <Modal
        visible={notifications}
        transparent
        animationType="slide"
        onRequestClose={() => setNotifications(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setNotifications(false)}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotifications(false)}>
                <CloseIcon size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.muted}>
              Approval notifications from your coordinator will appear here in real time.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Menu Drawer */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            style={styles.backdrop}
            onPress={() => setMenu(false)}
            activeOpacity={1}
          />
          <View style={styles.drawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerAvatar}>
                <Text style={styles.drawerAvatarLetter}>P</Text>
              </View>
              <Text style={styles.drawerTitle}>PATHWAY</Text>
              <Text style={styles.drawerSubtitle}>OJT Management System</Text>
            </View>

            <TouchableOpacity style={styles.logout} onPress={logout} activeOpacity={0.85}>
              <LogOutIcon size={18} color="#FFFFFF" />
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  topBar: {
    height: Platform.OS === 'ios' ? 94 : 64,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.soft,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  brand: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  content: {
    padding: 20,
    paddingBottom: 60,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  subheading: {
    color: COLORS.secondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    marginBottom: 24,
  },
  track: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: 16,
    height: 2.5,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
  },
  progress: {
    position: 'absolute',
    left: '12%',
    width: '76%',
    top: 16,
    height: 2.5,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },
  stepItem: {
    width: '24%',
    alignItems: 'center',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  done: {
    backgroundColor: COLORS.primary,
  },
  active: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: '#FFFFFF',
  },
  number: {
    color: '#94A3B8',
    fontWeight: '800',
    fontSize: 13,
  },
  doneNumber: {
    color: '#FFFFFF',
  },
  activeNumber: {
    color: COLORS.primary,
  },
  stepLabel: {
    color: '#94A3B8',
    fontSize: 10.5,
    textAlign: 'center',
    fontWeight: '600',
  },
  activeLabel: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  approvedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: 26,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    ...SHADOWS.card,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    ...SHADOWS.soft,
  },
  approvedTitle: {
    color: COLORS.primary,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  approvedText: {
    color: COLORS.textSecondary,
    fontSize: 13.5,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  statusIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    color: COLORS.textPrimary,
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  reasonBox: {
    backgroundColor: COLORS.dangerSubtle,
    borderLeftWidth: 3.5,
    borderLeftColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginTop: 14,
    width: '100%',
  },
  reasonHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.dangerDark,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  reason: {
    color: COLORS.dangerDark,
    fontSize: 12.5,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
    width: '100%',
    gap: 8,
    ...SHADOWS.soft,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    minHeight: 180,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: COLORS.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  drawer: {
    width: '78%',
    maxWidth: 360,
    height: '100%',
    backgroundColor: '#FFFFFF',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
  },
  drawerHeader: {
    marginBottom: 24,
  },
  drawerAvatar: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  drawerAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  drawerTitle: {
    color: COLORS.textPrimary,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },
  drawerSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  logout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    marginTop: 'auto',
  },
  logoutText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
