// src/pages/CoordinatorDashboard.js
import { useEffect, useState, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import SectionsTab from './SectionsTab';
import LogbookTab from './LogbookTab';
import RegistrationsTab from './RegistrationsTab';
import ClassListTab from './ClassListTab';
import AnalyticsTab from './AnalyticsTab';
import NotificationsTab from './NotificationsTab';
import EvaluationTab from './EvaluationTab';
import ClearanceTab from './ClearanceTab';
import CompanyPlacementsTab from './CompanyPlacementsTab';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import MessagesTab from './MessagesTab';
import { collection, getDocs, doc, updateDoc, query, where, getDoc } from 'firebase/firestore';
import { adminDownload, adminRequest } from '../adminApi';
import PathwayLogo from '../components/PathwayLogo';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { setPageMetadata } from '../pageMetadata';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import { requirementProgress } from '../requirementProgress';
import { REQUIREMENT_CATEGORIES, requirementCategory } from '../requirementCategory';
import { downloadSectionExcel } from '../sectionExport';
import './RequirementsWorkspace.css';
import './CoordinatorProfile.css';

const PRE_OJT_IDS = ['application_form', 'updated_resume', 'medical_certificate', 'endorsement_letter', 'signed_moa'];

const STATUS_COLOR = {
  not_submitted: COLORS.rose100,
  submitted: COLORS.yellow100,
  approved: COLORS.emerald100,
  rejected: COLORS.rose100,
};

const STATUS_TEXT = {
  not_submitted: 'Not Submitted',
  submitted: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const COORDINATOR_TABS = ['requirements', 'sections', 'logbook', 'companies', 'placements', 'messages', 'classlist', 'registrations', 'analytics', 'notifications', 'evaluations', 'clearance', 'profile'];
const ACTIVE_TAB_STORAGE_KEY = 'pathway.coordinator.activeTab';
const SECTION_STORAGE_KEY = 'pathway.coordinator.sectionId';

function getSavedCoordinatorTab() {
  const savedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return COORDINATOR_TABS.includes(savedTab) ? savedTab : 'requirements';
}

export default function CoordinatorDashboard() {
  const [sections, setSections] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState(getSavedCoordinatorTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const coordinatorId = auth.currentUser ? auth.currentUser.uid : '';
  const [pendingRegistrations, setPendingRegistrations] = useState(0);
  const [rejectionModal, setRejectionModal] = useState(null); // { studentId, reqId }
  const [downloadingRequirement, setDownloadingRequirement] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [sectionRequirements, setSectionRequirements] = useState([]);
  const [coordDept, setCoordDept] = useState('');
  const [coordinatorProfile, setCoordinatorProfile] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

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

  const fetchInitialData = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    setError('');
    try {
      const snap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      const coordSnap = await getDoc(doc(db, 'users', coordinatorId));
      const coordinatorData = coordSnap.data() || {};
      setCoordinatorProfile({ id: coordinatorId, ...coordinatorData });
      setCoordDept(coordinatorData.department || '');
      const regSnap = await getDocs(query(collection(db, 'users'),
        where('role', '==', 'student'), where('department', '==', coordinatorData.department || ''),
        where('sectionId', '==', ''), where('accountApproved', '==', false)));
      setPendingRegistrations(regSnap.docs.filter(d => d.data().status !== 'rejected_registration').length);
    } catch (e) {
      console.error(e);
      setError('We could not load your coordinator workspace. Check your connection and try again.');
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
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const fetchStudents = async (section) => {
    setSelectedSection(section);
    window.localStorage.setItem(SECTION_STORAGE_KEY, section.id);
    setSelectedStudent(null);
    setError('');
    try {
      const [studentSnap, reqSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'),
          where('role', '==', 'student'),
          where('department', '==', section.department),
          where('sectionId', '==', section.id))),
        getDocs(collection(db, 'sections', section.id, 'requirements'))
      ]);
      setStudents(studentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const reqs = reqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      reqs.sort((a, b) => {
        return REQUIREMENT_CATEGORIES.indexOf(requirementCategory(a.category))
          - REQUIREMENT_CATEGORIES.indexOf(requirementCategory(b.category));
      });
      setSectionRequirements(reqs);
    } catch (e) {
      console.error(e);
      setError('We could not load this section. Please try again.');
    }
  };

  const handleRequirement = async (studentId, reqId, status, reason = '') => {
    setSaving(true);
    setError('');
    try {
      await adminRequest(`/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(reqId)}/decision`, {
        method: 'POST', body: JSON.stringify({ status, reason }),
      });

      const updated = students.map(s => {
        if (s.id !== studentId) return s;
        const reqs = { ...s.requirements };
        reqs[reqId] = { ...reqs[reqId], status, reviewedAt: new Date().toISOString(), rejectionReason: reason };
        const allPreApproved = PRE_OJT_IDS.every(id => reqs[id]?.status === 'approved');
        return { ...s, requirements: reqs, requirementsStatus: allPreApproved ? 'approved' : s.requirementsStatus };
      });
      setStudents(updated);

      const student = updated.find(s => s.id === studentId);
      setSelectedStudent(student);
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

  const pendingCount = students.filter(s => s.requirementsStatus === 'pending').length;
  const filteredSections = sections.filter(section => matchesCoordinatorSearch(searchQuery, section.name, section.department));
  const filteredStudents = students.filter(student => matchesCoordinatorSearch(
    searchQuery,
    student.firstName,
    student.lastName,
    student.idNumber,
    selectedSection?.name,
  ));

  const coordNavGroups = [
    {
      title: 'Workspace',
      items: [
        { id: 'requirements', icon: 'clipboard', label: 'Requirements', badge: pendingCount > 0 ? pendingCount : null, isWarning: true },
        { id: 'sections', icon: 'section', label: 'Sections' },
        { id: 'logbook', icon: 'book', label: 'Logbook' },
        { id: 'placements', icon: 'building', label: 'Company Placements' },
        { id: 'companies', icon: 'building', label: 'Company Directory' },
        { id: 'messages', icon: 'chat', label: 'Messages' },
        { id: 'evaluations', icon: 'star', label: 'Evaluations' },
        { id: 'clearance', icon: 'cap', label: 'Clearance' },
      ],
    },
    {
      title: 'Operations',
      items: [
        { id: 'classlist', icon: 'clipboard', label: 'Authorized Roster' },
        { id: 'registrations', icon: 'users', label: 'Registrations', badge: pendingRegistrations > 0 ? pendingRegistrations : null, isWarning: true },
        { id: 'analytics', icon: 'chart', label: 'Analytics' },
        { id: 'notifications', icon: 'bell', label: 'Notifications' },
      ],
    },
  ];

  return (
    <div style={s.page} className="coordinator-page">
      {/* Sidebar */}
      <aside className="sidebar-container" style={s.sidebar}>
        <div className="sidebar-brand" style={s.sidebarTop}>
          <div className="sidebar-logo-box" style={s.logoWrap}>
            <PathwayLogo style={s.logoImg} />
          </div>
          <div>
            <div className="sidebar-brand-title" style={s.appName}>PATHWAY</div>
            <div className="sidebar-brand-subtitle" style={s.appSub}>Coordinator Portal</div>
          </div>
        </div>

        {coordDept && (
          <div className="coordinator-department" style={s.deptPill}>
            <span style={s.deptText}>{coordDept}</span>
          </div>
        )}

        <nav className="sidebar-nav-scroll" style={s.nav} aria-label="Coordinator navigation">
          {coordNavGroups.map(group => (
            <div key={group.title} className="sidebar-group">
              {group.title && <div className="sidebar-group-title">{group.title}</div>}
              {group.items.map(item => (
                <button
                  type="button"
                  key={item.id}
                  className={activeTab === item.id ? 'sidebar-nav-btn sidebar-nav-btn-active' : 'sidebar-nav-btn'}
                  onClick={() => setActiveTab(item.id)}
                  aria-current={activeTab === item.id ? 'page' : undefined}
                >
                  <span className="sidebar-btn-left">
                    <Icon name={item.icon} size={16} />
                    <span className="sidebar-btn-text">{item.label}</span>
                  </span>
                  {typeof item.badge !== 'undefined' && item.badge !== null && (
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
              <span className="sidebar-user-name">{[coordinatorProfile?.firstName, coordinatorProfile?.lastName].filter(Boolean).join(' ') || auth.currentUser?.email || 'Coordinator'}</span>
              <span className="sidebar-user-role">Profile settings</span>
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
        <header style={s.topbar} className="topbar">
          <div style={s.topbarLeft} className="topbarLeft">
            <h1 style={s.pageTitle}>
              {activeTab === 'requirements' ? 'Requirements Approval' :
                activeTab === 'sections' ? 'Sections Management' :
                          activeTab === 'logbook' ? 'Student Logbook Review' :
                            activeTab === 'placements' ? 'Company Placements' :
                              activeTab === 'companies' ? 'Company Directory' :
                              activeTab === 'messages' ? 'Messages' :
                    activeTab === 'registrations' ? 'Student Registrations' :
                      activeTab === 'classlist' ? 'Authorized Class List' :
                        activeTab === 'analytics' ? 'OJT Analytics & Attendance' :
                          activeTab === 'notifications' ? 'Announcements & Alerts' :
                            activeTab === 'evaluations' ? 'Supervisor Evaluations' :
                              activeTab === 'clearance' ? 'Clearance Readiness' :
                                activeTab === 'profile' ? 'Coordinator Profile' : ''}
            </h1>
            {activeTab === 'requirements' && pendingCount > 0 && (
              <span style={s.pendingBadge}>
                {pendingCount} Pending Review
              </span>
            )}
            {activeTab !== 'profile' && (
              <label style={s.sectionPickerLabel} className="sectionPickerLabel">
                <span>Current section</span>
                <select aria-label="Current section" style={s.sectionPicker} className="sectionPicker" value={selectedSection?.id || ''} onChange={e => { const section = sections.find(item => item.id === e.target.value); if (section) fetchStudents(section); }}>
                  <option value="">Select a section</option>
                  {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {['requirements', 'sections'].includes(activeTab) && (
            <button
              type="button"
              className="section-export-button"
              onClick={exportSection}
              disabled={!selectedSection || loading || exporting}
              aria-busy={exporting}
              title={selectedSection ? `Download ${selectedSection.name} records as an Excel file` : 'Select a section to export'}
            >
              {exporting ? <span className="section-export-spinner" aria-hidden="true" /> : <Icon name="download" size={18} />}
              <span aria-live="polite">{exporting ? 'Exporting…' : 'Export Data'}</span>
            </button>
          )}
        </header>

        {error && !loading && (
          <div style={s.errorBanner} role="alert">
            <span>{error}</span>
            <button type="button" style={s.retryBtn} onClick={fetchInitialData}>
              <Icon name="refresh" size={14} /> Retry
            </button>
          </div>
        )}

        {loading ? (
          <PageSkeleton label="Loading coordinator data" variant="three-column" />
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
          <div style={s.contentWrapper}>
            {activeTab === 'requirements' && (
              <div className="requirements-workspace" style={s.threeCol}>
                {/* Column 1: Sections */}
                <div className="requirements-sections" style={s.col1}>
                  <div style={s.colHeader}>Sections <span className="requirements-count">{filteredSections.length}</span><p>Choose your class to get started.</p></div>
                  <div style={s.columnSearch}><CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search sections and students" /></div>
                  {filteredSections.length === 0 && (
                    <div style={s.empty}>{searchQuery ? 'No matching sections. Try another search.' : 'No sections yet. Create one in the Sections tab.'}</div>
                  )}
                  {filteredSections.map(sec => (
                    <button
                      type="button"
                      className="requirements-section-card"
                      aria-pressed={selectedSection?.id === sec.id}
                      key={sec.id}
                      style={{ ...s.secCard, ...(selectedSection?.id === sec.id ? s.secCardActive : {}) }}
                      onClick={() => fetchStudents(sec)}
                    >
                      <div style={s.secName}>{sec.name}</div>
                      <div style={s.secInfo}>{sec.department}</div>
                    </button>
                  ))}
                </div>

                {/* Column 2: Students */}
                <div className="requirements-students" style={s.col2}>
                  <div style={s.colHeader}>
                    Students <span className="requirements-count">{filteredStudents.length}</span>
                    <p>{selectedSection?.name || 'Select a section to see its students.'}</p>
                  </div>
                  {!selectedSection && (
                    <div style={s.empty}>Select a section from the left list.</div>
                  )}
                  {selectedSection && filteredStudents.length === 0 && (
                    <div style={s.empty}>{searchQuery ? 'No matching students. Try another search.' : 'No students enrolled in this section.'}</div>
                  )}
                  {filteredStudents.map(student => {
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
                        <div className="student-card-name">
                          <strong>{student.firstName} {student.lastName}</strong>
                          <span>ID {student.idNumber || 'not provided'}</span>
                        </div>
                        {selectedStudent?.id === student.id && (
                          <strong className={`student-card-percentage${progress.percentage === 100 ? ' is-complete' : ''}`}>{progress.percentage}%</strong>
                        )}
                      </div>
                      {selectedStudent?.id === student.id && (
                      <div className="student-card-progress">
                        <div className="student-card-progress-caption">{progress.total ? `${progress.approved} of ${progress.total} requirements approved` : 'No requirements configured'}</div>
                      </div>
                      )}
                    </button>
                    );
                  })}
                </div>

                {/* Column 3: Requirements */}
                <div className="requirements-detail" style={s.col3}>
                  <div style={s.colHeader}>
                    {selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : 'Document review'}
                    <p>{selectedStudent ? `Student ID ${selectedStudent.idNumber || 'not provided'} — Review submitted requirements below.` : 'Attachments, decisions, and feedback in one place.'}</p>
                  </div>
                  {!selectedStudent ? (
                    <div style={s.requirementsScroll}>
                      {sectionRequirements.length === 0 && <div style={s.emptyStatePanel}><Icon name="clipboard" size={28} /><h3 style={s.emptyTitle}>No requirements configured</h3><p style={s.emptySub}>Add a checklist for this section in the Sections screen.</p></div>}
                      <div style={s.emptyStatePanel}>
                        <div style={s.emptyIcon}><Icon name="clipboard" size={28} label="Requirements" /></div>
                        <h3 style={s.emptyTitle}>Select a Student</h3>
                        <p style={s.emptySub}>Choose a student from the list to review documents, attachments, and approvals.</p>
                      </div>
                    </div>
                  ) : (
                    <div style={s.requirementsScroll}>
                      {sectionRequirements.length === 0 && <div style={s.emptyStatePanel}><Icon name="clipboard" size={28} /><h3 style={s.emptyTitle}>No requirements configured</h3><p style={s.emptySub}>Add a checklist for this section in the Sections screen.</p></div>}
                      {REQUIREMENT_CATEGORIES.map(cat => {
                        const catReqs = sectionRequirements.filter(r => requirementCategory(r.category) === cat);
                        if (catReqs.length === 0) return null;
                        return (
                          <div key={cat} style={s.reqGroup}>
                            <div style={s.reqGroupLabel}>{cat} Requirements</div>
                            <div style={s.reqCardsList}>
                              {catReqs.map(({ id, label, deadline }) => {
                                const req = selectedStudent.requirements?.[id];
                                const status = req?.status || 'not_submitted';
                                const isOverdue = deadline && new Date(deadline) < new Date() && status !== 'approved';
                                return (
                                  <div className="requirements-document" key={id} style={s.reqRow}>
                                    <div style={s.reqLeft}>
                                      <div className="requirements-document-icon"><Icon name="clipboard" size={18} /></div>
                                      <div>
                                        <div style={s.reqLabel}>{label}</div>
                                        {deadline && (
                                          <div style={{ fontSize: 11, color: isOverdue ? COLORS.rose700 : '#000000', fontWeight: isOverdue ? 800 : 600, marginTop: 2 }}>
                                            <><Icon name="calendar" size={12} /> Deadline: {new Date(deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                            {isOverdue ? ' (OVERDUE)' : ''}
                                          </div>
                                        )}
                                        {req?.submittedAt && (
                                          <div style={{ fontSize: 11, color: '#000000', marginTop: 3 }}>
                                            Submitted: {new Date(req.submittedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </div>
                                        )}
                                        {req?.reviewedAt && (
                                          <div style={{ fontSize: 11, color: '#000000' }}>
                                            {status === 'approved' ? 'Approved' : 'Rejected'}: {new Date(req.reviewedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </div>
                                        )}
                                        {status === 'rejected' && req?.rejectionReason && (
                                          <div style={s.rejectionAlert}>
                                            <strong style={{ color: '#000000' }}>Reason:</strong> <span style={{ color: '#000000' }}>{req.rejectionReason}</span>
                                          </div>
                                        )}
                                        {req?.cloudinaryDeliveryType === 'authenticated' && req?.cloudinaryAssetId ? (
                                          <button
                                            type="button"
                                            disabled={downloadingRequirement === `${selectedStudent.id}:${id}`}
                                            onClick={() => handleDownloadRequirement(selectedStudent.id, id, req.fileName)}
                                            title={req.fileName || 'Signed endorsement letter'}
                                            aria-label={`Download private copy: ${req.fileName || 'signed endorsement letter'}`}
                                            style={{ border: 0, background: 'transparent', color: COLORS.sky700, padding: '4px 0', marginTop: 4, fontWeight: 700, cursor: downloadingRequirement === `${selectedStudent.id}:${id}` ? 'wait' : 'pointer' }}
                                          >
                                            <><Icon name="paperclip" size={13} /> {downloadingRequirement === `${selectedStudent.id}:${id}` ? 'Downloading protected copy…' : 'Download private copy'}</>
                                          </button>
                                        ) : req?.fileUrl && (
                                          <a
                                            href={req.fileUrl + '?fl_attachment=true'}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={s.fileLink}
                                          >
                                            <><Icon name="paperclip" size={13} /> View / Download {req.fileName || 'Attachment'}</>
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                    <div style={s.reqRight}>
                                      <span style={{
                                        ...s.statusBadge,
                                        backgroundColor: STATUS_COLOR[status],
                                        color: '#000000',
                                        border: `1px solid ${COLORS.slate300}`,
                                      }}>
                                        {STATUS_TEXT[status]}
                                      </span>
                                      {status === 'submitted' && (
                                        <div style={s.actionBtns}>
                                          <button
                                            style={s.approveBtn}
                                            disabled={saving}
                                            onClick={() => handleRequirement(selectedStudent.id, id, 'approved')}
                                          >
                                            <Icon name="check" size={14} />
                                            Approve
                                          </button>
                                          <button
                                            style={s.rejectBtn}
                                            disabled={saving}
                                            onClick={() => {
                                              setRejectionModal({ studentId: selectedStudent.id, reqId: id });
                                              setRejectionReason('');
                                            }}
                                          >
                                            <Icon name="x" size={14} />
                                            Reject
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      <AlertDialog
                        open={Boolean(rejectionModal)}
                        title="Reject requirement submission?"
                        description="Specify the correction the student needs before resubmitting this requirement."
                        confirmLabel="Confirm rejection"
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
            {activeTab === 'sections' && <SectionsTab coordinatorId={coordinatorId} selectedSection={selectedSection} onSectionChange={fetchStudents} />}
            {activeTab === 'logbook' && <LogbookTab coordinatorId={coordinatorId} selectedSection={selectedSection} onSectionChange={fetchStudents} />}
            {activeTab === 'placements' && <CompanyPlacementsTab department={coordDept} selectedSection={selectedSection} students={students} />}
            {activeTab === 'companies' && <CompanyDirectoryTab readOnly={false} />}
            {activeTab === 'messages' && <MessagesTab sections={sections} selectedSection={selectedSection} onSectionChange={fetchStudents} />}
            {activeTab === 'registrations' && <RegistrationsTab coordinatorId={coordinatorId} department={coordDept} sections={sections} />}
            {activeTab === 'classlist' && <ClassListTab coordinatorId={coordinatorId} department={coordDept} />}
            {activeTab === 'analytics' && <AnalyticsTab coordinatorId={coordinatorId} selectedSection={selectedSection} />}
            {activeTab === 'notifications' && <NotificationsTab userId={coordinatorId} />}
            {activeTab === 'evaluations' && <EvaluationTab coordinatorId={coordinatorId} selectedSection={selectedSection} />}
            {activeTab === 'clearance' && <ClearanceTab coordinatorId={coordinatorId} selectedSection={selectedSection} />}
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
            <label htmlFor="coordinator-first-name" className="admin-profile-label">First Name</label>
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
            <label htmlFor="coordinator-last-name" className="admin-profile-label">Last Name</label>
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
            <label htmlFor="coordinator-email" className="admin-profile-label">Email Address (Read-Only)</label>
            <input
              id="coordinator-email"
              className="admin-profile-input admin-profile-input-readonly"
              value={auth.currentUser?.email || ''}
              disabled
              title="Email is managed by authentication service"
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-department" className="admin-profile-label">Assigned Department (Read-Only)</label>
            <input
              id="coordinator-department"
              className="admin-profile-input admin-profile-input-readonly"
              value={departmentName}
              disabled
              title="Department assignments are managed by System Administrator"
            />
          </div>

          <div className="admin-profile-field">
            <label htmlFor="coordinator-phone" className="admin-profile-label">Phone Number (Optional)</label>
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
              Your workspace
            </div>
            <div className="admin-profile-card-subtitle">
              Summary of assigned department, sections, and operational permissions.
            </div>
          </div>
        </div>

        <div className="admin-profile-security-grid">
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Assigned College / Dept</span>
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
