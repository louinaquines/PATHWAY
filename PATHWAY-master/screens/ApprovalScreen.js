// screens/ApprovalScreen.js
import React, { useEffect, useState } from 'react';
import {
  BackHandler,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { studentAlert as Alert } from '../services/studentAlert';
import { auth, db } from '../firebaseConfig';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import StudentLogoutScreen from '../components/StudentLogoutScreen';
import useStudentLogout from '../hooks/useStudentLogout';
import PreDeploymentDrawer from '../components/PreDeploymentDrawer';
import PreDeploymentTopBar from '../components/PreDeploymentTopBar';
import PreDeploymentStepper from '../components/PreDeploymentStepper';
import PreDeploymentNotificationsSheet from '../components/PreDeploymentNotificationsSheet';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowRightIcon,
} from '../components/Icons';

export default function ApprovalScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(null);
  const [menu, setMenu] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const { loggingOut, logout } = useStudentLogout(navigation);

  const uid = auth?.currentUser?.uid;

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    return onSnapshot(
      query(collection(db, 'finalReviewRequests'), where('studentId', '==', uid)),
      snap => {
        const latest = snap.docs
          .map(item => ({ id: item.id, ...item.data() }))
          .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0];
        setRequest(latest || null);
        setLoading(false);
      }, e => {
        console.error('Approval fetch error:', e);
        Alert.alert('Unable to load approval status', 'Please try again.');
        setLoading(false);
      }
    );
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
  const needsReviewAction = ['not_submitted', 'needs_revision', 'rejected', 'superseded'].includes(status);
  const statusTitles = {
    approved: 'Application approved',
    pending_review: 'Under coordinator review',
    needs_revision: 'Changes requested',
    rejected: 'Application not approved',
    superseded: 'New placement review needed',
    not_submitted: 'Review not yet submitted',
  };
  const statusMessages = {
    approved: 'Your pre-deployment requirements and company placement are approved. You are cleared to begin logging your OJT hours.',
    pending_review: 'Your coordinator is reviewing your pre-deployment documents and company placement details.',
    needs_revision: 'Please review the coordinator notes below, update your submission in Step 3, and submit it again.',
    rejected: 'Your coordinator did not approve this application. Check the notes below for further instructions.',
    superseded: 'Your approved company placement changed. Submit a new final review for the updated placement.',
    not_submitted: 'Submit your Final Review in Step 3 before checking the coordinator approval status.',
  };
  const statusLabels = {
    approved: 'CLEARED',
    pending_review: 'IN REVIEW',
    needs_revision: 'ACTION NEEDED',
    rejected: 'NOT APPROVED',
    superseded: 'REVIEW NEEDED',
    not_submitted: 'NOT SUBMITTED',
  };
  const hasStatusIssue = ['needs_revision', 'rejected', 'superseded'].includes(status);

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading) {
    return <StudentScreenSkeleton variant="review" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <PreDeploymentTopBar
        onMenuPress={() => setMenu(true)}
        onNotificationsPress={() => setNotifications(true)}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.pageIntro}>
          <View style={styles.introMetaRow}>
            <Text style={styles.subheading}>PRE-DEPLOYMENT</Text>
            <View style={styles.stageBadge}>
              <Text style={styles.stageBadgeText}>STEP 04 / 04</Text>
            </View>
          </View>
          <Text variant="heading" style={styles.heading}>Approval &amp; Clearance</Text>
          <Text style={styles.pageDescription}>Track your coordinator’s final decision and what to do next.</Text>
        </View>

        <PreDeploymentStepper
          activeStep={4}
          onStepPress={step => {
            if (step === 1) navigation.replace('Requirements');
            if (step === 2) navigation.replace('Company');
            if (step === 3) navigation.replace('Review');
          }}
        />

        <View style={[styles.statusCard, status === 'approved' && styles.statusCardApproved]}>
          <View style={styles.statusHeader}>
            <View style={[
              styles.statusIcon,
              status === 'approved' && styles.statusIconApproved,
              hasStatusIssue && styles.statusIconAttention,
            ]}>
              {status === 'approved' ? (
                <CheckCircleIcon size={23} color={COLORS.successDark} />
              ) : hasStatusIssue ? (
                <AlertCircleIcon size={23} color={COLORS.dangerDark} />
              ) : (
                <ClockIcon size={23} color={COLORS.primary} />
              )}
            </View>
            <View style={styles.statusHeadingCopy}>
              <Text style={styles.statusEyebrow}>CURRENT STATUS</Text>
              <Text style={styles.statusTitle}>{statusTitles[status] || statusTitles.not_submitted}</Text>
            </View>
            <View style={[
              styles.statusPill,
              status === 'approved' && styles.statusPillSuccess,
              hasStatusIssue && styles.statusPillAttention,
            ]}>
              <Text style={[
                styles.statusPillText,
                status === 'approved' && styles.statusPillTextSuccess,
                hasStatusIssue && styles.statusPillTextAttention,
              ]}>{statusLabels[status] || statusLabels.not_submitted}</Text>
            </View>
          </View>

          <Text style={styles.statusText}>{statusMessages[status] || statusMessages.not_submitted}</Text>

          {request?.reviewedAt && (
            <View style={styles.updatedAtRow}>
              <ClockIcon size={14} color={COLORS.textMuted} />
              <Text style={styles.muted}>Updated {new Date(request.reviewedAt).toLocaleDateString('en-PH')}</Text>
            </View>
          )}

          {request?.reviewReason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonHeader}>COORDINATOR NOTES</Text>
              <Text style={styles.reason}>{request.reviewReason}</Text>
            </View>
          ) : null}

          {status === 'approved' ? (
            <TouchableOpacity
              style={[styles.primaryButton, styles.primaryButtonSuccess]}
              onPress={() => navigation.replace('StudentDashboard')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>Enter Student Dashboard</Text>
              <ArrowRightIcon size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : needsReviewAction ? (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.replace('Review')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.primaryText}>{status === 'not_submitted' ? 'Open Final Review' : 'Review and update submission'}</Text>
              <ArrowRightIcon size={16} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>

      <PreDeploymentNotificationsSheet visible={notifications} onClose={() => setNotifications(false)} />

      <PreDeploymentDrawer
        visible={menu}
        activeRoute="Approval"
        onClose={() => setMenu(false)}
        onNavigate={route => navigation.replace(route)}
        onSignOut={logout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 44,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  pageIntro: {
    marginBottom: 16,
  },
  introMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  subheading: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stageBadge: {
    backgroundColor: COLORS.primarySubtle,
    borderRadius: RADIUS.full,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageBadgeText: {
    color: COLORS.primaryDark,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.45,
  },
  pageDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 17,
    borderWidth: 1,
    borderColor: COLORS.borderLight || COLORS.border,
    marginBottom: 18,
    ...SHADOWS.card,
  },
  statusCardApproved: {
    borderColor: '#A7F3D0',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primarySubtle,
    flexShrink: 0,
  },
  statusIconApproved: {
    backgroundColor: COLORS.successSubtle,
  },
  statusIconAttention: {
    backgroundColor: COLORS.dangerSubtle,
  },
  statusHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusEyebrow: {
    color: COLORS.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  statusTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  statusPill: {
    backgroundColor: COLORS.primarySubtle,
    borderRadius: RADIUS.full,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexShrink: 0,
  },
  statusPillSuccess: {
    backgroundColor: COLORS.successSubtle,
  },
  statusPillAttention: {
    backgroundColor: COLORS.dangerSubtle,
  },
  statusPillText: {
    color: COLORS.primaryDark,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.35,
  },
  statusPillTextSuccess: {
    color: COLORS.successDark,
  },
  statusPillTextAttention: {
    color: COLORS.dangerDark,
  },
  statusText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  updatedAtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 11,
  },
  muted: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
  reasonBox: {
    backgroundColor: COLORS.dangerSubtle,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.danger,
    borderRadius: RADIUS.md,
    padding: 13,
    marginTop: 15,
    width: '100%',
  },
  reasonHeader: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.dangerDark,
    letterSpacing: 0.8,
    marginBottom: 5,
  },
  reason: {
    color: COLORS.dangerDark,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    width: '100%',
    gap: 8,
    ...SHADOWS.soft,
  },
  primaryButtonSuccess: {
    backgroundColor: COLORS.successDark,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
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
});
