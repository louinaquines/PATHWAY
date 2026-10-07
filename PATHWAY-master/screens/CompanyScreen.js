import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import StudentLogoutScreen from '../components/StudentLogoutScreen';
import useStudentLogout from '../hooks/useStudentLogout';
import PreDeploymentDrawer from '../components/PreDeploymentDrawer';
import PreDeploymentTopBar from '../components/PreDeploymentTopBar';
import PlacementDateField from '../components/PlacementDateField';
import PreDeploymentStepper from '../components/PreDeploymentStepper';
import PreDeploymentNotificationsSheet from '../components/PreDeploymentNotificationsSheet';
import {
  AlertCircleIcon,
  CheckCircleIcon,
  FileIcon,
  SearchIcon,
  BuildingIcon,
  ArrowRightIcon,
} from '../components/Icons';

const EMPTY_FORM = {
  companyId: '',
  companyName: '',
  companyAddress: '',
  companyIndustry: '',
  companyEmail: '',
  companyPhone: '',
  supervisorName: '',
  supervisorPosition: '',
  supervisorEmail: '',
  supervisorPhone: '',
  internshipRole: '',
  startDate: '',
  endDate: '',
  workArrangement: '',
  notes: '',
};

const statusLabel = {
  draft: 'Draft',
  pending_review: 'In review',
  approved: 'Approved',
  needs_revision: 'Needs update',
  rejected: 'Resubmit',
};

