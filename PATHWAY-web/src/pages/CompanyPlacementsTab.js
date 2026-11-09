import CoordinatorRecordPicker from '../components/CoordinatorRecordPicker';
import { compareStudents } from '../coordinatorStudentSort';
import { PortalFormDialog } from '../components/PortalStates';
import { canAssignPlacement } from '../coordinatorOverviewData';
import { placementStatusLabel, placementStudentQueue } from '../placementStudentQueue';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import SubmissionNotifications, { submissionTime } from '../components/SubmissionNotifications';
import CoordinatorSearch from '../components/CoordinatorSearch';
import AlertDialog from '../components/AlertDialog';
import EndorsementDraftDialog from '../components/EndorsementDraftDialog';
import { adminRequest } from '../adminApi';
import PlacementCompanies from '../components/PlacementCompanies';
import CompanyConversations from '../components/CompanyConversations';
import './PlacementReviews.css';



export default function CompanyPlacementsTab({ department, selectedSection, students = [], overviewView }) {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [workspace, setWorkspace] = useState('reviews');
  const [companySelections, setCompanySelections] = useState({});
  const [finalItems, setFinalItems] = useState([]);
  const [history, setHistory] = useState(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [historyPaging, setHistoryPaging] = useState(null);
  const [endorsementItems, setEndorsementItems] = useState([]);
  const [verifiedEndorsementItems, setVerifiedEndorsementItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [requestsOnly, setRequestsOnly] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [draftBusy, setDraftBusy] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState('');
  const [deliveryConfirm, setDeliveryConfirm] = useState(null);
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const [endorsementDraft, setEndorsementDraft] = useState(null);
  const [reasons, setReasons] = useState({});
  const [reviewStage, setReviewStage] = useState('all');
  const [queueFilter, setQueueFilter] = useState('action');
  const [selectedQueueStudent, setSelectedQueueStudent] = useState(null);
  useEffect(() => { setSelectedQueueStudent(null); setQueueFilter('action'); setAssignmentOpen(overviewView === 'assign'); setRequestsOnly(overviewView === 'requests'); }, [selectedSection?.id, overviewView]);
  const [reviewSearch, setReviewSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [reviewConfirm, setReviewConfirm] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    if (!silent) setLoading(true);
    setHistoryRevision(value => value + 1);
    setError('');
    try {
      if (!selectedSection?.id) {
        setCompanies([]);

        setAssignedStudents([]);
        setItems([]);
        setFinalItems([]);

        setEndorsementItems([]);
        setVerifiedEndorsementItems([]);
        return;
      }
      const scopedFilters = [where('sectionId', '==', selectedSection.id), where('department', '==', department)];
      const [snap, finalSnap, endorsementSnap, directory, studentSnap] = await Promise.all([
        getDocs(query(collection(db, 'companyProposals'), ...scopedFilters)),
        getDocs(query(collection(db, 'finalReviewRequests'), ...scopedFilters)),
        getDocs(query(collection(db, 'endorsements'), ...scopedFilters)),
        adminRequest('/coordinator/company-directory'),
        getDocs(query(collection(db, 'users'), ...scopedFilters, where('role', '==', 'student'))),
      ]);
      if (!isRefreshCurrent()) return;
      const proposals = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !selectedSection || item.sectionId === selectedSection.id);
      setItems(proposals);
      setCompanies(directory.companies || []);
      setAssignedStudents(studentSnap.docs.map(item => ({ ...item.data(), id: item.id })));

      const endorsements = endorsementSnap.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setEndorsementItems(endorsements.filter(item => item.status === 'awaiting_document'));
      setVerifiedEndorsementItems(endorsements.filter(item => item.status === 'signed_copy_verified'));
      setCompanySelections(previous => Object.fromEntries(proposals.map(item => [item.id, previous[item.id] || item.companyId || ''])));
      setFinalItems(finalSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !selectedSection || item.sectionId === selectedSection.id));
    } catch (loadError) {
      if (!isRefreshCurrent()) return;
      console.error('Company placement load error:', loadError);
      setError(loadError.code === 'permission-denied'
        ? 'You do not have permission to view placement requests for this section. Confirm that the deployed Firestore rules are current.'
        : loadError.message || 'Could not load company placement requests. Check your connection and try again.');
      setItems([]);
      setCompanies([]);
      setAssignedStudents([]);

      setEndorsementItems([]);
      setVerifiedEndorsementItems([]);
      setFinalItems([]);
    } finally { setLoading(false); }
  }, [selectedSection, department]);

  usePortalAutoRefresh(load, { enabled: !loading && !busy && !draftBusy && !deliveryBusy, scope: selectedSection?.id || '', protectInputs: true });

  useEffect(() => { load(); }, [load]);

  const historyOpen = queueFilter === 'history' || (selectedQueueStudent && reviewStage === 'history');
  const sectionId = selectedSection?.id;
  useEffect(() => {
    if (queueFilter !== 'history') return;
    const timer = setTimeout(() => setHistorySearch(reviewSearch.trim().slice(0, 150)), 300);
    return () => clearTimeout(timer);
  }, [queueFilter, reviewSearch]);
  const historyTerm = queueFilter === 'history' ? historySearch : '';
  const historyScope = sectionId + ':' + historyRevision + ':' + historyTerm;
  const historyCursors = historyPaging?.scope === historyScope ? historyPaging.cursors : [null];
  const historyCursor = historyCursors.at(-1);
  const historyKey = historyScope + ':' + (historyCursor || '');
  const currentHistory = history?.key === historyKey ? history : null;
  const historyItems = currentHistory?.items || [];
  useEffect(() => {
    if (!historyOpen || !sectionId || currentHistory) return;
    let active = true;
    adminRequest('/coordinator/placement-history?sectionId=' + encodeURIComponent(sectionId) + '&page=true'
      + (historyCursor ? '&cursor=' + encodeURIComponent(historyCursor) : '')
      + (historyTerm ? '&search=' + encodeURIComponent(historyTerm) : ''))
      .then(data => { if (active) setHistory({ key: historyKey, items: data.history || [], nextCursor: data.nextCursor || null }); })
      .catch(() => { if (active) setHistory({ key: historyKey, error: 'Could not load placement history.' }); });
    return () => { active = false; };
  }, [historyOpen, sectionId, currentHistory, historyKey, historyCursor, historyTerm]);
  useEffect(() => { setEndorsementDraft(null); }, [selectedSection?.id]);
  useEffect(() => { setDeliveryConfirm(null); setDeliveryNotice(''); }, [selectedSection?.id]);
  useEffect(() => { setReasons({}); setReviewConfirm(null); setReviewSearch(''); setReviewStatus('all'); }, [selectedSection?.id]);

  const pendingStudents = new Set(items.filter(item => item.status === 'pending_review').map(item => item.studentId));
  const waitingStudents = assignedStudents.filter(student => student.sectionId === selectedSection?.id
    && canAssignPlacement(student, pendingStudents));
  const activeCompanies = companies.filter(company => company.active !== false && company.status !== 'inactive');

  const assignPlacement = async event => {
    event.preventDefault();
    if (busy || !selectedSection?.id) return;
    const { studentId, ...fields } = Object.fromEntries(new FormData(event.currentTarget));
    setBusy('assignment');
    setAssignmentError('');
    try {
      await adminRequest('/coordinator/sections/' + encodeURIComponent(selectedSection.id)
        + '/placements/' + encodeURIComponent(studentId) + '/assign', {
        method: 'POST', body: JSON.stringify(fields),
      });
      setAssignmentOpen(false);
      await load();
    } catch (error) {
      setAssignmentError(error.message || 'Unable to assign this placement.');
    } finally { setBusy(''); }
  };

  const review = async (item, status) => {
    const note = (reasons[`placement:${item.id}`] || '').trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { window.alert('Enter a reason before returning this proposal.'); return false; }
    setBusy(item.id);
    try {
      const companyId = companySelections[item.id] || item.companyId || '';
      if (status === 'approved' && !companyId) {
        window.alert('Assign this proposal to an active company in the directory before approving it.');
        return false;
      }
      await adminRequest(`/coordinator/company-placements/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST', body: JSON.stringify({ status, reason: note, ...(status === 'approved' ? { companyId } : {}) }),
      });
      setReasons(previous => ({ ...previous, [`placement:${item.id}`]: '' }));
      if (status === 'approved') setEndorsementDraft(null);
      await load();
      return true;
    } catch (error) { window.alert(error.message || 'Unable to review placement.'); return false; } finally { setBusy(''); }
  };

  const reviewFinal = async (item, status) => {
    const note = (reasons[`final:${item.id}`] || '').trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { window.alert('Enter a reason before returning this review.'); return false; }
    setBusy(item.id);
    try {
      await adminRequest(`/coordinator/final-reviews/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status, reason: note }),
      });
      setReasons(previous => ({ ...previous, [`final:${item.id}`]: '' })); await load();
      return true;
    } catch (error) { window.alert(error.message || 'Unable to review final request.'); return false; } finally { setBusy(''); }
  };

  const prepareEndorsementDraft = async item => {
    setDraftBusy(item.id);
    try {
      const proposalId = item.proposalId || item.id;
      const result = await adminRequest(`/coordinator/endorsements/${encodeURIComponent(proposalId)}/draft`, {
        method: 'POST', body: JSON.stringify({}),
      });
      setEndorsementDraft(result.draft);
      setEndorsementItems(previous => previous.map(record => record.id === item.id ? {
        ...record, draftStatus: 'prepared', draftPreparedAt: result.draft.preparedAt,
        draftPreparedByName: result.draft.preparedBy, draftVersion: result.draft.draftVersion,
      } : record));
    } catch (error) {
      window.alert(error.message || 'Unable to prepare the endorsement draft.');
    } finally { setDraftBusy(''); }
  };

  const viewPreparedDraft = item => {
    if (!item.draftSnapshot || !item.draftVersion || !item.draftPreparedAt) return;
    setEndorsementDraft({
      ...item.draftSnapshot,
      proposalId: item.proposalId || item.id,
      draftVersion: item.draftVersion,
      templateVersion: item.draftTemplateVersion || 'unknown',
      preparedAt: item.draftPreparedAt,
      preparedBy: item.draftPreparedByName || 'Coordinator',
    });
  };

  const sendEndorsement = async item => {
    setDeliveryBusy(item.id);
    setDeliveryNotice('');
    try {
      await adminRequest(`/coordinator/endorsements/${encodeURIComponent(item.proposalId || item.id)}/send`, {
        method: 'POST', body: JSON.stringify({}),
      });
      setDeliveryNotice('The signed endorsement was accepted by the email server for both recipients.');
    } catch (sendError) {
      setDeliveryNotice(sendError.message || 'Delivery failed. Check each recipient status before retrying.');
    } finally {
      setDeliveryBusy('');
      setDeliveryConfirm(null);
      await load();
    }
  };

  const requestReviewConfirmation = (item, status, finalReview = false) => {
    const note = (reasons[`${finalReview ? 'final' : 'placement'}:${item.id}`] || '').trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) {
      window.alert(finalReview ? 'Enter a reason before returning this review.' : 'Enter a reason before returning this proposal.');
      return;
    }
    setReviewConfirm({ item, status, finalReview });
  };

  const reviewStudentName = item => {
    const student = students.find(candidate => candidate.id === item.studentId);
    const currentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim();
    return currentName || item.studentName || items.find(proposal => proposal.studentId === item.studentId)?.studentName || item.studentId;
  };

  const matchesReview = item => {
    const term = reviewSearch.trim().toLowerCase();
    return (!term || selectedQueueStudent || [reviewStudentName(item), item.studentId, item.companyName, item.companySnapshot?.companyName, item.supervisorName, item.companySnapshot?.supervisorName].some(value => String(value || '').toLowerCase().includes(term)))
      && (reviewStatus === 'all' || item.status === reviewStatus)
      && item.studentId === selectedQueueStudent;
  };
  const sortedReviews = records => [...records].filter(matchesReview).sort((a, b) =>
    Number(b.status === 'pending_review') - Number(a.status === 'pending_review')
    || String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')));
  const pendingPlacements = items.filter(item => item.status === 'pending_review').length;
  const pendingFinalReviews = finalItems.filter(item => item.status === 'pending_review').length;
  const placementNotices = [
    ...items.filter(item => item.status === 'pending_review').map(item => ({ ...item, stage: 'placement', noticeTitle: 'Company placement awaiting review' })),
    ...finalItems.filter(item => item.status === 'pending_review').map(item => ({ ...item, stage: 'final', noticeTitle: 'Final approval awaiting review' })),
    ...endorsementItems.map(item => ({ ...item, stage: 'endorsement', noticeTitle: 'Endorsement awaiting signed copy' })),
  ].map(item => ({ id: `${item.stage}/${item.id}/${submissionTime(item.submittedAt || item.updatedAt || item.createdAt)}`, stage: item.stage,
    student: { id: item.studentId, firstName: reviewStudentName(item) },
    title: `${item.noticeTitle} — ${item.companyName || item.companySnapshot?.companyName || 'Company not provided'}`,
    createdAt: item.submittedAt || item.updatedAt || item.createdAt }));

  const queueRows = placementStudentQueue({ placements: items, finals: finalItems, endorsements: endorsementItems, verified: verifiedEndorsementItems, history: historyItems, nameFor: reviewStudentName });
  const studentIdsByUid = new Map([...students, ...assignedStudents].map(student => [student.id, student.idNumber]));
  const queueTerm = reviewSearch.trim().toLowerCase();
  const filteredQueue = queueRows.filter(row => (!requestsOnly || pendingStudents.has(row.id)) && (queueFilter === 'action' ? row.needsAction : queueFilter === 'history' ? row.hasHistory : !row.needsAction && row.tasks.some(task => task.stage !== 'history'))
    && (queueFilter === 'history' || [row.name, row.id, studentIdsByUid.get(row.id) || '', row.company, ...row.tasks.map(task => task.record.companyName || task.record.companySnapshot?.companyName || task.record.after?.companyName || '')].some(value => String(value).toLowerCase().includes(queueTerm))));
  const queuePage = useRecordPage(filteredQueue.sort(compareStudents), (selectedSection?.id || '') + ':' + queueFilter + ':' + reviewSearch);
  const selectedQueue = queueRows.find(row => row.id === selectedQueueStudent);
  const openStudent = row => { setSelectedQueueStudent(row.id); setReviewStage(queueFilter === 'history' ? 'history' : 'all'); setReviewStatus('all'); };
  const placementPage = useRecordPage(sortedReviews(items), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const finalPage = useRecordPage(sortedReviews(finalItems), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const endorsementPage = useRecordPage(endorsementItems.filter(matchesReview), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const verifiedPage = useRecordPage(verifiedEndorsementItems.filter(matchesReview), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const historyPage = useRecordPage(historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  if (loading) return <div style={{ padding: 32 }}>Loading company placements...</div>;
  return <div className="placement-page" style={{ padding: 28, overflowY: 'auto', flex: 1, background: '#F8FAFC' }}>

    <div className="placement-page-header">
      <div>
      <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>Assignments and reviews for {selectedSection ? selectedSection.name : 'your selected section'}.</p></div>
      <div className="review-actions">
        <button type="button" className="placement-refresh" onClick={load} disabled={!selectedSection}>Refresh placements</button>
        {selectedSection && !error && <button type="button" className="portal-primary" disabled={!!busy}
          onClick={() => { setAssignmentError(''); setAssignmentOpen(true); }}>Assign placement</button>}
      </div>
    </div>
    <div className="placement-workspace-tabs" role="group" aria-label="Placement workspace">
      <button type="button" aria-pressed={workspace === 'companies'} onClick={() => setWorkspace('companies')}>Companies</button>
      <button type="button" aria-pressed={workspace === 'reviews'} onClick={() => setWorkspace('reviews')}>Placement Reviews</button>
    </div>
    {workspace === 'reviews' && <div className="placement-review-top-toolbar">
      <CoordinatorSearch value={reviewSearch} onChange={setReviewSearch}
        label="Search placement reviews by student or company" placeholder="Search student name or company…" />
      <SubmissionNotifications kind="placements" coordinatorId={auth?.currentUser?.uid} section={selectedSection}
        suppliedItems={error ? [] : placementNotices} onRefresh={load}
        onOpen={(student, item) => { setWorkspace('reviews'); setQueueFilter('action'); setSelectedQueueStudent(student.id); setReviewStage('all'); setReviewStatus('all'); setReviewSearch(''); }} />
    </div>}

    {error && <div role="alert" style={{ padding: 14, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginTop: 14 }}>{error}</div>}
    {workspace === 'companies' && selectedSection && !error && <PlacementCompanies key={selectedSection.id} companies={companies} students={assignedStudents} sectionName={selectedSection.name} />}
    {workspace === 'companies' && items.some(item => item.status === 'pending_review') && <div style={{ marginTop: 16, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, background: '#FFF' }}>
      <p style={{ margin: '0 0 12px', color: '#475569' }}>Submitted requests appear in Placement Reviews. Students appear under a company after their placement is approved.</p>
      <button type="button" className="placement-refresh" onClick={() => setWorkspace('reviews')}>Review pending placements ({items.filter(item => item.status === 'pending_review').length})</button>
    </div>}
    {!selectedSection && <p>Select a section to view company placements.</p>}
    {assignmentOpen && selectedSection && <PortalFormDialog className="placement-student-detail" label="Assign placement"
      onCancel={() => { if (!busy) setAssignmentOpen(false); }}>
      <header><div><h2>Assign placement</h2><p>{selectedSection.name}</p></div></header>
      <form className="placement-detail-body" onSubmit={assignPlacement}>
        <p>Use Placement Reviews for students with a pending request.</p>
        {!waitingStudents.length && <p>No students are waiting for a direct assignment in this section.</p>}
        {!activeCompanies.length && <p>Add an active company in Company Directory before assigning a placement.</p>}
        <fieldset className="placement-assignment-fields" disabled={!!busy || !waitingStudents.length || !activeCompanies.length}>
          <CoordinatorRecordPicker label="Student" name="studentId" required options={[...waitingStudents].sort(compareStudents).map(student => ({
            id: student.id,
            label: [student.firstName, student.lastName].filter(Boolean).join(' ') + ' · ' + (student.idNumber || student.id),
          }))} />
          <CoordinatorRecordPicker label="Company" name="companyId" required options={activeCompanies.map(company => ({ id: company.id, label: company.name }))} />
          <label>Supervisor name<input name="supervisorName" required maxLength={160} /></label>
          <label>Supervisor email<input name="supervisorEmail" type="email" required maxLength={254} /></label>
          <label>Internship role or department<input name="internshipRole" required maxLength={160} /></label>
          <label>Work arrangement<select name="workArrangement" required defaultValue="">
            <option value="" disabled>Choose an arrangement</option><option>On-site</option><option>Remote</option><option>Hybrid</option>
          </select></label>
          <label>Start date<input name="startDate" type="date" required /></label>
          <label>End date<input name="endDate" type="date" required /></label>
        </fieldset>
        {assignmentError && <p role="alert">{assignmentError}</p>}
        <div className="review-actions">
          <button type="button" disabled={!!busy} onClick={() => setAssignmentOpen(false)}>Cancel</button>
          <button type="submit" className="review-approve" disabled={!!busy || !waitingStudents.length || !activeCompanies.length}>
            {busy === 'assignment' ? 'Assigning…' : 'Confirm assignment'}
          </button>
        </div>
      </form>
    </PortalFormDialog>}
    <div className="placement-reviews" hidden={workspace !== 'reviews'}>
    <div className="placement-queue-filters" role="group" aria-label="Placement queue">
      {[['action','To review or complete'],['completed','No action needed'],['history','Placement history']].map(([value,label]) => <button type="button" key={value} aria-pressed={queueFilter === value} onClick={() => { setRequestsOnly(false); setQueueFilter(value); setSelectedQueueStudent(null); }}>
        {label} {value !== 'history' && <span>{error ? '—' : queueRows.filter(row => value === 'action' ? row.needsAction : !row.needsAction && row.tasks.some(task => task.stage !== 'history')).length}</span>}
      </button>)}
    </div>
    {requestsOnly && <p className="placement-queue-help">Showing students with pending placement requests. <button type="button" className="portal-secondary" onClick={() => setRequestsOnly(false)}>Show all tasks</button></p>}
    <p className="placement-queue-help">{queueFilter === 'action' ? 'Start with the next action for each student. Open a student to see all outstanding tasks.' : queueFilter === 'history' ? 'Previous decisions, grouped by student on each page.' : 'Students with no outstanding placement tasks in the loaded records.'}</p>
    {queueFilter === 'history' && (historyCursors.length > 1 || currentHistory?.nextCursor) && <nav className="portal-record-pagination" aria-label="Placement history pages">
      <button type="button" className="portal-secondary" disabled={historyCursors.length <= 1}
        onClick={() => setHistoryPaging({ scope: historyScope, cursors: historyCursors.slice(0, -1) })}>Previous</button>
      <span>Page {historyCursors.length}</span>
      <button type="button" className="portal-secondary" disabled={!currentHistory?.nextCursor}
        onClick={() => setHistoryPaging({ scope: historyScope, cursors: [...historyCursors, currentHistory.nextCursor] })}>Next</button>
    </nav>}
    <RecordPagination pagination={queuePage} label="Placement students" />
    <div className="placement-queue-table"><table><thead><tr><th>Student ID</th><th>Student name</th><th>Company</th><th>Current step</th><th>Next action</th></tr></thead><tbody>
      {queuePage.items.map(row => <tr key={row.id}><td>{studentIdsByUid.get(row.id) || '—'}</td><td><strong>{row.name}</strong><small>{row.tasks.filter(task=>task.needsAction).length || 0} outstanding tasks</small></td><td>{row.company}</td><td>{queueFilter === 'history' ? 'Previous decisions' : row.current.step}</td><td><button type="button" className="portal-secondary" onClick={() => openStudent(row)}>{queueFilter === 'history' ? 'View history' : row.current.action}<span className="sr-only"> for {row.name}</span></button></td></tr>)}
    </tbody></table>{!filteredQueue.length && <div className="review-empty">{error ? 'Placement records could not load. Use Refresh placements to try again.' : queueFilter === 'history' && !currentHistory ? 'Loading placement history…' : queueFilter === 'history' && currentHistory.error ? currentHistory.error : reviewSearch ? (queueFilter === 'history' && currentHistory?.nextCursor ? 'No matches on this page. Choose Next to search older decisions.' : 'No students match this search.') : queueFilter === 'action' ? 'No placement tasks need attention in this section.' : 'No students in this view yet.'}</div>}</div>
    {selectedQueue && !reviewConfirm && !deliveryConfirm && !endorsementDraft && <PortalFormDialog className="placement-student-detail" label={'Placement details for ' + selectedQueue.name} onCancel={() => setSelectedQueueStudent(null)}>
      <header><div><h2>{selectedQueue.name}</h2><p>Placement steps and decisions</p></div><button type="button" className="portal-secondary" onClick={() => setSelectedQueueStudent(null)}>Close</button></header>
      <div className="placement-task-overview"><strong>Next: {selectedQueue.current.step}</strong><ul>{selectedQueue.tasks.filter(task=>task.needsAction).map(task=><li key={task.stage+task.record.id}>{task.step}</li>)}</ul></div>
      <div className="placement-detail-tabs" role="group" aria-label="Student placement details"><button type="button" aria-pressed={reviewStage==='all'} onClick={()=>setReviewStage('all')}>Tasks & decisions</button><button type="button" aria-pressed={reviewStage==='history'} onClick={()=>setReviewStage('history')}>History</button></div>
      <div className="placement-detail-body">

    <section hidden={reviewStage !== 'all' || !items.some(item=>item.studentId===selectedQueueStudent)}>
    <div className="review-section-heading"><h3>Review placement</h3><p>Confirm the company, supervisor, and schedule before assigning an official placement.</p></div>
    {sortedReviews(items).length === 0 && <div className="review-empty">No company placement requests match this view.</div>}
    <RecordPagination pagination={placementPage} label="Company requests" />
    {placementPage.items.map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><h3 style={{ margin: 0 }}>{item.companyName || 'Unnamed company'}</h3><div style={{ color: '#64748B', marginTop: 4 }}>{item.studentName || item.studentId} · {item.internshipRole || 'Role not specified'}</div></div><strong>{placementStatusLabel(item.status)}</strong></div>
      <p><b>Address:</b> {item.companyAddress || '—'}<br /><b>Supervisor:</b> {item.supervisorName || '—'} ({item.supervisorEmail || '—'})<br /><b>Schedule:</b> {item.startDate || '—'} to {item.endDate || '—'} · {item.workArrangement || '—'}</p>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      {item.status === 'pending_review' && <>
        <CoordinatorRecordPicker label={`Official company assignment for ${item.studentName || item.studentId}`}
          value={companySelections[item.id] || ''}
          onChange={companyId => setCompanySelections(previous => ({ ...previous, [item.id]: companyId }))}
          options={companies.filter(company => company.active).map(company => {
            const full = company.availableSlots === 0 && company.id !== item.companyId;
            const unavailable = company.capacity === null;
            const slots = unavailable ? 'slot limit not set' : full ? 'at capacity' : `${company.availableSlots} available`;
            return { id: company.id, label: `${company.name} · ${slots}`, disabled: full || unavailable };
          })} />
        <div className="review-decision"><label>Feedback for this student<input aria-label={`Placement feedback for ${reviewStudentName(item)}`} value={reasons[`placement:${item.id}`] || ''} onChange={e => setReasons(previous => ({ ...previous, [`placement:${item.id}`]: e.target.value }))} placeholder="Reason for changes or rejection" /></label><div className="review-actions"><button className="review-approve" disabled={busy === item.id || !(companySelections[item.id] || item.companyId)} onClick={() => requestReviewConfirmation(item, 'approved')}>Approve</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision')}>Request changes</button><button className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected')}>Reject</button></div></div>
      </>}
    </article>)}
    </section>
    <section hidden={reviewStage !== 'all' || !finalItems.some(item=>item.studentId===selectedQueueStudent)}>
    <div className="review-section-heading"><h3>Review internship tracking access</h3><p>Review the saved submission before granting access to internship tracking.</p></div>
    {sortedReviews(finalItems).length === 0 && <div className="review-empty">No final review requests match this view.</div>}
    <RecordPagination pagination={finalPage} label="Final approvals" />
    {finalPage.items.map(item => <article className="review-card" key={item.id}>
      <h3 style={{ margin: 0 }}>Final placement review</h3><p><b>Student:</b> {reviewStudentName(item)}<br /><b>Company:</b> {item.companySnapshot?.companyName || '—'}<br /><b>Supervisor:</b> {item.companySnapshot?.supervisorName || '—'}<br /><b>Requirements:</b> {item.requirementSnapshot?.filter(docItem => ['submitted', 'approved'].includes(docItem.status)).length || 0} submitted</p>
      <strong>{placementStatusLabel(item.status)}</strong>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      <details className="review-documents"><summary>View requirement statuses</summary>{(item.requirementSnapshot || []).map((requirement, index) => <div key={requirement.id || index}><span>{requirement.name || requirement.title || requirement.id || 'Requirement'}</span><strong>{requirement.status || 'Not submitted'}</strong></div>)}</details>
      {item.status === 'pending_review' && <div className="review-decision"><label>Feedback for this student<input aria-label={`Final review feedback for ${reviewStudentName(item)}`} value={reasons[`final:${item.id}`] || ''} onChange={e => setReasons(previous => ({ ...previous, [`final:${item.id}`]: e.target.value }))} placeholder="Reason for changes or rejection" /></label><div className="review-actions"><button className="review-approve" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'approved', true)}>Approve internship tracking</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision', true)}>Request changes</button><button className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected', true)}>Reject</button></div></div>}
    </article>)}
    </section>
    <section hidden={reviewStage !== 'all' || ![...endorsementItems,...verifiedEndorsementItems].some(item=>item.studentId===selectedQueueStudent)}>
    <h3 style={{ marginTop: 30 }}>Endorsement letter</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Approved placements awaiting a signed endorsement letter. These records are not issued documents or email deliveries.</p>
    {endorsementItems.filter(matchesReview).length === 0 && <div className="review-empty">No pending endorsement paperwork matches this view.</div>}
    <RecordPagination pagination={endorsementPage} label="Endorsements" />
    {endorsementPage.items.map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{item.studentName || item.studentId}</strong>
        <span style={{ color: '#0369A1', fontWeight: 700, fontSize: 13 }}>Awaiting signed letter</span>
      </div>
      <p style={{ margin: '10px 0 5px' }}><b>{item.companyName || 'Company not recorded'}</b> · {item.internshipRole || 'Role not specified'}</p>
      <div style={{ color: '#475569', fontSize: 13 }}>Supervisor: {item.supervisorName || '—'} · {item.startDate || '—'} to {item.endDate || '—'}</div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>Approved {item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleString() : 'date unavailable'} · Not sent</div>
      {item.draftVersion > 0 && <div style={{ color: '#475569', fontSize: 12, marginTop: 5 }}>
        Draft v{item.draftVersion} prepared{item.draftPreparedAt && !Number.isNaN(Date.parse(item.draftPreparedAt)) ? ` ${new Date(item.draftPreparedAt).toLocaleString()}` : ''}{item.draftPreparedByName ? ` by ${item.draftPreparedByName}` : ''}. The signed letter is still outstanding.
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {item.draftVersion > 0 && <button type="button" onClick={() => viewPreparedDraft(item)}
          style={{ border: '1px solid #BAE6FD', borderRadius: 8, padding: '9px 13px', background: '#F0F9FF', color: '#075985', fontWeight: 700, cursor: 'pointer' }}>
          View latest draft
        </button>}
        <button type="button" disabled={draftBusy === item.id} onClick={() => prepareEndorsementDraft(item)}
          style={{ border: 0, borderRadius: 8, padding: '9px 13px', background: draftBusy === item.id ? '#94A3B8' : '#0284C7', color: '#fff', fontWeight: 700, cursor: draftBusy === item.id ? 'wait' : 'pointer' }}>
          {draftBusy === item.id ? 'Preparing draft…' : item.draftVersion > 0 ? 'Prepare next version' : 'Prepare endorsement draft'}
        </button>
      </div>
    </article>)}
    <h3 style={{ marginTop: 30 }}>Signed endorsement letter and email status</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Only the verified private signed copy can be emailed to the student and official company contact. Email-server acceptance is recorded separately for each recipient.</p>
    {deliveryNotice && <div role="status" style={{ padding: 12, marginBottom: 10, border: '1px solid #BAE6FD', borderRadius: 8, background: '#F0F9FF' }}>{deliveryNotice}</div>}
    {verifiedEndorsementItems.filter(matchesReview).length === 0 && <div className="review-empty">No verified signed copies match this view.</div>}
    <RecordPagination pagination={verifiedPage} label="Verified endorsements" />
    {verifiedPage.items.map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{item.studentName || item.studentId}</strong>
        <span style={{ color: '#047857', fontWeight: 700, fontSize: 13 }}>Signed copy verified</span>
      </div>
      <p style={{ margin: '10px 0 5px' }}><b>{item.companyName || 'Company not recorded'}</b> · {item.internshipRole || 'Role not specified'}</p>
      <div style={{ color: '#475569', fontSize: 13 }}>Supervisor: {item.supervisorName || '—'} · {item.startDate || '—'} to {item.endDate || '—'}</div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>
        Verified {item.signedCopyVerifiedAt && !Number.isNaN(Date.parse(item.signedCopyVerifiedAt)) ? new Date(item.signedCopyVerifiedAt).toLocaleString() : 'date unavailable'} · Delivery: {({ not_sent: 'Not sent', sending: 'Email status still being checked', sent: 'Email service accepted the message. Inbox delivery is unconfirmed.', partial_failed: 'Some emails failed', failed: 'Failed' })[item.deliveryStatus ?? 'not_sent'] || 'Status unavailable'}
      </div>
      {item.deliveryRecipients && <div style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>
        {['student', 'company'].map(kind => <div key={kind}>{kind === 'student' ? 'Student' : 'Company'}: {item.deliveryRecipients[kind]?.status || 'Not sent yet'}{item.deliveryRecipients[kind]?.sentAt ? ` · ${new Date(item.deliveryRecipients[kind].sentAt).toLocaleString()}` : ''}</div>)}
      </div>}
      {item.deliveryStatus === 'sending' && <p style={{ color: '#9A3412', fontSize: 13 }}>Ask an administrator to check whether the email service accepted the message before retrying.</p>}
      {['not_sent', 'failed', 'partial_failed', undefined].includes(item.deliveryStatus) && <button type="button"
        disabled={deliveryBusy === item.id}
        onClick={() => setDeliveryConfirm(item)}
        style={{ border: 0, borderRadius: 8, padding: '10px 14px', marginTop: 12, background: deliveryBusy === item.id ? '#94A3B8' : '#0284C7', color: '#fff', fontWeight: 700, cursor: deliveryBusy === item.id ? 'wait' : 'pointer' }}>
        {deliveryBusy === item.id ? 'Sending…' : item.deliveryStatus === 'failed' || item.deliveryStatus === 'partial_failed' ? 'Retry emails that failed' : 'Email the signed letter'}
      </button>}
    </article>)}
    </section>
    <section hidden={reviewStage !== 'history'}>
    <h3 style={{ marginTop: 30 }}>Approved placement history</h3>
    {!currentHistory && <p role="status">Loading placement history…</p>}
    {currentHistory?.error && <p role="alert">{currentHistory.error}</p>}
    <p style={{ color: '#64748B', marginTop: -8 }}>Coordinator-approved assignment snapshots on this history page.</p>
    {currentHistory?.items && historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })).length === 0 && <div className="review-empty">No approved placement history matches this view.</div>}
    <RecordPagination pagination={historyPage} label="Placement history" />
    {historyPage.items.map(item => {
      const beforeName = item.before?.companyName || 'No previous approved placement';
      const afterName = item.after?.companyName || 'Company not recorded';
      return <article key={item.id} style={{ border: '1px solid #DBEAFE', borderRadius: 12, padding: 16, marginTop: 10, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <strong>{item.studentName || item.studentId}</strong>
          <span style={{ color: '#64748B', fontSize: 13 }}>{item.createdAt && !Number.isNaN(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleString() : 'Date unavailable'}</span>
        </div>
        <p style={{ margin: '10px 0 6px' }}><span style={{ color: '#64748B' }}>{beforeName}</span> <span aria-label="changed to">→</span> <strong>{afterName}</strong></p>
        <div style={{ color: '#475569', fontSize: 13 }}>
          {[item.after?.internshipRole, item.after?.supervisorName && `Supervisor: ${item.after.supervisorName}`, item.after?.startDate && item.after?.endDate && `${item.after.startDate} to ${item.after.endDate}`].filter(Boolean).join(' · ') || 'Placement details recorded'}
        </div>
      </article>;
    })}
    </section>
      </div>
    </PortalFormDialog>}
    </div>
    <details className="placement-email-disclosure"><summary>Company email <span>View replies and conversations</span></summary><CompanyConversations sectionId={selectedSection?.id} /></details>
    <AlertDialog
      open={Boolean(reviewConfirm)}
      tone={reviewConfirm?.status === 'approved' ? 'warning' : 'danger'}
      title={reviewConfirm?.status === 'approved' ? 'Approve this submission?' : reviewConfirm?.status === 'rejected' ? 'Reject this submission?' : 'Request changes to this submission?'}
      description={reviewConfirm?.status === 'approved' ? 'This records the coordinator decision and may move the student to the next workflow stage.' : 'The student will be notified and the submission will remain available for follow-up.'}
      confirmLabel={reviewConfirm?.status === 'approved' ? 'Approve' : reviewConfirm?.status === 'rejected' ? 'Reject' : 'Request changes'}
      busy={Boolean(reviewConfirm && busy === reviewConfirm.item.id)}
      onCancel={() => setReviewConfirm(null)}
      onConfirm={async () => {
        if (!reviewConfirm) return;
        const saved = reviewConfirm.finalReview
          ? await reviewFinal(reviewConfirm.item, reviewConfirm.status)
          : await review(reviewConfirm.item, reviewConfirm.status);
        if (saved) setReviewConfirm(null);
      }}
    />
    <AlertDialog
      open={Boolean(deliveryConfirm)}
      tone="warning"
      title="Email this signed endorsement?"
      description={deliveryConfirm ? `The verified signed copy will be sent to the student and official company contact${deliveryConfirm.companyEmail ? ` (${deliveryConfirm.companyEmail})` : ''}. Any recipient already marked sent will not be mailed again.` : ''}
      confirmLabel="Send email"
      busy={Boolean(deliveryConfirm && deliveryBusy === deliveryConfirm.id)}
      onCancel={() => setDeliveryConfirm(null)}
      onConfirm={() => { if (deliveryConfirm) sendEndorsement(deliveryConfirm); }}
    />
    <EndorsementDraftDialog draft={endorsementDraft} onClose={() => setEndorsementDraft(null)} />
  </div>;
}
