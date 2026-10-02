import React, { useEffect, useMemo, useState } from 'react';
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
  useWindowDimensions,
} from 'react-native';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { postBackend } from '../services/backendApi';
import { signOut } from 'firebase/auth';
import { COLORS, SHADOWS, RADIUS } from '../theme';
import { AppText as Text, AppTextInput as TextInput } from '../components/AppText';
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
  pending_review: 'Pending coordinator review',
  approved: 'Approved',
  needs_revision: 'Needs revision',
  rejected: 'Rejected — edit and resubmit',
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
  const [showNotifications, setShowNotifications] = useState(false);
  const [placementChangeMode, setPlacementChangeMode] = useState(false);

  const uid = auth?.currentUser?.uid;

  useEffect(() => {
    loadCompanyData();
  }, []);

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
      if (status === 'pending_review') Alert.alert('Submitted for review', 'Your coordinator will review this company placement.');
    } catch (error) {
      console.error('Company proposal save error:', error);
      Alert.alert('Unable to save placement', error.message || 'Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

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

  if (loading) {
    return <StudentScreenSkeleton variant="placement" />;
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      <View style={[styles.topBar, isNarrow && styles.topBarNarrow]}>
        <PathwayWatermark size={152} opacity={0.045} style={{ right: -47, top: -56 }} />
        <TouchableOpacity style={styles.iconButton} onPress={() => setShowMenuDrawer(true)} accessibilityLabel="Open menu">
          <MenuIcon size={20} color={COLORS.primaryDark} />
        </TouchableOpacity>
        <PathwayMark size={42} />
        <TouchableOpacity style={styles.iconButton} onPress={() => setShowNotifications(true)} accessibilityLabel="Open notifications">
          <BellIcon size={21} color={COLORS.primaryDark} hasUnread={false} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: isNarrow ? 14 : 20 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.subheading}>Pre-deployment Pipeline</Text>
        <Text variant="heading" style={styles.heading}>Company Placement</Text>

        <View style={styles.stepper}>
          <View style={styles.stepTrackLine} />
          {requirementsComplete && <View style={styles.stepTrackProgress} />}
          {['Doc Submission', 'Company', 'Review', 'Approval'].map((label, index) => (
            <TouchableOpacity key={label} style={styles.stepItem} activeOpacity={0.75} onPress={() => {
              if (index === 0) navigation.replace('Requirements');
              if (index === 2) navigation.replace('Review');
              if (index === 3) navigation.replace('Approval');
            }} accessibilityRole="button" accessibilityLabel={`Open ${label} step`}>
              <View style={[styles.stepCircle, index === 1 ? styles.stepActive : styles.stepInactive, index === 0 && requirementsComplete && styles.stepComplete]}><Text style={[styles.stepNumber, index === 1 && styles.stepNumberActive, index === 0 && requirementsComplete && styles.stepNumberComplete]}>{index + 1}</Text></View>
              <Text style={[styles.stepLabel, index === 1 && styles.stepLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusHeadingRow}>
            <View style={styles.statusIcon}><FileIcon size={20} color={COLORS.primary} /></View>
            <View style={styles.flex}><Text style={styles.cardTitle}>Placement status</Text><Text style={styles.cardSubtitle}>{statusLabel[proposalStatus] || 'Not started'}</Text></View>
            {proposalStatus === 'approved' && <CheckCircleIcon size={22} color={COLORS.successDark} />}
            {proposalStatus === 'needs_revision' && <AlertCircleIcon size={22} color={COLORS.danger} />}
          </View>
          {!!reviewReason && <Text style={styles.reviewReason}>Coordinator note: {reviewReason}</Text>}
        </View>

        {proposalStatus === 'pending_review' && <View style={styles.pendingCard}><Text style={styles.sectionTitle}>Waiting for coordinator review</Text><Text style={styles.helpText}>Your placement request has been submitted. You cannot submit it again until your coordinator responds.</Text></View>}

        {showEditor && (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Choose an existing company</Text>
              <Text style={styles.helpText}>Search the active company directory or propose a new company below.</Text>
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
              {search.trim() !== '' && filteredCompanies.map(company => (
                <TouchableOpacity key={company.id} style={styles.companyResult} onPress={() => selectCompany(company)} activeOpacity={0.8}>
                  <View style={styles.companyResultIcon}><BuildingIcon size={18} color={COLORS.secondary} /></View>
                  <View style={styles.flex}><Text style={styles.companyResultName}>{company.name}</Text><Text style={styles.companyResultMeta}>{company.industry || 'Industry not listed'} · {company.address || 'Address not listed'}</Text><Text style={styles.companyResultSlots}>{company.availableSlots ?? '—'} internship slots</Text></View>
                </TouchableOpacity>
              ))}
              {search.trim() !== '' && filteredCompanies.length === 0 && <Text style={styles.emptyText}>No active company found. You can propose a new company below.</Text>}
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{form.companyId ? 'Selected company details' : 'Propose a new company'}</Text>
              <Text style={styles.helpText}>Complete the placement details for coordinator review.</Text>
              <Field label="Company name" value={form.companyName} onChangeText={value => updateField('companyName', value)} editable={showEditor} />
              <Field label="Company address" value={form.companyAddress} onChangeText={value => updateField('companyAddress', value)} editable={showEditor} />
              <Field label="Industry or type" value={form.companyIndustry} onChangeText={value => updateField('companyIndustry', value)} editable={showEditor} />
              <View style={styles.row}><Field label="Company email" value={form.companyEmail} onChangeText={value => updateField('companyEmail', value)} editable={showEditor} half /><Field label="Company phone" value={form.companyPhone} onChangeText={value => updateField('companyPhone', value)} editable={showEditor} half /></View>
              <Text style={styles.formGroupTitle}>Supervisor</Text>
              <Field label="Supervisor name" value={form.supervisorName} onChangeText={value => updateField('supervisorName', value)} editable={showEditor} />
              <Field label="Position" value={form.supervisorPosition} onChangeText={value => updateField('supervisorPosition', value)} editable={showEditor} />
              <View style={styles.row}><Field label="Supervisor email" value={form.supervisorEmail} onChangeText={value => updateField('supervisorEmail', value)} editable={showEditor} half /><Field label="Supervisor phone" value={form.supervisorPhone} onChangeText={value => updateField('supervisorPhone', value)} editable={showEditor} half /></View>
              <Text style={styles.formGroupTitle}>Internship details</Text>
              <Field label="Internship role or department" value={form.internshipRole} onChangeText={value => updateField('internshipRole', value)} editable={showEditor} />
              <View style={styles.row}><Field label="Start date" value={form.startDate} onChangeText={value => updateField('startDate', value)} editable={showEditor} half placeholder="YYYY-MM-DD" /><Field label="End date" value={form.endDate} onChangeText={value => updateField('endDate', value)} editable={showEditor} half placeholder="YYYY-MM-DD" /></View>
              <Field label="Work arrangement or location" value={form.workArrangement} onChangeText={value => updateField('workArrangement', value)} editable={showEditor} />
              <Field label="Additional notes" value={form.notes} onChangeText={value => updateField('notes', value)} editable={showEditor} multiline />
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => saveProposal('draft')} disabled={saving}><Text style={styles.secondaryButtonText}>{saving ? 'Saving...' : 'Save draft'}</Text></TouchableOpacity>
                <MotionTouchableOpacity style={styles.primaryButton} onPress={() => saveProposal('pending_review')} disabled={saving}><Text style={styles.primaryButtonText}>{saving ? 'Submitting...' : 'Submit for review'}</Text></MotionTouchableOpacity>
              </View>
            </View>
          </>
        )}

        {proposalStatus === 'approved' && (
          <View style={styles.approvedCard}>
            <CheckCircleIcon size={24} color={COLORS.successDark} />
            <View style={{ flex: 1 }}>
              <Text style={styles.approvedTitle}>Placement Approved</Text>
              <Text style={styles.approvedText}>Your company placement is approved. You can now proceed to Step 3 (Final Review).</Text>
            </View>
            <TouchableOpacity
              style={styles.reviewStepBtn}
              onPress={() => navigation.navigate('Review')}
              activeOpacity={0.85}
            >
              <Text style={styles.reviewStepBtnText}>Review Step →</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={startPlacementChange} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>Request placement change</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={showNotifications} transparent animationType="slide" onRequestClose={() => setShowNotifications(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowNotifications(false)}>
          <View style={styles.modalCard}><Text style={styles.modalTitle}>Notifications</Text><Text style={styles.cardSubtitle}>Placement updates from your coordinator will appear here.</Text></View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showMenuDrawer} transparent animationType="fade" onRequestClose={() => setShowMenuDrawer(false)}>
        <View style={styles.drawerOverlay}>
          <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setShowMenuDrawer(false)} activeOpacity={1} />
          <View style={styles.drawerCard}><Text style={styles.drawerTitle}>PATHWAY</Text><Text style={styles.drawerSubtitle}>OJT Management System</Text><TouchableOpacity style={styles.logoutButton} onPress={handleLogout}><Text style={styles.logoutText}>Log out</Text></TouchableOpacity></View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, value, onChangeText, editable, half, multiline, placeholder }) {
  return <View style={[styles.fieldWrap, half && styles.halfField]}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} editable={editable} placeholder={placeholder || label} placeholderTextColor="#94A3B8" multiline={multiline} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  gateTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginTop: 12 },
  gateText: { color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 8, marginHorizontal: 28, marginBottom: 18 },
  loadingText: { marginTop: 12, color: COLORS.textSecondary },
  topBar: { height: Platform.OS === 'ios' ? 94 : 64, paddingTop: Platform.OS === 'ios' ? 44 : 12, paddingHorizontal: 20, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', ...SHADOWS.soft },
  topBarNarrow: { paddingHorizontal: 14 },
  iconButton: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' },
  brandTitle: { color: COLORS.primary, fontSize: 18, fontWeight: '800', letterSpacing: 2.5 },
  content: { paddingTop: 20, paddingBottom: 70, width: '100%', maxWidth: 680, alignSelf: 'center' },
  subheading: { color: COLORS.secondary, fontSize: 13, fontWeight: '700', marginBottom: 4 },
  heading: { color: COLORS.textPrimary, fontSize: 24, fontWeight: '800', marginBottom: 20 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, position: 'relative' },
  stepTrackLine: { position: 'absolute', left: '12%', right: '12%', top: 16, height: 2, borderRadius: 2, backgroundColor: '#E2E8F0' },
  stepTrackProgress: { position: 'absolute', left: '12%', width: '29%', top: 16, height: 2, borderRadius: 2, backgroundColor: COLORS.primary },
  stepComplete: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  stepNumberComplete: { color: COLORS.primary },
  stepItem: { alignItems: 'center', width: '24%' },
  stepCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  stepActive: { borderWidth: 2, borderColor: COLORS.primary, backgroundColor: '#FFF' },
  stepInactive: { borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  stepNumber: { color: '#94A3B8', fontWeight: '700' },
  stepNumberActive: { color: COLORS.primary },
  stepLabel: { color: '#94A3B8', fontSize: 10, textAlign: 'center' },
  stepLabelActive: { color: COLORS.primary, fontWeight: '700' },
  statusCard: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 14, ...SHADOWS.card },
  pendingCard: { backgroundColor: '#FFF7ED', borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA', padding: 16, marginBottom: 14 },
  statusHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  cardTitle: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '800' },
  cardSubtitle: { color: COLORS.textSecondary, fontSize: 13, marginTop: 3 },
  reviewReason: { color: COLORS.danger, backgroundColor: '#FEF2F2', padding: 10, borderRadius: 8, marginTop: 12, fontSize: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 14, ...SHADOWS.card },
  sectionTitle: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' },
  helpText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.textPrimary, backgroundColor: '#FFF', fontSize: 13 },
  fieldWrap: { marginBottom: 10 },
  halfField: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  label: { color: COLORS.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  formGroupTitle: { color: COLORS.primary, fontSize: 13, fontWeight: '800', marginTop: 8, marginBottom: 10 },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  companyResult: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#BAE6FD', borderRadius: 10, padding: 10, marginTop: 8, backgroundColor: '#F0F9FF', gap: 10 },
  companyResultIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  companyResultName: { color: COLORS.textPrimary, fontWeight: '800', fontSize: 13 },
  companyResultMeta: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  companyResultSlots: { color: COLORS.secondary, fontSize: 11, marginTop: 3, fontWeight: '700' },
  emptyText: { color: COLORS.textMuted, fontSize: 12, paddingVertical: 12 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  primaryButton: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  primaryButtonText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: COLORS.primary, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '800', fontSize: 12 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: RADIUS.md, paddingHorizontal: 12, marginBottom: 4 },
  searchInput: { flex: 1, paddingVertical: 10, paddingLeft: 8, fontSize: 13, color: COLORS.textPrimary },
  approvedCard: { flexDirection: 'row', gap: 12, backgroundColor: '#ECFDF5', borderRadius: 14, borderWidth: 1, borderColor: '#A7F3D0', padding: 16, alignItems: 'center', ...SHADOWS.soft },
  approvedTitle: { fontSize: 15, fontWeight: '800', color: COLORS.successDark, marginBottom: 2 },
  approvedText: { color: COLORS.successDark, fontSize: 12.5, lineHeight: 18, fontWeight: '500' },
  reviewStepBtn: { backgroundColor: COLORS.successDark, paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.sm },
  reviewStepBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFF', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 22, minHeight: 160 },
  modalTitle: { color: COLORS.textPrimary, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  drawerOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(15,23,42,.45)' },
  drawerBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  drawerCard: { width: '78%', maxWidth: 360, height: '100%', backgroundColor: '#FFF', padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 30 },
  drawerTitle: { color: COLORS.textPrimary, fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  drawerSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 3, marginBottom: 28 },
  logoutButton: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 'auto' },
  logoutText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
