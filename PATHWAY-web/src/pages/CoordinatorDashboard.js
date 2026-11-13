import personName from '../personName';
import { readMatchingPortalPage, readPortalPage } from '../portalRecordPages';
import { PortalEmpty, PortalFormDialog } from '../components/PortalStates';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/CoordinatorDashboard.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSidebarPrefs, SidebarIndicator, GroupTitle, SidebarTools } from '../sidebarV2';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import SectionsTab from './SectionsTab';
import JournalFrequencySettings from '../components/JournalFrequencySettings';
import LogbookTab from './LogbookTab';
import RegistrationsTab from './RegistrationsTab';
import ClassListTab from './ClassListTab';
import AnalyticsTab from './AnalyticsTab';
import NotificationsTab from './NotificationsTab';
import EvaluationTab from './EvaluationTab';
import ClearanceTab from './ClearanceTab';
import CoordinatorOverview, { OverviewSkeleton } from './CoordinatorOverview';
import CompanyPlacementsTab from './CompanyPlacementsTab';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import MessagesTab from './MessagesTab';
import SubmissionNotifications, { receivedRequirements } from '../components/SubmissionNotifications';
import { collection, getDocs, getDocsFromServer, doc, updateDoc, query, where, getDoc, orderBy, getCountFromServer, onSnapshot } from 'firebase/firestore';
import { adminDownload, adminRequest } from '../adminApi';
import PathwayLogo from '../components/PathwayLogo';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { COORDINATOR_PAGE_TITLES, setPageMetadata } from '../pageMetadata';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import { EvaluationSkeleton, LogbookSkeleton } from '../components/PageSkeletons';
import AlertDialog from '../components/AlertDialog';
import { PortalError } from '../components/PortalStates';
import DocumentPreviewDialog from '../components/DocumentPreviewDialog';
import RequirementCheckResult from '../components/RequirementCheckResult';
import ServerWakeNotice from '../components/ServerWakeNotice';
import '../components/RequirementAutoCheckDialog.css';
import { requirementProgress } from '../requirementProgress';
import { REQUIREMENT_CATEGORIES, requirementCategory } from '../requirementCategory';
import { downloadSectionExcel } from '../sectionExport';
import './RequirementsWorkspace.css';
import './CoordinatorProfile.css';
import './CoordinatorGlass.css';
import './PortalPolish.css';
import '../sidebarV2.css';

const PRE_OJT_IDS = ['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa'];

const STATUS_COLOR = {
  not_submitted: COLORS.rose100,
  submitted: COLORS.yellow100,
  approved: COLORS.emerald100,
  rejected: COLORS.rose100,
};

// Coordinator-facing labels: every requirement is Complete, Pending or Deficient.
const SIMPLE_STATUS = {
  approved: { label: 'Complete', tone: 'complete' },
  submitted: { label: 'Pending', tone: 'pending' },
  rejected: { label: 'Deficient', tone: 'deficient' },
  not_submitted: { label: 'Not submitted', tone: 'none' },
};
const AI_TONE_TEXT = { green: 'Green', yellow: 'Yellow', red: 'Red' };
function aiTone(review) {
  if (!review || ['queued', 'checking'].includes(review.status)) return null;
  if (['consent_required', 'ai_unavailable', 'policy_missing', 'unsupported_file', 'assignment_changed'].includes(review.reason)) return null;
  if (review.tier === 'red') return 'red';
  if (review.status === 'checks_passed' && review.tier !== 'yellow') return 'green';
  return 'yellow';
}
const STATUS_TEXT = {
  not_submitted: 'Not Submitted',
  submitted: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Rejected',
};

const COORDINATOR_TABS = ['overview', 'requirements', 'sections', 'logbook', 'companies', 'placements', 'messages', 'classlist', 'registrations', 'analytics', 'notifications', 'evaluations', 'clearance', 'profile'];
const SECTION_STORAGE_KEY = 'pathway.coordinator.sectionId';

const REVIEW_FILTERS = [['all', 'All students'], ['review', 'Pending'], ['revision', 'Deficient'], ['complete', 'Complete']];

