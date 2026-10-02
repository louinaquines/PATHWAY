// src/pages/AdminDashboard.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import SystemSettingsTab from './SystemSettingsTab';
import AcademicTermsTab from './AcademicTermsTab';
import AuditLogsTab from './AuditLogsTab';
import CompanyDirectoryTab from './CompanyDirectoryTab';
import { adminRequest } from '../adminApi';
import PathwayLogo from '../components/PathwayLogo';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import { PageSkeleton } from '../components/LoadingSkeleton';
import { setPageMetadata } from '../pageMetadata';
import {
  BarChart, Bar, CartesianGrid, Cell, Legend, Pie, PieChart,
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [dashboardRange, setDashboardRange] = useState('last30');
  const [dashboardPeriod, setDashboardPeriod] = useState('month');
  const [dashboardSearchOpen, setDashboardSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [userSnap, secSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'sections')),
      ]);
      setUsers(userSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSections(secSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    setPageMetadata('admin', 'admin');
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleToggleAccount = async (userId, currentStatus) => {
    setSaving(true);
    try {
      await adminRequest(`/admin/students/${encodeURIComponent(userId)}/account-status`, {
        method: 'PATCH',
        body: JSON.stringify({ accountApproved: !currentStatus }),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, accountApproved: !currentStatus } : u));
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const students = users.filter(u => u.role === 'student');
  const coordinators = users.filter(u => u.role === 'coordinator');
  const pending = students.filter(u => !u.accountApproved && u.status !== 'rejected_registration');
  const active = students.filter(u => u.accountApproved);
  const dashboardScopedStudents = students.filter(student => isWithinDashboardRange(student, dashboardRange));
  const notificationItems = [
    ...pending.slice(0, 3).map(student => ({
      key: `pending-${student.id}`,
      icon: 'user',
      title: `New registration from ${`${student.firstName || ''} ${student.lastName || ''}`.trim() || 'a student'}`,
      detail: 'Student account needs approval',
      time: 'Needs review',
      action: () => { setNotificationOpen(false); setActiveTab('students'); },
    })),
    ...(sections.length > 0 ? [{
      key: 'sections-monitored',
      icon: 'section',
      title: `${sections.length} active section${sections.length === 1 ? '' : 's'} monitored`,
      detail: 'Current section records are available',
      time: 'Current',
      action: () => { setNotificationOpen(false); setActiveTab('sections'); },
    }] : []),
  ].slice(0, 4);

  const totalHours = students.reduce((sum, s) => sum + (s.hoursRendered || 0), 0);
  const avgHours = students.length > 0 ? (totalHours / students.length).toFixed(1) : 0;
  const departmentData = getDepartmentData(dashboardScopedStudents);
  const accountStatusData = getAccountStatusData(dashboardScopedStudents);
  const registrationData = getRegistrationData(dashboardScopedStudents, dashboardPeriod);
  const normalizedDashboardSearch = normalizeSearchValue(dashboardSearch);
  const dashboardStudentSearchPool = normalizedDashboardSearch ? students : dashboardScopedStudents;
  const searchableDashboardStudents = dashboardStudentSearchPool.map(student => ({
    student,
    section: sections.find(section => section.id === student.sectionId),
  }));
  const filteredDashboardStudents = searchableDashboardStudents
    .filter(({ student, section }) => normalizeSearchValue(
      `${student.firstName || ''} ${student.lastName || ''} ${student.email || ''} ${student.idNumber || ''} ${student.department || ''} ${section?.name || ''}`
    ).includes(normalizedDashboardSearch))
    .map(({ student }) => student);

  const dashboardSuggestions = normalizedDashboardSearch ? [
    ...students
      .filter(student => normalizeSearchValue(
        `${student.firstName || ''} ${student.lastName || ''} ${student.email || ''} ${student.idNumber || ''} ${student.department || ''}`
      ).includes(normalizedDashboardSearch))
      .slice(0, 5)
      .map(student => ({
        key: `student-${student.id}`,
        type: 'Student',
        targetTab: 'students',
        title: `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed student',
        detail: [student.idNumber, student.email].filter(Boolean).join(' · '),
        value: `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.idNumber || student.email || '',
        icon: 'user',
      })),
    ...sections
      .filter(section => normalizeSearchValue(`${section.name || ''} ${section.department || ''}`).includes(normalizedDashboardSearch))
      .slice(0, 3)
      .map(section => ({
        key: `section-${section.id}`,
        type: 'Section',
        targetTab: 'sections',
        title: section.name || 'Unnamed section',
        detail: section.department || 'Assigned section',
        value: section.name || '',
        icon: 'section',
      })),
  ] : [];

  const applyDashboardSuggestion = suggestion => {
    setDashboardSearch(suggestion.value);
    setDashboardSearchOpen(false);
    if (suggestion.targetTab) setActiveTab(suggestion.targetTab);
  };

  const exportDashboard = () => {
    const header = ['Name', 'Student ID', 'Email', 'Department', 'Account Status', 'Registered'];
    const rows = students.map(student => [
      `${student.firstName || ''} ${student.lastName || ''}`.trim(),
      student.idNumber || '',
      student.email || '',
      student.department || '',
      student.accountApproved ? 'Active' : 'Pending',
      student.createdAt ? new Date(student.createdAt).toLocaleDateString('en-PH') : '',
    ]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `pathway-admin-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const adminNavGroups = [
    {
      title: 'Overview',
      items: [
        { id: 'overview', icon: 'grid', label: 'System Overview' },
      ],
    },
    {
      title: 'Directory & Accounts',
      items: [
        { id: 'students', icon: 'cap', label: 'Students', badge: students.length },
        { id: 'coordinators', icon: 'userCheck', label: 'Coordinators', badge: coordinators.length },
        { id: 'sections', icon: 'section', label: 'Sections', badge: sections.length },
        { id: 'companies', icon: 'building', label: 'Companies' },
        { id: 'create', icon: 'userPlus', label: 'Create Coordinator' },
      ],
    },
    {
      title: 'System & Security',
      items: [
        { id: 'terms', icon: 'calendar', label: 'Academic Terms' },
        { id: 'settings', icon: 'settings', label: 'System Settings' },
        { id: 'audit', icon: 'shield', label: 'Audit Logs' },
      ],
    },
  ];

  return (
    <div style={s.page} className="admin-page">
      {/* Sidebar */}
      <aside className="sidebar-container" style={s.sidebar}>
        <div className="sidebar-brand" style={s.sidebarTop}>
          <div className="sidebar-logo-box" style={s.logoWrap}>
            <PathwayLogo style={s.logoImg} />
          </div>
          <div>
            <div className="sidebar-brand-title" style={s.appName}>PATHWAY</div>
            <div className="sidebar-brand-subtitle" style={s.appSub}>System Admin Portal</div>
          </div>
        </div>

        <nav className="sidebar-nav-scroll" style={s.nav} aria-label="Admin navigation">
          {adminNavGroups.map(group => (
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
                    <span className="sidebar-badge">{item.badge}</span>
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
            title="Manage Admin Profile"
            aria-label="Admin Profile Settings"
          >
            <div className="sidebar-user-avatar">
              <Icon name="user" size={17} label="Admin profile" />
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{auth.currentUser?.email || 'Administrator'}</span>
              <span className="sidebar-user-role">System Admin</span>
            </div>
            <Icon name="chevronRight" size={14} className="sidebar-user-chevron" />
          </button>
          <button type="button" className="sidebar-logout-btn" onClick={handleLogout}>
            <Icon name="logout" size={15} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={s.main}>
        <header style={s.topbar}>
          <div style={s.topbarLeft}>
            <h1 style={s.pageTitle}>
              {activeTab === 'overview' ? 'System Overview & Health' :
                activeTab === 'students' ? 'Student Account Directory' :
                    activeTab === 'coordinators' ? 'Coordinator Management' :
                    activeTab === 'companies' ? 'Company Directory & Capacity' :
                    activeTab === 'create' ? 'Create Coordinator Account' :
                      activeTab === 'terms' ? 'Academic Terms & Periods' :
                        activeTab === 'settings' ? 'Global System Configuration' :
                          activeTab === 'audit' ? 'Security & System Audit Logs' :
                            activeTab === 'notifications' ? 'Recent Notifications' :
                              activeTab === 'profile' ? 'Admin Profile' :
                                'Section Records Overview'}
            </h1>
          </div>
          {activeTab === 'overview' && (
            <div style={s.headerActions}>
              <div style={s.headerPopoverAnchor}>
                <button type="button" style={s.toolbarIconBtn} aria-label="Notifications" onClick={() => { setNotificationOpen(value => !value); setProfileOpen(false); }}>
                  <Icon name="bell" size={16} />
                  {pending.length > 0 && !notificationsRead && <span style={s.toolbarBadge}>{pending.length}</span>}
                </button>
                {notificationOpen && (
                  <div style={s.headerPopover} className="admin-notification-popover">
                    <div style={s.notificationHeader}>
                      <strong style={s.popoverTitle}>Notifications</strong>
                      <button type="button" style={s.markReadBtn} onClick={() => setNotificationsRead(true)}>
                        <Icon name="check" size={15} />
                        Mark all as read
                      </button>
                    </div>
                    <div style={s.notificationList}>
                      {notificationItems.length > 0 ? notificationItems.map(item => (
                        <button type="button" key={item.key} style={s.notificationItem} onClick={item.action}>
                          <span style={s.notificationIcon}><Icon name={item.icon} size={15} /></span>
                          <span style={s.notificationCopy}>
                            <strong>{item.title}</strong>
                            <span>{item.detail}</span>
                            <small>{item.time}</small>
                          </span>
                        </button>
                      )) : (
                        <div style={s.notificationEmpty}>No new notifications.</div>
                      )}
                    </div>
                    <button type="button" style={s.notificationShowAll} onClick={() => { setNotificationOpen(false); setActiveTab('notifications'); }}>Show all</button>
                  </div>
                )}
              </div>
              <div style={s.headerPopoverAnchor}>
                <button type="button" style={s.toolbarProfileBtn} onClick={() => { setProfileOpen(value => !value); setNotificationOpen(false); }}>
                  <span style={s.profileAvatar}><Icon name="user" size={15} label="Admin profile" /></span>
                  <span style={s.profileName}>Admin</span>
                  <Icon name="chevronRight" size={13} />
                </button>
                {profileOpen && (
                  <div style={s.profileDropdown} className="admin-profile-dropdown">
                    <div style={s.profileDropdownAccount}>
                      <span style={s.profileDropdownAvatar}><Icon name="user" size={20} /></span>
                      <span style={s.profileDropdownAccountCopy}>
                        <strong>{auth.currentUser?.displayName || 'Administrator'}</strong>
                        <small>{auth.currentUser?.email || 'Signed-in admin'}</small>
                      </span>
                    </div>
                    <button type="button" className="admin-profile-dropdown-row" style={s.profileDropdownRow} onClick={() => { setProfileOpen(false); setActiveTab('profile'); }}>
                      <Icon name="user" size={18} />
                      <span>Manage profile</span>
                      <Icon name="chevronRight" size={15} className="sidebar-user-chevron" />
                    </button>
                    <button type="button" className="admin-profile-dropdown-row" style={s.profileDropdownRow} onClick={handleLogout}>
                      <Icon name="logout" size={18} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {!loading && activeTab === 'overview' && (
          <div style={s.dashboardToolbar} className="admin-dashboard-toolbar">
            <div style={s.dashboardSearchWrap}>
              <label style={s.dashboardSearch} className="dashboardSearch">
                <Icon name="search" size={15} />
                <span className="sr-only">Search dashboard records</span>
                <input
                  type="search"
                  placeholder="Search students, sections, or coordinators..."
                  value={dashboardSearch}
                  onFocus={() => setDashboardSearchOpen(true)}
                  onKeyDown={event => {
                    if (event.key === 'Escape') setDashboardSearchOpen(false);
                    if (event.key === 'Enter' && dashboardSuggestions[0]) {
                      applyDashboardSuggestion(dashboardSuggestions[0]);
                    }
                  }}
                  onChange={event => { setDashboardSearch(event.target.value); setDashboardSearchOpen(true); }}
                />
                {dashboardSearch && (
                  <button type="button" style={s.dashboardSearchClear} aria-label="Clear dashboard search" onClick={() => { setDashboardSearch(''); setDashboardSearchOpen(false); }}>
                    <Icon name="x" size={14} />
                  </button>
                )}
                {!dashboardSearch && <kbd style={s.searchShortcut}>⌘ K</kbd>}
              </label>
              {dashboardSearchOpen && normalizedDashboardSearch && (
                <div style={s.dashboardSearchSuggestions} role="listbox" aria-label="Related search results">
                  {dashboardSuggestions.length > 0 ? dashboardSuggestions.map(suggestion => (
                    <button
                      type="button"
                      key={suggestion.key}
                      style={s.dashboardSuggestion}
                      role="option"
                      aria-selected="false"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => applyDashboardSuggestion(suggestion)}
                    >
                      <span style={s.dashboardSuggestionIcon}><Icon name={suggestion.icon} size={14} /></span>
                      <span style={s.dashboardSuggestionText}>
                        <strong>{suggestion.title}</strong>
                        <small>{suggestion.type}{suggestion.detail ? ` · ${suggestion.detail}` : ''}</small>
                      </span>
                    </button>
                  )) : (
                    <div style={s.dashboardSuggestionEmpty}>No related records found.</div>
                  )}
                </div>
              )}
            </div>
            <div style={s.dashboardTools} className="dashboardTools">
              <label style={s.dashboardSelect}>
                <Icon name="calendar" size={14} />
                <span className="sr-only">Date range</span>
                <select value={dashboardRange} onChange={event => setDashboardRange(event.target.value)}>
                  <option value="last7">Last 7 days</option>
                  <option value="last30">Last 30 days</option>
                  <option value="last90">Last 90 days</option>
                  <option value="thisYear">This year</option>
                </select>
              </label>
              <label style={s.dashboardSelect}>
                <Icon name="filter" size={14} />
                <span className="sr-only">Chart grouping</span>
                <select value={dashboardPeriod} onChange={event => setDashboardPeriod(event.target.value)}>
                  <option value="day">Days</option>
                  <option value="month">Months</option>
                  <option value="year">Years</option>
                </select>
              </label>
              <button type="button" style={s.exportBtn} onClick={exportDashboard}>
                <Icon name="download" size={14} /> Export
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <PageSkeleton label="Loading admin management data" variant="dashboard" />
        ) : (
          <div style={s.content}>
            {/* OVERVIEW */}
            {activeTab === 'overview' && (
              <div style={s.overviewGrid}>
                <div className="admin-overview-metrics-wrap">
                  {/* Featured Hero Stat Cards */}
                  <div className="admin-featured-stats-grid">
                    <FeaturedStatCard
                      label="Active Students"
                      value={active.length}
                      icon="users"
                      badge="Verified & Active"
                      subtitle="Students actively verified and monitored in OJT"
                      variant="emerald"
                    />
                    <FeaturedStatCard
                      label="Active Sections"
                      value={sections.length}
                      icon="section"
                      badge="Monitored Cohorts"
                      subtitle="Class sections currently active and supervised"
                      variant="sky"
                    />
                  </div>

                  {/* Supporting 4 Stat Cards */}
                  <div className="admin-supporting-stats-grid">
                    <StatCard label="Total Students" value={students.length} accent="sky" icon="users" subtitle="Total enrolled records" />
                    <StatCard label="Pending Approval" value={pending.length} accent="yellow" icon="clock" subtitle={pending.length > 0 ? `${pending.length} pending review` : 'All accounts verified'} />
                    <StatCard label="OJT Coordinators" value={coordinators.length} accent="slate" icon="userCheck" subtitle="Assigned faculty" />
                    <StatCard label="Avg Rendered Hours" value={`${avgHours} hrs`} accent="yellow" icon="chart" subtitle="Across students" />
                  </div>
                </div>

                <AdminCharts
                  departmentData={departmentData}
                  accountStatusData={accountStatusData}
                  registrationData={registrationData}
                />

                <div style={s.fullWidth}>
                  <div style={s.cardHeader}>
                    <h2 style={s.subTitle}>Recent Student Registrations</h2>
                    <span style={s.countBadge}>
                      {normalizedDashboardSearch ? `${filteredDashboardStudents.length} matching record(s)` : 'Showing latest 5 records'}
                    </span>
                  </div>
                  <UserTable
                    users={normalizedDashboardSearch ? filteredDashboardStudents : filteredDashboardStudents.slice(0, 5)}
                    saving={saving}
                    onToggle={handleToggleAccount}
                    showToggle
                  />
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <AdminNotificationsPage
                items={notificationItems}
                notificationsRead={notificationsRead}
                onMarkAllRead={() => setNotificationsRead(true)}
              />
            )}

            {/* STUDENTS */}
            {activeTab === 'students' && (
              <div style={s.tabContent}>
                <div style={s.tabHeader}>
                  <div>
                    <h2 style={s.subTitle}>All Enrolled Students ({students.length})</h2>
                    <p style={s.subText}>Manage student portal access, activation status, and view department assignments.</p>
                  </div>
                </div>
                <UserTable
                  users={students}
                  saving={saving}
                  onToggle={handleToggleAccount}
                  showToggle
                />
              </div>
            )}

            {/* COORDINATORS */}
            {activeTab === 'coordinators' && (
              <div style={s.tabContent}>
                <div style={s.tabHeader}>
                  <div>
                    <h2 style={s.subTitle}>OJT Department Coordinators ({coordinators.length})</h2>
                    <p style={s.subText}>Active faculty members authorized to review student requirements and logbooks.</p>
                  </div>
                  <button style={s.addCoordinatorBtn} onClick={() => setActiveTab('create')}>
                    + Create Coordinator
                  </button>
                </div>
                <UserTable
                  users={coordinators}
                  saving={saving}
                  onToggle={handleToggleAccount}
                  showToggle={false}
                />
              </div>
            )}

            {/* SECTIONS */}
            {activeTab === 'sections' && (
              <div style={s.tabContent}>
                <div style={s.tabHeader}>
                  <h2 style={s.subTitle}>All Department Sections ({sections.length})</h2>
                </div>
                <div style={s.tableWrap}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>Section Name</th>
                        <th style={s.th}>College / Department</th>
                        <th style={s.th}>Hours Required</th>
                        <th style={s.th}>Enrolled Students</th>
                        <th style={s.th}>Assigned Coordinator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sections.map((sec) => {
                        const coord = coordinators.find(c => c.id === sec.coordinatorId);
                        const secStudents = students.filter(st => st.sectionId === sec.id);
                        return (
                          <tr key={sec.id} style={s.tr}>
                            <td style={s.td}>
                              <strong style={{ color: '#000000' }}>{sec.name}</strong>
                            </td>
                            <td style={s.td}>{sec.department}</td>
                            <td style={s.td}>
                              <span style={s.hoursPill}>{sec.hoursRequired} hrs</span>
                            </td>
                            <td style={s.td}>
                              <strong>{secStudents.length}</strong> students
                            </td>
                            <td style={s.td}>
                              {coord ? `${coord.firstName} ${coord.lastName}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      {sections.length === 0 && (
                        <tr>
                          <td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#000000', padding: 32 }}>
                            No sections created yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'create' && <CreateCoordinatorTab onCreated={fetchAll} />}
            {activeTab === 'companies' && <CompanyDirectoryTab />}
            {activeTab === 'terms' && <AcademicTermsTab />}
            {activeTab === 'settings' && <SystemSettingsTab />}
            {activeTab === 'audit' && <AuditLogsTab />}
            {activeTab === 'profile' && <AdminProfileTab admin={users.find(user => user.id === auth.currentUser?.uid)} onSaved={fetchAll} />}
          </div>
        )}
      </main>
    </div>
  );
}

const DEPARTMENTS = [
  'College of Business and Accountancy',
  'College of Engineering',
  'College of Hospitality and Tourism Management',
  'College of Nursing',
  'College of Customs Administration',
  'College of Teacher Education',
  'College of Criminology',
  'College of Computer Studies',
];

function AdminProfileTab({ admin, onSaved }) {
  const authName = auth.currentUser?.displayName || '';
  const authNameParts = authName.trim().split(/\s+/).filter(Boolean);
  const authFirstName = authNameParts[0] || 'System';
  const authLastName = authNameParts.slice(1).join(' ') || 'Administrator';
  const [form, setForm] = useState({
    firstName: admin?.firstName || authFirstName,
    lastName: admin?.lastName || authLastName,
    department: admin?.department || 'System Administration',
    phone: admin?.phone || '',
  });
  const [status, setStatus] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      firstName: admin?.firstName || authFirstName,
      lastName: admin?.lastName || authLastName,
      department: admin?.department || 'System Administration',
      phone: admin?.phone || '',
    });
  }, [admin, authFirstName, authLastName]);

  const save = async event => {
    event.preventDefault();
    if (!auth.currentUser) return;
    setSaving(true);
    setStatus({ type: '', message: '' });
    try {
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        department: form.department,
        phone: form.phone.trim(),
        updatedAt: new Date().toISOString(),
      });
      setStatus({ type: 'success', message: 'Profile updated successfully!' });
      onSaved?.();
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Could not update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const displayName = [form.firstName, form.lastName].filter(Boolean).join(' ') || 'System Administrator';
  const initials = ((form.firstName?.[0] || '') + (form.lastName?.[0] || 'A')).toUpperCase().slice(0, 2);

  return (
    <div className="admin-profile-container">
      {/* Hero Banner */}
      <div className="admin-profile-hero">
        <div className="admin-profile-hero-left">
          <div className="admin-profile-hero-avatar-wrap">
            <div className="admin-profile-hero-avatar">
              {initials}
            </div>
            <div className="admin-profile-hero-badge-status" title="Account Active" />
          </div>
          <div className="admin-profile-hero-details">
            <h2>{displayName}</h2>
            <div className="admin-profile-hero-meta">
              <span className="admin-profile-tag admin-profile-tag-role">
                <Icon name="shield" size={13} />
                System Administrator
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

      {/* Alert banner if status exists */}
      {status.message && (
        <div className={status.type === 'error' ? 'admin-profile-alert admin-profile-alert-error' : 'admin-profile-alert admin-profile-alert-success'}>
          <Icon name={status.type === 'error' ? 'x' : 'check'} size={16} />
          <span>{status.message}</span>
        </div>
      )}

      {/* Form Card: Personal Details */}
      <form className="admin-profile-card" onSubmit={save}>
        <div className="admin-profile-card-header">
          <div>
            <div className="admin-profile-card-title">
              <Icon name="user" size={18} />
              Personal & Contact Information
            </div>
            <div className="admin-profile-card-subtitle">
              Manage your administrator name, department affiliation, and contact details.
            </div>
          </div>
        </div>

        <div className="admin-profile-grid">
          <div className="admin-profile-field">
            <label className="admin-profile-label">First Name</label>
            <input
              className="admin-profile-input"
              value={form.firstName}
              onChange={e => setForm({ ...form, firstName: e.target.value })}
              placeholder="e.g. John"
              required
            />
          </div>

          <div className="admin-profile-field">
            <label className="admin-profile-label">Last Name</label>
            <input
              className="admin-profile-input"
              value={form.lastName}
              onChange={e => setForm({ ...form, lastName: e.target.value })}
              placeholder="e.g. Doe"
              required
            />
          </div>

          <div className="admin-profile-field">
            <label className="admin-profile-label">Email Address (Read-Only)</label>
            <input
              className="admin-profile-input admin-profile-input-readonly"
              value={auth.currentUser?.email || ''}
              disabled
              title="Email address is managed by authentication service"
            />
          </div>

          <div className="admin-profile-field">
            <label className="admin-profile-label">Department / Office</label>
            <input
              className="admin-profile-input"
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="e.g. System Administration"
            />
          </div>

          <div className="admin-profile-field">
            <label className="admin-profile-label">Phone Number (Optional)</label>
            <input
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

      {/* Security & System Privileges Card */}
      <div className="admin-profile-card">
        <div className="admin-profile-card-header">
          <div>
            <div className="admin-profile-card-title">
              <Icon name="shield" size={18} />
              Security & System Privileges
            </div>
            <div className="admin-profile-card-subtitle">
              Overview of security tier and system access assigned to this account.
            </div>
          </div>
        </div>

        <div className="admin-profile-security-grid">
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Access Level</span>
            <span className="admin-profile-security-item-val" style={{ color: 'var(--sky-700)' }}>Full System Admin</span>
          </div>
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Authentication Provider</span>
            <span className="admin-profile-security-item-val">Firebase Auth (Password)</span>
          </div>
          <div className="admin-profile-security-item">
            <span className="admin-profile-security-item-label">Account UID</span>
            <span className="admin-profile-security-item-val" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {auth.currentUser?.uid ? `${auth.currentUser.uid.slice(0, 16)}...` : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>

      {/* Account deprovisioning requires coordinated Auth and Firestore cleanup. */}
      <div className="admin-profile-danger-card" role="note">
        <div className="admin-profile-danger-info">
          <h4>Administrator account removal</h4>
          <p>
            Account removal is disabled here to prevent orphaning the Firebase sign-in account. Contact the system owner for a coordinated account deprovisioning.
          </p>
        </div>
      </div>
    </div>
  );
}

