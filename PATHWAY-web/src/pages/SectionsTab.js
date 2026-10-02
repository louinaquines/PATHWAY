// src/pages/SectionsTab.js
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { PageSkeleton, InlineSkeleton } from '../components/LoadingSkeleton';
import AlertDialog from '../components/AlertDialog';
import { adminRequest } from '../adminApi';

export default function SectionsTab({ coordinatorId, selectedSection: sharedSection, onSectionChange }) {
  const [sections, setSections]         = useState([]);
  const [students, setStudents]         = useState([]);
  const [selected, setSelected]         = useState(null);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [view, setView]                 = useState('students'); // 'students' | 'requirements'
  const [modal, setModal]               = useState(false);
  const [reqModal, setReqModal]         = useState(null); // null | 'add'
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [form, setForm]                 = useState({ name: '', department: '', hoursRequired: '', messengerLink: '' });
  const [reqForm, setReqForm]           = useState({ label: '', category: 'Pre-OJT', deadline: '' });
  const [searchQuery, setSearchQuery]   = useState('');

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

  const CATEGORIES = ['Pre-OJT', 'Ongoing', 'Post-OJT'];
  const filteredSections = sections.filter(section => matchesCoordinatorSearch(searchQuery, section.name, section.department));
  const filteredStudents = students.filter(student => matchesCoordinatorSearch(searchQuery, student.firstName, student.lastName, student.idNumber, selected?.name));

  const fetchSections = useCallback(async () => {
    if (!coordinatorId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId)));
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [coordinatorId]);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const fetchStudents = async (section) => {
    setSelected(section);
    onSectionChange?.(section);
    setView('students');
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('sectionId', '==', section.id)));
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (sharedSection) setSelected(sharedSection);
  }, [sharedSection]);

  const fetchRequirements = async (section) => {
    setSelected(section);
    setView('requirements');
    try {
      const snap = await getDocs(collection(db, 'sections', section.id, 'requirements'));
      if (snap.empty) {
        const result = await adminRequest(`/coordinator/sections/${encodeURIComponent(section.id)}/requirements/defaults`, { method: 'POST' });
        setRequirements(result.requirements);
      } else {
        const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        reqs.sort((a, b) => {
          const order = ['Pre-OJT', 'Ongoing', 'Post-OJT'];
          return order.indexOf(a.category) - order.indexOf(b.category);
        });
        setRequirements(reqs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreate = async () => {
    if (!form.name || !form.department || !form.hoursRequired) return;
    setSaving(true);
    try {
      await adminRequest('/coordinator/sections', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(), department: form.department, hoursRequired: Number(form.hoursRequired), messengerLink: form.messengerLink.trim(),
        }),
      });
      setModal(false);
      setForm({ name: '', department: '', hoursRequired: '', messengerLink: '' });
      fetchSections();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddRequirement = async () => {
    if (!reqForm.label.trim()) return;
    setSaving(true);
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements`, {
        method: 'POST', body: JSON.stringify({ label: reqForm.label.trim(), category: reqForm.category, deadline: reqForm.deadline }),
      });
      setReqModal(null);
      setReqForm({ label: '', category: 'Pre-OJT', deadline: '' });
      fetchRequirements(selected);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateDeadline = async (reqId, deadline) => {
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'PATCH', body: JSON.stringify({ deadline }),
      });
      setRequirements(prev => prev.map(r => r.id === reqId ? { ...r, deadline } : r));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRequirement = async (reqId) => {
    setSaving(true);
    try {
      await adminRequest(`/coordinator/sections/${encodeURIComponent(selected.id)}/requirements/${encodeURIComponent(reqId)}`, {
        method: 'DELETE',
      });
      setRequirements(prev => prev.filter(r => r.id !== reqId));
      setDeleteConfirm(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <PageSkeleton label="Loading sections" variant="three-column" />;
  }

  return (
    <div style={t.page}>
      {/* Left Column: Sections List */}
      <div style={t.left}>
        <div style={t.leftHeader}>
          <div>
            <h2 style={t.leftTitle}>Sections</h2>
            <span style={t.leftCount}>{sections.length} Active</span>
          </div>
          <button style={t.addBtn} onClick={() => setModal(true)}>+ New Section</button>
        </div>
        <div style={t.searchWrap}>
          <CoordinatorSearch value={searchQuery} onChange={setSearchQuery} label="Search sections and students" />
        </div>

        <div style={t.secList}>
          {filteredSections.length === 0 && (
            <div style={t.empty}>No sections created yet. Click "+ New Section" to begin.</div>
          )}
          {filteredSections.map(sec => (
            <div
              key={sec.id}
              style={{ ...t.secCard, ...(selected?.id === sec.id ? t.secCardActive : {}) }}
            >
              <div onClick={() => fetchStudents(sec)} style={t.secMainClick}>
                <div style={t.secName}>{sec.name}</div>
                <div style={t.secInfo}>{sec.department}</div>
                <div style={t.secHoursBadge}>{sec.hoursRequired} hrs required</div>
              </div>
              <button
                style={t.configBtn}
                onClick={() => fetchRequirements(sec)}
                title="Configure Requirements & Deadlines"
              >
                <Icon name="settings" size={15} label="Configure section" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Detail Area */}
      <div style={t.right}>
        {!selected ? (
          <div style={t.emptyDetail}>
            <div style={t.emptyIcon}><Icon name="section" size={28} label="Sections" /></div>
            <h3 style={t.emptyTitle}>Select a Section</h3>
            <p style={t.emptySub}>Select a section on the left to manage enrolled students, assign newcomers, or configure requirement deadlines.</p>
          </div>
        ) : (
          <>
            {/* Section Header Card */}
            <div style={t.detailHeader}>
              <div>
                <h2 style={t.detailTitle}>{selected.name}</h2>
                <div style={t.detailSubRow}>
                  <span><Icon name="building" size={14} /> {selected.department}</span>
                  <span><Icon name="clock" size={14} /> {selected.hoursRequired} Hours</span>
                  {selected.messengerLink ? (
                    <a href={selected.messengerLink} target="_blank" rel="noreferrer" style={t.gcLink}>
                      <><Icon name="chat" size={14} /> Open Group Chat</>
                    </a>
                  ) : (
                    <span style={{ color: '#000000' }}>No GC Link</span>
                  )}
                </div>
              </div>

              <div style={t.viewToggle}>
                <button
                  style={{ ...t.toggleBtn, ...(view === 'students' ? t.toggleBtnActive : {}) }}
                  onClick={() => fetchStudents(selected)}
                >
                  <Icon name="users" size={16} /> Enrolled Students ({students.length})
                </button>
                <button
                  style={{ ...t.toggleBtn, ...(view === 'requirements' ? t.toggleBtnActive : {}) }}
                  onClick={() => fetchRequirements(selected)}
                >
                  <Icon name="clipboard" size={16} /> Checklist & Deadlines
                </button>
              </div>
            </div>

            {/* Students View */}
            {view === 'students' && (
              <div style={t.viewContent}>
                <div style={t.subHeaderRow}>
                  <h3 style={t.sectionLabel}>ENROLLED STUDENTS IN THIS SECTION</h3>
                  <span style={t.studentCountText}>{students.length} Student(s)</span>
                </div>

                  {filteredStudents.length === 0 ? (
                    <div style={t.emptyCard}>No students enrolled in this section yet.</div>
                  ) : (
                  <div style={t.studentsGrid}>
                    {filteredStudents.map(st => (
                      <div key={st.id} style={t.studentRow}>
                        <div style={t.studentLeft}>
                          <div style={t.studentAvatar}>{st.firstName?.[0]}{st.lastName?.[0]}</div>
                          <div>
                            <div style={t.studentName}>{st.firstName} {st.lastName}</div>
                            <div style={t.studentInfo}>{st.idNumber || 'No ID'} · {st.email}</div>
                          </div>
                        </div>
                        <span style={{
                          ...t.pill,
                          backgroundColor: st.accountApproved ? COLORS.emerald50 : COLORS.yellow100,
                          color: '#000000',
                          border: `1px solid ${st.accountApproved ? COLORS.emerald200 : COLORS.yellow300}`,
                        }}>
                          {st.accountApproved ? 'Active' : 'Pending Approval'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={t.unassignedSection}>
                  <h3 style={t.sectionLabel}>ASSIGN UNASSIGNED STUDENTS TO {selected.name}</h3>
                  <UnassignedStudents
                    sectionId={selected.id}
                    department={selected.department}
                    onAssign={() => fetchStudents(selected)}
                  />
                </div>
              </div>
            )}

            {/* Requirements View */}
            {view === 'requirements' && (
              <div style={t.viewContent}>
                <div style={t.reqHeader}>
                  <div>
                    <h3 style={t.sectionLabel}>CUSTOM REQUIREMENTS & SUBMISSION DEADLINES</h3>
                    <p style={t.reqSubText}>Set specific deadlines for each requirement. Overdue alerts are automatically shown to students.</p>
                  </div>
                  <button
                    style={t.addReqBtn}
                    onClick={() => {
                      setReqModal('add');
                      setReqForm({ label: '', category: 'Pre-OJT', deadline: '' });
                    }}
                  >
                    + Add Custom Requirement
                  </button>
                </div>

                {CATEGORIES.map(cat => {
                  const catReqs = requirements.filter(r => r.category === cat);
                  if (catReqs.length === 0) return null;
                  return (
                    <div key={cat} style={t.catBlock}>
                      <div style={t.catLabel}>{cat} Phase Requirements</div>
                      <div style={t.reqList}>
                        {catReqs.map(req => {
                          const isOverdue = req.deadline && new Date(req.deadline) < new Date();
                          return (
                            <div key={req.id} style={t.reqRow}>
                              <div style={t.reqLeft}>
                                <div style={t.reqLabel}>{req.label}</div>
                                <div style={t.deadlineRow}>
                                  <span style={t.deadlineLabel}>Deadline:</span>
                                  <input
                                    type="date"
                                    style={t.dateInput}
                                    value={req.deadline || ''}
                                    onChange={e => handleUpdateDeadline(req.id, e.target.value)}
                                  />
                                  {req.deadline && (
                                    <span style={{
                                      ...t.deadlineBadge,
                                      backgroundColor: isOverdue ? COLORS.rose50 : COLORS.emerald50,
                                      color: '#000000',
                                      border: `1px solid ${isOverdue ? COLORS.rose200 : COLORS.emerald200}`,
                                    }}>
                                      {isOverdue ? 'Overdue' : 'Active'}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                style={t.deleteBtn}
                                onClick={() => setDeleteConfirm(req)}
                                title="Delete requirement"
                              >
                                <Icon name="trash" size={15} label="Delete requirement" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Section Modal */}
      {modal && (
        <div style={t.overlay}>
          <div style={t.modalCard}>
            <h2 style={t.modalTitle}>Create New Section</h2>
            <div style={t.field}>
              <label style={t.label}>Section Name / Code</label>
              <input
                style={t.input}
                placeholder="e.g. BSIT-4A-OJT"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div style={t.field}>
              <label style={t.label}>Department / College</label>
              <select
                style={t.select}
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                required
              >
                <option value="">Select department...</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={t.field}>
              <label style={t.label}>Required OJT Hours</label>
              <input
                style={t.input}
                type="number"
                placeholder="e.g. 486"
                value={form.hoursRequired}
                onChange={e => setForm(f => ({ ...f, hoursRequired: e.target.value }))}
                required
              />
            </div>
            <div style={t.field}>
              <label style={t.label}>Group Chat / Messenger Link (Optional)</label>
              <input
                style={t.input}
                placeholder="https://m.me/join/..."
                value={form.messengerLink}
                onChange={e => setForm(f => ({ ...f, messengerLink: e.target.value }))}
              />
            </div>
            <div style={t.modalBtns}>
              <button style={t.cancelBtn} onClick={() => setModal(false)}>Cancel</button>
              <button
                style={{ ...t.confirmBtn, opacity: saving ? 0.6 : 1 }}
                onClick={handleCreate}
                disabled={saving}
              >
                {saving ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Requirement Modal */}
      {reqModal === 'add' && (
        <div style={t.overlay}>
          <div style={t.modalCard}>
            <h2 style={t.modalTitle}>Add Custom Requirement</h2>
            <div style={t.field}>
              <label style={t.label}>Requirement Name</label>
              <input
                style={t.input}
                placeholder="e.g. Weekly Progress Presentation"
                value={reqForm.label}
                onChange={e => setReqForm(f => ({ ...f, label: e.target.value }))}
                required
              />
            </div>
            <div style={t.field}>
              <label style={t.label}>Internship Phase / Category</label>
              <select
                style={t.select}
                value={reqForm.category}
                onChange={e => setReqForm(f => ({ ...f, category: e.target.value }))}
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={t.field}>
              <label style={t.label}>Submission Deadline (Optional)</label>
              <input
                style={t.input}
                type="date"
                value={reqForm.deadline}
                onChange={e => setReqForm(f => ({ ...f, deadline: e.target.value }))}
              />
            </div>
            <div style={t.modalBtns}>
              <button style={t.cancelBtn} onClick={() => setReqModal(null)}>Cancel</button>
              <button
                style={{ ...t.confirmBtn, opacity: saving ? 0.6 : 1 }}
                onClick={handleAddRequirement}
                disabled={saving}
              >
                {saving ? 'Adding...' : 'Add Requirement'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog
        open={Boolean(deleteConfirm)}
        title="Delete requirement from checklist?"
        description={deleteConfirm ? `“${deleteConfirm.label}” will be removed from ${selected?.name || 'this section'} for future submissions. Existing student records are preserved.` : ''}
        confirmLabel="Delete requirement"
        busy={saving}
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => handleDeleteRequirement(deleteConfirm.id)}
      />
    </div>
  );
}

function UnassignedStudents({ sectionId, department, onAssign }) {
  const [unassigned, setUnassigned] = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('department', '==', department), where('sectionId', '==', '')));
        setUnassigned(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [sectionId, department]);

  const assign = async (studentId) => {
    try {
      await adminRequest('/coordinator/assign-student', {
        method: 'POST', body: JSON.stringify({ studentId, sectionId }),
      });
      setUnassigned(u => u.filter(s => s.id !== studentId));
      onAssign();
    } catch (error) {
      window.alert(error.message || 'Unable to assign this student.');
    }
  };

  if (loading) return <InlineSkeleton label="Loading unassigned students" />;
  if (unassigned.length === 0) return <div style={{ color: '#000000', fontSize: 13, padding: 12 }}>No unassigned students found.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {unassigned.map(st => (
        <div key={st.id} style={t.unassignedRow}>
          <div>
            <div style={t.studentName}>{st.firstName} {st.lastName}</div>
            <div style={t.studentInfo}>{st.idNumber || 'No ID'} · {st.department}</div>
          </div>
          <button style={t.assignBtn} onClick={() => assign(st.id)}>
            + Assign to Section
          </button>
        </div>
      ))}
    </div>
  );
}

const t = {
  page: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    backgroundColor: COLORS.slate50,
  },
  left: {
    width: 280,
    borderRight: `1px solid ${COLORS.slate200}`,
    backgroundColor: COLORS.white,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  leftHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 18px',
    borderBottom: `1px solid ${COLORS.slate100}`,
  },
  searchWrap: {
    padding: '12px 16px 0',
    backgroundColor: COLORS.white,
  },
  leftTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: '#000000',
    margin: 0,
  },
  leftCount: {
    fontSize: 11,
    color: '#000000',
    fontWeight: 700,
  },
  addBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '7px 12px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  secList: {
    flex: 1,
    overflowY: 'auto',
  },
  secCard: {
    padding: '14px 18px',
    borderBottom: `1px solid ${COLORS.slate200}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secCardActive: {
    backgroundColor: COLORS.sky50,
    borderLeft: `4px solid ${COLORS.sky600}`,
  },
  secMainClick: {
    flex: 1,
    cursor: 'pointer',
  },
  secName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  secInfo: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  secHoursBadge: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 800,
    backgroundColor: COLORS.yellow100,
    color: '#000000',
    padding: '2px 7px',
    borderRadius: THEME.radius.sm,
    marginTop: 6,
    border: `1px solid ${COLORS.yellow300}`,
  },
  configBtn: {
    background: 'none',
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    cursor: 'pointer',
    fontSize: 14,
    padding: '6px 8px',
    backgroundColor: COLORS.white,
  },
  right: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
  },
  emptyDetail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 80,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  emptySub: {
    fontSize: 13,
    color: '#000000',
    maxWidth: 380,
    lineHeight: 1.5,
  },
  detailHeader: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    marginBottom: 24,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 16,
    boxShadow: THEME.shadows.xs,
  },
  detailTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 6px',
  },
  detailSubRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    fontSize: 13,
    color: '#000000',
    fontWeight: 600,
    flexWrap: 'wrap',
  },
  gcLink: {
    color: '#000000',
    fontWeight: 800,
    textDecoration: 'none',
    backgroundColor: COLORS.yellow100,
    padding: '3px 8px',
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.yellow300}`,
  },
  viewToggle: {
    display: 'flex',
    gap: 8,
  },
  toggleBtn: {
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    borderColor: COLORS.sky600,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  viewContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    maxWidth: 900,
  },
  subHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: '#000000',
    letterSpacing: '0.06em',
    margin: 0,
  },
  studentCountText: {
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
  },
  studentsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  studentRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate300}`,
    boxShadow: THEME.shadows.xs,
  },
  studentLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    backgroundColor: COLORS.sky100,
    color: '#000000',
    fontWeight: 800,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${COLORS.sky300}`,
  },
  studentName: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
  },
  studentInfo: {
    fontSize: 12,
    color: '#000000',
    marginTop: 2,
  },
  pill: {
    fontSize: 11,
    fontWeight: 800,
    padding: '4px 10px',
    borderRadius: THEME.radius.full,
  },
  unassignedSection: {
    marginTop: 20,
    padding: 20,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  unassignedRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    backgroundColor: COLORS.slate50,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate200}`,
  },
  assignBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '7px 14px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 800,
  },
  reqHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
    flexWrap: 'wrap',
    gap: 12,
  },
  reqSubText: {
    margin: '4px 0 0',
    fontSize: 13,
    color: '#000000',
  },
  addReqBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '9px 16px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
  },
  catBlock: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderRadius: THEME.radius.lg,
    border: `1px solid ${COLORS.slate300}`,
  },
  catLabel: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 14,
  },
  reqList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  reqRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '12px 16px',
  },
  reqLeft: {
    flex: 1,
  },
  reqLabel: {
    fontSize: 14,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  deadlineRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deadlineLabel: {
    fontSize: 12,
    color: '#000000',
    fontWeight: 700,
  },
  dateInput: {
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.sm,
    padding: '4px 8px',
    fontSize: 12,
    color: '#000000',
    fontFamily: THEME.fonts.main,
    backgroundColor: COLORS.white,
  },
  deadlineBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '2px 8px',
    borderRadius: THEME.radius.full,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: 16,
    padding: '6px',
  },
  emptyCard: {
    padding: 28,
    textAlign: 'center',
    color: '#000000',
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
    border: `1px solid ${COLORS.slate200}`,
  },
  empty: {
    color: '#000000',
    fontSize: 13,
    padding: 24,
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
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.xl,
    padding: 32,
    width: '100%',
    maxWidth: 480,
    boxShadow: THEME.shadows.xl,
    border: `1px solid ${COLORS.slate300}`,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#000000',
    margin: '0 0 16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
  },
  select: {
    width: '100%',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 14,
    color: '#000000',
    backgroundColor: COLORS.white,
    boxSizing: 'border-box',
    fontFamily: THEME.fonts.main,
  },
  modalBtns: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '12px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    backgroundColor: COLORS.white,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '12px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 800,
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
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
