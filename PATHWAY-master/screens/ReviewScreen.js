// screens/ReviewScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { studentAlert as Alert } from '../services/studentAlert';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
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
  FileIcon,
  BuildingIcon,
  ArrowRightIcon,
} from '../components/Icons';

const statusText = {
  not_submitted: 'Missing',
  submitted: 'In review',
  approved: 'Approved',
  rejected: 'Resubmit',
  needs_revision: 'Needs update',
};

const EMPTY_COMPANY = {};

export default function ReviewScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState({});
  const [requirements, setRequirements] = useState([]);
  const [company, setCompany] = useState(EMPTY_COMPANY);
  const [request, setRequest] = useState(null);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { loggingOut, logout } = useStudentLogout(navigation);

  const uid = auth?.currentUser?.uid;
  const narrow = width < 360;

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.data() || {};
      setUser(userData);

      const sectionReqs = userData.sectionId
        ? await getDocs(collection(db, 'sections', userData.sectionId, 'requirements'))
        : { docs: [] };
      const saved = userData.requirements || {};
      const configured = sectionReqs.docs.map(item => ({ id: item.id, ...item.data() }));
      const ids = configured.length
        ? configured
        : Object.keys(saved).map(id => ({ id, label: id.replace(/_/g, ' ') }));

      setRequirements(
        ids.map(item => ({ ...item, ...saved[item.id], label: item.label || item.id }))
      );

      const proposalSnap = await getDocs(
        query(collection(db, 'companyProposals'), where('studentId', '==', uid))
      );
      const latestProposal = proposalSnap.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) =>
          String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
        )[0];

      const officialCompany = {
        companyId: userData.companyId || '',
        companyName: userData.company || userData.companyName || '',
        companyAddress: userData.companyAddress || '',
        companyIndustry: userData.companyIndustry || '',
        companyEmail: userData.companyEmail || '',
        companyPhone: userData.companyPhone || '',
        supervisorName: userData.supervisorName || '',
        supervisorPosition: userData.supervisorPosition || '',
        supervisorEmail: userData.supervisorEmail || '',
        supervisorPhone: userData.supervisorPhone || '',
        internshipRole: userData.internshipRole || '',
        startDate: userData.startDate || '',
        endDate: userData.endDate || '',
        workArrangement: userData.workArrangement || '',
        status: userData.placementStatus || '',
      };
      if (userData.placementStatus === 'approved') {
        setCompany(officialCompany);
      } else if (latestProposal) {
        setCompany({ ...latestProposal, status: userData.placementStatus || latestProposal.status || '' });
      } else {
        setCompany(officialCompany);
      }

      const requestSnap = await getDocs(
        query(collection(db, 'finalReviewRequests'), where('studentId', '==', uid))
      );
      const latestRequest = requestSnap.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) =>
          String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
        )[0];

      setRequest(latestRequest || null);
    } catch (error) {
      console.error('Review data error:', error);
      Alert.alert('Unable to load final review', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    return navigation.addListener('focus', load);
  }, [navigation, uid]);

  useEffect(() => {
    const handler = () => {
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
    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [showMenuDrawer, showNotifications]);

  const missing = useMemo(() => {
    const missingDocs = requirements.filter(
      item => item.required !== false
        && (!item.category || /pre|deploy/i.test(item.category))
        && !['submitted', 'approved'].includes(item.status)
    );
    const requiredCompany = [
      'companyName',
      'companyAddress',
      'supervisorName',
      'supervisorEmail',
      'internshipRole',
      'startDate',
      'endDate',
    ];
    return [
      ...missingDocs.map(item => item.label),
      ...requiredCompany
        .filter(field => !String(company[field] || '').trim())
        .map(field => field.replace(/([A-Z])/g, ' $1').toLowerCase()),
    ];
  }, [requirements, company]);

  const requiredDocuments = requirements.filter(
    item => item.required !== false && (!item.category || /pre|deploy/i.test(item.category))
  );
  const receivedDocumentCount = requiredDocuments.filter(
    item => ['submitted', 'approved'].includes(item.status)
  ).length;
  const documentProgress = requiredDocuments.length
    ? Math.round((receivedDocumentCount / requiredDocuments.length) * 100)
    : 0;

  const ready =
    missing.length === 0 &&
    user.placementStatus === 'approved' &&
    !['pending_review', 'approved'].includes(request?.status);

  const submit = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      const canResubmitExisting = request?.id && ['needs_revision', 'rejected'].includes(request.status);
      const result = await postBackend('/student/final-reviews', canResubmitExisting ? { requestId: request.id } : {});
      setRequest({
        ...(request || {}), id: result.requestId, status: result.status,
        submittedAt: result.submittedAt, updatedAt: result.submittedAt, reviewReason: '',
      });
      Alert.alert(
        'Submitted for Coordinator Review',
        'Your pre-deployment documentation package was successfully submitted.',
        [{ text: 'View Approval Status', onPress: () => navigation.replace('Approval') }]
      );
    } catch (error) {
      console.error('Final review submission error:', error);
      Alert.alert('Unable to submit review', error.message || 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading) {
    return <StudentScreenSkeleton variant="review" />;
  }

  const requestPending = request?.status === 'pending_review';
  const requestApproved = request?.status === 'approved';
  const requestNeedsChanges = ['needs_revision', 'rejected'].includes(request?.status);
  const requestSuperseded = request?.status === 'superseded';
  const companyApproved = user.placementStatus === 'approved';
  const hasBlockers = missing.length > 0 || !companyApproved;
  const blockingItems = [
    ...missing,
    ...(!companyApproved ? ['Approved company placement'] : []),
  ];
  const statusBadgeText = requestPending
    ? 'In review'
    : requestApproved
      ? 'Approved'
      : requestNeedsChanges
        ? 'Update needed'
        : requestSuperseded
          ? 'Resubmit'
          : hasBlockers
            ? 'Action needed'
            : 'Ready';
  const statusDescription = requestPending
    ? 'Your package is with the coordinator. Check the next step for its decision.'
    : requestApproved
      ? 'Your final review has been approved. Continue to view your approval details.'
      : requestNeedsChanges
        ? 'Review the coordinator feedback, update anything needed, then resubmit.'
        : requestSuperseded
          ? 'A placement change replaced the previous review. Check the latest details before resubmitting.'
          : missing.length > 0
            ? 'Complete the items below before sending your package for final review.'
            : !companyApproved
              ? 'Your company placement must be approved before you can submit this package.'
              : 'Everything is ready. Submit your package for coordinator review.';
  const statusTone = requestApproved
    ? 'success'
    : requestNeedsChanges || requestSuperseded
      ? 'warning'
      : requestPending
        ? 'info'
        : hasBlockers
          ? 'warning'
          : 'ready';
  const mainActionLabel = requestApproved || requestPending
    ? 'View approval status'
    : !ready
      ? 'Complete items to continue'
      : requestNeedsChanges
        ? 'Resubmit for review'
        : 'Submit for coordinator review';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      <PreDeploymentTopBar
        onMenuPress={() => setShowMenuDrawer(true)}
        onNotificationsPress={() => setShowNotifications(true)}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: narrow ? 14 : 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pageHeading}>
          <Text style={styles.subheading}>PRE-DEPLOYMENT · STEP 3</Text>
          <Text variant="heading" style={styles.heading}>Final Review</Text>
          <Text style={styles.pageDescription}>Check your documents and placement details before sending your package for approval.</Text>
        </View>

        <PreDeploymentStepper
          activeStep={3}
          onStepPress={step => {
            if (step === 1) navigation.replace('Requirements');
            if (step === 2) navigation.replace('Company');
            if (step === 4) navigation.replace('Approval');
          }}
        />

        {/* Review status adapts to draft, pending, revision, superseded, and approved states. */}
        <Card title="Submission status" icon={<FileIcon size={20} color={COLORS.primary} />}>
          <View style={styles.statusSummary}>
            <Text style={styles.statusDescription}>{statusDescription}</Text>
            <View style={[
              styles.statusBadge,
              statusTone === 'success' && styles.statusBadgeSuccess,
              statusTone === 'warning' && styles.statusBadgeWarning,
              statusTone === 'info' && styles.statusBadgeInfo,
              statusTone === 'ready' && styles.statusBadgeReady,
            ]}>
              <Text style={[
                styles.statusBadgeText,
                statusTone === 'success' && styles.statusBadgeTextSuccess,
                statusTone === 'warning' && styles.statusBadgeTextWarning,
                statusTone === 'info' && styles.statusBadgeTextInfo,
                statusTone === 'ready' && styles.statusBadgeTextReady,
              ]}>{statusBadgeText}</Text>
            </View>
          </View>
          {request?.reviewReason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonHeader}>COORDINATOR NOTE</Text>
              <Text style={styles.reason}>{request.reviewReason}</Text>
            </View>
          ) : null}
        </Card>

        {hasBlockers && !requestPending && !requestApproved && (
          <View style={styles.blockersCard}>
            <View style={styles.blockersHeading}>
              <AlertCircleIcon size={18} color={COLORS.warningDark} />
              <Text style={styles.blockersTitle}>A few things to complete</Text>
            </View>
            <Text style={styles.blockersDescription}>You can submit once these items are resolved:</Text>
            {blockingItems.map((item, index) => (
              <View key={`${item}-${index}`} style={styles.blockerRow}>
                <View style={styles.blockerDot} />
                <Text style={styles.blockerText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Verified Documents Snapshot */}
        <Card
          title="Document checklist"
          icon={<CheckCircleIcon size={20} color={COLORS.successDark} />}
          action={(
            <TouchableOpacity
              style={styles.editAction}
              onPress={() => navigation.replace('Requirements')}
              accessibilityRole="button"
              accessibilityLabel="Edit required documents"
            >
              <Text style={styles.editText}>Edit</Text>
              <ArrowRightIcon size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        >
          <View style={styles.documentProgressHeader}>
            <Text style={styles.documentProgressText}>
              {requiredDocuments.length
                ? `${receivedDocumentCount} of ${requiredDocuments.length} required documents received`
                : 'No required documents assigned'}
            </Text>
            <Text style={styles.documentProgressPercent}>{requiredDocuments.length ? `${documentProgress}%` : '—'}</Text>
          </View>
          <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel="Required documents received" accessibilityValue={{ min: 0, max: 100, now: documentProgress }}>
            <View style={[styles.progressFill, { width: `${documentProgress}%` }]} />
          </View>

          {requirements.length === 0 ? (
            <View style={styles.emptyDocuments}>
              <FileIcon size={20} color={COLORS.textMuted} />
              <Text style={styles.emptyDocumentsText}>Your document checklist hasn’t been set up yet.</Text>
            </View>
          ) : requirements.map(item => {
            const itemApproved = item.status === 'approved';
            const itemSubmitted = item.status === 'submitted';
            const itemNeedsChanges = ['rejected', 'needs_revision'].includes(item.status);
            const itemStatus = statusText[item.status] || 'Missing';
            return (
              <View key={item.id} style={styles.documentRow}>
                <View style={[
                  styles.documentStatusIcon,
                  itemApproved && styles.documentStatusIconApproved,
                  itemSubmitted && styles.documentStatusIconSubmitted,
                  itemNeedsChanges && styles.documentStatusIconIssue,
                ]}>
                  {itemApproved
                    ? <CheckCircleIcon size={17} color={COLORS.successDark} />
                    : itemNeedsChanges
                      ? <AlertCircleIcon size={17} color={COLORS.dangerDark} />
                      : <FileIcon size={17} color={itemSubmitted ? COLORS.primary : COLORS.textMuted} />}
                </View>
                <View style={styles.documentCopy}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{item.label}</Text>
                  <Text style={styles.mutedText} numberOfLines={1}>{item.fileName || (itemSubmitted ? 'Received by coordinator' : itemApproved ? 'Approved by coordinator' : 'No file submitted')}</Text>
                </View>
                <View style={[
                  styles.documentStatusBadge,
                  itemApproved && styles.documentStatusBadgeApproved,
                  itemSubmitted && styles.documentStatusBadgeSubmitted,
                  itemNeedsChanges && styles.documentStatusBadgeIssue,
                ]}>
                  <Text style={[
                    styles.documentStatusText,
                    itemApproved && styles.documentStatusTextApproved,
                    itemSubmitted && styles.documentStatusTextSubmitted,
                    itemNeedsChanges && styles.documentStatusTextIssue,
                  ]}>{itemStatus}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        {/* Host Company Snapshot */}
        <Card
          title="Company placement"
          icon={<BuildingIcon size={20} color={COLORS.primary} />}
          action={(
            <TouchableOpacity
              style={styles.editAction}
              onPress={() => navigation.replace('Company')}
              accessibilityRole="button"
              accessibilityLabel="Edit company placement"
            >
              <Text style={styles.editText}>Edit</Text>
              <ArrowRightIcon size={14} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        >

          <Detail label="Company Name" value={company.companyName} />
          <Detail label="Office Address" value={company.companyAddress} />
          <Detail label="Industry" value={company.companyIndustry} />
          <Detail
            label="Company Contact"
            value={[company.companyEmail, company.companyPhone].filter(Boolean).join(' · ')}
          />
          <Detail
            label="Supervisor"
            value={[company.supervisorName, company.supervisorPosition].filter(Boolean).join(' · ')}
          />
          <Detail
            label="Supervisor Contact"
            value={[company.supervisorEmail, company.supervisorPhone].filter(Boolean).join(' · ')}
          />
          <Detail label="Internship Role" value={company.internshipRole} />
          <Detail
            label="Schedule Dates"
            value={`${company.startDate || '—'} to ${company.endDate || '—'}`}
          />
          <Detail label="Work Arrangement" value={company.workArrangement} />
          <Detail label="Additional Notes" value={company.notes} />
        </Card>

        {/* Action Buttons */}
        <View style={[styles.actions, narrow && styles.actionsStacked]}>
          <TouchableOpacity
            style={[styles.secondaryBtn, narrow && styles.stackedAction]}
            onPress={() => navigation.replace('Company')}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Back to company placement</Text>
          </TouchableOpacity>

          <MotionTouchableOpacity
            style={[styles.primaryBtn, narrow && styles.stackedAction, !ready && !requestPending && !requestApproved && styles.disabledBtn]}
            disabled={(!ready && !requestPending && !requestApproved) || saving}
            onPress={() => {
              if (requestPending || requestApproved) navigation.replace('Approval');
              else submit();
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.primaryText}>{mainActionLabel}</Text>
            )}
          </MotionTouchableOpacity>
        </View>
      </ScrollView>

      <PreDeploymentNotificationsSheet visible={showNotifications} onClose={() => setShowNotifications(false)} />

      <PreDeploymentDrawer
        visible={showMenuDrawer}
        activeRoute="Review"
        onClose={() => setShowMenuDrawer(false)}
        onNavigate={route => navigation.replace(route)}
        onSignOut={logout}
      />
    </View>
  );
}

function Card({ title, icon, action, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>{icon}</View>
        <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

function Detail({ label, value }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || 'Not provided'}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  topBar: {
    height: Platform.OS === 'ios' ? 94 : 64,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  brandLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  brand: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  brandNarrow: {
    fontSize: 16,
    letterSpacing: 1.8,
  },
  content: {
    paddingTop: 22,
    paddingBottom: 44,
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
  },
  subheading: {
    color: COLORS.secondary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 5,
  },
  pageHeading: {
    marginBottom: 17,
  },
  heading: {
    color: COLORS.textPrimary,
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  pageDescription: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
    position: 'relative',
  },
  stepTrackLine: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: 17,
    height: 2,
    borderRadius: 2,
    backgroundColor: COLORS.border,
  },
  stepTrackProgress: {
    position: 'absolute',
    left: '12%',
    width: '50%',
    top: 17,
    height: 2,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  stepItem: {
    alignItems: 'center',
    width: '24%',
  },
  stepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDone: {
    backgroundColor: COLORS.primary,
  },
  stepActive: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  stepInactive: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: COLORS.background,
  },
  stepNumber: {
    color: COLORS.textMuted,
    fontWeight: '700',
    fontSize: 13,
  },
  stepNumberDone: {
    color: '#FFFFFF',
  },
  stepNumberActive: {
    color: COLORS.primary,
  },
  stepLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  stepLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: 15,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 13,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: COLORS.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
    minWidth: 0,
  },
  editAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 6,
    paddingLeft: 4,
  },
  editText: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  statusSummary: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusDescription: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
    minWidth: 0,
  },
  statusBadge: {
    borderRadius: 20,
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexShrink: 0,
  },
  statusBadgeSuccess: {
    backgroundColor: COLORS.successSubtle,
  },
  statusBadgeWarning: {
    backgroundColor: COLORS.warningSubtle,
  },
  statusBadgeInfo: {
    backgroundColor: COLORS.primarySubtle,
  },
  statusBadgeReady: {
    backgroundColor: COLORS.successSubtle,
  },
  statusBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeTextSuccess: {
    color: COLORS.successDark,
  },
  statusBadgeTextWarning: {
    color: COLORS.warningDark,
  },
  statusBadgeTextInfo: {
    color: COLORS.primary,
  },
  statusBadgeTextReady: {
    color: COLORS.successDark,
  },
  blockersCard: {
    backgroundColor: COLORS.warningSubtle,
    borderWidth: 1,
    borderColor: COLORS.warningLight,
    borderRadius: 15,
    padding: 14,
    marginBottom: 12,
  },
  blockersHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blockersTitle: {
    color: COLORS.warningDark,
    fontSize: 13,
    fontWeight: '800',
  },
  blockersDescription: {
    color: COLORS.textSecondary,
    fontSize: 11,
    marginTop: 6,
    marginBottom: 3,
  },
  blockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 7,
  },
  blockerDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: COLORS.warningDark,
  },
  blockerText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  documentProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  documentProgressText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 11,
  },
  documentProgressPercent: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceMuted,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  documentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 10,
  },
  documentStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  documentStatusIconApproved: {
    backgroundColor: COLORS.successSubtle,
  },
  documentStatusIconSubmitted: {
    backgroundColor: COLORS.primarySubtle,
  },
  documentStatusIconIssue: {
    backgroundColor: COLORS.dangerSubtle,
  },
  documentCopy: {
    flex: 1,
    minWidth: 0,
  },
  documentStatusBadge: {
    backgroundColor: COLORS.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    flexShrink: 0,
  },
  documentStatusBadgeApproved: {
    backgroundColor: COLORS.successSubtle,
  },
  documentStatusBadgeSubmitted: {
    backgroundColor: COLORS.primarySubtle,
  },
  documentStatusBadgeIssue: {
    backgroundColor: COLORS.dangerSubtle,
  },
  documentStatusText: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  documentStatusTextApproved: {
    color: COLORS.successDark,
  },
  documentStatusTextSubmitted: {
    color: COLORS.primary,
  },
  documentStatusTextIssue: {
    color: COLORS.dangerDark,
  },
  emptyDocuments: {
    minHeight: 68,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyDocumentsText: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 12.5,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  mutedText: {
    color: COLORS.textSecondary,
    fontSize: 10.5,
    marginTop: 2,
    minWidth: 0,
  },
  reasonBox: {
    backgroundColor: COLORS.dangerSubtle,
    borderLeftWidth: 3.5,
    borderLeftColor: COLORS.danger,
    borderRadius: RADIUS.sm,
    padding: 12,
    marginTop: 10,
  },
  reasonHeader: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.dangerDark,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  reason: {
    color: COLORS.dangerDark,
    fontSize: 12.5,
    lineHeight: 18,
  },
  detail: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 9,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  detailValue: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
    marginBottom: 14,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
    gap: 9,
  },
  stackedAction: {
    flex: 0,
  },
  primaryBtn: {
    flex: 1.4,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    ...SHADOWS.soft,
  },
  disabledBtn: {
    backgroundColor: '#AAB8C9',
    ...SHADOWS.none,
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    backgroundColor: COLORS.surface,
  },
  secondaryText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
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