function CreateCoordinatorTab({ onCreated }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', department: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3000';

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!form.firstName || !form.lastName || !form.email || !form.password || !form.department) {
      setError('All fields are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${BACKEND_URL}/create-coordinator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create account.');
        return;
      }
      setSuccess(`Coordinator account created successfully for ${form.firstName} ${form.lastName}!`);
      setForm({ firstName: '', lastName: '', email: '', password: '', department: '' });
      if (onCreated) onCreated();
    } catch (e) {
      setError('Could not reach backend server. Please verify the backend service is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.tabContent}>
      <h2 style={s.subTitle}>Create Coordinator Account</h2>
      <p style={s.subText}>
        Coordinators manage student requirements, approve registrations, and review logbooks for their specific department.
      </p>

      {error && <div style={s.errorBox}>{error}</div>}
      {success && <div style={s.successBox}>{success}</div>}

      <form onSubmit={handleCreate} style={s.createForm}>
        <div style={s.formRow}>
          <div style={s.formGroup}>
            <label style={s.label}>First Name</label>
            <input
              style={s.input}
              placeholder="Juan"
              value={form.firstName}
              onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
              disabled={loading}
              required
            />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>Last Name</label>
            <input
              style={s.input}
              placeholder="Dela Cruz"
              value={form.lastName}
              onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
              disabled={loading}
              required
            />
          </div>
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Email Address</label>
          <input
            style={s.input}
            type="email"
            placeholder="coordinator@uclm.edu.ph"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            disabled={loading}
            required
          />
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Initial Password (Min. 6 characters)</label>
          <input
            style={s.input}
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            disabled={loading}
            required
          />
        </div>

        <div style={s.formGroup}>
          <label style={s.label}>Assigned Department</label>
          <select
            style={s.select}
            value={form.department}
            onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
            disabled={loading}
            required
          >
            <option value="">Select college / department...</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <button
          style={{ ...s.createBtn, opacity: loading ? 0.7 : 1 }}
          disabled={loading}
        >
          {loading ? 'Creating Coordinator Account...' : 'Create Coordinator Account'}
        </button>
      </form>
    </div>
  );
}

