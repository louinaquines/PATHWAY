// screens/ReviewScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text } from '../components/AppText';
import PathwayWatermark from '../components/PathwayWatermark';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import PathwayMark from '../components/PathwayMark';
import {
  AlertCircleIcon,
  BellIcon,
  CheckCircleIcon,
  FileIcon,
  MenuIcon,
  CloseIcon,
  LogOutIcon,
  BuildingIcon,
  ArrowRightIcon,
} from '../components/Icons';

const statusText = {
  not_submitted: 'Missing',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Needs Resubmission',
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
  }, []);

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

  const logout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  if (loading) {
    return <StudentScreenSkeleton variant="review" />;
  }

  const requestStatus =
    request?.status === 'pending_review'
      ? 'Submitted for coordinator review'
      : request?.status === 'needs_revision'
      ? 'Needs coordinator revision'
      : request?.status === 'rejected'
      ? 'Rejected — review the reason and resubmit'
      : request?.status === 'approved'
      ? 'Approved'
      : request?.status === 'superseded'
      ? 'Previous review superseded by placement change'
      : missing.length
      ? 'Items Pending Completion'
      : 'Ready for Coordinator Submission';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <PathwayWatermark size={152} opacity={0.045} style={{ right: -47, top: -56 }} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowMenuDrawer(true)}
          accessibilityLabel="Open menu"
        >
          <MenuIcon size={20} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <PathwayMark size={42} />
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => setShowNotifications(true)}
          accessibilityLabel="Open notifications"
        >
          <BellIcon size={21} color={COLORS.primaryDark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: narrow ? 14 : 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subheading}>Pre-deployment Pipeline</Text>
        <Text variant="heading" style={styles.heading}>Final Review &amp; Verification</Text>

        {/* 4-Step Stepper */}
        <View style={styles.stepper}>
          <View style={styles.stepTrackLine} />
          <View style={styles.stepTrackProgress} />
          {['Doc Submission', 'Company', 'Review', 'Approval'].map((label, index) => (
            <TouchableOpacity
              key={label}
              style={styles.stepItem}
              onPress={() => {
                if (index === 0) navigation.replace('Requirements');
                if (index === 1) navigation.replace('Company');
                if (index === 3) navigation.replace('Approval');
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Open ${label} step`}
            >
              <View
                style={[
                  styles.stepCircle,
                  index < 2
                    ? styles.stepDone
                    : index === 2
                    ? styles.stepActive
                    : styles.stepInactive,
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    index < 2 && styles.stepNumberDone,
                    index === 2 && styles.stepNumberActive,
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, index === 2 && styles.stepLabelActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Review Status Card */}
        <Card title="Review Status" icon={<FileIcon size={20} color={COLORS.primary} />}>
          <Text style={styles.status}>{requestStatus}</Text>
          {request?.reviewReason ? (
            <View style={styles.reasonBox}>
              <Text style={styles.reasonHeader}>COORDINATOR NOTE</Text>
              <Text style={styles.reason}>{request.reviewReason}</Text>
            </View>
          ) : null}

          {missing.length > 0 && (
            <View style={styles.warning}>
              <AlertCircleIcon size={16} color={COLORS.danger} />
              <View style={styles.warningContent}>
                <Text style={styles.warningHeading}>Incomplete Requirements:</Text>
                {missing.map(item => (
                  <Text key={item} style={styles.warningItem}>
                    • {item}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </Card>

        {/* Verified Documents Snapshot */}
        <Card
          title="Verified Documents"
          icon={<CheckCircleIcon size={20} color={COLORS.successDark} />}
        >
          <TouchableOpacity
            style={styles.editLink}
            onPress={() => navigation.replace('Requirements')}
          >
            <Text style={styles.editText}>Edit Documents →</Text>
          </TouchableOpacity>

          {requirements.map(item => (
            <View key={item.id} style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{item.label}</Text>
                <Text style={styles.mutedText}>
                  {statusText[item.status] || 'Missing'}
                  {item.fileName ? ` · ${item.fileName}` : ''}
                </Text>
              </View>
              {['submitted', 'approved'].includes(item.status) ? (
                <CheckCircleIcon size={18} color={COLORS.success} />
              ) : (
                <AlertCircleIcon size={18} color={COLORS.danger} />
              )}
            </View>
          ))}
        </Card>

        {/* Host Company Snapshot */}
        <Card title="Host Company Placement" icon={<BuildingIcon size={20} color={COLORS.primary} />}>
          <TouchableOpacity
            style={styles.editLink}
            onPress={() => navigation.replace('Company')}
          >
            <Text style={styles.editText}>Edit Placement →</Text>
          </TouchableOpacity>

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
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.replace('Company')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryText}>Back to Company</Text>
          </TouchableOpacity>

          <MotionTouchableOpacity
            style={[styles.primaryBtn, !ready && styles.disabledBtn]}
            disabled={!ready || saving}
            onPress={submit}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.primaryText}>
                {['needs_revision', 'rejected'].includes(request?.status) ? 'Resubmit Review' : 'Submit Package'}
              </Text>
            )}
          </MotionTouchableOpacity>
        </View>
      </ScrollView>

      {/* Notifications Modal */}
      <Modal
        visible={showNotifications}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNotifications(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowNotifications(false)}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifications(false)}>
                <CloseIcon size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.mutedText}>
              Review updates and approval notes from your coordinator will appear here.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Menu Drawer */}
      <Modal
        visible={showMenuDrawer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuDrawer(false)}
      >
        <View style={styles.drawerOverlay}>
          <TouchableOpacity
            style={styles.backdrop}
            onPress={() => setShowMenuDrawer(false)}
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

function Card({ title, icon, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {icon}
        <Text style={styles.cardTitle}>{title}</Text>
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
  brand: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2.5,
  },
  content: {
    paddingTop: 20,
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
    marginBottom: 20,
    position: 'relative',
  },
  stepTrackLine: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
  },
  stepTrackProgress: {
    position: 'absolute',
    left: '12%',
    width: '45%',
    top: 16,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  stepItem: {
    alignItems: 'center',
    width: '24%',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
    backgroundColor: '#FFFFFF',
  },
  stepInactive: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  stepNumber: {
    color: '#94A3B8',
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
    color: '#94A3B8',
    fontSize: 10.5,
    textAlign: 'center',
    fontWeight: '600',
  },
  stepLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 16,
    ...SHADOWS.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15.5,
    fontWeight: '800',
  },
  editLink: {
    alignSelf: 'flex-end',
    marginTop: -36,
    marginBottom: 14,
  },
  editText: {
    color: COLORS.secondary,
    fontSize: 12,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 11,
  },
  flex: {
    flex: 1,
  },
  itemTitle: {
    color: COLORS.textPrimary,
    fontSize: 13.5,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  mutedText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  status: {
    color: COLORS.primary,
    fontSize: 14.5,
    fontWeight: '800',
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
  warning: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.dangerSubtle,
    padding: 12,
    borderRadius: RADIUS.sm,
    marginTop: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningHeading: {
    color: COLORS.dangerDark,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  warningItem: {
    color: COLORS.dangerDark,
    fontSize: 12,
    lineHeight: 18,
  },
  detail: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingVertical: 10,
  },
  detailLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  detailValue: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  primaryBtn: {
    flex: 1.4,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.soft,
  },
  disabledBtn: {
    backgroundColor: '#CBD5E1',
  },
  primaryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
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