export default function CompanyScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isNarrow = width < 360;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [proposalId, setProposalId] = useState(null);
  const [proposalStatus, setProposalStatus] = useState('not_started');
  const [reviewReason, setReviewReason] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [requirementsEligible, setRequirementsEligible] = useState(false);
  const [requirementsComplete, setRequirementsComplete] = useState(false);
  const [search, setSearch] = useState('');
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);
  const { loggingOut, logout } = useStudentLogout(navigation);
  const [showNotifications, setShowNotifications] = useState(false);
  const [placementChangeMode, setPlacementChangeMode] = useState(false);

  const uid = auth?.currentUser?.uid;

  useEffect(() => {
    loadCompanyData();
    return navigation.addListener('focus', loadCompanyData);
  }, [navigation, uid]);

  useEffect(() => {
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

  const loadCompanyData = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [userSnap, companySnap, proposalSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDocs(collection(db, 'companies')),
        getDocs(query(collection(db, 'companyProposals'), where('studentId', '==', uid))),
      ]);

      const userData = userSnap.data() || {};
      setRequirementsEligible(userData.requirementsStatus === 'approved');
      const requirementValues = Object.values(userData.requirements || {});
      setRequirementsComplete(requirementValues.length > 0 && requirementValues.every(item => ['submitted', 'approved'].includes(item?.status)));
      setCompanies(companySnap.docs.map(item => ({ id: item.id, ...item.data() })));
      const latest = proposalSnap.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];

      if (latest) {
        setProposalId(latest.id);
        setProposalStatus(latest.status || 'draft');
        setReviewReason(latest.reviewReason || '');
        setForm({ ...EMPTY_FORM, ...latest });
      } else if (userSnap.exists() && userData.company) {
        setForm(previous => ({ ...previous, companyName: userData.company }));
      }
    } catch (error) {
      console.error('Company data error:', error);
      Alert.alert('Unable to load companies', 'Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = useMemo(() => {
    const term = search.trim().toLowerCase();
    return companies.filter(company => company.status !== 'inactive' && (
      !term || [company.name, company.address, company.industry].some(value => String(value || '').toLowerCase().includes(term))
    ));
  }, [companies, search]);
  const activeCompanyCount = companies.filter(company => company.status !== 'inactive').length;

  const updateField = (field, value) => setForm(previous => ({ ...previous, [field]: value }));

  const selectCompany = (company) => {
    setForm(previous => ({
      ...previous,
      companyId: company.id,
      companyName: company.name || '',
      companyAddress: company.address || '',
      companyIndustry: company.industry || '',
      companyEmail: company.email || '',
      companyPhone: company.phone || '',
    }));
    setSearch('');
  };

  const validateSubmission = () => {
    const required = [
      ['companyName', 'company name'],
      ['companyAddress', 'company address'],
      ['supervisorName', 'supervisor name'],
      ['supervisorEmail', 'supervisor email'],
      ['internshipRole', 'internship role or department'],
      ['startDate', 'proposed start date'],
      ['endDate', 'proposed end date'],
    ];
    const missing = required.find(([field]) => !String(form[field] || '').trim());
    if (missing) {
      Alert.alert('Complete the placement details', `Please enter the ${missing[1]} before submitting.`);
      return false;
    }
    return true;
  };

  const saveProposal = async (status) => {
    if (status === 'pending_review' && !validateSubmission()) return;
    if (proposalStatus === 'approved') return;

    setSaving(true);
    try {
      const payload = {
        ...Object.fromEntries(Object.keys(EMPTY_FORM).map(key => [key, form[key] ?? EMPTY_FORM[key]])),
        status,
        ...(proposalId ? { proposalId } : {}),
      };
      const saved = await postBackend('/student/company-proposals', payload);
      setProposalId(saved.id);
      setProposalStatus(status);
      if (status === 'pending_review') setPlacementChangeMode(false);
      if (status === 'draft') Alert.alert('Draft saved', 'You can continue editing your placement details later.');
      if (status === 'pending_review') Alert.alert('Submitted for review', 'Your coordinator will review this company placement. You can return to your dashboard while you wait.', [
        { text: 'Done', style: 'cancel' },
        { text: 'Back to dashboard', onPress: () => navigation.replace('StudentDashboard') },
      ]);
    } catch (error) {
      console.error('Company proposal save error:', error);
      Alert.alert('Unable to save placement', error.message || 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = logout;

  const startPlacementChange = () => {
    const { id, status, createdAt, updatedAt, reviewReason: previousReason, studentId, studentName, department, sectionId, ...draft } = form;
    setProposalId(null);
    setProposalStatus('draft');
    setReviewReason('');
    setPlacementChangeMode(true);
    setForm({ ...EMPTY_FORM, ...draft, status: 'draft', companyId: '' });
  };

  const canEdit = ['not_started', 'draft', 'needs_revision', 'rejected'].includes(proposalStatus);
  const showEditor = canEdit || placementChangeMode;
  const placementApproved = proposalStatus === 'approved';
  const placementNeedsAttention = ['needs_revision', 'rejected'].includes(proposalStatus);
  const placementUnderReview = proposalStatus === 'pending_review';
  const placementStatusMessage = {
    not_started: 'Choose a company or propose a new placement to get started.',
    draft: 'Your placement details are saved. Finish them and submit when ready.',
    pending_review: 'Your request is with your coordinator. You can review it here while you wait.',
    approved: 'Your company placement has been confirmed.',
    needs_revision: 'Review the coordinator note, update your details, then resubmit.',
    rejected: 'Update your placement details and submit them again for review.',
  }[proposalStatus] || 'Your placement status will appear here.';

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading) {
    return <StudentScreenSkeleton variant="placement" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <PreDeploymentTopBar
        onMenuPress={() => setShowMenuDrawer(true)}
        onNotificationsPress={() => setShowNotifications(true)}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: isNarrow ? 14 : 20 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeading}>
          <Text style={styles.subheading}>PRE-DEPLOYMENT · STEP 2</Text>
          <Text variant="heading" style={styles.heading}>Company Placement</Text>
          <Text style={styles.pageDescription}>Choose where you’ll complete your OJT and submit the placement details for coordinator review.</Text>
        </View>

        <PreDeploymentStepper
          activeStep={2}
          completedSteps={requirementsComplete ? [1] : []}
          onStepPress={step => {
            if (step === 1) navigation.replace('Requirements');
            if (step === 3) navigation.replace('Review');
            if (step === 4) navigation.replace('Approval');
          }}
        />

        <View style={styles.statusCard}>
          <View style={styles.statusHeadingRow}>
            <View style={[
              styles.statusIcon,
              placementApproved && styles.statusIconSuccess,
              placementNeedsAttention && styles.statusIconIssue,
              placementUnderReview && styles.statusIconReview,
            ]}>
              {placementApproved
                ? <CheckCircleIcon size={20} color={COLORS.successDark} />
                : placementNeedsAttention
                  ? <AlertCircleIcon size={20} color={COLORS.dangerDark} />
                  : placementUnderReview
                    ? <FileIcon size={20} color={COLORS.warningDark} />
                    : <BuildingIcon size={20} color={COLORS.primary} />}
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Placement status</Text>
              <Text style={styles.cardSubtitle}>{placementStatusMessage}</Text>
            </View>
            <View style={[
              styles.statusPill,
              placementApproved && styles.statusPillSuccess,
              placementNeedsAttention && styles.statusPillIssue,
              placementUnderReview && styles.statusPillReview,
            ]}>
              <Text style={[
                styles.statusPillText,
                placementApproved && styles.statusPillTextSuccess,
                placementNeedsAttention && styles.statusPillTextIssue,
                placementUnderReview && styles.statusPillTextReview,
              ]}>{statusLabel[proposalStatus] || 'Not started'}</Text>
            </View>
          </View>
          {!!reviewReason && (
            <View style={styles.reviewReasonCard}>
              <Text style={styles.reviewReasonLabel}>COORDINATOR FEEDBACK</Text>
              <Text style={styles.reviewReason}>{reviewReason}</Text>
            </View>
          )}
        </View>

        {proposalStatus === 'pending_review' && (
          <View style={styles.pendingCard}>
            <View style={styles.pendingIcon}><FileIcon size={18} color={COLORS.warningDark} /></View>
            <View style={styles.pendingCopy}>
              <Text style={styles.sectionTitle}>What happens next</Text>
              <Text style={styles.pendingText}>Your coordinator will review the company and placement details. You can’t resubmit until they respond.</Text>
            </View>
          </View>
        )}

        {showEditor && (
          <>
            <View style={styles.card}>
              <View style={styles.cardSectionHeading}>
                <View style={styles.sectionIcon}><SearchIcon size={18} color={COLORS.primary} /></View>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Find a company</Text>
                  <Text style={styles.sectionDescription}>Search the directory, or enter a new company below.</Text>
                </View>
              </View>
              <View style={styles.searchBarContainer}>
                <SearchIcon size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name, address, or industry"
                  placeholderTextColor={COLORS.textPlaceholder}
                />
              </View>
              {!search.trim() && (
                <View style={styles.directoryHint}>
                  <BuildingIcon size={15} color={COLORS.secondary} />
                  <Text style={styles.directoryHintText}>{activeCompanyCount} active {activeCompanyCount === 1 ? 'company' : 'companies'} in the directory</Text>
                </View>
              )}
              {search.trim() !== '' && filteredCompanies.map(company => (
                <TouchableOpacity key={company.id} style={styles.companyResult} onPress={() => selectCompany(company)} activeOpacity={0.8}>
                  <View style={styles.companyResultIcon}><BuildingIcon size={18} color={COLORS.secondary} /></View>
                  <View style={styles.flex}><Text style={styles.companyResultName}>{company.name}</Text><Text style={styles.companyResultMeta} numberOfLines={1}>{company.industry || 'Industry not listed'} · {company.address || 'Address not listed'}</Text><Text style={styles.companyResultSlots}>{company.availableSlots ?? '—'} internship slots</Text></View>
                  <ArrowRightIcon size={16} color={COLORS.primary} />
                </TouchableOpacity>
              ))}
              {search.trim() !== '' && filteredCompanies.length === 0 && <Text style={styles.emptyText}>No active company found. You can propose a new company below.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.cardSectionHeading}>
                <View style={styles.sectionIcon}><BuildingIcon size={18} color={COLORS.primary} /></View>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>{form.companyId ? 'Selected company' : 'Company details'}</Text>
                  <Text style={styles.sectionDescription}>{form.companyId ? 'Confirm the directory details and add your placement information.' : 'Propose a company and provide the details for coordinator review.'}</Text>
                </View>
              </View>
              <Text style={styles.formGroupTitle}>COMPANY</Text>
              <Field label="Company name" value={form.companyName} onChangeText={value => updateField('companyName', value)} editable={showEditor} />
              <Field label="Company address" value={form.companyAddress} onChangeText={value => updateField('companyAddress', value)} editable={showEditor} />
              <Field label="Industry or type" value={form.companyIndustry} onChangeText={value => updateField('companyIndustry', value)} editable={showEditor} />
              <View style={[styles.row, isNarrow && styles.formColumn]}><Field label="Company email" value={form.companyEmail} onChangeText={value => updateField('companyEmail', value)} editable={showEditor} half={!isNarrow} /><Field label="Company phone" value={form.companyPhone} onChangeText={value => updateField('companyPhone', value)} editable={showEditor} half={!isNarrow} /></View>
              <Text style={styles.formGroupTitle}>Supervisor</Text>
              <Field label="Supervisor name" value={form.supervisorName} onChangeText={value => updateField('supervisorName', value)} editable={showEditor} />
              <Field label="Position" value={form.supervisorPosition} onChangeText={value => updateField('supervisorPosition', value)} editable={showEditor} />
              <View style={[styles.row, isNarrow && styles.formColumn]}><Field label="Supervisor email" value={form.supervisorEmail} onChangeText={value => updateField('supervisorEmail', value)} editable={showEditor} half={!isNarrow} /><Field label="Supervisor phone" value={form.supervisorPhone} onChangeText={value => updateField('supervisorPhone', value)} editable={showEditor} half={!isNarrow} /></View>
              <Text style={styles.formGroupTitle}>INTERNSHIP DETAILS</Text>
              <Field label="Internship role or department" value={form.internshipRole} onChangeText={value => updateField('internshipRole', value)} editable={showEditor} />
              <View style={[styles.row, isNarrow && styles.formColumn]}><PlacementDateField label="Start date" value={form.startDate} onChangeText={value => { updateField('startDate', value); if (form.endDate && form.endDate < value) updateField('endDate', ''); }} editable={showEditor} half={!isNarrow} /><PlacementDateField label="End date" value={form.endDate} onChangeText={value => updateField('endDate', value)} editable={showEditor} half={!isNarrow} minimumDate={form.startDate} /></View>
              <Field label="Work arrangement or location" value={form.workArrangement} onChangeText={value => updateField('workArrangement', value)} editable={showEditor} />
              <Field label="Additional notes" value={form.notes} onChangeText={value => updateField('notes', value)} editable={showEditor} multiline />
              <View style={[styles.actionRow, isNarrow && styles.actionColumn]}>
                <TouchableOpacity accessibilityRole="button" style={[styles.secondaryButton, isNarrow && styles.stackedButton]} onPress={() => saveProposal('draft')} disabled={saving}><Text style={styles.secondaryButtonText}>{saving ? 'Saving...' : 'Save draft'}</Text></TouchableOpacity>
                <MotionTouchableOpacity accessibilityRole="button" style={[styles.primaryButton, isNarrow && styles.stackedButton]} onPress={() => saveProposal('pending_review')} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Submitting...' : 'Submit for review'}</Text></MotionTouchableOpacity>
              </View>
            </View>
          </>
        )}

        {proposalStatus === 'approved' && (
          <View style={styles.approvedCard}>
            <View style={styles.approvedHeadingRow}>
              <View style={styles.approvedIcon}><CheckCircleIcon size={22} color={COLORS.successDark} /></View>
              <View style={styles.flex}>
                <Text style={styles.approvedTitle}>Placement approved</Text>
                <Text style={styles.approvedText}>You’re ready to continue to the final review step.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.reviewStepBtn}
              onPress={() => navigation.navigate('Review')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue to final review"
            >
              <Text style={styles.reviewStepBtnText}>Continue to final review</Text>
              <ArrowRightIcon size={17} color={COLORS.textOnPrimary} />
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" style={styles.changeRequestBtn} onPress={startPlacementChange} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Request placement change</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <PreDeploymentNotificationsSheet visible={showNotifications} onClose={() => setShowNotifications(false)} />

      <PreDeploymentDrawer
        visible={showMenuDrawer}
        activeRoute="Company"
        onClose={() => setShowMenuDrawer(false)}
        onNavigate={route => navigation.replace(route)}
        onSignOut={handleLogout}
      />
    </View>
  );
}

function Field({ label, value, onChangeText, editable, half, multiline, placeholder }) {
  return <View style={[styles.fieldWrap, half && styles.halfField]}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} editable={editable} placeholder={placeholder || label} placeholderTextColor="#94A3B8" multiline={multiline} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  gateTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 12 },
  gateText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8, marginHorizontal: 28, marginBottom: 18 },
  loadingText: { marginTop: 12, color: COLORS.textSecondary },
  topBar: { height: Platform.OS === 'ios' ? 94 : 64, paddingTop: Platform.OS === 'ios' ? 44 : 12, paddingHorizontal: 20, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, ...SHADOWS.soft },
  topBarNarrow: { paddingHorizontal: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  brandLockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandTitle: { color: COLORS.primary, fontSize: 18, fontWeight: '800', letterSpacing: 2.5 },
  brandTitleNarrow: { fontSize: 16, letterSpacing: 1.8 },
  content: { paddingTop: 22, paddingBottom: 48, width: '100%', maxWidth: 680, alignSelf: 'center' },
  pageHeading: { marginBottom: 17 },
  subheading: { color: COLORS.secondary, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 5 },
  heading: { color: COLORS.textPrimary, fontSize: 25, fontWeight: '800' },
  pageDescription: { color: COLORS.textMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, position: 'relative' },
  stepTrackLine: { position: 'absolute', left: '12%', right: '12%', top: 17, height: 2, borderRadius: 2, backgroundColor: COLORS.border },
  stepTrackProgress: { position: 'absolute', left: '12%', width: '29%', top: 17, height: 2, borderRadius: 2, backgroundColor: COLORS.primary },
  stepComplete: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: COLORS.primarySubtle },
  stepNumberComplete: { color: COLORS.primary },
  stepItem: { alignItems: 'center', width: '24%' },
  stepCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 5, backgroundColor: COLORS.surface },
  stepActive: { borderWidth: 2, borderColor: COLORS.primary },
  stepInactive: { borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: COLORS.background },
  stepNumber: { color: '#94A3B8', fontWeight: '700' },
  stepNumberActive: { color: COLORS.primary, fontWeight: '800' },
  stepLabel: { color: COLORS.textMuted, fontSize: 10, textAlign: 'center' },
  stepLabelActive: { color: COLORS.primary, fontWeight: '800' },
  statusCard: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight, padding: 15, marginBottom: 12, ...SHADOWS.soft },
  statusHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.primarySubtle, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statusIconSuccess: { backgroundColor: COLORS.successSubtle },
  statusIconIssue: { backgroundColor: COLORS.dangerSubtle },
  statusIconReview: { backgroundColor: COLORS.warningSubtle },
  flex: { flex: 1, minWidth: 0 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 14, fontWeight: '800' },
  cardSubtitle: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 3 },
  statusPill: { maxWidth: 112, backgroundColor: COLORS.surfaceMuted, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 5, flexShrink: 0 },
  statusPillSuccess: { backgroundColor: COLORS.successSubtle },
  statusPillIssue: { backgroundColor: COLORS.dangerSubtle },
  statusPillReview: { backgroundColor: COLORS.warningSubtle },
  statusPillText: { color: COLORS.textSecondary, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  statusPillTextSuccess: { color: COLORS.successDark },
  statusPillTextIssue: { color: COLORS.dangerDark },
  statusPillTextReview: { color: COLORS.warningDark },
  reviewReasonCard: { backgroundColor: COLORS.dangerSubtle, borderRadius: 11, padding: 11, marginTop: 13 },
  reviewReasonLabel: { color: COLORS.dangerDark, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  reviewReason: { color: COLORS.dangerDark, fontSize: 12, lineHeight: 18 },
  pendingCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, backgroundColor: COLORS.warningSubtle, borderRadius: 15, borderWidth: 1, borderColor: COLORS.warningLight, padding: 14, marginBottom: 14 },
  pendingIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  pendingCopy: { flex: 1, minWidth: 0 },
  pendingText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4 },
  card: { backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.borderLight, padding: 16, marginBottom: 14, ...SHADOWS.soft },
  cardSectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 15 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.primarySubtle, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  sectionDescription: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  helpText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.textPrimary, backgroundColor: '#FFF', fontSize: 13 },
  fieldWrap: { marginBottom: 11 },
  halfField: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  formColumn: { flexDirection: 'column', gap: 0 },
  label: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  formGroupTitle: { color: COLORS.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 4, marginBottom: 10 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  companyResult: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#C8DDFB', borderRadius: 12, padding: 11, marginTop: 8, backgroundColor: COLORS.primarySubtle, gap: 10 },
  companyResultIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface },
  companyResultName: { color: COLORS.textPrimary, fontWeight: '800', fontSize: 13 },
  companyResultMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  companyResultSlots: { color: COLORS.secondary, fontSize: 11, marginTop: 3, fontWeight: '700' },
  directoryHint: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 10 },
  directoryHintText: { color: COLORS.textMuted, fontSize: 11 },
  emptyText: { color: COLORS.textMuted, fontSize: 12, lineHeight: 18, paddingVertical: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionColumn: { flexDirection: 'column-reverse', gap: 9 },
  stackedButton: { flex: 0 },
  primaryButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, ...SHADOWS.soft },
  primaryButtonText: { color: '#FFF', fontWeight: '800', fontSize: 13 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: 10, paddingLeft: 8, fontSize: 13, color: COLORS.textPrimary, minWidth: 0 },
  approvedCard: { backgroundColor: COLORS.successSubtle, borderRadius: 16, borderWidth: 1, borderColor: '#A7F3D0', padding: 16, gap: 12, ...SHADOWS.soft },
  approvedHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  approvedIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  approvedTitle: { fontSize: 16, fontWeight: '800', color: COLORS.successDark, marginBottom: 2 },
  approvedText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  reviewStepBtn: { flexDirection: 'row', backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  reviewStepBtnText: { color: COLORS.textOnPrimary, fontSize: 13, fontWeight: '800' },
  changeRequestBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, minHeight: 160 },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 8 },
});