function FeaturedStatCard({ label, value, icon, badge, subtitle, variant = 'emerald' }) {
  const isEmerald = variant === 'emerald';
  return (
    <div className={`admin-featured-stat-card ${isEmerald ? 'admin-featured-stat-emerald' : 'admin-featured-stat-sky'}`}>
      <div className="admin-featured-stat-header">
        <div className="admin-featured-stat-title-wrap">
          <span className="admin-featured-stat-label">{label}</span>
          {badge && (
            <span className="admin-featured-stat-badge">
              <Icon name="check" size={12} />
              {badge}
            </span>
          )}
        </div>
        <div className="admin-featured-stat-icon-wrap">
          <Icon name={icon} size={22} label={label} />
        </div>
      </div>
      <div className="admin-featured-stat-body">
        <div className="admin-featured-stat-value">{value}</div>
        {subtitle && <div className="admin-featured-stat-subtext">{subtitle}</div>}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, icon, subtitle }) {
  const themes = {
    sky: { bg: COLORS.sky50, color: COLORS.sky700 },
    yellow: { bg: COLORS.amber50, color: COLORS.amber700 },
    emerald: { bg: COLORS.emerald50, color: COLORS.emerald700 },
    slate: { bg: COLORS.slate100, color: COLORS.slate700 },
  };
  const current = themes[accent] || themes.sky;

  const displaySubtitle = subtitle || (
    label === 'Pending Approval' ? (value > 0 ? 'Needs review' : 'All clear') :
      label === 'Avg Rendered Hours' ? 'Across students' :
        'Current records'
  );

  return (
    <div className="admin-regular-stat-card">
      <div className="admin-regular-stat-header">
        <span className="admin-regular-stat-label">{label}</span>
        <div className="admin-regular-stat-icon" style={{ backgroundColor: current.bg, color: current.color }}>
          <Icon name={icon} size={15} label={label} />
        </div>
      </div>
      <div>
        <div className="admin-regular-stat-value">{value}</div>
        <div className="admin-regular-stat-footer">{displaySubtitle}</div>
      </div>
    </div>
  );
}

