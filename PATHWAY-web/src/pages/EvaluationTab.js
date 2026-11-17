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
import PaginationButtonGroup from '../components/PaginationButtonGroup'; // eslint-disable-line no-unused-vars
import CoordinatorSearch, { matchesCoordinatorSearch } from '../components/CoordinatorSearch';
import { EvaluationSkeleton } from '../components/PageSkeletons';
import './CoordinatorOperations.css';
import './EvaluationTab.css';
import { defaultEvaluationForm } from './EvaluationFormBuilder';
import EvaluationBuilderDialog from './EvaluationBuilderDialog';
import AlertDialog from '../components/AlertDialog';
import { PortalEmpty, PortalFormDialog } from '../components/PortalStates';
import SectionPicker from '../components/SectionPicker';
import Pager from '../components/Pager';
import { createPortal } from 'react-dom';
import './EvaluationRedesign.css';

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
  const [evFilter, setEvFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [topHost, setTopHost] = useState(null);
  useEffect(() => { setTopHost(document.getElementById('ev-top-actions')); }, []);

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

  void pageCount; void visibleEvaluations;

  if (loading) {
    return <EvaluationSkeleton />;
  }

  const placedIds = new Set(placedStudents.map(student => student.id));
  const latestByStudent = new Map();
  evaluations.filter(item => studentIds.has(item.studentId)).forEach(item => {
    const prev = latestByStudent.get(item.studentId);
    const rank = e => (e.submitted ? 2e15 : 0) + (Date.parse(e.submittedAt || e.expiresAt || 0) || 0);
    if (!prev || rank(item) > rank(prev)) latestByStudent.set(item.studentId, item);
  });
  const now = Date.now();
  const rate = v => { const n = Number(v); return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : null; };
  const questionsOf = item => Array.isArray(item?.formDefinition?.questions) ? item.formDefinition.questions : [];
  const scoreOf = item => {
    if (!item?.submitted) return null;
    const values = item.formDefinition
      ? questionsOf(item).filter(q => q?.type === 'rating').map(q => rate(item.answers?.[q.id])).filter(v => v != null)
      : Object.values(item.ratings || {}).map(rate).filter(v => v != null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const ago = value => { const days = Math.floor((now - Date.parse(value)) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`; };
  const short = value => new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const rows = students.filter(student => placedIds.has(student.id) || latestByStudent.has(student.id)).map(student => {
    const item = latestByStudent.get(student.id);
    const state = !item ? 'none' : item.submitted ? 'answered' : Date.parse(item.expiresAt) < now ? 'expired' : 'waiting';
    return { student, item, state, score: scoreOf(item) };
  }).filter(row => matchesCoordinatorSearch(searchQuery, personName(row.student), row.student.idNumber, row.item?.companyName || row.student.companyName || row.student.company))
    .sort((a, b) => compareStudents(a.student, b.student));
  const counts = { all: rows.length, waiting: rows.filter(r => r.state === 'waiting').length, answered: rows.filter(r => r.state === 'answered').length, expired: rows.filter(r => r.state === 'expired').length, none: rows.filter(r => r.state === 'none').length };
  const shownRows = evFilter === 'all' ? rows : rows.filter(r => r.state === evFilter);
  const evPages = Math.max(1, Math.ceil(shownRows.length / 10));
  const evPage = Math.min(currentPage, evPages);
  const pageRows = shownRows.slice((evPage - 1) * 10, evPage * 10);
  // average per rating question across answered evaluations
  const summary = new Map();
  rows.filter(r => r.state === 'answered').forEach(({ item }) => {
    if (item.formDefinition) questionsOf(item).filter(q => q?.type === 'rating').forEach(q => { const v = rate(item.answers?.[q.id]); const label = String(q.label || 'Question').trim(); if (v != null) { const s = summary.get(label) || []; s.push(v); summary.set(label, s); } });
    else Object.entries(item.ratings || {}).forEach(([k, v]) => { const n = rate(v); if (n == null) return; const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()); const s = summary.get(label) || []; s.push(n); summary.set(label, s); });
  });
  const answeredCount = counts.answered;
  const unsent = preparedInvitations.filter(item => !item.sent);
  const askStep = !preparedInvitations.length || remainingStudents.length ? 'who' : unsent.length ? 'review' : 'sent';
  const startOver = () => {
    setPreparedInvitations([]); setInvitation(null); setLink(''); setSelectedStudentIds([]); setCompanyKey(''); setStatus(''); setEmailMessage('');
    setForm({ studentId: '', companyName: '', supervisorName: '', supervisorEmail: '' });
  };
  const sendAll = async () => {
    if (busy) return;
    setBusy(true); setStatus('Sending invitations…');
    let failed = 0;
    for (const item of unsent) {
      try {
        await adminRequest('/coordinator/evaluations/' + encodeURIComponent(item.id) + '/email', { method: 'POST', body: JSON.stringify({ token: item.token, message: emailMessage }) });
        setPreparedInvitations(previous => previous.map(x => x.id === item.id ? { ...x, sent: true, sendFailed: false } : x));
        if (invitation?.id === item.id) setEmailSent(true);
      } catch (error) { failed += 1; setPreparedInvitations(previous => previous.map(x => x.id === item.id ? { ...x, sendFailed: true } : x)); setStatus(error.message); }
    }
    if (!failed) setStatus('');
    setBusy(false);
    try { await loadEvaluations(); } catch (_) { /* keep results */ }
  };
  const openAsk = student => {
    setPreparedInvitations([]); setInvitation(null); setLink(''); setSelectionOpen(false);
    if (student) {
      const key = companyFor(student);
      setCompanyKey(key); setSelectedStudentIds([student.id]);
      setForm({ studentId: '', companyName: student.company || student.companyName || '', supervisorName: student.supervisorName || '', supervisorEmail: student.supervisorEmail || '' });
    } else { setCompanyKey(''); setSelectedStudentIds([]); setForm({ studentId: '', companyName: '', supervisorName: '', supervisorEmail: '' }); }
    setAskOpen(true);
  };
  const dots = score => <span className="ev-dots" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <i key={n} data-on={score >= n - 0.25 || undefined} />)}</span>;
  const topControls = <>
    <button type="button" className="rq-btn ev-top-btn" disabled={busy} onClick={() => setBuilderOpen(true)}>Edit the questions</button>
    <button type="button" className="rq-btn rq-primary ev-top-btn" onClick={() => openAsk(null)}><Icon name="plus" size={14} /> Ask for an evaluation</button>
    <SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />
  </>;

  return (
    <div className="ev">
      {topHost ? createPortal(topControls, topHost) : <div className="rq-top-actions ev-inline-actions">{topControls}</div>}
      <div className="ev-main">
        <div className="ev-toolbar">
          <div className="rq-pills ev-pills" role="group" aria-label="Filter evaluations">
            {[['all', 'All', counts.all], ['waiting', 'Waiting for supervisor', counts.waiting], ['answered', 'Answered', counts.answered], ['expired', 'Link expired', counts.expired], ['none', 'Not asked yet', counts.none]].filter(([v, , n]) => v === 'all' || n > 0).map(([value, label, n]) =>
              <button key={value} type="button" aria-pressed={evFilter === value} onClick={() => { setEvFilter(value); setCurrentPage(1); }}>{label} {n}</button>)}
          </div>
          <CoordinatorSearch value={searchQuery} onChange={value => { setSearchQuery(value); setCurrentPage(1); }} label="Search students" placeholder="Find a student" />
        </div>
        {status && !askOpen && <p className="ev-status" role="status">{status}</p>}
        <div className="ev-list">
          {!selectedSection && <PortalEmpty compact icon="section" title="Choose a section" description="Pick a section at the top right." />}
          {selectedSection && !rows.length && <div className="lb-empty">
            <img src="/guide-thinking.png" alt="" aria-hidden="true" />
            <h3>No students to evaluate yet</h3>
            <p>Students show up here once they are placed in a company. Then you can ask their supervisor for an evaluation.</p>
          </div>}
          {selectedSection && rows.length > 0 && !shownRows.length && <p className="ev-none">No students in this view.</p>}
          {pageRows.map(({ student, item, state, score }) => {
            const open = expandedId === student.id;
            const chip = state === 'answered' ? [`Answered ${short(item.submittedAt || item.expiresAt)}`, 'green']
              : state === 'waiting' ? [`Waiting · ${item.emailAcceptedAt ? 'sent ' + ago(item.emailAcceptedAt) : 'not emailed'}`, 'amber']
              : state === 'expired' ? [`Link expired ${short(item.expiresAt)}`, 'red'] : ['Not asked yet', 'mute'];
            return <div key={student.id} className="ev-row" data-open={open || undefined}>
              <button type="button" className="ev-row-main" aria-expanded={item ? open : undefined} onClick={() => { if (!item) { if (placedIds.has(student.id)) openAsk(student); return; } setExpandedId(open ? null : student.id); }}>
                <span className="rq-avatar" aria-hidden="true">{((student.firstName || '?')[0] + (student.lastName || '')[0]).toUpperCase()}</span>
                <span className="ev-who"><strong>{personName(student)}</strong><small>{[item?.companyName || student.company || student.companyName, item?.supervisorName || student.supervisorName].filter(Boolean).join(' · ')}</small></span>
                <span className="ev-state"><b className="lb-chip" data-tone={chip[1]}>{chip[0]}</b></span>
                <span className="ev-score">{score != null ? <>{dots(score)}<strong>{score.toFixed(1)}</strong></> : <small>No score yet</small>}</span>
              </button>
              <span className="ev-action">
                {state === 'answered' && <button type="button" className="rq-link" onClick={() => setExpandedId(open ? null : student.id)}>{open ? 'Hide answers' : 'See answers'}</button>}
                {state === 'waiting' && <button type="button" className="rq-btn" onClick={() => openAsk(student)}>Ask again</button>}
                {state === 'expired' && <button type="button" className="rq-btn" onClick={() => openAsk(student)}>Send again</button>}
                {state === 'none' && <button type="button" className="rq-btn" disabled={!placedIds.has(student.id)} onClick={() => openAsk(student)}>Ask now</button>}
              </span>
              {open && item && <div className="ev-detail">
                <div className="ev-meta">
                  <span><small>Supervisor</small>{item.supervisorName}<em>{item.supervisorEmail}</em></span>
                  <span><small>Email</small>{({ sent: 'Sent', sending: 'Sending…', authorization_failed: 'Not sent', delivery_unknown: 'Unknown', not_sent: 'Not sent' })[item.emailStatus] || 'Not recorded'}</span>
                  <span><small>Link</small>{item.submitted ? `Answered ${short(item.submittedAt || item.expiresAt)}` : `Works until ${short(item.expiresAt)}`}</span>
                </div>
                {item.submitted && (() => {
                  const list = item.formDefinition
                    ? questionsOf(item).map((q, i) => ({ id: q?.id || 'q' + i, label: String(q?.label || `Question ${i + 1}`), rating: q?.type === 'rating', value: item.answers?.[q?.id] }))
                    : Object.entries(item.ratings || {}).map(([k, v]) => ({ id: k, label: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), rating: true, value: v }));
                  const ratings = list.filter(x => x.rating), texts = list.filter(x => !x.rating);
                  return <>
                    {ratings.length > 0 && <div className="ev-ratings">{ratings.map(x => <div key={x.id} className="ev-rating">
                      <span className="ev-q" title={x.label}>{x.label}</span>{rate(x.value) != null ? <>{dots(rate(x.value))}<strong>{rate(x.value)}<small> / 5</small></strong></> : x.value != null && x.value !== '' ? <strong className="ev-raw">{String(x.value)}</strong> : <small className="f48-muted ev-na">Not answered</small>}</div>)}</div>}
                    {texts.filter(x => x.value != null && String(x.value).trim()).map(x => <blockquote key={x.id} className="ev-quote"><small>{x.label}</small><p>{String(x.value)}</p></blockquote>)}
                    {!item.formDefinition && item.comments && <blockquote className="ev-quote"><small>Comments</small><p>{item.comments}</p></blockquote>}
                  </>;
                })()}
                <div className="ev-detail-foot"><button type="button" className="rq-link ev-delete" onClick={() => setDeleteTarget(item)}><Icon name="trash" size={13} /> Delete this evaluation</button></div>
              </div>}
            </div>;
          })}
        </div>
        {shownRows.length > 0 && <div className="rq-pages ev-pages"><span>{(evPage - 1) * 10 + 1}–{Math.min(evPage * 10, shownRows.length)} of {shownRows.length}</span><Pager page={evPage} pages={evPages} onGo={setCurrentPage} label="Evaluation pages" /></div>}
      </div>

      <aside className="ev-side">
        <h3>What supervisors say</h3>
        <div className="ev-card">
          {summary.size ? <>
            <p className="f48-muted">Average of {answeredCount} answer{answeredCount === 1 ? '' : 's'}, out of 5</p>
            {[...summary.entries()].map(([label, values]) => { const avg = values.reduce((a, b) => a + b, 0) / values.length; return <div key={label} className="ev-bar">
              <div><span title={label}>{label}</span><strong>{avg.toFixed(1)}</strong></div>
              <i><b style={{ width: `${(avg / 5) * 100}%` }} /></i></div>; })}
          </> : <p className="f48-muted">Scores appear here after supervisors answer.</p>}
        </div>
        <div className="ev-how"><strong>How it works</strong><p>The supervisor gets an email with a link. They confirm with a 6-digit code, answer {formDefinition.questions.length} questions, and the score shows up here.</p></div>
        <button type="button" className="rq-link ev-refresh" disabled={refreshing} onClick={refreshEvaluations}><Icon name="refresh" size={13} /> {refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </aside>

      {askOpen && <PortalFormDialog className="ev-ask" label="Ask for an evaluation" closeOnBackdrop onCancel={() => { if (!busy) setAskOpen(false); }}>
        <header className="ev-ask-head"><div><h2>Ask for an evaluation</h2>
          <p>{askStep === 'who' ? 'Step 1 of 2 · Who should answer?' : askStep === 'review' ? 'Step 2 of 2 · Check before sending' : 'All done'}</p></div>
          <button type="button" className="rq-icon" aria-label="Close" disabled={busy} onClick={() => setAskOpen(false)}><Icon name="x" size={16} /></button></header>
        {askStep !== 'sent' && <div className="ev-steps" aria-hidden="true"><i data-on /><i data-on={askStep === 'review' || undefined} /></div>}
        {askStep === 'who' && <form onSubmit={createLink} className="evaluation-panel ev-ask-form">

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
            <div ref={studentPicker} style={styles.field} className="evaluation-student-picker" onBlur={event => { const next = event.relatedTarget; if (next && !event.currentTarget.contains(next) && !next.contains(event.currentTarget)) setSelectionOpen(false); }} onKeyDown={event => { if (event.key === 'Escape' && selectionOpen) { event.preventDefault(); event.stopPropagation(); setSelectionOpen(false); studentPicker.current?.querySelector('button')?.focus(); } }}>
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
                {companyStudents.map(student => {
                  const locked = busy || preparedInvitations.length > 0;
                  const on = selectedStudentIds.includes(student.id);
                  const toggle = () => { if (!locked) updateSelection(on ? selectedStudentIds.filter(id => id !== student.id) : [...selectedStudentIds, student.id]); };
                  return <div key={student.id} className="evaluation-student-row" data-on={on || undefined} data-locked={locked || undefined} onClick={toggle}>
                    <input id={`evaluation-student-${student.id}`} type="checkbox" aria-label={`${personName(student)} ${student.idNumber || student.id}`} disabled={locked} checked={on}
                      onClick={event => event.stopPropagation()} onChange={toggle} />
                    <span>{personName(student)}<small>{student.idNumber || student.id}</small></span>
                  </div>;
                })}
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

          {preparedInvitations.length > 0 && remainingStudents.length > 0 && !busy && <p className="ev-ask-error" role="alert"><Icon name="alert" size={14} /> <span>{remainingStudents.length} student{remainingStudents.length === 1 ? '' : 's'} couldn’t be prepared. Press Next to try again.{status && !/^Preparing/.test(status) && <> Reason: <span>{status}</span></>}</span></p>}
          {status && !(preparedInvitations.length > 0 && remainingStudents.length > 0) && !/^Preparing/.test(status) && <p className="ev-ask-error" role="alert"><Icon name="alert" size={14} /> {status}</p>}
          <div className="ev-ask-foot">
            <button type="button" className="rq-btn" disabled={busy} onClick={() => setAskOpen(false)}>Cancel</button>
            <button type="submit" className="rq-btn rq-primary" disabled={busy || mixedSupervisors || !remainingStudents.length}>{busy ? 'Preparing…' : 'Next'} <Icon name="chevronRight" size={14} /></button>
          </div>
        </form>}
        {askStep === 'review' && <div className="ev-ask-review">
          {preparedInvitations.length > 1 && <div className="ev-tabs" role="group" aria-label="Invitations">
            {preparedInvitations.map(item => <button key={item.id} type="button" aria-pressed={invitation?.id === item.id} disabled={busy} onClick={() => showInvitation(item)}>
              <strong>{item.studentName}</strong> <span data-state={item.sent ? 'sent' : item.sendFailed ? 'failed' : 'ready'}>{item.sent ? 'Sent' : item.sendFailed ? 'Send failed' : 'Ready to send'}</span>
            </button>)}
          </div>}
          {link && invitation && <section key={invitation.id} className="ev-review" aria-label="Review invitation">
            <div><span>To</span><strong>{invitation.supervisorName}<em>{invitation.email}</em></strong></div>
            <div><span>About</span><strong>{invitation.studentName}{emailSent && <b className="lb-chip" data-tone="green">Sent</b>}</strong></div>
            <div><span>Subject</span><strong>PATHWAY supervisor evaluation request</strong></div>
            <div><span>Link</span><strong>Works for 7 days</strong></div>
          </section>}
          <label className="ev-note" htmlFor="evaluation-email-message">Add a note (optional)
            <textarea id="evaluation-email-message" maxLength={2000} rows={3} value={emailMessage} disabled={busy || emailSent} onChange={event => setEmailMessage(event.target.value)} placeholder="e.g. Thank you for guiding Jose this semester." /></label>
          {status && /could not|error|failed|not |invalid|denied|verify/i.test(status) && !/does not confirm/i.test(status) && <p className="ev-ask-error" role="alert"><Icon name="alert" size={14} /> {status}</p>}
          <div className="ev-ask-foot">
            <button type="button" className="rq-link" disabled={busy} onClick={startOver}>Start over</button>
            <span className="f48-grow" />
            <button type="button" className="rq-btn" disabled={busy || !link} onClick={copyToClipboard}>{copied ? 'Copied' : 'Copy link'}</button>
            {unsent.length > 1 && <button type="button" className="rq-btn" disabled={busy} onClick={sendAll}>Send all {unsent.length}</button>}
            <button type="button" className="rq-btn rq-primary" disabled={busy || emailSent} onClick={sendEmail}><Icon name="mail" size={14} /> {emailSent ? 'Invitation sent' : busy ? 'Sending…' : 'Send invitation'}</button>
          </div>
        </div>}
        {askStep === 'sent' && <div className="ev-ask-done">
          <img src="/email/email-guide-thumbsup.gif" alt="" aria-hidden="true" onError={event => { event.currentTarget.src = '/guide-thinking.png'; }} />
          <h3>{preparedInvitations.length === 1 ? `Invitation sent to ${preparedInvitations[0].supervisorName}` : `${preparedInvitations.length} invitations sent`}</h3>
          <p>They’ll get an email with a private link. Their score shows up here once they answer. The link works for 7 days.</p>
          <small>“Sent” means the email service accepted it, not that it was read.</small>
          <div className="ev-ask-foot ev-ask-center">
            <button type="button" className="rq-btn" onClick={startOver}>Ask for another</button>
            <button type="button" className="rq-btn rq-primary" onClick={() => setAskOpen(false)}>Done</button>
          </div>
        </div>}
      </PortalFormDialog>}
      {builderOpen && <EvaluationBuilderDialog value={formDefinition} onSave={setFormDefinition} onClose={() => setBuilderOpen(false)} />}
      <AlertDialog open={Boolean(deleteTarget)} title="Delete this evaluation?"
        description={deleteTarget ? `The record for ${deleteTarget.studentName || 'this student'} will be removed and its link will stop working. This can’t be undone.` : ''}
        confirmLabel="Delete" busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={deleteEvaluation} />
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
