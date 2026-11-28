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
import SubmissionNotifications, { receivedRequirements, submissionTime } from '../components/SubmissionNotifications'; // eslint-disable-line no-unused-vars
import RequirementsInbox from '../components/RequirementsInbox';
import Pager from '../components/Pager';
import SectionPicker from '../components/SectionPicker';
import DashboardNotifications from '../components/DashboardNotifications';
import RequirementViewer from '../components/RequirementViewer';
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
import './RequirementsRedesign.css';
import './Responsive.css';
import './CoordinatorSidebar.css';
import SuccessHost from '../components/SuccessHost';
import { TermPicker } from '../components/TermManager';
import { quietly, showSuccess, showToast, showNotice } from '../successFx';
import CoordinatorProfile from '../components/CoordinatorProfile';
import { ListSkeleton, SplitSkeleton, SectionsSkeleton, ProgressSkeleton } from '../components/CoordSkeletons';

const PRE_OJT_IDS = ['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa'];

const STATUS_COLOR = {
  not_submitted: COLORS.rose100,
  submitted: COLORS.yellow100,
  approved: COLORS.emerald100,
  rejected: COLORS.rose100,
};

const STAGE_LABEL = { 'Pre-OJT': 'Before OJT', Ongoing: 'During OJT', 'Post-OJT': 'After OJT', Other: 'Other' };
function aiTone(review) {
  if (!review || ['queued', 'checking'].includes(review.status)) return null;
  if (['consent_required', 'ai_unavailable', 'policy_missing', 'unsupported_file', 'assignment_changed'].includes(review.reason)) return null;
  if (review.tier === 'red') return 'red';
  if (review.status === 'checks_passed' && review.tier !== 'yellow') return 'green';
  return 'yellow';
}