function AdminNotificationsPage({ items, notificationsRead, onMarkAllRead }) {
  return (
    <div style={s.notificationsPage}>
      <div style={s.notificationsPageHeader}>
        <div>
          <h2 style={s.subTitle}>Recent Notifications</h2>
          <p style={s.subText}>Review recent account and section activity across the admin workspace.</p>
        </div>
        <button type="button" style={s.markReadBtn} onClick={onMarkAllRead}>
          <Icon name="check" size={15} />
          {notificationsRead ? 'All notifications read' : 'Mark all as read'}
        </button>
      </div>
      <div style={s.notificationsPageCard}>
        {items.length > 0 ? items.map(item => (
          <button type="button" key={item.key} style={s.notificationsPageItem} onClick={item.action}>
            <span style={s.notificationIcon}><Icon name={item.icon} size={17} /></span>
            <span style={s.notificationCopy}>
              <strong>{item.title}</strong>
              <span>{item.detail}</span>
              <small>{item.time}</small>
            </span>
            <Icon name="chevronRight" size={16} className="sidebar-user-chevron" />
          </button>
        )) : (
          <div style={s.notificationEmpty}>No recent notifications.</div>
        )}
      </div>
    </div>
  );
}

function normalizeSearchValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getDepartmentData(students) {
  const counts = students.reduce((result, student) => {
    const department = student.department || 'Unassigned';
    result[department] = (result[department] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts)
    .map(([department, students]) => ({ department, students }))
    .sort((a, b) => b.students - a.students);
}

function isWithinDashboardRange(student, range) {
  if (!student.createdAt || range === 'thisYear') {
    if (range !== 'thisYear' || !student.createdAt) return range !== 'thisYear';
  }
  const createdAt = new Date(student.createdAt);
  if (Number.isNaN(createdAt.getTime())) return true;
  const now = new Date();
  if (range === 'thisYear') return createdAt.getFullYear() === now.getFullYear();
  const days = range === 'last7' ? 7 : range === 'last90' ? 90 : 30;
  return createdAt >= new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function getAccountStatusData(students) {
  return [
    { name: 'Active', value: students.filter(student => student.accountApproved).length, color: COLORS.emerald600 },
    { name: 'Pending', value: students.filter(student => !student.accountApproved && student.status !== 'rejected_registration').length, color: COLORS.yellow500 },
    { name: 'Rejected', value: students.filter(student => student.status === 'rejected_registration').length, color: COLORS.rose600 },
  ].filter(item => item.value > 0);
}

function getRegistrationData(students, period = 'month') {
  const months = [];
  const today = new Date();
  const count = period === 'day' ? 7 : period === 'year' ? 5 : 6;
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = period === 'day'
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset)
      : period === 'year'
        ? new Date(today.getFullYear() - offset, 0, 1)
        : new Date(today.getFullYear(), today.getMonth() - offset, 1);
    months.push({
      key: period === 'day' ? date.toISOString().slice(0, 10) : period === 'year' ? `${date.getFullYear()}` : `${date.getFullYear()}-${date.getMonth()}`,
      month: period === 'day'
        ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
        : period === 'year' ? String(date.getFullYear()) : date.toLocaleDateString('en-PH', { month: 'short' }),
      registrations: 0,
    });
  }

  const monthMap = new Map(months.map(month => [month.key, month]));
  students.forEach(student => {
    if (!student.createdAt) return;
    const date = new Date(student.createdAt);
    if (Number.isNaN(date.getTime())) return;
    const key = period === 'day' ? date.toISOString().slice(0, 10) : period === 'year' ? `${date.getFullYear()}` : `${date.getFullYear()}-${date.getMonth()}`;
    const month = monthMap.get(key);
    if (month) month.registrations += 1;
  });
  return months;
}

function AdminCharts({ departmentData, accountStatusData, registrationData }) {
  const hasStudents = departmentData.length > 0;
  const hasAccounts = accountStatusData.length > 0;
  const [expandedChart, setExpandedChart] = useState(null);

  useEffect(() => {
    if (!expandedChart) return undefined;
    const handleKeyDown = event => {
      if (event.key === 'Escape') setExpandedChart(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expandedChart]);

  const chartTitles = {
    department: 'Students by Department',
    accounts: 'Account Status',
    registration: 'Registration Trend',
  };

  const renderChart = (type, expanded = false) => {
    const chartBox = expanded ? s.chartModalBox : s.chartBox;
    if (type === 'department') {
      if (!hasStudents) return <ChartEmpty message="No student records yet." />;
      return (
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={departmentData} margin={{ top: 12, right: 18, left: expanded ? 0 : -16, bottom: expanded ? 48 : 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.slate200} />
              <XAxis dataKey="department" angle={expanded ? -18 : -25} textAnchor="end" interval={0} height={expanded ? 72 : 58} tick={{ fontSize: expanded ? 12 : 10, fill: COLORS.slate700 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: COLORS.slate700 }} />
              <Tooltip />
              <Bar dataKey="students" name="Students" fill={COLORS.sky600} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (type === 'accounts') {
      if (!hasAccounts) return <ChartEmpty message="No account statuses yet." />;
      return (
        <div style={chartBox}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={accountStatusData} dataKey="value" nameKey="name" cx="50%" cy="46%" innerRadius={expanded ? 100 : 58} outerRadius={expanded ? 160 : 88} paddingAngle={3}>
                {accountStatusData.map(item => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={expanded ? 42 : 28} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return (
      <div style={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={registrationData} margin={{ top: 12, right: 18, left: expanded ? 0 : -16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.slate200} />
            <XAxis dataKey="month" tick={{ fontSize: expanded ? 13 : 11, fill: COLORS.slate700 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: COLORS.slate700 }} />
            <Tooltip />
            <Line type="monotone" dataKey="registrations" name="Registrations" stroke={COLORS.sky600} strokeWidth={expanded ? 4 : 3} dot={{ r: expanded ? 5 : 4, fill: COLORS.sky600 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const chartCardProps = type => ({
    role: 'button',
    tabIndex: 0,
    className: 'admin-chart-card',
    onClick: () => setExpandedChart(type),
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setExpandedChart(type);
      }
    },
    'aria-label': `Expand ${chartTitles[type]} chart`,
  });

  return (
    <div style={s.chartGrid}>
      <div {...chartCardProps('department')} style={s.chartCard}>
        <div style={s.chartHeading}>
          <h2 style={s.subTitle}>Students by Department</h2>
          <span className="admin-chart-caption" style={s.chartCaption}>Current student records <Icon name="expand" size={14} /></span>
        </div>
        {renderChart('department')}
      </div>

      <div {...chartCardProps('accounts')} style={s.chartCard}>
        <div style={s.chartHeading}>
          <h2 style={s.subTitle}>Account Status</h2>
          <span className="admin-chart-caption" style={s.chartCaption}>Student access overview <Icon name="expand" size={14} /></span>
        </div>
        {renderChart('accounts')}
      </div>

      <div {...chartCardProps('registration')} style={{ ...s.chartCard, ...s.chartWide }}>
        <div style={s.chartHeading}>
          <h2 style={s.subTitle}>Registration Trend</h2>
          <span className="admin-chart-caption" style={s.chartCaption}>New student accounts over the last 6 months <Icon name="expand" size={14} /></span>
        </div>
        {renderChart('registration')}
      </div>

      {expandedChart && (
        <div className="admin-chart-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setExpandedChart(null); }}>
          <div className="admin-chart-modal" role="dialog" aria-modal="true" aria-labelledby="expanded-chart-title">
            <div style={s.chartModalHeader}>
              <div>
                <h2 id="expanded-chart-title" style={s.subTitle}>{chartTitles[expandedChart]}</h2>
                <p style={s.chartModalCaption}>Expanded chart view</p>
              </div>
              <button type="button" className="admin-chart-close" onClick={() => setExpandedChart(null)} aria-label="Close expanded chart">
                <Icon name="x" size={18} />
              </button>
            </div>
            {renderChart(expandedChart, true)}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartEmpty({ message }) {
  return <div style={s.chartEmpty}><Icon name="chart" size={24} label="Chart" /><span>{message}</span></div>;
}

function UserTable({ users, saving, onToggle, showToggle }) {
  const [search, setSearch] = useState('');
  const filtered = users.filter(u =>
    `${u.firstName || ''} ${u.lastName || ''} ${u.email || ''} ${u.idNumber || ''} ${u.department || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <div>
      <div style={s.tableSearchRow}>
        <input
          type="text"
          placeholder="Filter by name, ID, department, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={s.tableSearchInput}
        />
        <span style={s.countBadge}>{filtered.length} record(s)</span>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Name</th>
              <th style={s.th}>Student / Employee ID</th>
              <th style={s.th}>Email Address</th>
              <th style={s.th}>Department</th>
              <th style={s.th}>Account Status</th>
              {showToggle && <th style={{ ...s.th, textAlign: 'right' }}>Action</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id} style={s.tr}>
                <td style={s.td}>
                  <strong style={{ color: '#000000' }}>{user.firstName} {user.lastName}</strong>
                </td>
                <td style={s.td}>
                  <span style={s.idCode}>{user.idNumber || '—'}</span>
                </td>
                <td style={s.td}>{user.email}</td>
                <td style={s.td}>{user.department || '—'}</td>
                <td style={s.td}>
                  <span style={{
                    ...s.statusBadge,
                    backgroundColor: user.accountApproved ? COLORS.emerald50 : COLORS.yellow100,
                    color: '#000000',
                    border: `1px solid ${user.accountApproved ? COLORS.emerald200 : COLORS.yellow300}`,
                  }}>
                    {user.accountApproved ? 'Active' : 'Pending'}
                  </span>
                </td>
                {showToggle && (
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button
                      type="button"
                      className={`account-action-button ${user.accountApproved ? 'account-action-deactivate' : 'account-action-activate'}`}
                      style={{
                        ...s.toggleBtn,
                        backgroundColor: user.accountApproved ? COLORS.rose600 : COLORS.sky600,
                        color: COLORS.white,
                        border: `1px solid ${user.accountApproved ? COLORS.rose600 : COLORS.sky600}`,
                      }}
                      disabled={saving}
                      onClick={() => onToggle(user.id, user.accountApproved)}
                    >
                      <Icon name={user.accountApproved ? 'x' : 'check'} size={14} />
                      {user.accountApproved ? 'Deactivate' : 'Activate Account'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...s.td, textAlign: 'center', color: '#000000', padding: 32 }}>
                  No matching user records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
    marginBottom: 20,
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
  nav: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    overflowY: 'auto',
  },
  navLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 9,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    color: COLORS.slate700,
    backgroundColor: COLORS.white,
    border: '1px solid transparent',
    borderRadius: THEME.radius.md,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  navItemActive: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    color: COLORS.white,
    backgroundColor: COLORS.sky600,
    border: '1px solid transparent',
    borderRadius: THEME.radius.md,
    padding: '9px 12px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.35)',
    textAlign: 'left',
    fontFamily: 'inherit',
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
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerPopoverAnchor: {
    position: 'relative',
  },
  headerPopover: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    width: 360,
    padding: 16,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.white,
    boxShadow: THEME.shadows.lg,
  },
  profileDropdown: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    zIndex: 30,
    width: 300,
    padding: '8px 12px',
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: 18,
    backgroundColor: COLORS.white,
    boxShadow: '0 14px 34px rgba(15, 23, 42, 0.14)',
  },
  profileDropdownAccount: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    padding: '10px 8px 13px',
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  profileDropdownAvatar: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 38,
    height: 38,
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: COLORS.sky50,
    color: COLORS.sky700,
    border: `1px solid ${COLORS.sky200}`,
  },
  profileDropdownAccountCopy: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 3,
  },
  profileDropdownRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '13px 8px',
    border: 0,
    borderBottom: `1px solid ${COLORS.slate100}`,
    backgroundColor: COLORS.white,
    color: COLORS.slate800,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 700,
  },
  notificationItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: '10px 4px',
    border: 0,
    borderBottom: `1px solid ${COLORS.slate100}`,
    backgroundColor: COLORS.white,
    color: COLORS.slate700,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  notificationHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 12,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  markReadBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    border: 0,
    padding: 0,
    backgroundColor: 'transparent',
    color: COLORS.sky600,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },
  notificationList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 300,
    overflowY: 'auto',
  },
  notificationIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.sky50,
    color: COLORS.sky600,
  },
  notificationCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
    lineHeight: 1.3,
  },
  notificationEmpty: {
    padding: '18px 4px',
    color: COLORS.slate500,
    fontSize: 12,
    textAlign: 'center',
  },
  notificationShowAll: {
    width: '100%',
    marginTop: 12,
    padding: '8px 12px',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.white,
    color: COLORS.slate800,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  notificationsPage: {
    maxWidth: 860,
    margin: '0 auto',
  },
  notificationsPageHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  notificationsPageCard: {
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.lg,
    boxShadow: THEME.shadows.xs,
  },
  notificationsPageItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: '16px 18px',
    border: 0,
    borderBottom: `1px solid ${COLORS.slate100}`,
    backgroundColor: COLORS.white,
    color: COLORS.slate900,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  dashboardToolbar: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '14px 28px',
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
    flexWrap: 'wrap',
  },
  dashboardSearchWrap: {
    position: 'relative',
    width: 360,
    maxWidth: '100%',
  },
  dashboardSearch: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.md,
    padding: '8px 10px',
    color: COLORS.slate500,
  },
  dashboardSearchClear: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 0,
    padding: 2,
    backgroundColor: 'transparent',
    color: COLORS.slate500,
    cursor: 'pointer',
  },
  dashboardSearchSuggestions: {
    position: 'absolute',
    zIndex: 20,
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    padding: 6,
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.md,
    boxShadow: THEME.shadows.md,
  },
  dashboardSuggestion: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '9px 10px',
    border: 0,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.white,
    color: COLORS.slate900,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  dashboardSuggestionIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    flexShrink: 0,
    borderRadius: THEME.radius.sm,
    backgroundColor: COLORS.sky50,
    color: COLORS.sky700,
  },
  dashboardSuggestionText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    gap: 2,
  },
  dashboardSuggestionEmpty: {
    padding: '12px 10px',
    color: COLORS.slate500,
    fontSize: 12,
  },
  searchShortcut: {
    color: COLORS.slate500,
    backgroundColor: COLORS.slate100,
    border: `1px solid ${COLORS.slate200}`,
    borderRadius: THEME.radius.sm,
    padding: '1px 5px',
    fontSize: 10,
    whiteSpace: 'nowrap',
  },
  dashboardTools: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dashboardSelect: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.white,
    color: COLORS.slate600,
    padding: '8px 10px',
  },
  toolbarIconBtn: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.white,
    color: COLORS.slate700,
    cursor: 'pointer',
  },
  toolbarBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    padding: '1px 4px',
    borderRadius: THEME.radius.full,
    backgroundColor: COLORS.rose600,
    color: COLORS.white,
    fontSize: 10,
    fontWeight: 800,
  },
  toolbarProfileBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '5px 9px 5px 5px',
    backgroundColor: COLORS.white,
    color: COLORS.slate700,
    cursor: 'pointer',
  },
  profileAvatar: {
    width: 25,
    height: 25,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    color: COLORS.sky800,
    fontSize: 11,
    fontWeight: 800,
  },
  profileName: {
    fontSize: 12,
    fontWeight: 800,
  },
  exportBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '9px 14px',
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
  },
  toolbarPopover: {
    position: 'absolute',
    top: 'calc(100% - 4px)',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
    width: 250,
    padding: 14,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.white,
    boxShadow: THEME.shadows.lg,
  },
  notificationPopover: { right: 160 },
  profilePopover: { right: 28 },
  popoverTitle: { fontSize: 13, color: '#000000' },
  popoverText: { fontSize: 12, color: COLORS.slate600, lineHeight: 1.4 },
  popoverAction: {
    alignSelf: 'flex-start',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    padding: '6px 10px',
    backgroundColor: COLORS.white,
    color: '#000000',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
  },
  profilePage: {
    maxWidth: 900,
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 20,
  },
  profileLargeAvatar: {
    width: 60,
    height: 60,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    border: `1px solid ${COLORS.sky300}`,
    color: COLORS.sky800,
    fontSize: 18,
    fontWeight: 800,
  },
  profileCard: {
    padding: 24,
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    boxShadow: THEME.shadows.xs,
  },
  profileFacts: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 22,
    paddingBottom: 18,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  profileFactLabel: {
    display: 'block',
    marginBottom: 4,
    color: COLORS.slate500,
    fontSize: 11,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  profileFactValue: {
    display: 'block',
    color: '#000000',
    fontSize: 13,
    fontWeight: 700,
    overflowWrap: 'anywhere',
  },
  profileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
  },
  profileStatus: {
    marginBottom: 16,
    padding: 12,
    border: `1px solid ${COLORS.emerald200}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.emerald50,
    color: COLORS.emerald700,
    fontSize: 13,
    fontWeight: 700,
  },
  profileActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 22,
  },
  deleteProfileBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 14px',
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.rose50,
    color: COLORS.rose700,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
  },
  overviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: 12,
    maxWidth: 'none',
  },
  chartGrid: {
    gridColumn: '1 / -1',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 16,
  },
  chartCard: {
    minWidth: 0,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 20,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    cursor: 'zoom-in',
  },
  chartWide: {
    gridColumn: '1 / -1',
  },
  chartHeading: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  chartCaption: {
    fontSize: 11,
    color: COLORS.slate600,
    fontWeight: 600,
  },
  chartBox: {
    width: '100%',
    height: 260,
  },
  chartModalBox: {
    width: '100%',
    height: 'min(62vh, 560px)',
  },
  chartModalHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 18,
  },
  chartModalCaption: {
    margin: '4px 0 0',
    color: COLORS.slate600,
    fontSize: 13,
  },
  chartEmpty: {
    height: 260,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    color: COLORS.slate500,
    fontSize: 13,
    fontWeight: 700,
  },
  fullWidth: {
    gridColumn: '1 / -1',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 24,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    marginTop: 8,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    padding: '11px 14px 10px',
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 5,
    minHeight: 88,
    justifyContent: 'space-between',
  },
  statHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statIcon: {
    width: 18,
    height: 18,
    borderRadius: THEME.radius.sm,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statContent: {
    minWidth: 0,
  },
  statNum: {
    fontSize: 23,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: '#000000',
  },
  statFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  statSubtitle: {
    color: COLORS.slate500,
    fontSize: 9,
    fontWeight: 600,
  },
  tabContent: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    padding: 28,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
    maxWidth: 1100,
  },
  tabHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    flexWrap: 'wrap',
    gap: 12,
  },
  subTitle: {
    fontSize: 17,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  subText: {
    fontSize: 13,
    color: '#000000',
    margin: '4px 0 0',
  },
  countBadge: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 700,
  },
  addCoordinatorBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  tableSearchRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  tableSearchInput: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '8px 14px',
    fontSize: 13,
    width: 320,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  tableWrap: {
    overflowX: 'auto',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: COLORS.slate50,
    borderBottom: `1px solid ${COLORS.slate200}`,
  },
  tr: {
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  td: {
    padding: '13px 16px',
    color: '#000000',
    verticalAlign: 'middle',
  },
  idCode: {
    fontSize: 12,
    fontFamily: THEME.fonts.mono,
    fontWeight: 700,
    color: '#000000',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: THEME.radius.full,
  },
  hoursPill: {
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    border: `1px solid ${COLORS.yellow300}`,
    padding: '2px 8px',
    borderRadius: THEME.radius.sm,
    fontWeight: 800,
    fontSize: 12,
  },
  toggleBtn: {
    borderRadius: THEME.radius.md,
    padding: '6px 14px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 12,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
    boxShadow: THEME.shadows.xs,
  },
  createForm: {
    maxWidth: 580,
    marginTop: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 14,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
  },
  createBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '13px 24px',
    fontSize: 14,
    fontWeight: 800,
    cursor: 'pointer',
    marginTop: 8,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
    alignSelf: 'flex-start',
  },
  errorBox: {
    backgroundColor: COLORS.rose50,
    border: `1px solid ${COLORS.rose200}`,
    borderRadius: THEME.radius.md,
    padding: 14,
    marginBottom: 16,
    color: '#000000',
    fontSize: 13,
  },
  successBox: {
    backgroundColor: COLORS.emerald50,
    border: `1px solid ${COLORS.emerald200}`,
    borderRadius: THEME.radius.md,
    padding: 14,
    marginBottom: 16,
    color: '#000000',
    fontSize: 13,
  },
  loadingWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    gap: 12,
    color: '#000000',
  },
  spinner: {
    width: 24,
    height: 24,
    border: `3px solid ${COLORS.sky200}`,
    borderTopColor: COLORS.sky600,
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
};
