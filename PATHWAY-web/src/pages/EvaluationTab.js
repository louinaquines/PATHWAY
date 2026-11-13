import personName from '../personName';
import { compareStudents } from '../coordinatorStudentSort';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
// src/pages/EvaluationTab.js
import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import { COLORS, THEME } from '../theme';
import Icon from '../components/Icons';
import PaginationButtonGroup from '../components/PaginationButtonGroup';
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { EvaluationSkeleton } from '../components/PageSkeletons';
import './CoordinatorOperations.css';
import './EvaluationTab.css';
import { defaultEvaluationForm } from './EvaluationFormBuilder';
import EvaluationBuilderDialog from './EvaluationBuilderDialog';
import AlertDialog from '../components/AlertDialog';

const EVALUATIONS_PER_PAGE = 5;

export default function EvaluationTab({ coordinatorId, selectedSection, sections = [], onSectionChange }) {
  const [students, setStudents]       = useState([]);
  const [formDefinition, setFormDefinition] = useState(defaultEvaluationForm);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [evaluations, setEvaluations] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const deleteEvaluation = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminRequest('/coordinator/evaluations/' + encodeURIComponent(deleteTarget.id), { method: 'DELETE' });
      const removedId = deleteTarget.id;
      setEvaluations(previous => previous.filter(item => item.id !== removedId));
      setPreparedInvitations(previous => previous.filter(item => item.id !== removedId));
      if (invitation?.id === removedId) { setInvitation(null); setLink(''); }
      setDeleteTarget(null);
      loadEvaluations().catch(() => {});
    } catch (error) { window.alert(error.message || 'Could not delete this evaluation.'); }
    finally { setDeleting(false); }
  };
  const [form, setForm]               = useState({
    studentId: '',
    supervisorName: '',
    supervisorEmail: '',
    companyName: '',
  });
  const [companyKey, setCompanyKey] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [preparedInvitations, setPreparedInvitations] = useState([]);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const studentPicker = useRef(null);
  useEffect(() => {
    if (!selectionOpen) return;
    const dismiss = event => { if (!studentPicker.current?.contains(event.target)) setSelectionOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [selectionOpen]);
  const [link, setLink]               = useState('');
  const [invitation, setInvitation] = useState(null);
  const [emailMessage, setEmailMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkVisible, setLinkVisible] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied]           = useState(false);
  const [status, setStatus]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');

  const loadEvaluations = useCallback(async ({ isCurrent = () => true } = {}) => {
    const data = await adminRequest('/coordinator-evaluations');
    if (isCurrent()) setEvaluations(data.evaluations || []);
  }, []);

  useEffect(() => {
    if (!coordinatorId) return;
    let active = true;
    setEvaluations([]);
    setStudents([]); setSelectedStudentIds([]); setCompanyKey(''); setPreparedInvitations([]);
    setInvitation(null); setLink(''); setStatus('');
    setForm({ studentId: '', companyName: '', supervisorName: '', supervisorEmail: '' });
    if (!selectedSection?.id) { setLoading(false); return; }
    loadEvaluations({ isCurrent: () => active }).catch(error => { if (active) setStatus(error.message); });
    getDocs(query(collection(db, 'sections'), where('coordinatorId', '==', coordinatorId))).then(async snapshot => {
      if (!snapshot.docs.some(section => section.id === selectedSection.id)) throw new Error('This section is not assigned to you.');
      const roster = await getDocs(query(collection(db, 'users'), where('role', '==', 'student'), where('sectionId', '==', selectedSection.id)));
      if (active) setStudents(roster.docs.map(item => ({ ...item.data(), id: item.id })));
    }).catch(error => { if (active) setStatus(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [coordinatorId, loadEvaluations, selectedSection?.id]);
  usePortalAutoRefresh(loadEvaluations, { enabled: !loading && !busy && !refreshing, scope: selectedSection?.id || '' });

  const companyFor = student => student.companyId ? 'id:' + student.companyId : 'name:' + (student.company || student.companyName || '').trim();
  const placedStudents = students.filter(student => student.placementStatus === 'approved' && student.preDeploymentStatus === 'approved' && (student.company || student.companyName || '').trim());
  const companies = [...new Map(placedStudents.map(student => [companyFor(student), student.company || student.companyName])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const companyStudents = placedStudents.filter(student => companyFor(student) === companyKey)
    .sort(compareStudents);
  const selectedStudents = companyStudents.filter(student => selectedStudentIds.includes(student.id));
  const selectedNames = selectedStudents.map(student => personName(student) || student.idNumber || student.id);
  const allStudentsSelected = selectedNames.length > 1 && selectedNames.length === companyStudents.length;
  const selectionSummary = !selectedNames.length ? 'Select students' : allStudentsSelected ? 'All ' + selectedNames.length + ' students selected' : selectedNames.slice(0, 2).join(', ') + (selectedNames.length > 2 ? ' +' + (selectedNames.length - 2) + ' more' : '');
  const supervisorEmails = new Set(selectedStudents.map(student => (student.supervisorEmail || '').trim().toLowerCase()).filter(Boolean));
  const mixedSupervisors = supervisorEmails.size > 1;
  const preparedIds = new Set(preparedInvitations.map(item => item.studentId));
  const remainingStudents = selectedStudents.filter(student => !preparedIds.has(student.id));

  const updateSelection = ids => {
    setSelectedStudentIds(ids);
    const selected = companyStudents.filter(student => ids.includes(student.id));
    const emails = new Set(selected.map(student => (student.supervisorEmail || '').trim().toLowerCase()).filter(Boolean));
    setForm(previous => ({ ...previous, supervisorName: emails.size <= 1 ? selected.find(student => student.supervisorName)?.supervisorName || '' : '',
      supervisorEmail: emails.size <= 1 ? [...emails][0] || '' : '' }));
  };

  const showInvitation = item => {
    setInvitation(item); setLink(window.location.origin + '/evaluate?token=' + item.token);
    setEmailSent(item.sent === true); setCopied(false); setLinkVisible(false); setEmailMessage('');
  };

  const createLink = async event => {
    event.preventDefault();
    if (busy || !remainingStudents.length || mixedSupervisors) return;
    setBusy(true); setStatus('Preparing invitations…');
    try {
      for (const student of remainingStudents) {
        const data = await adminRequest('/create-evaluation-token', {
          method: 'POST', body: JSON.stringify({ ...form, studentId: student.id, formDefinition }),
        });
        const item = { id: data.id, token: data.token, studentId: student.id,
          studentName: personName(student),
          email: form.supervisorEmail, supervisorName: form.supervisorName };
        setPreparedInvitations(previous => [...previous, item]);
        showInvitation(item);
      }
      setSelectionOpen(false);
      setStatus('Invitations prepared. Check the recipient before sending each email.');
    } catch (error) { setStatus(error.message); }
    finally {
      setBusy(false);
      try { await loadEvaluations(); } catch (_) { /* Keep prepared invitations visible. */ }
    }
  };
  const sendEmail = async () => {
    if (!invitation || busy || emailSent) return;
    setBusy(true);
    setStatus('Sending evaluation email…');
    try {
      await adminRequest('/coordinator/evaluations/' + encodeURIComponent(invitation.id) + '/email', {
        method: 'POST', body: JSON.stringify({ token: invitation.token, message: emailMessage }),
      });
      setEmailSent(true);
      setPreparedInvitations(previous => previous.map(item => item.id === invitation.id ? { ...item, sent: true, sendFailed: false } : item));
      setStatus('Sent: the email server accepted the invitation. This does not confirm that the supervisor has read it.');
    } catch (error) {
      setPreparedInvitations(previous => previous.map(item => item.id === invitation.id ? { ...item, sendFailed: true } : item));
      setStatus(error.message);
    }
    finally {
      setBusy(false);
      try { await loadEvaluations(); } catch (_) { /* Keep the delivery result visible. */ }
    }
  };

  const copyToClipboard = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (error) {
      setCopied(false);
      setLinkVisible(true);
      setStatus('Could not copy the link. Select and copy it manually.');
    }
  };

  const refreshEvaluations = async () => {
    setRefreshing(true);
    try {
      await loadEvaluations();
      setStatus('Evaluation records refreshed.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setRefreshing(false);
    }
  };

  const studentIds = new Set(students.map(student => student.id));
  const filteredEvaluations = evaluations.filter(item => studentIds.has(item.studentId) && matchesCoordinatorSearch(
    searchQuery,
    item.studentName,
    item.studentId,
    item.sectionName,
  )).sort(compareStudents);
  const pageCount = Math.max(1, Math.ceil(filteredEvaluations.length / EVALUATIONS_PER_PAGE));
  const visibleEvaluations = filteredEvaluations.slice(
    (currentPage - 1) * EVALUATIONS_PER_PAGE,
    currentPage * EVALUATIONS_PER_PAGE,
  );

  useEffect(() => {
    setCurrentPage(page => Math.min(page, pageCount));
  }, [pageCount]);

  if (loading) {
    return <EvaluationSkeleton />;
  }

  return (
    <div style={styles.panel} className="evaluation-panel">
      {/* Generator Card */}
      <div className="evaluation-invitation" style={styles.card}>
        <div className="evaluation-invitation-header" style={styles.cardHeader}>
          <div style={styles.iconWrap}><Icon name="star" size={22} label="Supervisor evaluation" /></div>
          <div>
            <h2 style={styles.title}>Request an evaluation</h2>
            <p style={styles.sub}>
              Prepare a private invitation for the student’s supervisor.
            </p>
          </div>
          <div className="evaluation-builder-launch"><button type="button" disabled={busy} aria-haspopup="dialog" onClick={() => setBuilderOpen(true)} aria-label="Create evaluation">Edit evaluation questions</button><span>{formDefinition.title} · {formDefinition.questions.length} questions</span></div>
        </div>

        <form onSubmit={createLink} style={styles.form}>
          <label className="evaluation-section-control">Section
            <select aria-label="Current section" disabled={busy || !sections.length} value={selectedSection?.id || ''}
              onChange={event => { const section = sections.find(item => item.id === event.target.value); if (section) onSectionChange?.(section); }}>
              {!sections.length && <option value="">No sections assigned to you</option>}
              {sections.map(section => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <div style={styles.formRow}>
            <div style={styles.field}>
              <label htmlFor="evaluation-company" style={styles.label}>Company</label>
              <select id="evaluation-company" required disabled={busy || preparedInvitations.length > 0} value={companyKey} style={styles.select}
                onChange={event => {
                  setCompanyKey(event.target.value); setSelectedStudentIds([]); setSelectionOpen(false);
                  setForm({ studentId: '', companyName: companies.find(([key]) => key === event.target.value)?.[1] || '', supervisorName: '', supervisorEmail: '' });
                }}>
                <option value="">Select company</option>
                {companies.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
              </select>
              {!companies.length && <p className="evaluation-field-note">Companies will appear here once students in this section are placed.</p>}
            </div>
            <div ref={studentPicker} style={styles.field} className="evaluation-student-picker" onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setSelectionOpen(false); }} onKeyDown={event => { if (event.key === 'Escape' && selectionOpen) { event.preventDefault(); event.stopPropagation(); setSelectionOpen(false); studentPicker.current?.querySelector('button')?.focus(); } }}>
              <label style={styles.label} id="evaluation-students-label">Students</label>
              <button type="button" className="evaluation-students-trigger" aria-labelledby="evaluation-students-label"
                aria-expanded={selectionOpen} aria-controls="evaluation-student-options" disabled={!companyKey || busy || preparedInvitations.length > 0}
                onClick={() => setSelectionOpen(open => !open)}>
                <span className="evaluation-selection-summary" title={selectedNames.join(', ')}>
                  <span className="evaluation-selection-desktop">{selectionSummary}</span>
                  <span className="evaluation-selection-mobile">{allStudentsSelected || !selectedNames.length ? selectionSummary : selectedNames[0] + (selectedNames.length > 1 ? ' +' + (selectedNames.length - 1) + ' more' : '')}</span>
                </span><Icon name="chevronRight" size={16} />
              </button>
              {selectionOpen && <div id="evaluation-student-options" className="evaluation-student-options" role="group" aria-label="Company students">
                <div className="evaluation-selection-toolbar"><span aria-live="polite">{selectedStudentIds.length} of {companyStudents.length} selected</span><button type="button" className="evaluation-select-all" disabled={busy || preparedInvitations.length > 0} onClick={() => updateSelection(selectedStudentIds.length === companyStudents.length ? [] : companyStudents.map(student => student.id))}>
                  {selectedStudentIds.length === companyStudents.length ? 'Clear selection' : 'Select all'}
                </button></div>
                {companyStudents.map(student => <label key={student.id} htmlFor={`evaluation-student-${student.id}`}>
                  <input id={`evaluation-student-${student.id}`} type="checkbox" disabled={busy || preparedInvitations.length > 0} checked={selectedStudentIds.includes(student.id)} onChange={event =>
                    updateSelection(event.target.checked ? [...selectedStudentIds, student.id] : selectedStudentIds.filter(id => id !== student.id))} />
                  <span>{personName(student)}<small>{student.idNumber || student.id}</small></span>
                </label>)}
              </div>}
            </div>
          </div>
          {mixedSupervisors && <p role="alert">These students have different supervisors. Select students with the same supervisor for each request.</p>}
          <div style={styles.formRow}>
            <div style={styles.field}>
              <label style={styles.label}>Supervisor name</label>
              <input
                required
                placeholder="e.g. John Doe, Senior Dev"
                aria-label="Supervisor full name"
                value={form.supervisorName}
                disabled={busy || preparedInvitations.length > 0}
                onChange={e => setForm({ ...form, supervisorName: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Supervisor email</label>
              <input
                type="email"
                required
                placeholder="supervisor@company.com"
                aria-label="Supervisor email address"
                value={form.supervisorEmail}
                disabled={busy || preparedInvitations.length > 0}
                onChange={e => setForm({ ...form, supervisorEmail: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div className="evaluation-form-actions">
          <button type="submit" disabled={busy || mixedSupervisors || !remainingStudents.length} style={styles.generateBtn}>
            {busy ? 'Please wait…' : 'Create evaluation links'}
          </button>
          </div>
        </form>

        {status && (
          <div role="status" aria-live="polite" style={status.includes('Could not') || status.includes('Error') ? styles.errorBox : styles.infoBox}>
            {status}
          </div>
        )}

        {preparedInvitations.length > 0 && <section className="evaluation-prepared">
          <div className="evaluation-prepared-heading">
            <h3>{preparedInvitations.length === 1 ? 'Prepared invitation' : 'Prepared invitations'}</h3>
            <button type="button" className="portal-secondary" disabled={busy} onClick={() => {
              setPreparedInvitations([]); setInvitation(null); setLink(''); setSelectedStudentIds([]); setCompanyKey(''); setStatus('');
              setForm({ studentId: '', companyName: '', supervisorName: '', supervisorEmail: '' });
            }}>New request</button>
          </div>
          {preparedInvitations.length > 1 && <ul className="evaluation-invitation-list">
            {preparedInvitations.map(item => <li key={item.id}>
              <button type="button" aria-pressed={invitation?.id === item.id} disabled={busy} onClick={() => showInvitation(item)}>
                <strong>{item.studentName}</strong><span>{item.sent ? 'Sent' : item.sendFailed ? 'Send failed' : 'Ready to send'}</span>
              </button>
            </li>)}
          </ul>}
          {link && invitation && <section key={invitation.id} className="evaluation-review-card" aria-label="Review invitation">
            <h4>Review invitation</h4>
            <dl>
              <dt>Student</dt><dd>{invitation.studentName}{emailSent && <span className="evaluation-review-sent">Sent</span>}</dd>
              <dt>To</dt><dd>{invitation.supervisorName} · {invitation.email}</dd>
              <dt>Subject</dt><dd>PATHWAY supervisor evaluation request</dd>
            </dl>
            <div className="evaluation-review-link">
              <small>Expires in 7 days</small>
              <button type="button" className="portal-secondary" onClick={copyToClipboard}>{copied ? 'Link copied' : 'Copy link'}</button>
              <button type="button" className="portal-secondary" aria-expanded={linkVisible} onClick={() => setLinkVisible(!linkVisible)}>{linkVisible ? 'Hide link' : 'Show link'}</button>
            </div>
            {linkVisible && <input aria-label="Evaluation link" readOnly value={link} style={styles.input} onFocus={event => event.target.select()} />}
            <label htmlFor="evaluation-email-message">Additional message (optional)</label>
            <textarea id="evaluation-email-message" maxLength={2000} rows={2} value={emailMessage} disabled={busy || emailSent} onChange={event => setEmailMessage(event.target.value)} style={styles.input} placeholder="Add a note for the supervisor" />
            <div className="evaluation-review-send">
              <button type="button" disabled={busy || emailSent} onClick={sendEmail} style={styles.generateBtn}><Icon name="mail" size={16} /> {emailSent ? 'Invitation sent' : busy ? 'Sending…' : 'Send invitation'}</button>
            </div>
          </section>}
        </section>}

      </div>

      {builderOpen && <EvaluationBuilderDialog value={formDefinition} onSave={setFormDefinition} onClose={() => setBuilderOpen(false)} />}
      {/* Evaluations Log Card */}
      <AlertDialog open={Boolean(deleteTarget)} title="Delete this evaluation?"
        description={deleteTarget ? `The record for ${deleteTarget.studentName || 'this student'} will be removed and its evaluation link will stop working. This cannot be undone.` : ''}
        confirmLabel="Delete" busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={deleteEvaluation} />
      <div className="evaluation-records-card" style={styles.card}>
          <div className="evaluation-records-header" style={styles.recordsHeader}>
          <div>
            <h3 style={styles.title}>Evaluation records</h3>
            <p style={styles.sub}>{evaluations.length} {evaluations.length === 1 ? 'evaluation' : 'evaluations'}</p>
          </div>
          <div className="evaluation-records-actions" style={styles.recordsActions}>
            <CoordinatorSearch value={searchQuery} onChange={value => { setSearchQuery(value); setCurrentPage(1); }} label="Search evaluations" placeholder="Search evaluations…" />
            <div className="evaluation-records-utilities" style={styles.recordsUtilityRow}>
              <PaginationButtonGroup
                align="right"
                page={currentPage}
                pageCount={pageCount}
                onPageChange={setCurrentPage}
              />
              <button
                type="button"
                onClick={refreshEvaluations}
                disabled={refreshing}
                style={styles.refreshButton}
              >
                <Icon name="refresh" size={14} />
                {refreshing ? 'Refreshing...' : 'Refresh evaluations'}
              </button>
            </div>
          </div>
        </div>

        {evaluations.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}><Icon name="clipboard" size={28} label="Evaluation records" /></div>
            <strong className="evaluation-empty-title">No evaluations yet</strong><p className="evaluation-empty-text">Evaluation links you create will show up here with their status.</p>
          </div>
        ) : (
          <div style={styles.recordsGrid}>
            {visibleEvaluations.map(item => {
              const submitted = item.submitted || item.used;
              return (
                <div className="evaluation-record" key={item.id} style={styles.recordCard}>
                  <div style={styles.recordTop}>
                    <div>
                      <h4 style={styles.recordStudent}>{item.studentName || item.studentId}</h4>
                      <div style={styles.recordCompany}>
                        <span><Icon name="building" size={14} /> {item.companyName}</span><br /><span>Supervisor: {item.supervisorName} ({item.supervisorEmail})</span>
                      </div>
                    </div>
                    <span style={{
                      ...styles.statusBadge,
                      backgroundColor: submitted ? COLORS.emerald50 : COLORS.yellow100,
                      color: '#000000',
                      border: `1px solid ${submitted ? COLORS.emerald200 : COLORS.yellow300}`,
                    }}>
                      {submitted ? 'Submitted' : 'Awaiting Response'}
                    </span>
                    <button type="button" className="evaluation-delete" aria-label={`Delete evaluation for ${item.studentName || 'student'}`} title="Delete evaluation" onClick={() => setDeleteTarget(item)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg>
                    </button>
                  </div>

                  <div className="evaluation-delivery"><span>Email delivery</span><p>{({ sent: 'Email service accepted the message. Inbox delivery is unconfirmed.', sending: 'Sending — awaiting confirmation', authorization_failed: 'Email wasn’t sent. Reconnect the email account before retrying.', delivery_unknown: 'Email status unknown. Check the email service before resending.', not_sent: 'Not sent' })[item.emailStatus || 'not_sent'] || 'Status unavailable'}</p></div>

                  {item.formDefinition && <p className="evaluation-form-title">{item.formDefinition.title}</p>}
                  {submitted && item.formDefinition && <div className="evaluation-custom-answers">{item.formDefinition.questions.map(question => <div key={question.id}><strong>{question.label}</strong><p>{item.answers?.[question.id] !== undefined ? `${item.answers[question.id]}${question.type === 'rating' ? '/5' : ''}` : 'Not answered (optional)'}</p></div>)}</div>}
                  {submitted && !item.formDefinition && (
                    <div style={styles.ratingsSection}>
                      <div style={styles.ratingsRow}>
                        <span style={styles.ratingLabel}>Criteria Scores:</span>
                        <div style={styles.ratingPills}>
                          {item.ratings && Object.entries(item.ratings).map(([k, v]) => (
                            <span key={k} style={styles.ratingChip}>
                              <span>{k.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase())}</span> <strong>{v}/5</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                      {item.comments && (
                        <div style={styles.commentsWrap}>
                          <strong>Supervisor feedback</strong><p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.comments}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  panel: {
    flex: 1,
    overflowY: 'auto',
    padding: 28,
    backgroundColor: COLORS.slate50,
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
    width: '100%',
    maxWidth: 'none',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: COLORS.white,
    border: `1px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.lg,
    padding: 24,
    boxShadow: THEME.shadows.xs,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.yellow100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
    flexShrink: 0,
    border: `1px solid ${COLORS.yellow300}`,
  },
  title: {
    margin: '0 0 2px',
    fontSize: 17,
    fontWeight: 800,
    color: '#000000',
  },
  sub: {
    margin: 0,
    color: '#000000',
    fontSize: 13,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: 800,
    color: '#000000',
    marginBottom: 6,
  },
  select: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '10px 14px',
    fontSize: 13,
    backgroundColor: COLORS.white,
    fontFamily: THEME.fonts.main,
    color: '#000000',
  },
  generateBtn: {
    backgroundColor: COLORS.sky600,
    color: COLORS.white,
    border: 'none',
    borderRadius: THEME.radius.md,
    padding: '12px 20px',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: 14,
    marginTop: 4,
    alignSelf: 'flex-start',
    boxShadow: '0 1px 2px rgba(2, 132, 199, 0.2)',
  },
  infoBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.sky50,
    color: '#000000',
    fontSize: 13,
    border: `1px solid ${COLORS.sky200}`,
  },
  errorBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: THEME.radius.md,
    backgroundColor: COLORS.rose50,
    color: '#000000',
    fontSize: 13,
    border: `1px solid ${COLORS.rose200}`,
  },
  recordsHeader: {
    gap: 24,
    flexWrap: 'wrap',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  recordsActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    width: 'min(100%, 460px)',
    flex: '0 1 460px',
  },
  recordsUtilityRow: {
    flexWrap: 'wrap',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  refreshButton: {
    backgroundColor: COLORS.white,
    border: `1.5px solid ${COLORS.slate300}`,
    borderRadius: THEME.radius.md,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    color: '#000000',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  recordsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  recordCard: {
    padding: 16,
    border: `1px solid ${COLORS.slate300}`,
    backgroundColor: COLORS.white,
    borderRadius: THEME.radius.md,
  },
  recordTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },
  recordStudent: {
    margin: '0 0 3px',
    fontSize: 15,
    fontWeight: 800,
    color: '#000000',
  },
  recordCompany: {
    fontSize: 13,
    color: '#000000',
  },
  statusBadge: {
    fontSize: 11,
    fontWeight: 800,
    padding: '3px 10px',
    borderRadius: THEME.radius.full,
  },
  ratingsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px solid ${COLORS.slate200}`,
  },
  ratingsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: 800,
    color: '#000000',
  },
  ratingPills: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 10,
  },
  ratingChip: {
    fontSize: 13,
    backgroundColor: COLORS.slate50,
    border: `1px solid ${COLORS.slate300}`,
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    borderRadius: THEME.radius.sm,
    color: '#000000',
  },
  commentsWrap: {
    fontSize: 13,
    color: '#000000',
    backgroundColor: COLORS.slate50,
    padding: 10,
    borderRadius: THEME.radius.sm,
    border: `1px solid ${COLORS.slate200}`,
    fontStyle: 'normal',
  },
  empty: {
    padding: 40,
    textAlign: 'center',
    color: '#000000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 14,
    background: '#eff6ff',
    color: '#2563eb',
    marginBottom: 12,
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