export default function CoordinatorDashboard() {
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewPaging, setReviewPaging] = useState(null);
  const [reviewResult, setReviewResult] = useState(null);
  const [reviewTotal, setReviewTotal] = useState(null);
  const [reviewRetry, setReviewRetry] = useState(0);
  const { page } = useParams();
  const location = useLocation();
  const overviewView = selectedSection && location.state?.sectionId === selectedSection.id ? location.state.view : undefined;
  const [loadedSectionId, setLoadedSectionId] = useState(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const activeTab = COORDINATOR_TABS.includes(page) ? page : 'overview';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const setActiveTab = tab => { setNavigationOpen(false); navigate('/coordinator/' + tab); };
  const coordinatorId = auth.currentUser ? auth.currentUser.uid : '';
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [rejectionModal, setRejectionModal] = useState(null); // { studentId, reqId }
  const [downloadingRequirement, setDownloadingRequirement] = useState('');
  const [documentPreview, setDocumentPreview] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [sectionRequirements, setSectionRequirements] = useState([]);
  const [coordDept, setCoordDept] = useState('');
  const [coordinatorProfile, setCoordinatorProfile] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  useEffect(() => {
    if (activeTab === 'requirements' && overviewView === 'requirements') {
      setReviewFilter('review');
      setSearchQuery('');
    }
  }, [activeTab, overviewView, location.key]);
  const [exporting, setExporting] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState(null);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterBusy, setRosterBusy] = useState(false);
  const attendanceNavigation = useRef(0);
  const sidebarPrefs = useSidebarPrefs('coordinator');
  const navRef = useRef(null);
  const sectionLoad = useRef(0);
  const requirementsActive = activeTab === 'requirements';
  const needsSectionRoster = ['overview', 'requirements', 'profile'].includes(activeTab);
  useEffect(() => () => { attendanceNavigation.current++; }, [activeTab, coordinatorId]);

  const openAttendanceRisk = async ({ sectionId, studentId }) => {
    const actor = auth.currentUser, request = ++attendanceNavigation.current;
    if (actor?.uid !== coordinatorId) return;
    try {
      const snapshot = await getDocsFromServer(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      if (auth.currentUser !== actor || request !== attendanceNavigation.current) return;
      const assigned = snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
      setSections(assigned);
      const section = assigned.find(item => item.id === sectionId);
      if (!section) { setError('This section is no longer in your assigned sections. Refresh your workspace.'); return; }
      fetchStudents(section);
      setAttendanceTarget({ sectionId, studentId });
      setActiveTab('analytics');
    } catch {
      if (auth.currentUser === actor && request === attendanceNavigation.current) setError('Could not refresh your assigned sections. Try opening the attendance notice again.');
    }
  };

  const exportSection = async () => {
    if (!selectedSection || exporting) return;
    const section = selectedSection;
    setExporting(true);
    setError('');
    try {
      const [studentSnap, reqSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', section.department), where('sectionId', '==', section.id))),
        getDocs(collection(db, 'sections', section.id, 'requirements')),
      ]);
      if (studentSnap.metadata.fromCache || reqSnap.metadata.fromCache) throw new Error('Connect to the internet before exporting current section records.');
      await downloadSectionExcel(section, studentSnap.docs.map(item => ({ ...item.data(), id: item.id })), reqSnap.docs.map(item => ({ ...item.data(), id: item.id })));
    } catch (e) {
      setError(e.message || 'Could not export this section. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const fetchInitialData = useCallback(async ({ silent = false, isCurrent = () => true } = {}) => {
    if (!coordinatorId) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const snap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      if (!isCurrent()) return;
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      const coordSnap = await getDoc(doc(db, 'users', coordinatorId));
      if (!isCurrent()) return;
      const coordinatorData = coordSnap.data() || {};
      setCoordinatorProfile({ id: coordinatorId, ...coordinatorData });
      setCoordDept(coordinatorData.department || '');
      const regSnap = await getDocs(query(collection(db, 'users'),
        where('role', '==', 'student'), where('department', '==', coordinatorData.department || ''),
        where('sectionId', '==', ''), where('accountApproved', '==', false)));
      if (!isCurrent()) return;
      setPendingRegistrations(regSnap.docs.filter(d => d.data().status !== 'rejected_registration').length);
    } catch (e) {
      if (!isCurrent()) return;
      console.error(e);
      setError('Couldn’t load the coordinator portal. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [coordinatorId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Keep the coordinator workspace useful after a refresh: once assigned
  // sections arrive, restore the last section or select the first one so
  // section-scoped pages can load their records without requiring a second click.
  useEffect(() => {
    if (!selectedSection && sections.length > 0) {
      const savedSectionId = window.localStorage.getItem(SECTION_STORAGE_KEY);
      const savedSection = sections.find(section => section.id === savedSectionId);
      fetchStudents(savedSection || sections[0]);
    }
  }, [sections, selectedSection]);

  useEffect(() => {
    setPageMetadata(activeTab, 'coordinator');
  }, [activeTab]);

  const fetchStudents = async (section, { silent = false, isCurrent = () => true } = {}) => {
    const request = ++sectionLoad.current;
    if (!silent) {
      setLoadedSectionId(null);
      setStudents([]); setSectionRequirements([]); setDocumentPreview(null);
      setSelectedSection(section); window.localStorage.setItem(SECTION_STORAGE_KEY, section.id);
      setSelectedStudent(null);
    }
    setError('');
    if (!needsSectionRoster) return;
    try {
      const [studentSnap, reqSnap] = await Promise.all([
        requirementsActive ? Promise.resolve(null) : getDocs(query(collection(db, 'users'),
          where('role', '==', 'student'),
          where('department', '==', section.department),
          where('sectionId', '==', section.id))),
        getDocs(collection(db, 'sections', section.id, 'requirements'))
      ]);
      if (request !== sectionLoad.current || !isCurrent()) return;
      if (studentSnap) {
        const nextStudents = studentSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setStudents(nextStudents);
        if (silent) setSelectedStudent(previous => previous ? nextStudents.find(item => item.id === previous.id) || null : null);
      }
      const reqs = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      reqs.sort((a, b) => {
        return REQUIREMENT_CATEGORIES.indexOf(requirementCategory(a.category))
          - REQUIREMENT_CATEGORIES.indexOf(requirementCategory(b.category));
      });
      setSectionRequirements(reqs);
      setLoadedSectionId(section.id + (requirementsActive ? ':requirements' : ':roster'));
    } catch (e) {
      console.error(e);
      if (request === sectionLoad.current) setError('We could not load this section. Please try again.');
    }
  };

  useEffect(() => {
    if (needsSectionRoster && selectedSection && loadedSectionId !== selectedSection.id + (requirementsActive ? ':requirements' : ':roster')) {
      fetchStudents(selectedSection, { silent: true });
    }
  }, [needsSectionRoster, requirementsActive]);

  usePortalAutoRefresh(async options => {
    await fetchInitialData(options);
    if (options.isCurrent() && selectedSection) await fetchStudents(selectedSection, options);
  }, { enabled: !loading && !saving && activeTab !== 'profile', scope: coordinatorId + ':' + activeTab + ':' + (selectedSection?.id || '') });

  const [bulkConfirm, setBulkConfirm] = useState(null);
  // Coordinator-only AI results, live for the selected section.
  const [aiReviews, setAiReviews] = useState({});
  useEffect(() => {
    if (!requirementsActive || !selectedSection?.id) { setAiReviews({}); return undefined; }
    let stop = () => {};
    try {
      stop = onSnapshot(query(collection(db, 'requirementReviews'), where('sectionId', '==', selectedSection.id)),
        snapshot => setAiReviews(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))),
        () => setAiReviews({}));
    } catch { setAiReviews({}); }
    return () => stop();
  }, [requirementsActive, selectedSection?.id]);
  const [docFilter, setDocFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  useEffect(() => { setDocFilter('all'); setPhaseFilter('all'); }, [selectedStudent?.id]);
  const aiReviewFor = (studentId, reqId, fallback) => aiReviews[`${studentId}__${reqId}`] || fallback;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReason, setBulkReason] = useState('The AI check found this is the wrong document, a different student, or the form was not filled in and signed. Please upload the correct, completed and signed form.');
  const tierItems = (list, tier) => (list || []).flatMap(st => Object.entries(st.requirements || {})
    .filter(([reqId, r]) => r?.status === 'submitted' && aiReviewFor(st.id, reqId, r?.autoReview)?.tier === tier).map(([reqId]) => ({ studentId: st.id, reqId })));
  const runBulk = async () => {
    if (!bulkConfirm) return;
    const { items, status } = bulkConfirm;
    setBulkBusy(true);
    try { for (const item of items) await handleRequirement(item.studentId, item.reqId, status, status === 'rejected' ? bulkReason.trim() : ''); }
    finally { setBulkBusy(false); setBulkConfirm(null); }
  };

  const handleUndoAutoApproval = async (studentId, reqId) => {
    setSaving(true); setError('');
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(reqId)}/undo-auto-approval`, { method: 'POST' });
      const undo = st => st.id !== studentId ? st : { ...st, requirements: { ...st.requirements, [reqId]: { ...st.requirements[reqId], status: 'submitted', autoApproved: false } } };
      setSelectedStudent(prev => prev ? undo(prev) : prev);
      setStudents(prev => prev.map(undo));
    } catch (e) { setError(e.message || 'Could not undo the automatic approval.'); }
    finally { setSaving(false); }
  };

  const handleRequirement = async (studentId, reqId, status, reason = '') => {
    const request = sectionLoad.current;
    setSaving(true);
    setError('');
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(reqId)}/decision`, {
        method: 'POST', body: JSON.stringify({ status, reason }),
      });

      if (request !== sectionLoad.current) return;
      const updateStudent = s => {
        if (s.id !== studentId) return s;
        const reqs = { ...s.requirements };
        reqs[reqId] = { ...reqs[reqId], status, reviewedAt: new Date().toISOString(), rejectionReason: reason };
        const allPreApproved = PRE_OJT_IDS.every(id => reqs[id]?.status === 'approved');
        return { ...s, requirements: reqs, requirementsStatus: allPreApproved ? 'approved' : s.requirementsStatus };
      };
      setReviewResult(previous => previous?.page ? {
        ...previous,
        page: { ...previous.page, records: previous.page.records.map(updateStudent) },
      } : previous);
      setSelectedStudent(previous => previous ? updateStudent(previous) : previous);
      return true;

    } catch (e) {
      console.error(e);
      const message = e.message || 'Could not save the requirement decision. Please try again.';
      setError(message);
      window.alert(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadRequirement = async (studentId, requirementId, fileName) => {
    const key = `${studentId}:${requirementId}`;
    setDownloadingRequirement(key);
    try {
      await adminDownload(
        `/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(requirementId)}/download`,
        fileName || 'endorsement-letter',
      );
    } catch (downloadError) {
      window.alert(downloadError.message || 'Could not download this protected document.');
    } finally {
      setDownloadingRequirement('');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const pendingCount = requirementsActive ? 0 : students.filter(s => s.requirementsStatus === 'pending').length;
  const needsReview = student => sectionRequirements.some(requirement => student.requirements?.[requirement.id]?.status === 'submitted');
  const needsChanges = student => sectionRequirements.some(requirement => student.requirements?.[requirement.id]?.status === 'rejected');
  const isComplete = student => requirementProgress(student.requirements, sectionRequirements).percentage === 100;
  const reviewQueue = students.filter(needsReview);
  const selectedProgress = selectedStudent ? requirementProgress(selectedStudent.requirements, sectionRequirements) : null;
  const reviewScope = (selectedSection?.id || '') + ':' + reviewFilter + ':' + reviewSearch + ':' + reviewRetry;
  const reviewCursors = reviewPaging?.scope === reviewScope ? reviewPaging.cursors : [null];
  const reviewCursor = reviewCursors.at(-1);
  const currentReview = reviewResult?.scope === reviewScope && reviewResult.cursor === reviewCursor ? reviewResult : null;
  const visibleReviewStudents = currentReview?.page?.records || [];
  const reviewReady = requirementsActive && selectedSection && loadedSectionId === selectedSection.id + ':requirements';

  useEffect(() => {
    const timer = setTimeout(() => setReviewSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!reviewReady) return;
    let active = true;
    const exactId = /^\d{5,24}$/.test(reviewSearch);
    const constraints = [
      where('role', '==', 'student'),
      where('department', '==', selectedSection.department),
      where('sectionId', '==', selectedSection.id),
    ];
    const base = query(collection(db, 'users'), ...constraints, ...(exactId
      ? [where('idNumber', '==', reviewSearch)]
      : [orderBy('firstName'), orderBy('lastName')]));
    const requiresMatching = reviewFilter !== 'all' || (reviewSearch && !exactId);
    if (!requiresMatching && !reviewCursor) {
      getCountFromServer(base).then(snapshot => {
        if (active) setReviewTotal({ scope: reviewScope, pages: Math.max(1, Math.ceil(snapshot.data().count / 25)) });
      }).catch(() => {});
    }
    const request = requiresMatching
      ? readMatchingPortalPage(base, reviewCursor, 25, student => (
        matchesCoordinatorSearch(reviewSearch, student.firstName, student.lastName, student.idNumber, selectedSection.name)
        && (reviewFilter === 'all' || (reviewFilter === 'review' ? needsReview(student) : reviewFilter === 'revision' ? needsChanges(student) : isComplete(student)))
      ))
      : readPortalPage(base, reviewCursor, 25);
    request.then(page => ({ ...page, records: [...(page.records || [])].sort((a, b) => String(a.lastName || '').localeCompare(String(b.lastName || '')) || String(a.firstName || '').localeCompare(String(b.firstName || ''))) })).then(page => {
      if (!active) return;
      setReviewResult({ scope: reviewScope, cursor: reviewCursor, page });
      if (!page.hasMore) setReviewTotal({ scope: reviewScope, pages: reviewCursors.length });
    }).catch(err => {
      console.warn('Requirement students query failed:', err);
      if (active) setReviewResult({ scope: reviewScope, cursor: reviewCursor, error: 'Could not load requirement students.' });
    });
    return () => { active = false; };
  }, [reviewReady, reviewScope, reviewCursor, sectionRequirements]);

  // Short sidebar labels; full names stay as page titles and accessible names.
  const NAV_LABELS = { overview: 'Dashboard', requirements: 'Requirements', logbook: 'Attendance & Journals', evaluations: 'Evaluations', clearance: 'Clearance', placements: 'Placements', companies: 'Companies', sections: 'Sections', registrations: 'Accounts', analytics: 'Progress', messages: 'Messages', notifications: 'Announcements' };
  const coordNavGroups = [
    { title: '', items: [{ id: 'overview', icon: 'dashboard' }] },
    { title: 'Reviews', items: [
        { id: 'requirements', icon: 'clipboard', badge: pendingCount > 0 ? pendingCount : null, isWarning: true, hint: pendingCount > 0 ? `${pendingCount} to review` : 'All reviewed' },
        { id: 'logbook', icon: 'book' },
        { id: 'evaluations', icon: 'star' },
        { id: 'clearance', icon: 'cap' },
    ] },
    { title: 'Placements', items: [
        { id: 'placements', icon: 'briefcase' },
        { id: 'companies', icon: 'building' },
    ] },
    { title: 'Students', items: [
        { id: 'sections', icon: 'users', hint: selectedSection ? `${students.length} students` : null },
        { id: 'registrations', icon: 'users', badge: pendingRegistrations > 0 ? pendingRegistrations : null, isWarning: true, hint: pendingRegistrations > 0 ? `${pendingRegistrations} to approve` : null },
        { id: 'analytics', icon: 'chart' },
        { id: 'messages', icon: 'chat' },
        { id: 'notifications', icon: 'bell' },
    ] },
  ];

  return (
    <div style={s.page} className={(activeTab === 'overview' ? 'coordinator-page coordinator-dashboard-mode' : 'coordinator-page') + sidebarPrefs.rootClass}>
      <ServerWakeNotice />
      {documentPreview && <DocumentPreviewDialog key={documentPreview.path} {...documentPreview} onClose={() => setDocumentPreview(null)} />}
      {/* Sidebar */}
      <aside className="sidebar-container" style={s.sidebar}>
        <div className="sidebar-brand" style={s.sidebarTop}>
          <button type="button" className="sidebar-home-link" onClick={() => setActiveTab('overview')} aria-label="Go to dashboard">
          <div className="sidebar-logo-box" style={s.logoWrap}>
            <PathwayLogo style={s.logoImg} />
          </div>
          <div>
            <div className="sidebar-brand-title" style={s.appName}>PATHWAY</div>
            <div className="sidebar-brand-subtitle" style={s.appSub}>Coordinator Portal</div>
          </div>
          </button>
        </div>

        {sidebarPrefs.modern && sections.length > 0 && (
          <label className="sidebar-section-card" title="Switch section">
            <span className="sidebar-section-icon" aria-hidden="true"><Icon name="section" size={16} /></span>
            <span className="sidebar-section-text"><small>{coordDept || 'Current section'}</small>
              <strong>{selectedSection?.name || 'Choose a section'}</strong></span>
            <select aria-label="Switch section" value={selectedSection?.id || ''} onChange={e => { const section = sections.find(item => item.id === e.target.value); if (section) fetchStudents(section); }}>
              {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
            <Icon name="chevronRight" size={14} className="sidebar-section-chevron" />
          </label>
        )}
        {coordDept && !sidebarPrefs.modern && (
          <div className="coordinator-department" style={s.deptPill}>
            <span style={s.deptText}>{coordDept}</span>
          </div>
        )}

        <button type="button" className="portal-navigation-toggle portal-secondary"
          aria-controls="portal-navigation" aria-expanded={navigationOpen}
          onClick={() => setNavigationOpen(open => !open)}>
          {navigationOpen ? 'Close navigation' : 'Open navigation'}
        </button>
        <nav ref={navRef} id="portal-navigation" data-mobile-open={navigationOpen} className="sidebar-nav-scroll" style={s.nav} aria-label="Coordinator navigation">
          {sidebarPrefs.modern && <SidebarIndicator navRef={navRef} activeKey={activeTab} deps={[sidebarPrefs.collapsed, sidebarPrefs.isFolded('Reviews'), sidebarPrefs.isFolded('Placements'), sidebarPrefs.isFolded('Students')]} />}
          {coordNavGroups.map(group => (
            <div key={group.title} className="sidebar-group" data-folded={sidebarPrefs.isFolded(group.title)}>
              <GroupTitle prefs={sidebarPrefs} title={group.title} />
              {group.items.filter(item => !sidebarPrefs.isFolded(group.title) || activeTab === item.id).map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={(activeTab === item.id || activeTab === 'classlist' && item.id === 'sections') ? 'sidebar-nav-btn sidebar-nav-btn-active' : 'sidebar-nav-btn'}
                  onClick={() => setActiveTab(item.id)}
                  aria-label={COORDINATOR_PAGE_TITLES[item.id]}
                  aria-current={(activeTab === item.id || activeTab === 'classlist' && item.id === 'sections') ? 'page' : undefined}
                >
                  <span className="sidebar-btn-left">
                    <Icon name={item.icon} size={16} />
                    <span className="sidebar-btn-label">
                      <span className="sidebar-btn-text" title={COORDINATOR_PAGE_TITLES[item.id]}>{NAV_LABELS[item.id] || COORDINATOR_PAGE_TITLES[item.id]}</span>
                      {sidebarPrefs.modern && item.hint && <span className="sidebar-btn-hint">{item.hint}</span>}
                    </span>
                  </span>
                  {item.badge > 0 && (
                    <span className={item.isWarning ? 'sidebar-badge sidebar-badge-warning' : 'sidebar-badge'}>
                      {item.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <SidebarTools prefs={sidebarPrefs} />
          <button
            type="button"
            className={activeTab === 'profile' ? 'sidebar-user-pill sidebar-user-pill-active' : 'sidebar-user-pill'}
            onClick={() => setActiveTab('profile')}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            title="Manage Coordinator Profile"
            aria-label="Coordinator Profile Settings"
          >
            <div className="sidebar-user-avatar">
              <Icon name="user" size={17} label="Coordinator profile" />
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{[coordinatorProfile?.firstName, coordinatorProfile?.lastName].filter(Boolean).join(' ') || auth.currentUser?.displayName || 'Coordinator'}</span>
              <span className="sidebar-user-role">Coordinator</span>
            </div>
            <Icon name="chevronRight" size={14} className="sidebar-user-chevron" />
          </button>
          <button type="button" className="sidebar-logout-btn" onClick={handleLogout}>
            <Icon name="logout" size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main style={s.main}>
        {/* Topbar */}
        <header style={s.topbar} className="topbar requirements-topbar">
          <div style={s.topbarLeft} className="topbarLeft">
            <div className="coordinator-header-title"><h1 style={s.pageTitle}>{COORDINATOR_PAGE_TITLES[activeTab]}</h1></div>
            {activeTab === 'requirements' && pendingCount > 0 && (
              <span style={s.pendingBadge}>
                {pendingCount} Pending Review
              </span>
            )}
            {!['profile', 'requirements', 'logbook', 'sections', 'evaluations', 'messages'].includes(activeTab) && (
              <label style={s.sectionPickerLabel} className="sectionPickerLabel">
                <span>Section</span>
                <select aria-label="Current section" style={s.sectionPicker} className="sectionPicker" disabled={!sections.length} value={selectedSection?.id || sections[0]?.id || ''} onChange={e => { const section = sections.find(item => item.id === e.target.value); if (section) fetchStudents(section); }}>
                  {sections.length === 0 && <option value="">No sections assigned to you</option>}
                  {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {activeTab === 'classlist' && <button type="button" className="portal-secondary" onClick={() => setActiveTab('sections')}>Back to sections</button>}
          {activeTab === 'requirements' && (
            <button
              type="button"
              className="section-export-button"
              onClick={exportSection}
              disabled={!selectedSection || loading || exporting}
              aria-busy={exporting}
              title={selectedSection ? `Download ${selectedSection.name} records as an Excel file` : 'Select a section to export'}
            >
              {exporting ? <span className="section-export-spinner" aria-hidden="true" /> : <Icon name="download" size={18} />}
              <span aria-live="polite">{exporting ? 'Exporting…' : 'Download section records (Excel)'}</span>
            </button>
          )}
        </header>

        {error && !loading && <PortalError message={error} onRetry={() => (activeTab === 'overview' || requirementsActive) && selectedSection ? fetchStudents(selectedSection) : fetchInitialData()} />}

        {loading ? (
          activeTab === 'overview' ? <OverviewSkeleton /> : activeTab === 'requirements' ? <RequirementsSkeleton /> : activeTab === 'logbook' ? <LogbookSkeleton /> : activeTab === 'evaluations' ? <EvaluationSkeleton /> : <PageSkeleton label="Loading coordinator data" variant="three-column" />
        ) : activeTab === 'profile' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <CoordinatorProfileTab
              coordinator={coordinatorProfile}
              sectionsCount={sections.length}
              studentsCount={students.length}
              onSaved={fetchInitialData}
            />
          </div>
        ) : (
          <div style={{ ...s.contentWrapper, ...(['requirements', 'logbook'].includes(activeTab) ? { flexDirection: 'column' } : {}) }}>
            {activeTab === 'overview' && (selectedSection && loadedSectionId !== selectedSection.id + ':roster'
              ? !error && <OverviewSkeleton />
              : <CoordinatorOverview key={selectedSection?.id} section={selectedSection} students={students}
                  requirementsCount={reviewQueue.length} onOpen={(tab, view, pendingStudentIds) => navigate('/coordinator/' + tab, {
                    state: { sectionId: selectedSection.id, view, ...(view === 'journals' ? { pendingStudentIds } : {}) },
                  })} />)}
            {activeTab === 'requirements' && (
              <div className="requirements-workspace" style={s.threeCol}>
                {/* Column 2: Students */}
                <div className="requirements-students" style={s.col2}>
                  <div style={s.colHeader}>
                    Students
                    <select aria-label="Current section" className="requirements-queue-section" disabled={!sections.length} value={selectedSection?.id || sections[0]?.id || ''} onChange={e => { const section = sections.find(item => item.id === e.target.value); if (section) fetchStudents(section); }}>
                      {sections.length === 0 && <option value="">No sections assigned to you</option>}
                      {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
                    </select>
                  </div>
                  <div className="requirements-search-row" style={s.columnSearch}>
                    <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search students" placeholder="Search students…" />
                    <div className="requirements-filter-icon" data-active={reviewFilter !== 'all'}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 5h18l-7 8v5l-4 2v-7z" />
                      </svg>
                      <select aria-label="Filter students by requirement status" title="Filter by status" value={reviewFilter} onChange={event => setReviewFilter(event.target.value)}>
                        {REVIEW_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </div>
                  </div>
                  {(() => {
                    const greens = tierItems(visibleReviewStudents, 'green'), reds = tierItems(visibleReviewStudents, 'red'), yellows = tierItems(visibleReviewStudents, 'yellow');
                    if (!greens.length && !reds.length && !yellows.length) return null;
                    return <div className="ai-bulk-bar" aria-label="AI check results">
                      <div className="ai-bulk-counts"><span data-tier="green" title="Green: passed the AI check">{greens.length}</span><span data-tier="yellow" title="Yellow: review these one by one">{yellows.length}</span><span data-tier="red" title="Red: failed the AI check">{reds.length}</span></div>
                      {bulkConfirm ? <div className="ai-bulk-confirm" role="group" aria-label="Confirm bulk action">
                        <p>{bulkConfirm.status === 'approved' ? `Approve ${bulkConfirm.items.length} green document${bulkConfirm.items.length === 1 ? '' : 's'}?` : `Reject ${bulkConfirm.items.length} red document${bulkConfirm.items.length === 1 ? '' : 's'}?`}</p>
                        {bulkConfirm.status === 'rejected' && <textarea aria-label="Reason sent to students" rows={3} value={bulkReason} onChange={e => setBulkReason(e.target.value)} />}
                        <div><button type="button" className="ai-bulk-cancel" disabled={bulkBusy} onClick={() => setBulkConfirm(null)}>Cancel</button>
                          <button type="button" className={bulkConfirm.status === 'approved' ? 'ai-bulk-approve' : 'ai-bulk-reject'} disabled={bulkBusy || (bulkConfirm.status === 'rejected' && !bulkReason.trim())} onClick={runBulk}>{bulkBusy ? 'Working…' : 'Confirm'}</button></div>
                      </div> : <div className="ai-bulk-actions">
                        {greens.length > 0 && <button type="button" className="ai-bulk-approve" disabled={saving} onClick={() => setBulkConfirm({ status: 'approved', items: greens })}>Approve {greens.length} green</button>}
                        {reds.length > 0 && <button type="button" className="ai-bulk-reject" disabled={saving} onClick={() => setBulkConfirm({ status: 'rejected', items: reds })}>Reject {reds.length} red</button>}
                      </div>}
                      
                    </div>;
                  })()}
                  {reviewFilter !== 'all' && <div className="requirements-filter-chip">
                    <button type="button" onClick={() => setReviewFilter('all')} aria-label="Clear status filter">
                      {REVIEW_FILTERS.find(([value]) => value === reviewFilter)?.[1]} <Icon name="x" size={13} />
                    </button>
                  </div>}
                  <div className="requirements-student-list">
                  {!selectedSection && (
                    sections.length === 0
                      ? <PortalEmpty compact icon="section" title="No sections yet" description="Create a section to see students here." />
                      : <PortalEmpty compact icon="section" title="Choose a section" description="Pick a section in the menu above." />
                  )}
                  {selectedSection && currentReview?.page && visibleReviewStudents.length === 0 && (
                    <div style={s.empty}>{currentReview?.page?.hasMore ? 'No matches in this window. Choose Next to continue.' : 'No students match this view.'}</div>
                  )}
                  {selectedSection && !currentReview && <div className="req-skel-list" role="status" aria-label="Loading students">{[0, 1, 2, 3, 4].map(key => <div key={key} className="req-skel-student"><span className="cdash-skel" style={{ width: 40, height: 40, borderRadius: '50%' }} /><div><span className="cdash-skel" style={{ width: '70%', height: 13 }} /><span className="cdash-skel" style={{ width: '45%', height: 10 }} /><span className="cdash-skel" style={{ width: 70, height: 18, borderRadius: 99 }} /></div></div>)}</div>}
                  {currentReview?.error && <div className="requirements-empty-state" role="status">
                    <span className="requirements-empty-icon" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M17 8v6M14 11h6" /></svg>
                    </span>
                    <strong>No students yet</strong>
                    <span>Students will appear here once they join {selectedSection?.name || 'this section'}.</span>
                    <button type="button" className="requirements-empty-refresh" onClick={() => setReviewRetry(value => value + 1)}>Check again</button>
                  </div>}
                  {visibleReviewStudents.map(student => {
                    const progress = requirementProgress(student.requirements, sectionRequirements);
                    return (
                    <button
                      type="button"
                      className="requirements-student-card"
                      aria-pressed={selectedStudent?.id === student.id}
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                    >
                      <div className="student-card-identity">
                        <span className="student-card-avatar" aria-hidden="true">{((student.firstName || '?')[0] + (student.lastName || '')[0]).toUpperCase()}</span>
                        <div className="student-card-name">
                          <strong>{personName(student)}</strong>
                          <span>ID {student.idNumber || 'not provided'}</span>
                          <span className="coordinator-queue-status" data-status={isComplete(student) ? 'complete' : needsChanges(student) ? 'deficient' : 'pending'}>
                            {isComplete(student) ? 'Complete' : needsChanges(student) ? 'Deficient' : 'Pending'}
                          </span>
                        </div>
                        {selectedStudent?.id === student.id && (
                          <strong className={`student-card-percentage${progress.percentage === 100 ? ' is-complete' : ''}`}>{progress.percentage}%</strong>
                        )}
                      </div>
                      {selectedStudent?.id === student.id && (
                      <div className="student-card-progress">
                        <div className="student-card-progress-caption">{progress.total ? `${progress.approved} of ${progress.total} requirements approved` : 'No requirements added for this section'}</div>
                      </div>
                      )}
                    </button>
                    );
                  })}
                  </div>
                  {(reviewCursors.length > 1 || currentReview?.page?.hasMore) && <nav className="portal-record-pagination" aria-label="Requirement students pagination">
                    <button type="button" className="portal-secondary" disabled={reviewCursors.length === 1 || saving}
                      onClick={() => setReviewPaging({ scope: reviewScope, cursors: reviewCursors.slice(0, -1) })} aria-label="Previous page"><Icon name="chevronLeft" size={16} /></button>
                    <span aria-live="polite">{reviewCursors.length}{reviewTotal?.scope === reviewScope
                      ? ` of ${Math.max(reviewCursors.length + Number(Boolean(currentReview?.page?.hasMore)), reviewTotal.pages)}`
                      : currentReview?.page?.hasMore ? ` of at least ${reviewCursors.length + 1}` : ''}</span>
                    <button type="button" className="portal-secondary" disabled={!currentReview?.page?.hasMore || saving}
                      onClick={() => setReviewPaging({ scope: reviewScope, cursors: [...reviewCursors, currentReview.page.cursor] })} aria-label="Next page"><Icon name="chevronRight" size={16} /></button>
                  </nav>}
                </div>

                {/* Column 3: Requirements */}
                <div className="requirements-detail" style={s.col3}>
                  <div style={{ ...s.colHeader, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div>{selectedStudent ? personName(selectedStudent) : 'Review student documents'}
                    <p>{selectedStudent ? `Student ID ${selectedStudent.idNumber || 'not provided'} — Review submitted requirements below.` : 'Attachments, decisions, and feedback in one place.'}</p>
                    </div>
                    <SubmissionNotifications kind="requirements" coordinatorId={coordinatorId} section={selectedSection} suppliedItems={visibleReviewStudents.flatMap(receivedRequirements)} onRefresh={() => setReviewRetry(value => value + 1)} onOpen={setSelectedStudent} />
                  </div>
                  {selectedProgress?.total > 0 && <div className="coordinator-review-progress">
                    <progress aria-label="Requirements approved" value={selectedProgress.approved} max={selectedProgress.total} />
                    <span>{selectedProgress.approved} of {selectedProgress.total} approved</span>
                  </div>}
                  {!selectedStudent ? (
                    <div style={s.requirementsScroll}>
                      {sections.length === 0 ? (
                        <PortalEmpty icon="section" title="Start by creating a section"
                          description="Student documents appear here once a section has students and requirements."
                          steps={['Create a section', 'Add requirements and deadlines', 'Students upload — you review here']}
                          action={{ label: 'Go to Sections & Students', onClick: () => setActiveTab('sections') }} />
                      ) : sectionRequirements.length === 0 ? (
                        <PortalEmpty title="No requirements yet"
                          description="Add the documents students must submit for this section."
                          action={{ label: 'Add requirements', onClick: () => setActiveTab('sections') }} />
                      ) : (
                        <PortalEmpty icon="user" title="Select a student"
                          description="Choose a student on the left to review their documents and approvals." />
                      )}
                    </div>
                  ) : (
                    <div style={s.requirementsScroll}>
                      {sectionRequirements.length === 0 && <PortalEmpty title="No requirements yet" description="Add the documents students must submit for this section." action={{ label: 'Add requirements', onClick: () => setActiveTab('sections') }} />}
                      {sectionRequirements.length > 0 && (() => {
                        const ordered = REQUIREMENT_CATEGORIES.flatMap(cat => sectionRequirements.filter(r => requirementCategory(r.category) === cat));
                        const rows = ordered.map(requirement => {
                          const req = selectedStudent.requirements?.[requirement.id];
                          const status = req?.status || 'not_submitted';
                          const review = (status === 'submitted' || req?.autoApproved || status === 'approved' || status === 'rejected') ? aiReviewFor(selectedStudent.id, requirement.id, req?.autoReview) : null;
                          return { ...requirement, req, status, review, tone: aiTone(review) };
                        });
                        const counts = { green: 0, yellow: 0, red: 0 };
                        rows.forEach(row => { if (counts[row.tone] != null) counts[row.tone] += 1; });
                        const shown = rows.filter(row => (docFilter === 'all' || row.tone === docFilter) && (phaseFilter === 'all' || requirementCategory(row.category) === phaseFilter));
                        const fmt = value => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                        return <>
                          <div className="req-table-filters" role="group" aria-label="Filter by AI check">
                            {[['all', `All (${rows.length})`], ['green', `Green (${counts.green})`], ['yellow', `Yellow (${counts.yellow})`], ['red', `Red (${counts.red})`]].map(([value, label]) =>
                              <button key={value} type="button" data-tone={value} aria-pressed={docFilter === value} onClick={() => setDocFilter(value)}>
                                {value !== 'all' && <i aria-hidden="true" />}{label}</button>)}
                            <label className="req-phase-filter">
                              <span className="req-phase-face" aria-hidden="true">{phaseFilter === 'all' ? 'All stages' : phaseFilter}<Icon name="chevronDown" size={13} /></span>
                              <select value={phaseFilter} onChange={event => setPhaseFilter(event.target.value)} aria-label="Filter by requirement stage">
                                <option value="all">All stages</option>
                                {REQUIREMENT_CATEGORIES.filter(cat => cat !== 'Other' || rows.some(row => requirementCategory(row.category) === 'Other')).map(cat => <option key={cat} value={cat}>{cat} ({rows.filter(row => requirementCategory(row.category) === cat).length})</option>)}
                              </select>
                            </label>
                          </div>
                          <div className="req-table-wrap">
                            <table className="req-table">
                              <thead><tr><th>#</th><th>Requirement</th><th>AI check</th><th>AI findings &amp; notes</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                              <tbody>
                                {shown.length === 0 && <tr><td colSpan={6} className="req-table-empty">No documents in this view.</td></tr>}
                                {shown.map(row => {
                                  const index = rows.indexOf(row) + 1;
                                  const isOverdue = row.deadline && new Date(row.deadline) < new Date() && row.status !== 'approved';
                                  const finding = row.status === 'rejected' && row.req?.rejectionReason ? row.req.rejectionReason : (row.review?.findings || [])[0];
                                  const pct = Number.isFinite(row.review?.confidence) ? Math.round(row.review.confidence * 100) : null;
                                  const simple = SIMPLE_STATUS[row.status];
                                  const canOpen = row.req?.cloudinaryPublicId && row.req?.cloudinaryVersion;
                                  return <tr key={row.id} data-status={row.status}>
                                    <td className="req-index">{index}</td>
                                    <td className="req-name">
                                      <strong>{row.label}</strong>
                                      <small>{row.req?.submittedAt ? `Submitted ${fmt(row.req.submittedAt)}` : 'Not submitted'}
                                        {row.deadline && <span data-overdue={isOverdue}> · Due {fmt(row.deadline)}{isOverdue ? ' (overdue)' : ''}</span>}</small>
                                    </td>
                                    <td>{row.tone ? <span className="req-ai-pill" data-tone={row.tone}><i aria-hidden="true" />{AI_TONE_TEXT[row.tone]}{pct != null && ` · ${pct}%`}</span>
                                      : <span className="req-ai-none">{row.status === 'not_submitted' ? '—' : row.review && ['queued', 'checking'].includes(row.review.status) ? 'Checking…' : 'Manual review'}</span>}</td>
                                    <td className="req-findings">{finding ? <span data-tone={row.status === 'rejected' ? 'red' : row.tone}>{finding}</span> : <span className="req-ai-none">—</span>}
                                      {row.review && (row.review.findings || []).length > 1 && <details><summary>More</summary><RequirementCheckResult review={row.review} compact /></details>}</td>
                                    <td><span className="req-status-pill" data-status={simple.tone}>{simple.label}</span></td>
                                    <td className="req-actions">
                                      {canOpen && <button type="button" className="req-icon-btn" title="View document" aria-label={`View ${row.label}`}
                                        onClick={() => setDocumentPreview({ path: `/coordinator/students/${encodeURIComponent(selectedStudent.id)}/requirements/${encodeURIComponent(row.id)}/download`, fileName: row.req.fileName, sectionId: selectedSection.id, requirementId: row.id, studentId: selectedStudent.id })}><Icon name="expand" size={15} /></button>}
                                      {canOpen && <button type="button" className="req-icon-btn" title="Download" aria-label={`Download ${row.label}`} disabled={downloadingRequirement === `${selectedStudent.id}:${row.id}`}
                                        onClick={() => handleDownloadRequirement(selectedStudent.id, row.id, row.req.fileName)}><Icon name="download" size={15} /></button>}
                                      {row.status === 'submitted' && <>
                                        <button type="button" className="req-approve" disabled={saving} onClick={() => handleRequirement(selectedStudent.id, row.id, 'approved')}><Icon name="check" size={14} /> Approve</button>
                                        <button type="button" className="req-reject" disabled={saving} onClick={() => { setRejectionModal({ studentId: selectedStudent.id, reqId: row.id }); setRejectionReason(''); }}>Deficient</button>
                                      </>}
                                      {row.status === 'approved' && row.req?.autoApproved && <button type="button" className="autocheck-chip" disabled={saving} onClick={() => handleUndoAutoApproval(selectedStudent.id, row.id)}>Undo</button>}
                                      {!canOpen && row.req?.fileUrl && <small>Ask the student to upload again.</small>}
                                    </td>
                                  </tr>;
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>;
                      })()}

                      <AlertDialog
                        open={Boolean(rejectionModal)}
                        title="Mark this document as deficient?"
                        description="Specify the correction the student needs before resubmitting this requirement."
                        confirmLabel="Mark as deficient"
                        busy={saving}
                        confirmDisabled={!rejectionReason.trim()}
                        onCancel={() => setRejectionModal(null)}
                        onConfirm={async () => {
                          const saved = await handleRequirement(rejectionModal.studentId, rejectionModal.reqId, 'rejected', rejectionReason);
                          if (saved) setRejectionModal(null);
                        }}
                      >
                        <textarea
                          autoFocus
                          aria-label="Rejection reason"
                          style={{ width: '100%', minHeight: 96, marginTop: 16, padding: 12, resize: 'vertical', border: `1px solid ${COLORS.slate300}`, borderRadius: 10, font: 'inherit', boxSizing: 'border-box' }}
                          placeholder="e.g. Document is missing an official signature or notarization seal..."
                          value={rejectionReason}
                          onChange={e => setRejectionReason(e.target.value)}
                          rows={4}
                        />
                      </AlertDialog>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'sections' && <SectionsTab coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} onSectionChange={fetchStudents} journalSettings={<JournalFrequencySettings key={auth.currentUser?.uid} />}
              sectionActions={<>
                <button type="button" className="portal-secondary section-action-btn" onClick={() => setRosterOpen(true)}><Icon name="users" size={16} /> Class list & accounts</button>
                <button type="button" className="portal-secondary section-action-btn" onClick={exportSection} disabled={!selectedSection || exporting} aria-busy={exporting}><Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Download records (Excel)'}</button>
              </>} />}
            {rosterOpen && <PortalFormDialog className="authorized-roster-drawer" label="Class List & Accounts" closeOnBackdrop onCancel={() => { if (!rosterBusy) setRosterOpen(false); }}>
              <header className="roster-drawer-header"><div><h2>Class List & Accounts</h2></div><button type="button" className="portal-secondary" disabled={rosterBusy} onClick={() => setRosterOpen(false)}>Close</button></header>
              <ClassListTab coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} onBusyChange={setRosterBusy} />
            </PortalFormDialog>}
            {activeTab === 'logbook' && <LogbookTab key={selectedSection?.id} pendingStudentIds={overviewView === 'journals' ? location.state.pendingStudentIds : undefined} openJournals={overviewView === 'journals'} coordinatorId={coordinatorId} selectedSection={selectedSection} sections={sections} onSectionChange={fetchStudents} />}
            {activeTab === 'placements' && <CompanyPlacementsTab overviewView={overviewView} department={coordDept} selectedSection={selectedSection} />}
            {activeTab === 'companies' && <CompanyDirectoryTab readOnly={false} />}
            {activeTab === 'messages' && <MessagesTab key={selectedSection?.id} selectedSection={selectedSection} sections={sections} onSectionChange={fetchStudents} />}
            {activeTab === 'registrations' && <RegistrationsTab key={selectedSection?.id} department={coordDept} selectedSection={selectedSection} />}
            {activeTab === 'classlist' && <ClassListTab key={selectedSection?.id} coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} />}
            {activeTab === 'analytics' && <AnalyticsTab coordinatorId={coordinatorId} selectedSection={selectedSection} highlightStudentId={attendanceTarget && attendanceTarget.sectionId === selectedSection?.id ? attendanceTarget.studentId : null} />}
            {activeTab === 'notifications' && <NotificationsTab userId={coordinatorId} section={selectedSection} sections={sections} onOpenAttendanceRisk={openAttendanceRisk} />}
            {activeTab === 'evaluations' && <EvaluationTab coordinatorId={coordinatorId} selectedSection={selectedSection} sections={sections} onSectionChange={fetchStudents} />}
            {activeTab === 'clearance' && <ClearanceTab key={selectedSection?.id} initialFilter={overviewView === 'ready' ? 'ready' : 'all'} coordinatorId={coordinatorId} selectedSection={selectedSection} />}
          </div>
        )}
      </main>
    </div>
  );
}

function CoordinatorProfileTab({ coordinator, sectionsCount = 0, studentsCount = 0, onSaved }) {
  const authName = auth.currentUser?.displayName || '';
  const authNameParts = authName.trim().split(/\s+/).filter(Boolean);
  const authFirstName = authNameParts[0] || 'OJT';
  const authLastName = authNameParts.slice(1).join(' ') || 'Coordinator';
  const [form, setForm] = useState({
    firstName: coordinator?.firstName || authFirstName,
    lastName: coordinator?.lastName || authLastName,
    phone: coordinator?.phone || '',
  });
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      firstName: coordinator?.firstName || authFirstName,
      lastName: coordinator?.lastName || authLastName,
      phone: coordinator?.phone || '',
    });
  }, [coordinator, authFirstName, authLastName]);

  const save = async event => {
    event.preventDefault();
    if (!auth.currentUser) return;
    setSaving(true);
    setStatus(null);
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
      });
      setStatus({ type: 'success', message: 'Coordinator profile updated successfully!' });
      onSaved?.();
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: error.message || 'Could not update your profile.' });
    } finally {
      setSaving(false);
    }
  };

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'OJT Coordinator';
  const initials = ((form.firstName?.[0] || '') + (form.lastName?.[0] || 'C')).toUpperCase().slice(0, 2);
  const departmentName = coordinator?.department || 'Not Assigned';

  return (
    <div className="admin-profile-container coordinator-profile-container">
      {/* Hero Banner */}
      <div className="admin-profile-hero">
        <div className="admin-profile-hero-left">
          <div className="admin-profile-hero-avatar-wrap">
            <div className="admin-profile-hero-avatar">
              {initials}
            </div>
          </div>
          <div className="admin-profile-hero-details">
            <h2>{displayName}</h2>
            <div className="admin-profile-hero-meta">
              <span className="admin-profile-tag admin-profile-tag-role">
                <Icon name="userCheck" size={13} />
                OJT Coordinator
              </span>
              <span className="admin-profile-tag admin-profile-tag-status">
                <Icon name="check" size={12} />
                Active Account
              </span>
              <span style={{ fontSize: 12, color: 'var(--slate-500)', marginLeft: 4 }}>
                {auth.currentUser?.email || 'Unavailable'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {status && (
        <div role={status.type === 'error' ? 'alert' : 'status'} className={status.type === 'error' ? 'admin-profile-alert admin-profile-alert-error' : 'admin-profile-alert admin-profile-alert-success'}>
          <Icon name={status.type === 'error' ? 'x' : 'check'} size={16} />
          <span>{status.message}</span>
        </div>
      )}

      {/* Personal & Contact Information Card */}
      <form className="admin-profile-card" onSubmit={save}>
        <div className="admin-profile-card-header">
          <div>
            <div className="admin-profile-card-title">
              <Icon name="user" size={18} />
              Personal details
            </div>
            <div className="admin-profile-card-subtitle">
              Update your name and contact details visible to students and administrators.
            </div>
          </div>
        </div>

        <div className="admin-profile-grid">
          <div className="admin-profile-field">
            <label htmlFor="coordinator-first-name" className="admin-profile-label">First name</label>
            <input
              id="coordinator-first-name"
              className="admin-profile-input"
              value={form.firstName}
              onChange={e => setForm({ ...form, firstName: e.target.value })}
              placeholder="e.g. Maria"
              required
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-last-name" className="admin-profile-label">Last name</label>
            <input
              id="coordinator-last-name"
              className="admin-profile-input"
              value={form.lastName}
              onChange={e => setForm({ ...form, lastName: e.target.value })}
              placeholder="e.g. Santos"
              required
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-email" className="admin-profile-label">Email · read only</label>
            <input
              id="coordinator-email"
              className="admin-profile-input admin-profile-input-readonly"
              value={auth.currentUser?.email || ''}
              disabled
              title="Contact your system administrator to change your email."
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-department" className="admin-profile-label">Department · read only</label>
            <input
              id="coordinator-department"
              className="admin-profile-input admin-profile-input-readonly"
              value={departmentName}
              disabled
              title="Department assignments are managed by System Administrator"
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-phone" className="admin-profile-label">Phone number (optional)</label>
            <input
              id="coordinator-phone"
              type="tel"
              className="admin-profile-input"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. +63 912 345 6789"
            />
          </div>
        </div>

        <div className="admin-profile-actions">
          <button type="submit" className="admin-profile-save-btn" disabled={saving}>
            <Icon name="check" size={15} />
            {saving ? 'Saving changes...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Coordinator Scope & Access Overview Card */}
      <div className="admin-profile-card">
        <div className="admin-profile-card-header">
          <div>
            <div className="admin-profile-card-title">
              <Icon name="shield" size={18} />
              Your assignments
            </div>
            <div className="admin-profile-card-subtitle">
              Summary of assigned department, sections, and operational permissions.
            </div>
          </div>
        </div>

        <div className="admin-profile-security-grid">
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Assigned college or department</span>
            <span className="admin-profile-security-item-val" style={{ color: 'var(--sky-800)' }}>
              {departmentName}
            </span>
          </div>
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Assigned sections</span>
            <span className="admin-profile-security-item-val">
              {sectionsCount} {sectionsCount === 1 ? 'Section' : 'Sections'}
            </span>
          </div>
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Students in selected section</span>
            <span className="admin-profile-security-item-val">
              {studentsCount} {studentsCount === 1 ? 'Student' : 'Students'}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--slate-100)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="clipboard" size={16} style={{ color: 'var(--sky-600)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'var(--slate-600)' }}>
            You have full coordinator access to review pre-OJT requirements, approve weekly logbooks, verify evaluations, and monitor student clearances for <strong>{departmentName}</strong>.
          </span>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    height: '100vh',
    fontFamily: THEME.fonts.main,
    backgroundColor: COLORS.slate50,
    overflow: 'hidden',
  },
  sidebar: {
    width: 240,
    backgroundColor: COLORS.white,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px 16px',
    flexShrink: 0,
    borderRight: `1px solid ${COLORS.slate200}`,
  },
  sidebarTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingLeft: 6,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.sky50,
    border: `1.5px solid ${COLORS.sky300}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImg: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  appName: {
    color: COLORS.slate950,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: '0.08em',
  },
  appSub: {
    color: COLORS.sky700,
    fontSize: 11,
    fontWeight: 700,
  },
  deptPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(2, 132, 199, 0.12)',
    border: `1px solid rgba(2, 132, 199, 0.25)`,
    borderRadius: THEME.radius.sm,
    padding: '6px 10px',
    marginBottom: 16,
  },
  deptDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: COLORS.yellow400,
  },
  deptText: {
    color: COLORS.sky800,
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflowY: 'auto',
  },
  navGroupLabel: {
    color: COLORS.slate500,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.12em',
    padding: '12px 12px 4px',
  },
  navLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 9,
  },
  sectionPickerLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
    color: COLORS.slate600,
    fontSize: 11,
    fontWeight: 700,
  },
  sectionPicker: {
    minWidth: 190,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '8px 10px',
    color: COLORS.slate900,
    backgroundColor: COLORS.white,
    fontSize: 12,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: COLORS.slate700,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid transparent',
    textAlign: 'left',
    width: '100%',
    fontFamily: 'inherit',
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    color: COLORS.white,
    backgroundColor: COLORS.sky600,
    borderRadius: THEME.radius.md,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
    border: '1px solid transparent',
    textAlign: 'left',
    width: '100%',
    fontFamily: 'inherit',
  },
  navCountBadge: {
    backgroundColor: COLORS.yellow400,
    color: '#000000',
    fontSize: 11,
    fontWeight: 800,
    padding: '1px 6px',
    borderRadius: THEME.radius.full,
  },
  navPendingBadge: {
    backgroundColor: COLORS.yellow400,
    color: '#000000',
    fontSize: 11,
    fontWeight: 800,
    padding: '1px 6px',
    borderRadius: THEME.radius.full,
  },
  logoutBtn: {
    backgroundColor: 'transparent',
    border: `1px solid ${COLORS.slate300}`,
    color: COLORS.slate700,
    borderRadius: THEME.radius.md,
    padding: '9px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    marginTop: 12,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  topbar: {
    backgroundColor: COLORS.white,
    padding: '16px 28px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  topbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  pendingBadge: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    fontSize: 12,
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: THEME.radius.full,
  },
  loadingContainer: {
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: '#000000',
    fontSize: 14,
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    margin: '16px 28px 0',
    padding: '10px 12px',
    border: `1px solid ${COLORS.rose100}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.rose50,
    color: COLORS.rose700,
    fontSize: 13,
    fontWeight: 700,
  },
  retryBtn: {
    border: `1px solid ${COLORS.rose600}`,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.white,
    color: COLORS.rose700,
    padding: '5px 10px',
    cursor: 'pointer',
    fontWeight: 800,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  contentWrapper: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
  },
  threeCol: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  col1: {
    width: 275,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    overflowY: 'auto',
    flexShrink: 0,
  },
  col2: {
    width: 325,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.slate50,
    overflowY: 'auto',
    flexShrink: 0,
  },
  col3: {
    flex: 1,
    overflow: 'hidden',
    padding: 0,
    backgroundColor: COLORS.white,
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  colHeader: {
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.06em',
    padding: '14px 16px 8px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    position: 'sticky',
    top: 0,
    zIndex: 2,
    flexShrink: 0,
  },
  columnSearch: {
    padding: '10px 12px 4px',
    backgroundColor: COLORS.white,
  },
  requirementsScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: 24,
    backgroundColor: COLORS.white,
  },
  secCard: {
    padding: '12px 16px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    cursor: 'pointer',
  },
  secCardActive: {
    backgroundColor: COLORS.sky50,
    borderLeft: `4px solid ${COLORS.sky600}`,
  },
  secName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  secInfo: {
    fontSize: 11,
    color: '#000000',
    marginTop: 2,
  },
  studentCard: {
    padding: '12px 14px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  studentCardActive: {
    backgroundColor: COLORS.sky50,
    borderLeft: `4px solid ${COLORS.sky600}`,
  },
  studentTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    color: '#000000',
    fontWeight: 800,
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    border: `1px solid ${COLORS.sky300}`,
  },
  studentName: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
  },
  studentInfo: {
    fontSize: 11,
    color: '#000000',
  },
  statusPill: {
    display: 'inline-block',
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: THEME.radius.full,
  },
  emptyStatePanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  emptySub: {
    fontSize: 13,
    color: '#000000',
    maxWidth: 320,
  },
  reqGroup: {
    marginBottom: 24,
  },
  reqGroupLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 10,
  },
  reqCardsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  reqRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 14,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
  },
  reqLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  reqDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
    marginTop: 5,
    flexShrink: 0,
  },
  reqLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  fileLink: {
    fontSize: 12,
    color: COLORS.sky700,
    fontWeight: 700,
    display: 'inline-block',
    marginTop: 6,
    textDecoration: 'none',
    backgroundColor: COLORS.sky50,
    padding: '3px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.sky200}`,
  },
  rejectionAlert: {
    fontSize: 12,
    color: '#000000',
    backgroundColor: COLORS.rose50,
    padding: '6px 10px',
    borderRadius: THEME.radius.sm,
    marginTop: 6,
    border: `1px solid ${COLORS.rose200}`,
  },
  reqRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
    marginLeft: 16,
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 9px',
    borderRadius: THEME.radius.full,
  },
  actionBtns: {
    display: 'flex',
    gap: 6,
  },
  approveBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.sm,
    padding: '6px 14px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  rejectBtn: {
    backgroundColor: COLORS.rose600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.sm,
    padding: '6px 14px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    padding: 20,
    textAlign: 'center',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: 16,
  },
  overlayCard: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 28,
    width: '100%',
    maxWidth: 440,
    boxShadow: THEME.shadows.xl,
    border: `1px solid ${COLORS.slate300}`,
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  overlaySub: {
    fontSize: 13,
    color: '#000000',
    marginBottom: 16,
  },
  overlayInput: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: 12,
    fontSize: 14,
    color: '#000000',
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
    resize: 'vertical',
  },
  overlayBtns: {
    display: 'flex',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '11px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    color: '#000000',
    backgroundColor: COLORS.white,
  },
  confirmRejectBtn: {
    flex: 1,
    backgroundColor: COLORS.rose600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '11px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
  },
};

// Loading state shaped like the Requirements page: student list on the left, review table on the right.
function RequirementsSkeleton() {
  const bar = (width, height = 12, extra = {}) => <span className="cdash-skel" style={{ width, height, ...extra }} />;
  return <div className="req-skel" aria-busy="true" aria-label="Loading requirements">
    <div className="req-skel-left">
      {bar(90, 16)}{bar('100%', 40, { borderRadius: 10 })}{bar('100%', 40, { borderRadius: 10 })}
      {bar('100%', 64, { borderRadius: 12 })}
      <div className="req-skel-list">{[0, 1, 2, 3, 4].map(key => <div key={key} className="req-skel-student">{bar(40, 40, { borderRadius: '50%' })}<div>{bar('70%', 13)}{bar('45%', 10)}{bar(70, 18, { borderRadius: 99 })}</div></div>)}</div>
    </div>
    <div className="req-skel-right">
      {bar(160, 18)}{bar(280, 12)}{bar('100%', 6, { borderRadius: 99 })}
      <div className="req-skel-row">{[60, 80, 86, 70, 120].map((w, key) => <span key={key} className="cdash-skel" style={{ width: w, height: 30, borderRadius: 99 }} />)}</div>
      <div className="req-skel-table">{[0, 1, 2, 3, 4, 5].map(key => <div key={key} className="req-skel-tr">{bar(14, 12)}{bar('80%', 14)}{bar('60%', 12)}{bar('70%', 12)}{bar(78, 22, { borderRadius: 99 })}</div>)}</div>
    </div>
  </div>;
}
