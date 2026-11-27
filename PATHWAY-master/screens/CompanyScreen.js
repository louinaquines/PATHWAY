import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { studentAlert as Alert } from '../services/studentAlert';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
import { MotionTouchableOpacity } from '../components/Motion';
import StudentScreenSkeleton from '../components/StudentScreenSkeleton';
import StudentLogoutScreen from '../components/StudentLogoutScreen';
import StudentSurface from '../components/StudentSurface';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ChevronIcon,
  ChevronLeftIcon,
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
  rejected: 'Declined',
};

export default function CompanyScreen({ navigation, route }) {
  const dedicatedChange = route?.name === 'PlacementChange';
  const insets = useSafeAreaInsets();
  const reachedStep = Math.max(2, Math.min(4, Number(route?.params?.reachedStep) || 2));
  const readOnlyStep = route?.params?.readOnlyStep === true;
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
  const [requestOpen, setRequestOpen] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkNote, setCheckNote] = useState(null);

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

  // quiet: refresh in place (no full-screen skeleton). Returns the placement status it found.
  const loadCompanyData = async ({ quiet = false } = {}) => {
    if (!uid) return null;
    if (!quiet) setLoading(true);
    setLoadFailed(false);
    let found = null;
    try {
      const read = (label, promise) => promise.catch(error => {
        console.error(`Company read failed: ${label} (project ${db.app.options.projectId})`, error.code);
        throw error;
      });
      const [userSnap, companySnap, proposalSnap] = await Promise.all([
        read('profile', getDoc(doc(db, 'users', uid))),
        read('directory', getDocs(collection(db, 'companies'))),
        read('own proposals', getDocs(query(collection(db, 'companyProposals'), where('studentId', '==', uid)))),
      ]);

      const userData = userSnap.data() || {};
      setCleared(userData.clearanceStatus === 'cleared');
      setRequirementsEligible(userData.requirementsStatus === 'approved');
      const requirementValues = Object.values(userData.requirements || {});
      setRequirementsComplete(requirementValues.length > 0 && requirementValues.every(item => ['submitted', 'approved'].includes(item?.status)));
      setCompanies(companySnap.docs.map(item => ({ id: item.id, ...item.data() }))
        .filter(company => !!userData.department && company.department === userData.department));
      const latest = proposalSnap.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0];

      if (userData.placementStatus === 'approved') {
        found = 'approved';
        setProposalId(null);
        setReviewReason('');
        setRequestOpen(false);
        setProposalStatus('approved');
        setForm({ ...EMPTY_FORM, ...userData, companyName: userData.company || userData.companyName });
      } else if (latest) {
        setProposalId(latest.id);
        found = latest.status === 'approved' ? 'not_started' : latest.status || 'draft';
        setProposalStatus(found);
        setReviewReason(latest.reviewReason || '');
        setForm({ ...EMPTY_FORM, ...latest });
      } else if (userSnap.exists() && userData.company) {
        setProposalStatus(userData.placementStatus || 'not_started');
        setForm(previous => ({ ...previous, companyName: userData.company }));
      }
    } catch (error) {
      console.error('Company data error:', error);
      if (quiet) throw error;
      setLoadFailed(true);
      Alert.alert('Unable to load companies', 'Placement data could not load. Retry before editing or submitting a placement.');
    } finally {
      if (!quiet) setLoading(false);
    }
    return found;
  };

  const checkPlacementStatus = async () => {
    if (checking) return;
    setChecking(true);
    setCheckNote(null);
    try {
      const status = await loadCompanyData({ quiet: true });
      setCheckNote(status === 'approved' ? { tone: 'ok', text: 'Placement assigned! Continue to final review below.' }
        : { tone: 'wait', text: 'Still waiting for your coordinator · checked just now' });
    } catch {
      setCheckNote({ tone: 'error', text: "Couldn't check right now. Check your connection and try again." });
    } finally {
      setChecking(false);
    }
  };

  // Live updates: when the coordinator assigns or reviews a placement, refresh in place.
  const firstSnapshot = useRef({ user: true, proposals: true });
  useEffect(() => {
    if (!uid) return undefined;
    firstSnapshot.current = { user: true, proposals: true };
    const refresh = key => () => {
      if (firstSnapshot.current[key]) { firstSnapshot.current[key] = false; return; }
      loadCompanyData({ quiet: true }).then(status => {
        if (status === 'approved') setCheckNote({ tone: 'ok', text: 'Placement assigned! Continue to final review below.' });
      }).catch(() => {});
    };
    const stopUser = onSnapshot(doc(db, 'users', uid), refresh('user'), () => {});
    const stopProposals = onSnapshot(query(collection(db, 'companyProposals'), where('studentId', '==', uid)), refresh('proposals'), () => {});
    return () => { stopUser(); stopProposals(); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!showEditor || saving) return;
    if (cleared || loadFailed || loading) return;
    if (status === 'pending_review' && !validateSubmission()) return;
    if (proposalStatus === 'approved') return;

    setSaving(true);
    try {
      const payload = {
        ...Object.fromEntries(Object.keys(EMPTY_FORM).map(key => [key, form[key] ?? EMPTY_FORM[key]])),
        status,
        ...(proposalId ? { proposalId } : {}),
      };
      const saved = await postBackend('/student/placement-requests', payload);
      setProposalId(saved.id);
      setProposalStatus(status);
      if (status === 'pending_review') setRequestOpen(false);
      if (status === 'draft') Alert.alert('Draft saved', 'You can edit it later.');
      if (status === 'pending_review') Alert.alert('Submitted', 'Your coordinator will review your suggested placement.', [
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

  const canRequest = !readOnlyStep && !cleared && !loadFailed
    && ['not_started', 'draft', 'needs_revision', 'rejected'].includes(proposalStatus);
  const showEditor = canRequest && requestOpen;
  const placementApproved = proposalStatus === 'approved';
  const placementNeedsAttention = ['needs_revision', 'rejected'].includes(proposalStatus);
  const placementUnderReview = proposalStatus === 'pending_review';
  const placementStatusMessage = {
    not_started: 'Your coordinator has not assigned a company yet.',
    draft: 'Your request draft has not been sent.',
    pending_review: 'Your coordinator is reviewing your request.',
    approved: 'Your company placement is approved.',
    needs_revision: 'Your coordinator asked you to update your request.',
    rejected: 'Your request was declined. You can wait for an assignment or suggest another placement.',
  }[proposalStatus] || 'Your placement status will appear here.';

  if (loggingOut) {
    return <StudentLogoutScreen />;
  }

  if (loading) {
    return <StudentScreenSkeleton variant="placement" />;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      {dedicatedChange ? <View style={[styles.changeHeader, { paddingTop: insets.top + 12, paddingLeft: Math.max(18, insets.left), paddingRight: Math.max(18, insets.right) }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to profile" onPress={() => navigation.goBack()} style={styles.changeBack}><ChevronLeftIcon size={22} color={COLORS.primary} /></TouchableOpacity>
        <Text style={styles.changeHeaderTitle}>Placement change</Text>
        <View style={styles.changeHeaderSpacer} />
      </View> : <PreDeploymentTopBar
        onMenuPress={() => setShowMenuDrawer(true)}
        onNotificationsPress={() => setShowNotifications(true)}
      />}

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: isNarrow ? 14 : 20 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.pageHeading, styles.changeHero, !dedicatedChange && styles.companyIntro]}>
          <StudentSurface tone="welcome" waves />
          {!dedicatedChange && <Image source={require('../assets/pathway-guide-writing.png')} style={styles.companyGuide} resizeMode="contain" accessible={false} />}
          <Text style={styles.subheading}>{dedicatedChange ? 'YOUR NEXT PLACEMENT' : 'PRE-DEPLOYMENT · STEP 2'}</Text>
          <Text style={[styles.heading, styles.changeTitle]}>{dedicatedChange ? 'Request a placement change' : 'Company placement'}</Text>
          <Text style={styles.pageDescription}>{dedicatedChange ? 'Propose updated company and supervisor details for coordinator review. Your official placement changes only after approval.' : 'Wait for your coordinator to assign a company, or suggest a placement for review.'}</Text>
        </View>

        {!dedicatedChange && <PreDeploymentStepper
          activeStep={2}
          reachedStep={reachedStep}
          completedSteps={requirementsComplete ? [1] : []}
          onStepPress={step => {
            if (step === 1) navigation.replace('Requirements', { readOnlyStep: 1 < reachedStep, reachedStep });
            if (step === 3) navigation.replace('Review', { readOnlyStep: 3 < reachedStep, reachedStep });
            if (step === 4) navigation.replace('Approval', { readOnlyStep: 4 < reachedStep, reachedStep });
          }}
        />}
        {readOnlyStep && <Text style={{ color: '#526174', fontSize: 14, marginBottom: 16 }}>Completed step — view only. Return to your current step to continue.</Text>}

        {(!dedicatedChange || !placementApproved || loadFailed || cleared) && <View style={styles.statusCard}>
          <StudentSurface waves />
          {loadFailed && <TouchableOpacity accessibilityRole="button" onPress={loadCompanyData}><Text style={styles.secondaryButtonText}>Retry loading placement</Text></TouchableOpacity>}
          {cleared && <TouchableOpacity accessibilityRole="button" onPress={() => navigation.replace('StudentDashboard')}><Text style={styles.secondaryButtonText}>OJT cleared — records are read-only. Back to dashboard</Text></TouchableOpacity>}
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
        </View>}

        {proposalStatus === 'pending_review' && (
          <View style={styles.pendingCard}>
            <View style={styles.pendingIcon}><FileIcon size={18} color={COLORS.warningDark} /></View>
            <View style={styles.pendingCopy}>
              <Text style={styles.sectionTitle}>What happens next</Text>
              <Text style={styles.pendingText}>Wait for your coordinator to approve or decline your request{form.companyName ? ' for ' + form.companyName : ''}.</Text>
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{placementApproved ? 'Assigned company' : 'Waiting for your coordinator'}</Text>
          <Text style={styles.sectionDescription}>You can continue to Final Review once your coordinator confirms your placement.</Text>
          {!placementApproved && <TouchableOpacity accessibilityRole="button" accessibilityState={{ busy: checking }} disabled={checking}
            style={[styles.secondaryButton, styles.checkButton]} onPress={checkPlacementStatus}>
            {checking && <ActivityIndicator size="small" color={COLORS.primary} />}
            <Text style={styles.secondaryButtonText}>{checking ? 'Checking…' : 'Check placement status'}</Text>
          </TouchableOpacity>}
          {checkNote && <Text accessibilityLiveRegion="polite" style={[styles.checkNote, checkNote.tone === 'ok' ? styles.checkNoteOk : checkNote.tone === 'error' ? styles.checkNoteError : null]}>{checkNote.text}</Text>}
          {placementApproved && <>
            <Text style={styles.cardTitle}>{form.companyName || 'Company details pending'}</Text>
            <Text style={styles.cardSubtitle}>{form.companyAddress || 'Address not provided'}</Text>
            <Text style={styles.cardSubtitle}>Supervisor: {form.supervisorName || 'Not provided'}</Text>
            <Text style={styles.cardSubtitle}>Schedule: {form.startDate || 'Not provided'} to {form.endDate || 'Not provided'}</Text>
          </>}
        </View>

        {canRequest && <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: requestOpen }}
          style={styles.secondaryButton} onPress={() => setRequestOpen(open => !open)}>
          <Text style={styles.secondaryButtonText}>{requestOpen ? 'Hide placement request' : 'Suggest a placement (optional)'}</Text>
        </TouchableOpacity>}

        {showEditor && (
          <>
            <View style={styles.card}>
              <View style={styles.cardSectionHeading}>
                <View style={styles.sectionIcon}><SearchIcon size={18} color={COLORS.primary} /></View>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>Suggest a company</Text>
                  <Text style={styles.sectionDescription}>Choose a listed company or enter your own suggestion.</Text>
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
              {search.trim() !== '' && filteredCompanies.length === 0 && <Text style={styles.emptyText}>No companies found. Enter company details below.</Text>}
            </View>

            <View style={styles.card}>
              <View style={styles.cardSectionHeading}>
                <View style={styles.sectionIcon}><BuildingIcon size={18} color={COLORS.primary} /></View>
                <View style={styles.flex}>
                  <Text style={styles.sectionTitle}>{form.companyId ? 'Selected company' : 'Company details'}</Text>
                  <Text style={styles.sectionDescription}>{form.companyId ? 'Check the company details and complete the form.' : 'Complete the form for coordinator review.'}</Text>
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
              <WorkArrangementField value={form.workArrangement} onChange={value => updateField('workArrangement', value)} editable={showEditor && !saving} />
              <Field label="Additional notes" value={form.notes} onChangeText={value => updateField('notes', value)} editable={showEditor} multiline />
              <View style={[styles.actionRow, isNarrow && styles.actionColumn]}>
                <TouchableOpacity accessibilityRole="button" style={[styles.secondaryButton, isNarrow && styles.stackedButton]} onPress={() => saveProposal('draft')} disabled={saving}><Text style={styles.secondaryButtonText}>{saving ? 'Saving...' : 'Save draft'}</Text></TouchableOpacity>
                <MotionTouchableOpacity accessibilityRole="button" style={[styles.primaryButton, isNarrow && styles.stackedButton]} onPress={() => saveProposal('pending_review')} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Submitting...' : 'Send request'}</Text></MotionTouchableOpacity>
              </View>
            </View>
          </>
        )}

        {proposalStatus === 'approved' && (
          <View style={[styles.approvedCard, dedicatedChange && styles.changeSummary]}>
            {!dedicatedChange && <StudentSurface tone="mint" waves />}
            <View style={styles.approvedHeadingRow}>
              <View style={styles.approvedIcon}><CheckCircleIcon size={22} color={COLORS.successDark} /></View>
              <View style={styles.flex}>
                <Text style={styles.approvedTitle}>{dedicatedChange ? 'Current placement' : 'Placement approved'}</Text>
                <Text style={styles.approvedText}>{dedicatedChange ? 'Start a change request below. Your coordinator will review the proposed details.' : 'Continue to Step 3: Final review.'}</Text>
              </View>
            </View>
            {dedicatedChange && <>
              <View style={styles.changeDetail}><Text style={styles.changeLabel}>Company</Text><Text style={styles.changeValue}>{form.companyName || 'Not available'}</Text></View>
              <View style={styles.changeDetail}><Text style={styles.changeLabel}>Supervisor</Text><Text style={styles.changeValue}>{form.supervisorName || 'Not available'}</Text></View>
              <View style={styles.changeNotice}><Text style={styles.pageDescription}>Your current placement stays in place while your coordinator reviews the request.</Text></View>
            </>}
            {!dedicatedChange && <TouchableOpacity
              style={styles.reviewStepBtn}
              onPress={() => navigation.navigate('Review', readOnlyStep ? { readOnlyStep: 3 < reachedStep, reachedStep } : { readOnlyStep: false })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue to final review"
            >
              <Text style={styles.reviewStepBtnText}>Continue to final review</Text>
              <ArrowRightIcon size={17} color={COLORS.textOnPrimary} />
            </TouchableOpacity>}
          </View>
        )}
      </ScrollView>

      <PreDeploymentNotificationsSheet visible={showNotifications} onClose={() => setShowNotifications(false)} />

      <PreDeploymentDrawer
        reachedStep={reachedStep}
        visible={showMenuDrawer}
        activeRoute="Company"
        onClose={() => setShowMenuDrawer(false)}
        onNavigate={(route, params) => navigation.replace(route, params)}
        onSignOut={handleLogout}
      />
    </KeyboardAvoidingView>
  );
}

function WorkArrangementField({ value, onChange, editable }) {
  const [open, setOpen] = useState(false);
  const options = [
    ['On-site', 'Work at the company location'],
    ['Remote', 'Work from home or another approved location'],
    ['Hybrid', 'A mix of on-site and remote work'],
  ];
  useEffect(() => { if (!editable) setOpen(false); }, [editable]);
  return <View style={styles.fieldWrap}>
    <Text style={styles.label}>Work arrangement</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Work arrangement: ${value || 'Select work arrangement'}`}
      accessibilityState={{ expanded: open, disabled: !editable }} disabled={!editable}
      onPress={() => setOpen(previous => !previous)}
      style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }]}>
      <Text style={{ flex: 1, color: value ? COLORS.textPrimary : '#64748B' }}>{value || 'Select work arrangement'}</Text>
      <ChevronIcon size={18} color={COLORS.textSecondary} expanded={open} />
    </TouchableOpacity>
    <Text style={styles.sectionDescription}>Choose how you will work. Enter the physical location in Company address.</Text>
    {open && editable && <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, marginTop: 6, backgroundColor: '#FFF' }}>
      {options.map(([option, description]) => <TouchableOpacity key={option} accessibilityRole="button"
        accessibilityState={{ selected: value === option }} onPress={() => { onChange(option); setOpen(false); }}
        style={{ padding: 12, backgroundColor: value === option ? COLORS.primarySubtle : 'transparent' }}>
        <Text style={{ color: COLORS.textPrimary, fontWeight: '600' }}>{option}</Text>
        <Text style={styles.sectionDescription}>{description}</Text>
      </TouchableOpacity>)}
    </View>}
  </View>;
}

function Field({ label, value, onChangeText, editable, half, multiline, placeholder }) {
  return <View style={[styles.fieldWrap, half && styles.halfField]}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} editable={editable} placeholder={placeholder || label} placeholderTextColor="#94A3B8" multiline={multiline} /></View>;
}

const styles = StyleSheet.create({
  companyIntro: { minHeight: 160, paddingRight: 130, justifyContent: 'center' },
  companyGuide: { position: 'absolute', right: -6, bottom: -10, width: 142, height: 148 },
  changeHero: { position: 'relative', overflow: 'hidden', borderRadius: 22, padding: 20, marginBottom: 18 },
  changeTitle: { fontSize: 24, lineHeight: 30, fontWeight: '600' },
  changeSummary: { backgroundColor: '#FFFFFF', borderColor: '#E3ECF8', borderRadius: 22, padding: 20, gap: 16 },
  changeDetail: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, borderBottomWidth: 1, borderBottomColor: '#EDF2F8', paddingBottom: 14 },
  changeLabel: { fontSize: 12, color: COLORS.textMuted, width: 75 },
  changeValue: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: COLORS.textPrimary },
  changeNotice: { backgroundColor: '#F0F6FF', padding: 12, borderRadius: 12 },
  changePrimary: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, minHeight: 50 },
  changeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 0, paddingBottom: 12, backgroundColor: '#FFFFFF' },
  changeBack: { width: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF3FF', borderRadius: 12 },
  changeHeaderTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 22, textAlign: 'center', fontWeight: '600', color: COLORS.textPrimary },
  changeHeaderSpacer: { width: 44, flexShrink: 0 },
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
  statusCard: { position: 'relative', overflow: 'hidden', backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderLight, padding: 15, marginBottom: 12, ...SHADOWS.soft },
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
  checkButton: { flex: 0, flexDirection: 'row', gap: 8, marginTop: 12 },
  checkNote: { marginTop: 10, fontSize: 12, lineHeight: 17, color: COLORS.textMuted, textAlign: 'center' },
  checkNoteOk: { color: COLORS.success || '#15803d', fontWeight: '700' },
  checkNoteError: { color: COLORS.danger || '#b91c1c' },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 12, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: 10, paddingLeft: 8, fontSize: 13, color: COLORS.textPrimary, minWidth: 0 },
  approvedCard: { position: 'relative', overflow: 'hidden', backgroundColor: COLORS.successSubtle, borderRadius: 20, borderWidth: 1, borderColor: '#A7F3D0', padding: 16, gap: 12, ...SHADOWS.soft },
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