const COORDINATOR_TABS = ['overview', 'requirements', 'sections', 'logbook', 'companies', 'placements', 'messages', 'classlist', 'registrations', 'analytics', 'notifications', 'evaluations', 'clearance', 'profile'];
const SECTION_STORAGE_KEY = 'pathway.coordinator.sectionId';


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
      showToast('Export ready', 'Section requirements downloaded.');
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

  // New coordinators must replace the initial password before using the portal.
  useEffect(() => {
    if (coordinatorProfile?.mustChangePassword && activeTab !== 'profile') navigate('/coordinator/profile', { replace: true });
  }, [coordinatorProfile?.mustChangePassword, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dashTerms, setDashTerms] = useState([]);
  const [dashTerm, setDashTerm] = useState(null);
  useEffect(() => {
    let alive = true;
    adminRequest('/coordinator/terms').then(d => { if (alive) setDashTerms(d.terms || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Follow the selected section's term unless the coordinator picked one.
  const shownTerm = dashTerm || selectedSection?.termId || 'all';
  const termSections = shownTerm === 'all' ? sections : sections.filter(sec => sec.termId === shownTerm);
  const changeDashTerm = termId => {
    setDashTerm(termId);
    if (termId === 'all') return;
    const first = sections.find(sec => sec.termId === termId);
    if (first && first.id !== selectedSection?.id && selectedSection?.termId !== termId) fetchStudents(first);
  };
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
  const [phaseFilter, setPhaseFilter] = useState('Pre-OJT');
  const [sectionMenuOpen, setSectionMenuOpen] = useState(false);
  const [rqDetailView, setRqDetailView] = useState(false);
  useEffect(() => {
    const id = location.state?.openStudentId;
    if (activeTab !== 'requirements' || !id) return;
    let on = true;
    getDoc(doc(db, 'users', id)).then(snap => { if (on && snap.exists()) { setSelectedStudent({ id: snap.id, ...snap.data() }); setRqDetailView(true); } }).catch(() => {});
    return () => { on = false; };
  }, [activeTab, location.state]);
  const [viewerId, setViewerId] = useState(null);
  useEffect(() => { setViewerId(null); }, [selectedStudent?.id]);
  const pendingStageRef = useRef(null);
  const [newStudentIds, setNewStudentIds] = useState(() => new Set());
  const newStudentIdsRef = useRef(newStudentIds);
  newStudentIdsRef.current = newStudentIds;
  useEffect(() => { setPhaseFilter(pendingStageRef.current || 'Pre-OJT'); pendingStageRef.current = null; }, [selectedStudent?.id]);
  const aiReviewFor = (studentId, reqId, fallback) => aiReviews[`${studentId}__${reqId}`] || fallback;
  const [colorFilter, setColorFilter] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [colorPage, setColorPage] = useState(1);
  const [allSectionStudents, setAllSectionStudents] = useState(null);
  const [colorRefresh, setColorRefresh] = useState(0);
  useEffect(() => {
    if (!requirementsActive || !selectedSection?.id) { setAllSectionStudents(null); return undefined; }
    let on = true;
    getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', selectedSection.department), where('sectionId', '==', selectedSection.id)))
      .then(snap => { if (on) setAllSectionStudents(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }).catch(() => { if (on) setAllSectionStudents([]); });
    return () => { on = false; };
  }, [requirementsActive, selectedSection?.id, selectedSection?.department, colorRefresh]);
  useEffect(() => { setColorFilter(null); setColorPage(1); }, [selectedSection?.id]);
  const toneItems = (list, tone) => (list || []).flatMap(st => Object.entries(st.requirements || {})
    .filter(([reqId, r]) => r?.status === 'submitted' && aiTone(aiReviewFor(st.id, reqId, r?.autoReview)) === tone).map(([reqId]) => ({ studentId: st.id, reqId, name: personName(st), label: sectionRequirements.find(x => x.id === reqId)?.label || reqId })));
  const toneCount = (st, tone) => toneItems([st], tone).length;
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkReason, setBulkReason] = useState('The AI check found this is the wrong document, a different student, or the form was not filled in and signed. Please upload the correct, completed and signed form.');
  const tierItems = (list, tier) => (list || []).flatMap(st => Object.entries(st.requirements || {})
    .filter(([reqId, r]) => r?.status === 'submitted' && aiReviewFor(st.id, reqId, r?.autoReview)?.tier === tier).map(([reqId]) => ({ studentId: st.id, reqId })));
  const runBulk = async () => {
    if (!bulkConfirm) return;
    const { items, status } = bulkConfirm;
    setBulkBusy(true);
    try {
      let ok = 0;
      await quietly(async () => { for (const item of items) if (await handleRequirement(item.studentId, item.reqId, status, status === 'rejected' ? bulkReason.trim() : '')) ok += 1; });
      showSuccess(status === 'approved' ? 'Approved' : 'Sent back', `${ok} of ${items.length} requirements ${status === 'approved' ? 'approved' : 'sent back'}.`);
    }
    finally { setBulkBusy(false); setBulkConfirm(null); setColorRefresh(v => v + 1); }
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
      showNotice(message);
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
      showNotice(downloadError.message || 'Could not download this protected document.');
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
  const visibleReviewStudents = (currentReview?.page?.records || []).slice(0, 10);
  const [reviewJump, setReviewJump] = useState(null);
  useEffect(() => {
    if (!reviewJump || reviewJump.scope !== reviewScope || !currentReview?.page) return;
    if (reviewCursors.length >= reviewJump.page || !currentReview.page.hasMore) { setReviewJump(null); return; }
    setReviewPaging({ scope: reviewScope, cursors: [...reviewCursors, currentReview.page.cursor] });
  }, [reviewJump, currentReview]); // eslint-disable-line react-hooks/exhaustive-deps
  const goReviewPage = n => {
    if (n < reviewCursors.length) { setReviewJump(null); setReviewPaging({ scope: reviewScope, cursors: reviewCursors.slice(0, n) }); }
    else if (n > reviewCursors.length) setReviewJump({ scope: reviewScope, page: n });
  };
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
    if (!requiresMatching) {
      getCountFromServer(base).then(snapshot => {
        if (active) setReviewTotal({ scope: reviewScope, count: snapshot.data().count, pages: Math.max(1, Math.ceil(snapshot.data().count / 10)) });
      }).catch(() => {});
    }
    const request = requiresMatching
      ? readMatchingPortalPage(base, reviewCursor, 10, student => (
        matchesCoordinatorSearch(reviewSearch, student.firstName, student.lastName, student.idNumber, selectedSection.name)
        && (reviewFilter === 'all' || (reviewFilter === 'new' ? newStudentIdsRef.current.has(student.id) : reviewFilter === 'review' ? needsReview(student) : reviewFilter === 'revision' ? needsChanges(student) : isComplete(student)))
      ))
      : readPortalPage(base, reviewCursor, 10);
    const latestUpload = st => Math.max(0, ...Object.values(st.requirements || {}).map(r => submissionTime(r?.submittedAt)));
    request.then(page => ({ ...page, records: [...(page.records || [])].sort((a, b) => reviewFilter === 'new' ? latestUpload(b) - latestUpload(a) : String(a.lastName || '').localeCompare(String(b.lastName || '')) || String(a.firstName || '').localeCompare(String(b.firstName || ''))) })).then(page => {
      if (!active) return;
      setReviewResult({ scope: reviewScope, cursor: reviewCursor, page });
      if (!page.hasMore) setReviewTotal(prev => ({ ...(prev?.scope === reviewScope ? prev : {}), scope: reviewScope, pages: reviewCursors.length }));
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
        { id: 'requirements', icon: 'clipboard', badge: null },
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
        { id: 'registrations', icon: 'users', badge: null },
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
      <SuccessHost />
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
            {!['profile', 'requirements', 'logbook', 'sections', 'evaluations', 'messages', 'clearance', 'placements', 'companies', 'registrations', 'analytics', 'notifications', 'overview'].includes(activeTab) && (
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
          {activeTab === 'logbook' && <div className="rq-top-actions" id="lb-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'evaluations' && <div className="rq-top-actions" id="ev-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'clearance' && <div className="rq-top-actions" id="cl-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'placements' && <div className="rq-top-actions" id="pl-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'companies' && <div className="rq-top-actions" id="co-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'sections' && <div className="rq-top-actions" id="sx-top-actions" />}
          {activeTab === 'registrations' && <div className="rq-top-actions" id="rg-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'analytics' && <div className="rq-top-actions" id="an-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'messages' && <div className="rq-top-actions" id="msg-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'notifications' && <div className="rq-top-actions" id="ann-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /></div>}
          {activeTab === 'overview' && sections.length > 0 && <div className="rq-top-actions"><TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} /><SectionPicker sections={termSections} selected={termSections.some(sec => sec.id === selectedSection?.id) ? selectedSection : null} onChange={section => fetchStudents(section)} /><DashboardNotifications section={selectedSection} students={students}
            onOpen={(tab, { view, studentId } = {}) => navigate('/coordinator/' + tab, { state: { sectionId: selectedSection?.id, ...(view ? { view } : {}), ...(studentId ? { openStudentId: studentId } : {}) } })} /></div>}
          {activeTab === 'requirements' && (
            <div className="rq-top-actions">
            <TermPicker terms={dashTerms} value={shownTerm} onChange={changeDashTerm} />
            <button
              type="button"
              className="section-export-button"
              onClick={exportSection}
              disabled={!selectedSection || loading || exporting}
              aria-busy={exporting}
              title={selectedSection ? `Download ${selectedSection.name} records as an Excel file` : 'Select a section to export'}
            >
              {exporting ? <span className="section-export-spinner" aria-hidden="true" /> : <Icon name="download" size={18} />}
              <span aria-live="polite">{exporting ? 'Exporting…' : 'Download records'}</span>
            </button>
            <div className="rq-section-pick" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setSectionMenuOpen(false); }}>
              <button type="button" className="rq-section-face" aria-haspopup="listbox" aria-expanded={sectionMenuOpen} aria-label="Current section" disabled={!sections.length}
                onClick={() => setSectionMenuOpen(open => !open)} onKeyDown={e => { if (e.key === 'Escape') setSectionMenuOpen(false); }}>
                {selectedSection?.name || 'Choose section'}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              {sectionMenuOpen && <ul className="rq-section-menu" role="listbox" aria-label="Sections">
                {termSections.map(section => <li key={section.id}><button type="button" role="option" aria-selected={section.id === selectedSection?.id}
                  onClick={() => { setSectionMenuOpen(false); if (section.id !== selectedSection?.id) fetchStudents(section); }}>
                  <span>{section.name}</span>
                  {section.id === selectedSection?.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
                </button></li>)}
              </ul>}
            </div>
            </div>
          )}
        </header>

        {error && !loading && <PortalError message={error} onRetry={() => (activeTab === 'overview' || requirementsActive) && selectedSection ? fetchStudents(selectedSection) : fetchInitialData()} />}

        {loading ? (
          activeTab === 'overview' ? <OverviewSkeleton />
            : activeTab === 'requirements' ? <SplitSkeleton label="Loading requirements" />
            : ['messages', 'notifications'].includes(activeTab) ? <SplitSkeleton label="Loading inbox" inbox />
            : activeTab === 'sections' ? <SectionsSkeleton />
            : activeTab === 'analytics' ? <ProgressSkeleton />
            : activeTab === 'clearance' ? <ListSkeleton label="Loading clearance" chips={4} table />
            : activeTab === 'evaluations' ? <ListSkeleton label="Loading evaluations" chips={4} side />
            : activeTab === 'companies' ? <ListSkeleton label="Loading companies" chips={3} side />
            : activeTab === 'registrations' ? <ListSkeleton label="Loading accounts" chips={3} rows={4} />
            : <ListSkeleton label="Loading" chips={3} />
        ) : activeTab === 'profile' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
            <CoordinatorProfile
              coordinator={coordinatorProfile}
              sections={sections}
              activeTerm={(dashTerms.find(t => t.isActive) || {}).name || ''}
              onSaved={fetchInitialData}
              onGo={setActiveTab}
              onOpenSection={section => { fetchStudents(section); setActiveTab('overview'); }}
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
              <div className="rq" data-view={rqDetailView && selectedStudent ? 'detail' : 'list'}>
                <div className="rq-list">
                  <div className="rq-search-row">
                    <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search students" placeholder="Find a student" />
                    <div className="rq-filter" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setFilterOpen(false); }}>
                      <button type="button" className="rq-filter-btn" aria-haspopup="menu" aria-expanded={filterOpen} aria-label={`Filter students: ${({ all: 'All', review: 'To check', revision: 'Needs fixing', complete: 'Complete' })[reviewFilter]}`} data-active={reviewFilter !== 'all' || undefined} onClick={() => setFilterOpen(o => !o)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
                        {reviewFilter !== 'all' && <i aria-hidden="true" />}
                      </button>
                      {filterOpen && <ul className="rq-filter-menu" role="menu" aria-label="Filter students" onMouseDown={e => e.preventDefault()}>
                        {[['all', 'All'], ['review', 'To check'], ['revision', 'Needs fixing'], ['complete', 'Complete']].map(([value, label]) =>
                          <li key={value}><button type="button" role="menuitemradio" aria-checked={reviewFilter === value} onClick={() => { setColorFilter(null); setReviewFilter(value); setFilterOpen(false); }}>{label}{reviewFilter === value && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>}</button></li>)}
                      </ul>}
                    </div>
                    <RequirementsInbox coordinatorId={coordinatorId} section={selectedSection} requirements={sectionRequirements}
                      toneFor={(studentId, reqId, item) => aiTone(aiReviewFor(studentId, reqId, item?.autoReview))}
                      stageFor={reqId => requirementCategory(sectionRequirements.find(r => r.id === reqId)?.category)}
                      onNewChange={setNewStudentIds}
                      onOpen={(student, stage) => { setRqDetailView(true); pendingStageRef.current = stage || null; if (selectedStudent?.id === student.id && stage) setPhaseFilter(stage); setSelectedStudent(student); }} />
                  </div>
                  <div className="rq-pills rq-tones" role="group" aria-label="Filter by AI check">
                    {[['green', 'Green'], ['yellow', 'Yellow'], ['red', 'Red']].map(([tone, label]) => { const n = toneItems(allSectionStudents, tone).length;
                      return <button key={tone} type="button" data-tone={tone} aria-pressed={colorFilter === tone} onClick={() => { setColorFilter(colorFilter === tone ? null : tone); setColorPage(1); }}><i aria-hidden="true" />{label}<b>{allSectionStudents ? n : '…'}</b></button>; })}
                  </div>
                  {colorFilter && colorFilter !== 'yellow' && (() => { const items = toneItems(allSectionStudents, colorFilter); return items.length > 0 &&
                    <button type="button" className={`rq-btn rq-bulk rq-bulk-${colorFilter}`} disabled={saving || bulkBusy} onClick={() => setBulkConfirm({ status: colorFilter === 'green' ? 'approved' : 'rejected', items })}>
                      {colorFilter === 'green' ? `Approve all green (${items.length} document${items.length === 1 ? '' : 's'})` : `Reject all red (${items.length} document${items.length === 1 ? '' : 's'})`}</button>; })()}
                  {colorFilter === 'yellow' && <p className="rq-tone-note">Yellow documents need a closer look. Open each student to review them.</p>}
                  <div className="rq-students">
                    {!selectedSection && (sections.length === 0
                      ? <PortalEmpty compact icon="section" title="No sections yet" description="Create a section to see students here." />
                      : <PortalEmpty compact icon="section" title="Choose a section" description="Pick a section at the top right." />)}
                    {selectedSection && currentReview?.page && visibleReviewStudents.length === 0 && (
                      <div className="rq-empty">{currentReview?.page?.hasMore ? 'No matches on this page. Choose Next to continue.' : 'No students match this view.'}</div>
                    )}
                    {selectedSection && !currentReview && <div className="req-skel-list" role="status" aria-label="Loading students">{[0, 1, 2, 3, 4].map(key => <div key={key} className="req-skel-student"><span className="cdash-skel" style={{ width: 32, height: 32, borderRadius: '50%' }} /><div><span className="cdash-skel" style={{ width: '70%', height: 13 }} /><span className="cdash-skel" style={{ width: '45%', height: 10 }} /></div></div>)}</div>}
                    {currentReview?.error && <div className="rq-empty" role="status">
                      <strong>No students yet</strong>
                      <span>Students will appear here once they join {selectedSection?.name || 'this section'}.</span>
                      <button type="button" className="rq-link" onClick={() => setReviewRetry(value => value + 1)}>Check again</button>
                    </div>}
                    {colorFilter && (() => { const list = (allSectionStudents || []).filter(st => toneCount(st, colorFilter) > 0).sort((a, b) => personName(a).localeCompare(personName(b)));
                      const pages = Math.max(1, Math.ceil(list.length / 10)); const cur = Math.min(colorPage, pages);
                      return <>
                        {!allSectionStudents && <div className="rq-empty">Loading…</div>}
                        {allSectionStudents && !list.length && <div className="rq-empty">No students have {colorFilter} documents waiting.</div>}
                        {list.slice((cur - 1) * 10, cur * 10).map(student => { const n = toneCount(student, colorFilter);
                          return <button type="button" className="rq-student" aria-pressed={selectedStudent?.id === student.id} key={student.id} onClick={() => { setSelectedStudent(student); setRqDetailView(true); }}>
                            <span className="rq-avatar" aria-hidden="true">{((student.firstName || '?')[0] + (student.lastName || '')[0]).toUpperCase()}</span>
                            <span className="rq-student-name"><strong>{personName(student)}</strong><small>{selectedSection?.name}</small></span>
                            <span className="rq-student-tag" data-tone={colorFilter === 'yellow' ? 'amber' : colorFilter}>{n} {colorFilter}</span>
                          </button>; })}
                        {pages > 1 && <div className="rq-pages"><span>{(cur - 1) * 10 + 1}–{Math.min(cur * 10, list.length)} of {list.length}</span><Pager page={cur} pages={pages} onGo={setColorPage} label="Colour filter pages" /></div>}
                      </>; })()}
                    {!colorFilter && visibleReviewStudents.map(student => {
                      const reqs = sectionRequirements.map(r => student.requirements?.[r.id]?.status);
                      const toCheck = reqs.filter(v => v === 'submitted').length, toFix = reqs.filter(v => v === 'rejected').length;
                      const tag = toFix ? [`${toFix} need${toFix === 1 ? 's' : ''} fixing`, 'red'] : toCheck ? [`${toCheck} to check`, 'blue'] : isComplete(student) ? ['All approved', 'green'] : ['Nothing new', 'mute'];
                      return <button type="button" className="rq-student" aria-pressed={selectedStudent?.id === student.id} key={student.id} onClick={() => { setSelectedStudent(student); setRqDetailView(true); }}>
                        <span className="rq-avatar" aria-hidden="true">{((student.firstName || '?')[0] + (student.lastName || '')[0]).toUpperCase()}</span>
                        <span className="rq-student-name"><strong>{personName(student)}</strong><small>{selectedSection?.name}</small></span>
                        <span className="rq-student-tag" data-tone={tag[1]}>{tag[0]}</span>
                      </button>;
                    })}
                  </div>
                  {!colorFilter && visibleReviewStudents.length > 0 && (() => {
                    const first = (reviewCursors.length - 1) * 10 + 1, last = first + visibleReviewStudents.length - 1;
                    const total = reviewTotal?.scope === reviewScope && reviewTotal.count != null ? reviewTotal.count : null;
                    const pages = reviewTotal?.scope === reviewScope ? Math.max(reviewCursors.length + Number(Boolean(currentReview?.page?.hasMore)), reviewTotal.pages) : reviewCursors.length + Number(Boolean(currentReview?.page?.hasMore));
                    return <div className="rq-pages">
                      <span aria-live="polite">{first}–{last}{total != null ? ` of ${total}` : ''}</span>
                      <Pager page={reviewCursors.length} pages={pages} busy={Boolean(reviewJump) || saving} onGo={goReviewPage} label="Student pages" />
                    </div>;
                  })()}
                </div>

                <div className="rq-detail">
                  {!selectedStudent || sectionRequirements.length === 0 ? (
                    sections.length === 0 ? (
                      <PortalEmpty icon="section" title="Start by creating a section" description="Student documents appear here once a section has students and requirements."
                        steps={['Create a section', 'Add requirements and deadlines', 'Students upload — you review here']} action={{ label: 'Go to Sections', onClick: () => setActiveTab('sections') }} />
                    ) : sectionRequirements.length === 0 ? (
                      <PortalEmpty title="No requirements yet" description="Add the documents students must submit for this section." action={{ label: 'Add requirements', onClick: () => setActiveTab('sections') }} />
                    ) : (
                      <PortalEmpty icon="user" title="Select a student" description="Choose a student on the left to see their documents." />
                    )
                  ) : (() => {
                    const ordered = REQUIREMENT_CATEGORIES.flatMap(cat => sectionRequirements.filter(r => requirementCategory(r.category) === cat));
                    const rows = ordered.map(requirement => {
                      const req = selectedStudent.requirements?.[requirement.id];
                      const status = req?.status || 'not_submitted';
                      const review = (status === 'submitted' || req?.autoApproved || status === 'approved' || status === 'rejected') ? aiReviewFor(selectedStudent.id, requirement.id, req?.autoReview) : null;
                      return { ...requirement, req, status, review, tone: aiTone(review), stage: requirementCategory(requirement.category) };
                    });
                    const stages = REQUIREMENT_CATEGORIES.filter(cat => cat !== 'Other' || rows.some(row => row.stage === 'Other'));
                    const activeStage = stages.includes(phaseFilter) ? phaseFilter : stages[0];
                    const stageSummary = cat => { // eslint-disable-line no-unused-vars
                      const list = rows.filter(row => row.stage === cat);
                      const ok = list.filter(row => row.status === 'approved').length, check = list.filter(row => row.status === 'submitted').length, fix = list.filter(row => row.status === 'rejected').length, none = list.filter(row => row.status === 'not_submitted').length;
                      if (!list.length) return 'none';
                      if (ok === list.length) return `${ok} of ${list.length} approved`;
                      return [check && `${check} to check`, fix && `${fix} to fix`, none && `${none} not sent yet`, !check && !fix && !none && `${ok} of ${list.length} approved`].filter(Boolean).join(' · ');
                    };
                    const shown = rows.filter(row => row.stage === activeStage);
                    const fmt = value => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
                    const greens = tierItems([selectedStudent], 'green');
                    return <>
                      <button type="button" className="rq-back" onClick={() => setRqDetailView(false)}><Icon name="chevronLeft" size={15} /> Students</button>
                      <div className="rq-head">
                        <div><h2>{personName(selectedStudent)}</h2>
                          <p>{selectedProgress?.approved || 0} of {selectedProgress?.total || 0} documents approved · ID {selectedStudent.idNumber || 'not provided'}</p></div>
                        <div className="rq-head-acts">
                        {greens.length > 0 && <button type="button" className="rq-btn rq-primary" disabled={saving} onClick={() => setBulkConfirm({ status: 'approved', items: greens })}>
                          Approve the {greens.length} that look{greens.length === 1 ? 's' : ''} good <Icon name="check" size={14} /></button>}
                        </div>
                      </div>
                      <div className="rq-progress" role="progressbar" aria-label="Documents approved" aria-valuemin={0} aria-valuemax={selectedProgress?.total || 0} aria-valuenow={selectedProgress?.approved || 0}><i style={{ width: `${selectedProgress?.total ? Math.round(100 * (selectedProgress.approved || 0) / selectedProgress.total) : 0}%` }} /></div>
                      <div className="rq-stages" role="tablist" aria-label="OJT stage" style={{ '--count': stages.length, '--index': Math.max(0, stages.indexOf(activeStage)) }}>
                        <span className="rq-stages-thumb" aria-hidden="true" />
                        {stages.map(cat => {
                          const list = rows.filter(row => row.stage === cat);
                          const tone = list.some(row => row.status === 'rejected') ? 'red' : list.some(row => row.status === 'submitted') ? 'blue' : list.length && list.every(row => row.status === 'approved') ? 'green' : 'mute';
                          const hint = tone === 'red' ? 'needs fixing' : tone === 'blue' ? 'has documents to check' : tone === 'green' ? 'all approved' : 'waiting for the student';
                          return <button key={cat} type="button" role="tab" aria-selected={cat === activeStage} onClick={() => setPhaseFilter(cat)} title={`${STAGE_LABEL[cat] || cat}: ${hint}`}>
                            <i data-tone={tone} aria-hidden="true" /><strong>{STAGE_LABEL[cat] || cat}</strong><span className="sr-only">, {hint}</span></button>;
                        })}
                      </div>
                      <div className="rq-table" role="table" aria-label={`${STAGE_LABEL[activeStage] || activeStage} documents`}>
                        
                        {shown.length === 0 && <div className="rq-empty">No documents in this stage.</div>}
                        {shown.map(row => {
                          const isOverdue = row.deadline && new Date(row.deadline) < new Date() && row.status !== 'approved';
                          const finding = row.status === 'rejected' && row.req?.rejectionReason ? row.req.rejectionReason : (row.review?.findings || [])[0];
                          const pct = Number.isFinite(row.review?.confidence) ? Math.round(row.review.confidence * 100) : null;
                          const canOpen = row.req?.cloudinaryPublicId && row.req?.cloudinaryVersion;
                          const pill = row.status === 'approved' ? ['Approved', 'green'] : row.status === 'rejected' ? ['Sent back', 'red'] : row.status === 'submitted' ? (row.tone === 'green' ? ['Looks good', 'green'] : row.tone === 'red' ? ['Looks wrong', 'red'] : row.tone === 'yellow' ? ['Check closely', 'amber'] : ['To check', 'blue']) : ['Waiting', 'mute'];
                          const note = finding || (row.status === 'approved' ? (row.req?.autoApproved ? 'Approved by the AI check.' : row.req?.reviewedAt ? `Checked by you on ${fmt(row.req.reviewedAt)}.` : 'Approved.') : row.status === 'not_submitted' ? 'The student has not uploaded this yet.' : row.review && ['queued', 'checking'].includes(row.review.status) ? 'The AI is still checking this.' : '');
                          return <div className="rq-row" role="row" key={row.id} data-status={row.status}>
                            <span className="rq-doc" role="cell"><strong>{row.label}</strong>
                              <small>{row.req?.submittedAt ? `${row.req?.viaLink ? 'Submitted through link' : 'Sent'} ${fmt(row.req.submittedAt)}` : 'Not sent yet'}{row.deadline && <em data-overdue={isOverdue}> · Due {fmt(row.deadline)}{isOverdue ? ' (late)' : ''}</em>}</small></span>
                            <span className="rq-status" role="cell"><b data-tone={pill[1]}>{pill[0]}{pct != null && row.status === 'submitted' && ` · ${pct}% checks passed`}</b>
                              {note && <small>{note}</small>}
                              {row.review && (row.review.findings || []).length > 1 && <details><summary>More</summary><RequirementCheckResult review={row.review} compact /></details>}</span>
                            <span className="rq-actions" role="cell">
                              {row.status === 'submitted' && <>
                                <button type="button" className="rq-btn rq-primary" disabled={saving} onClick={() => handleRequirement(selectedStudent.id, row.id, 'approved')}>Approve</button>
                                <button type="button" className="rq-btn" disabled={saving} onClick={() => { setRejectionModal({ studentId: selectedStudent.id, reqId: row.id }); setRejectionReason(''); }}>Ask to fix</button>
                              </>}
                              {canOpen && <button type="button" className="rq-link" onClick={() => setViewerId(row.id)}>View <Icon name="eye" size={14} /></button>}
                              {canOpen && <button type="button" className="rq-icon" title="Download" aria-label={`Download ${row.label}`} disabled={downloadingRequirement === `${selectedStudent.id}:${row.id}`} onClick={() => handleDownloadRequirement(selectedStudent.id, row.id, row.req.fileName)}><Icon name="download" size={14} /></button>}
                              {row.status === 'approved' && row.req?.autoApproved && <button type="button" className="rq-link" disabled={saving} onClick={() => handleUndoAutoApproval(selectedStudent.id, row.id)}>Undo</button>}
                              {row.req?.viaLink && row.req?.submissionLink && <a className="rq-link" href={row.req.submissionLink} target="_blank" rel="noopener noreferrer">Open link</a>}
                              {!canOpen && !row.req?.viaLink && row.req?.fileUrl && <small>Ask the student to upload again.</small>}
                            </span>
                          </div>;
                        })}
                      </div>
                      {viewerId && <RequirementViewer student={selectedStudent} studentName={personName(selectedStudent)} sectionId={selectedSection?.id}
                        rows={rows.filter(r => r.req?.cloudinaryPublicId && r.req?.cloudinaryVersion)} startId={viewerId} saving={saving}
                        stageLabel={cat => STAGE_LABEL[cat] || cat}
                        onApprove={reqId => handleRequirement(selectedStudent.id, reqId, 'approved')}
                        onFix={(reqId, why) => handleRequirement(selectedStudent.id, reqId, 'rejected', why)}
                        onUndo={reqId => handleUndoAutoApproval(selectedStudent.id, reqId)}
                        onClose={() => setViewerId(null)} />}
                    </>;
                  })()}
                  <AlertDialog
                    open={Boolean(bulkConfirm)}
                    title={bulkConfirm ? `${bulkConfirm.status === 'rejected' ? 'Send back' : 'Approve'} ${bulkConfirm.items.length} document${bulkConfirm.items.length === 1 ? '' : 's'}?` : ''}
                    description={bulkConfirm?.status === 'rejected' ? 'These were flagged red by the AI check. Each student gets this reason and can upload again.' : 'These passed the AI check. You can still undo each one later.'}
                    confirmLabel={bulkConfirm?.status === 'rejected' ? 'Send back' : 'Approve'}
                    confirmDisabled={bulkConfirm?.status === 'rejected' && !bulkReason.trim()}
                    busy={bulkBusy}
                    onCancel={() => setBulkConfirm(null)}
                    onConfirm={runBulk}
                  >
                    {bulkConfirm && bulkConfirm.items.length > 1 && bulkConfirm.items[0].name && <ul className="rq-bulk-list">{bulkConfirm.items.slice(0, 8).map(it => <li key={it.studentId + it.reqId}><b>{it.name}</b> · {it.label}</li>)}{bulkConfirm.items.length > 8 && <li>+{bulkConfirm.items.length - 8} more</li>}</ul>}
                    {bulkConfirm?.status === 'rejected' && <textarea aria-label="Reason sent to students" className="rq-reason" rows={3} value={bulkReason} onChange={e => setBulkReason(e.target.value)} />}
                  </AlertDialog>
                  <AlertDialog
                    open={Boolean(rejectionModal)}
                    title="Ask the student to fix this?"
                    description="Tell the student what to change before they upload it again."
                    confirmLabel="Send back"
                    busy={saving}
                    confirmDisabled={!rejectionReason.trim()}
                    onCancel={() => setRejectionModal(null)}
                    onConfirm={async () => {
                      const saved = await handleRequirement(rejectionModal.studentId, rejectionModal.reqId, 'rejected', rejectionReason);
                      if (saved) setRejectionModal(null);
                    }}
                  >
                    <textarea autoFocus aria-label="What to fix" className="rq-reason" placeholder="e.g. The form is missing the parent's signature." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} rows={4} />
                  </AlertDialog>
                </div>
              </div>
            )}
            {activeTab === 'sections' && <SectionsTab coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} onSectionChange={fetchStudents} onAddStudents={() => setRosterOpen('add')} onManageAccounts={() => setRosterOpen(true)} journalSettings={<JournalFrequencySettings key={auth.currentUser?.uid} />}
              sectionActions={<>
                <button type="button" className="portal-secondary section-action-btn" onClick={exportSection} disabled={!selectedSection || exporting} aria-busy={exporting}><Icon name="download" size={16} /> {exporting ? 'Exporting…' : 'Download records (Excel)'}</button>
              </>} />}
            {rosterOpen && <PortalFormDialog className="authorized-roster-drawer" label="Class List & Accounts" closeOnBackdrop onCancel={() => { if (!rosterBusy) setRosterOpen(false); }}>
              <header className="roster-drawer-header"><div><h2>Class List & Accounts</h2></div><button type="button" className="portal-secondary" disabled={rosterBusy} onClick={() => setRosterOpen(false)}>Close</button></header>
              <ClassListTab coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} onBusyChange={setRosterBusy} onClose={() => setRosterOpen(false)} initialTab={rosterOpen === 'add' ? 'add' : undefined} />
            </PortalFormDialog>}
            {activeTab === 'logbook' && <LogbookTab key={selectedSection?.id} pendingStudentIds={overviewView === 'journals' ? location.state.pendingStudentIds : undefined} openJournals={overviewView === 'journals'} coordinatorId={coordinatorId} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'placements' && <CompanyPlacementsTab overviewView={overviewView} department={coordDept} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'companies' && <CompanyDirectoryTab readOnly={false} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'messages' && <MessagesTab key={selectedSection?.id} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'registrations' && <RegistrationsTab key={selectedSection?.id} department={coordDept} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'classlist' && <ClassListTab key={selectedSection?.id} coordinatorId={coordinatorId} department={coordDept} selectedSection={selectedSection} />}
            {activeTab === 'analytics' && <AnalyticsTab coordinatorId={coordinatorId} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} highlightStudentId={attendanceTarget && attendanceTarget.sectionId === selectedSection?.id ? attendanceTarget.studentId : null} />}
            {activeTab === 'notifications' && <NotificationsTab userId={coordinatorId} section={selectedSection} sections={termSections} onOpenAttendanceRisk={openAttendanceRisk} onSectionChange={fetchStudents} />}
            {activeTab === 'evaluations' && <EvaluationTab coordinatorId={coordinatorId} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
            {activeTab === 'clearance' && <ClearanceTab key={selectedSection?.id} initialFilter={overviewView === 'ready' ? 'ready' : 'all'} coordinatorId={coordinatorId} selectedSection={selectedSection} sections={termSections} onSectionChange={fetchStudents} />}
          </div>
        )}
      </main>
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
