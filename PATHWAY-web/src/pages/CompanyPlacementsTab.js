import personName from '../personName';
import PlacementPicker from '../components/PlacementPicker';
import CompanyEmailInbox from '../components/CompanyEmailInbox';
import * as adminApi from '../adminApi';
import CoordinatorRecordPicker from '../components/CoordinatorRecordPicker';
import { compareStudents } from '../coordinatorStudentSort';
import { PortalFormDialog } from '../components/PortalStates';
import { placementStatusLabel, placementStudentQueue } from '../placementStudentQueue';
import RecordPagination, { useRecordPage } from '../components/RecordPagination';
import usePortalAutoRefresh from '../usePortalAutoRefresh';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import SubmissionNotifications, { submissionTime } from '../components/SubmissionNotifications';
import CoordinatorSearch from '../components/CoordinatorSearch';
import AlertDialog from '../components/AlertDialog';
import EndorsementDraftDialog from '../components/EndorsementDraftDialog';
import { adminRequest } from '../adminApi';
import PlacementCompanies from '../components/PlacementCompanies';
import './PlacementReviews.css';
import Icon from '../components/Icons';
import PlacementOverview from '../components/PlacementOverview';
import PlacementTracker from '../components/PlacementTracker';
import AssignPlacementPanel from '../components/AssignPlacementPanel';
import '../components/EndorsementDraftDialog.css';
import SectionPicker from '../components/SectionPicker';
import { createPortal } from 'react-dom';
import './RequirementsRedesign.css';
import './LogbookRedesign.css';
import './PlacementRedesign.css';
import { RowsSkeleton } from '../components/CoordSkeletons';
import { showNotice } from '../successFx';



export default function CompanyPlacementsTab({ department, selectedSection, students = [], overviewView, sections = [], onSectionChange }) {
  const [topHost, setTopHost] = useState(null);
  const navigate = useNavigate();
  const [doneCompany, setDoneCompany] = useState('');
  const [assignIds, setAssignIds] = useState([]);
  const [doneCompanies, setDoneCompanies] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [matchCompanies, setMatchCompanies] = useState([]);
  useEffect(() => { setTopHost(document.getElementById('pl-top-actions')); }, []);
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [workspace, setWorkspace] = useState('reviews');
  const [companySelections, setCompanySelections] = useState({});
  const [finalItems, setFinalItems] = useState([]);
  const [history, setHistory] = useState(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [boardKey, setBoardKey] = useState(0);
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
  const [declineAsk, setDeclineAsk] = useState(null);
  const [reasonError, setReasonError] = useState('');
  const [error, setError] = useState('');

  const [recordCursors, setRecordCursors] = useState({});
  const [recordsBusy, setRecordsBusy] = useState(false);
  const [openedStudent, setOpenedStudent] = useState(null);
  const [remoteStudents, setRemoteStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [slowLoad, setSlowLoad] = useState(false);
  // This screen shows its own loading banner, so hide the global server notice here.
  useEffect(() => (typeof adminApi.registerPageLoader === 'function' ? adminApi.registerPageLoader() : undefined), []);
  useEffect(() => {
    if (!loading) { setSlowLoad(false); return undefined; }
    const timer = setTimeout(() => setSlowLoad(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);
  const [queueCursors, setQueueCursors] = useState([null]);
  const [nextQueueCursor, setNextQueueCursor] = useState(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [emailOpen, setEmailOpen] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(reviewSearch.trim()), 300); return () => clearTimeout(timer); }, [reviewSearch]);
  useEffect(() => { setQueueCursors([null]); }, [selectedSection?.id, queueFilter, debouncedSearch, stageFilter]);
  const load = useCallback(async ({ silent = false, isCurrent: isRefreshCurrent = () => true } = {}) => {
    if (!silent) setLoading(true);
    setHistoryRevision(value => value + 1);
    if (!silent) setBoardKey(value => value + 1);
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
      const base='/coordinator/placement-workspace?sectionId='+encodeURIComponent(selectedSection.id);
      const cursor=queueCursors.at(-1);
      const [page, totals] = await Promise.all([
        adminRequest(base+'&view=students&queue='+queueFilter+'&stage='+stageFilter+'&search='+encodeURIComponent(debouncedSearch)+(cursor?'&cursor='+encodeURIComponent(cursor):'')),
        adminRequest(base+'&view=summary'),
      ]);
      if (!isRefreshCurrent()) return;
      setRemoteStudents(page.students || []);setNextQueueCursor(page.nextCursor || null);setSummary(totals);

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
  }, [selectedSection, department, queueFilter, debouncedSearch, queueCursors, stageFilter]);

  usePortalAutoRefresh(load, { enabled: !loading && !busy && !draftBusy && !deliveryBusy, scope: selectedSection?.id || '', protectInputs: true });

  useEffect(() => { let active=true; load({isCurrent:()=>active}); return () => { active=false; }; }, [load]);
  useEffect(() => {
    if(!selectedQueueStudent || !selectedSection?.id) return;
    let active=true;
    adminRequest('/coordinator/placement-workspace?sectionId='+encodeURIComponent(selectedSection.id)+'&view=details&studentId='+encodeURIComponent(selectedQueueStudent)).then(data=>{
      if(!active)return;setRecordCursors(data.recordCursors||{});setOpenedStudent(data.student);setItems(data.placements||[]);setFinalItems(data.finals||[]);setEndorsementItems(data.endorsements||[]);setVerifiedEndorsementItems(data.verified||[]);setAssignedStudents(data.student?[data.student]:[]);
    }).catch(e=>{if(active)setError(e.message||'Could not load placement details.');});
    return()=>{active=false;};
  },[selectedQueueStudent,selectedSection?.id]);
  useEffect(()=>{
    if(!assignmentOpen || !selectedSection?.id)return;
    let active=true;const base='/coordinator/placement-workspace?sectionId='+encodeURIComponent(selectedSection.id);
    Promise.all([adminRequest(base+'&view=students&queue=waiting'),adminRequest(base+'&view=companies&availability=active')]).then(([a,b])=>{if(active){setAssignedStudents(a.students||[]);setCompanies(b.companies||[]);}}).catch(e=>{if(active)setAssignmentError(e.message);});return()=>{active=false;};
  },[assignmentOpen,selectedSection?.id]);

  useEffect(() => { if (queueFilter !== 'completed' || !selectedSection?.id) return; let on = true;
    adminRequest('/coordinator/placement-workspace?sectionId=' + encodeURIComponent(selectedSection.id) + '&view=companies&availability=active').then(d => { if (on) setDoneCompanies(d.companies || []); }).catch(() => {});
    return () => { on = false; }; }, [queueFilter, selectedSection?.id]);
  useEffect(() => { if (!selectedQueueStudent || !selectedSection?.id) return; let on = true;
    adminRequest('/coordinator/placement-workspace?sectionId=' + encodeURIComponent(selectedSection.id) + '&view=companies&availability=active').then(d => { if (on) setMatchCompanies(d.companies || []); }).catch(() => {});
    return () => { on = false; }; }, [selectedQueueStudent, selectedSection?.id]);
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

  const loadMoreRecords = async stage => {
    if(recordsBusy || !recordCursors[stage])return;setRecordsBusy(true);
    try{const data=await adminRequest('/coordinator/placement-workspace?sectionId='+encodeURIComponent(selectedSection.id)+'&view=records&studentId='+encodeURIComponent(selectedQueueStudent)+'&stage='+stage+'&cursor='+encodeURIComponent(recordCursors[stage]));
      const setter={placement:setItems,final:setFinalItems,endorsement:setEndorsementItems,verified:setVerifiedEndorsementItems}[stage];
      if(setter)setter(previous=>[...previous,...(data.records||[])]);
      setRecordCursors(previous=>({...previous,[stage]:data.nextCursor||null}));
    }catch(e){setError(e.message||'Could not load older records.');}finally{setRecordsBusy(false);}
  };
  const [assignmentCompany, setAssignmentCompany] = useState(null);
  useEffect(() => { setAssignmentCompany(null); }, [assignmentOpen, selectedSection?.id]);

  const assignPlacement = async event => {
    event.preventDefault();
    if (busy || !selectedSection?.id) return;
    const data = new FormData(event.currentTarget);
    const studentIds = data.getAll('studentId').filter(Boolean);
    data.delete('studentId');
    const fields = Object.fromEntries(data);
    if (!fields.companyId || !studentIds.length) { setAssignmentError('Choose a company and at least one student.'); return; }
    if (!fields.supervisorName || !fields.supervisorEmail || !fields.internshipRole || !fields.workArrangement) {
      setAssignmentError('This company has no supervisor or internship details yet. Add them in Companies first.'); return;
    }
    setBusy('assignment');
    setAssignmentError('');
    const failed = [];
    for (const studentId of studentIds) {
      try {
        await adminRequest('/coordinator/sections/' + encodeURIComponent(selectedSection.id)
          + '/placements/' + encodeURIComponent(studentId) + '/assign', { method: 'POST', body: JSON.stringify(fields) });
      } catch (error) { failed.push(error.message || 'Unable to assign'); }
    }
    setBusy('');
    if (failed.length) { setAssignmentError(`${studentIds.length - failed.length} assigned, ${failed.length} failed: ${failed[0]}`); await load(); return; }
    setAssignmentOpen(false);
    await load();
  };

  const review = async (item, status, noteOverride) => {
    const note = (noteOverride ?? reasons[`placement:${item.id}`] ?? '').trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { setReasonError(`placement:${item.id}`); return false; }
    setBusy(item.id);
    try {
      const companyId = companySelections[item.id] || item.companyId || '';
      if (status === 'approved' && !companyId) {
        showNotice('Assign this proposal to an active company in the directory before approving it.');
        return false;
      }
      await adminRequest(`/coordinator/company-placements/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST', body: JSON.stringify({ status, reason: note, ...(status === 'approved' ? { companyId } : {}) }),
      });
      setReasons(previous => ({ ...previous, [`placement:${item.id}`]: '' }));
      if (status === 'approved') setEndorsementDraft(null);
      await load();
      return true;
    } catch (error) { showNotice(error.message || 'Unable to review placement.'); return false; } finally { setBusy(''); }
  };

  const reviewFinal = async (item, status) => {
    const note = (reasons[`final:${item.id}`] || '').trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { setReasonError(`final:${item.id}`); return false; }
    setBusy(item.id);
    try {
      await adminRequest(`/coordinator/final-reviews/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status, reason: note }),
      });
      setReasons(previous => ({ ...previous, [`final:${item.id}`]: '' })); await load();
      return true;
    } catch (error) { showNotice(error.message || 'Unable to review final request.'); return false; } finally { setBusy(''); }
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
      showNotice(error.message || 'Unable to prepare the endorsement draft.');
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
      // Shown inline under the note field: a pop-up would open behind the student drawer.
      setReasonError(`${finalReview ? 'final' : 'placement'}:${item.id}`);
      document.querySelector(`[data-reason-key="${finalReview ? 'final' : 'placement'}:${item.id}"]`)?.focus();
      return;
    }
    setReasonError('');
    setReviewConfirm({ item, status, finalReview });
  };

  const reviewStudentName = item => {
    const student = students.find(candidate => candidate.id === item.studentId);
    const currentName = personName(student);
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

  const queueRows = remoteStudents.map(student => ({...student.queue,id:student.id,name:[student.firstName,student.lastName].filter(Boolean).join(' '),idNumber:student.idNumber}));
  const studentIdsByUid = new Map(remoteStudents.map(student=>[student.id,student.idNumber]));
  const filteredQueue = queueRows;
  const queuePage = {items:queueRows};
  const selectedQueue = queueRows.find(row => row.id === selectedQueueStudent) || (openedStudent?.id === selectedQueueStudent ? {id:openedStudent.id,name:[openedStudent.firstName,openedStudent.lastName].join(" "),tasks:[],current:{step:"Placement details",stage:"placement"}} : null);
  const openStudent = row => { setSelectedQueueStudent(row.id); setReviewStage(queueFilter === 'history' ? 'history' : 'all'); setReviewStatus('all'); };
  const placementPage = useRecordPage(sortedReviews(items), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const finalPage = useRecordPage(sortedReviews(finalItems), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const endorsementPage = useRecordPage(endorsementItems.filter(matchesReview), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const verifiedPage = useRecordPage(verifiedEndorsementItems.filter(matchesReview), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);
  const historyPage = useRecordPage(historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })), (selectedSection?.id || '') + ':' + reviewSearch + ':' + reviewStatus + ':' + reviewStage);

  return <div className="placement-page pl-page">

    {(() => { const acts = <>
      <button type="button" className="rq-btn" onClick={() => setEmailOpen(true)}><Icon name="mail" size={14} /> Company email</button>
      <button type="button" className="rq-btn" onClick={load} disabled={!selectedSection}>Refresh</button>
      {selectedSection && !error && <button type="button" className="rq-btn rq-primary" disabled={!!busy} onClick={() => { setAssignmentError(''); setAssignmentOpen(true); }}>Assign placement</button>}
      {sections.length > 0 && <SectionPicker sections={sections} selected={selectedSection} onChange={section => onSectionChange?.(section)} />}
    </>; return topHost ? createPortal(acts, topHost) : <div className="pl-inline-actions">{acts}</div>; })()}
    {selectedSection && error && <div className="pl-down" role="alert"><strong>Placements couldn’t load</strong><p>{/503|unavailable|fetch|network|timed? ?out/i.test(error) ? 'The PATHWAY server is starting up or temporarily down. This usually clears within a minute.' : error}</p><button type="button" className="rq-btn rq-primary" onClick={() => load()}>Try again</button></div>}
    {selectedSection && !error && <PlacementOverview section={selectedSection} summary={summary} refreshKey={boardKey}
      onApprove={(record, studentId) => { if (record.companyId) setReviewConfirm({ item: record, status: 'approved' }); else { setWorkspace('reviews'); setSelectedQueueStudent(studentId); setReviewStage('all'); } }}
      onDecline={(record, studentId, name) => setDeclineAsk({ item: record, name, reason: '' })}
      onOpenStudent={id => { setWorkspace('reviews'); setSelectedQueueStudent(id); setReviewStage('all'); setReviewStatus('all'); }}
      onAssigned={() => load()} onOpenAssign={ids => { setAssignIds(Array.isArray(ids) ? ids : []); setAssignmentError(''); setAssignmentOpen(true); }} />}
    {(() => { const isReq = row => row.current?.stage === 'placement' && row.tasks?.some(t => t.stage === 'placement' && t.record?.status === 'pending_review' && t.needsAction) && row.tasks.filter(t => t.needsAction).length === 1;
      const n = queueFilter === 'action' ? queueRows.filter(r => !isReq(r)).length : queueRows.length;
      return <div className="pl-work-head">
        <h3 className="pl-section-title">{workspace === 'companies' ? 'Students by company' : queueFilter === 'history' ? 'Placement history' : queueFilter === 'completed' ? `Finished placements · ${queueRows.length}` : n ? `${n} letter${n === 1 ? '' : 's'} and approval${n === 1 ? '' : 's'} to finish` : 'Letters and approvals'}</h3>
        <span className="pl-grow" />
        {workspace === 'reviews' && queueFilter === 'completed' && <select className="pl-co-filter" aria-label="Filter by company" value={doneCompany} onChange={e => setDoneCompany(e.target.value)}><option value="">All companies</option>{[...new Set(queueRows.map(r => r.company && r.company !== '—' ? r.company : 'No company recorded'))].sort().map(n => <option key={n} value={n}>{n}</option>)}</select>}
        {workspace === 'reviews' && queueFilter !== 'action' && <CoordinatorSearch value={reviewSearch} onChange={setReviewSearch} label="Search placement reviews by student or company" placeholder="Find a student" />}

      </div>; })()}

    {selectedSection && !error && <PlacementTracker section={selectedSection} refreshKey={boardKey}
      onOpen={row => { setWorkspace('reviews'); setQueueFilter('action'); setSelectedQueueStudent(row.id); setReviewStage('all'); setReviewStatus('all'); }}
      bell={<SubmissionNotifications kind="placements" coordinatorId={auth?.currentUser?.uid} section={selectedSection} suppliedItems={placementNotices} onRefresh={load}
        onOpen={(student) => { setWorkspace('reviews'); setQueueFilter('action'); setSelectedQueueStudent(student.id); setReviewStage('all'); setReviewStatus('all'); setReviewSearch(''); }} />} />}
    {error && items.length > 0 && <div role="alert" style={{ padding: 14, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginTop: 14 }}>{error}</div>}
    {workspace === 'companies' && selectedSection && <PlacementCompanies key={selectedSection.id} selectedSection={selectedSection} onOpenStudent={student => {setWorkspace("reviews");setSelectedQueueStudent(student.id);}} />}
    {workspace === 'companies' && items.some(item => item.status === 'pending_review') && <div style={{ marginTop: 16, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, background: '#FFF' }}>
      <p style={{ margin: '0 0 12px', color: '#475569' }}>Submitted requests appear in Placement Reviews. Students appear under a company after their placement is approved.</p>
      <button type="button" className="placement-refresh" onClick={() => setWorkspace('reviews')}>Review pending placements ({items.filter(item => item.status === 'pending_review').length})</button>
    </div>}
    {!selectedSection && <p>Select a section to view company placements.</p>}
    {assignmentOpen && selectedSection && <PortalFormDialog className="apl-dialog" label="Assign placement" closeOnBackdrop onCancel={() => setAssignmentOpen(false)}>
      <AssignPlacementPanel section={selectedSection} initialIds={assignIds} onClose={() => { setAssignmentOpen(false); setAssignIds([]); }} onDone={() => load()} onEditCompanies={() => navigate('/coordinator/companies')} onAddCompany={() => navigate('/coordinator/companies', { state: { addCompany: true } })} />
    </PortalFormDialog>}
    <div className="placement-reviews" hidden={workspace !== 'reviews'}>
    {requestsOnly && <p className="placement-queue-help">Showing students with pending placement requests. <button type="button" className="portal-secondary" onClick={() => setRequestsOnly(false)}>Show all tasks</button></p>}
    <p className="placement-queue-help" hidden>{queueFilter === 'action' ? 'Start with the next action for each student. Open a student to see all outstanding tasks.' : queueFilter === 'history' ? 'Previous decisions, grouped by student on each page.' : 'Students with no outstanding placement tasks in the loaded records.'}</p>
    {queueFilter === 'history' && (historyCursors.length > 1 || currentHistory?.nextCursor) && <nav className="portal-record-pagination" aria-label="Placement history pages">
      <button type="button" className="portal-secondary" disabled={historyCursors.length <= 1}
        onClick={() => setHistoryPaging({ scope: historyScope, cursors: historyCursors.slice(0, -1) })}>Previous</button>
      <span>Page {historyCursors.length}</span>
      <button type="button" className="portal-secondary" disabled={!currentHistory?.nextCursor}
        onClick={() => setHistoryPaging({ scope: historyScope, cursors: [...historyCursors, currentHistory.nextCursor] })}>Next</button>
    </nav>}

    {loading && <div role="status" className="placement-loading-banner"><span className="placement-spinner" aria-hidden="true" /><div><strong>Loading placements…</strong>{slowLoad && <span>The server is waking up. The first load can take up to a minute.</span>}</div></div>}{queueFilter === 'completed' && workspace === 'reviews' && (() => {
      const recOf = row => (row.tasks || []).find(t => t.stage === 'placement' && t.record?.status === 'approved')?.record || row.current?.record || {};
      const chip = row => { const ts = row.tasks || []; if (ts.some(t => t.stage === 'verified' && t.record?.deliveryStatus === 'sent')) return ['Letter sent', 'green']; if (ts.some(t => t.stage === 'final' && t.record?.status === 'approved')) return ['Training', 'blue']; return ['Approved', 'mute']; };
      const fmt = v => { const t = Date.parse(v); return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''; };
      const groups = new Map();
      queueRows.forEach(row => { const c = row.company && row.company !== '—' ? row.company : 'No company recorded'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(row); });
      const names = [...groups.keys()].sort((x, y) => x.localeCompare(y));
      const shown = doneCompany ? names.filter(n => n === doneCompany) : names;
      return <div className="pl-done">
        {!loading && !names.length && <div className="pl-list"><div className="review-empty">No finished placements yet.</div></div>}
        {shown.map(name => { const rows = groups.get(name).sort((x, y) => String(recOf(y).updatedAt || recOf(y).createdAt || '').localeCompare(String(recOf(x).updatedAt || recOf(x).createdAt || '')));
          const co = doneCompanies.find(c => c.name === name); const shut = collapsed[name];
          return <section key={name} className="pl-co-card">
            <button type="button" className="pl-co-head" aria-expanded={!shut} onClick={() => setCollapsed(v => ({ ...v, [name]: !shut }))}>
              <span className="pl-co-name"><strong>{name}</strong><small>{rows.length} student{rows.length === 1 ? '' : 's'}</small></span>
              {co?.capacity > 0 && <span className="plo-slots" aria-label={`${co.occupiedSlots || 0} of ${co.capacity} slots filled`}>{Array.from({ length: Math.min(co.capacity, 12) }, (_, i) => <i key={i} data-on={i < (co.occupiedSlots || 0) || undefined} />)}</span>}
              <svg className="pl-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            {!shut && rows.map(row => { const rec = recOf(row); const [label, tone] = chip(row); const nm = row.name || 'Student';
              return <div key={row.id} className="pl-done-row">
                <i className="plo-av">{nm.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}</i>
                <span className="plo-body"><strong>{nm}</strong><small>{[studentIdsByUid.get(row.id), rec.internshipRole].filter(Boolean).join(' · ') || '—'}</small></span>
                <b className="lb-chip" data-tone={tone}>{label}</b>
                <span className="pl-dates">{rec.startDate ? `${fmt(rec.startDate)} – ${fmt(rec.endDate)}` : ''}</span>
                <button type="button" className="rq-link" onClick={() => openStudent(row)}>View<span className="sr-only"> placement for {row.name}</span></button>
              </div>; })}
          </section>; })}
      </div>; })()}
    <div className="placement-queue-table pl-list" hidden={queueFilter === 'completed'}>
      {queuePage.items.filter(row => queueFilter !== 'action' || !(row.current?.stage === 'placement' && row.tasks?.some(t => t.stage === 'placement' && t.record?.status === 'pending_review' && t.needsAction) && row.tasks.filter(t => t.needsAction).length === 1)).map(row => { const label = queueFilter === 'history' ? 'View history' : ({ 'Draft needed': 'Prepare draft', 'Waiting for signed copy': 'View letter', 'Signed copy verified': 'Email letter', 'Final approval awaiting review': 'Review' }[row.current.step] || row.current.action);
        const nm = row.name || 'Student'; return <div key={row.id} className="pl-row">
        <i className="plo-av">{nm.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}</i>
        <span className="plo-body"><strong>{nm}</strong><small>{[row.company && row.company !== '—' ? row.company : null, queueFilter === 'history' ? 'Previous decisions' : row.current.step, row.tasks.filter(task => task.needsAction).length > 1 ? `${row.tasks.filter(task => task.needsAction).length} tasks` : null].filter(Boolean).join(' · ')}</small></span>
        <button type="button" className="rq-btn" onClick={() => openStudent(row)}>{label}<span className="sr-only"> for {row.name}</span></button>
      </div>; })}{loading && !filteredQueue.length && <RowsSkeleton label="Loading placements" rows={6} />}{!loading && !filteredQueue.length && <div className="review-empty">{nextQueueCursor ? 'No matches on this page. Choose Next to keep searching.' : error ? 'No placement records yet. They will appear here once students submit placement requests.' : queueFilter === 'history' && !currentHistory ? 'Loading placement history…' : queueFilter === 'history' && currentHistory.error ? currentHistory.error : reviewSearch ? (queueFilter === 'history' && currentHistory?.nextCursor ? 'No matches on this page. Choose Next to search older decisions.' : 'No students match this search.') : queueFilter === 'action' ? 'All caught up. Placement tasks will appear here when students submit requests.' : 'No students in this view yet.'}</div>}</div>
    {selectedQueue && !reviewConfirm && !deliveryConfirm && !endorsementDraft && <PortalFormDialog className="placement-student-detail pl-detail" label={'Placement details for ' + selectedQueue.name} closeOnBackdrop onCancel={() => setSelectedQueueStudent(null)}>
      {(() => { const steps = [['placement', 'Request'], ['final', 'Final check'], ['endorsement', 'Letter draft'], ['verified', 'Signed copy'], ['sent', 'Emailed']];
        const cur = selectedQueue.current?.stage === 'verified' && selectedQueue.current?.record?.deliveryStatus === 'sent' ? 'sent' : (selectedQueue.current?.stage || 'placement');
        const idx = Math.max(0, steps.findIndex(([k]) => k === cur));
        const nm = selectedQueue.name || 'Student';
        return <header className="pld-head">
          <div className="pld-who"><i className="plo-av">{nm.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}</i>
            <div><h2>{nm}</h2><p>{studentIdsByUid.get(selectedQueue.id) || openedStudent?.idNumber} · {selectedSection?.name}</p></div>
            <span className="pl-grow" />
            <button type="button" className="plt-x" aria-label="Close" onClick={() => setSelectedQueueStudent(null)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>
          <ol className="pld-steps" aria-label={'Current step: ' + selectedQueue.current.step}>{steps.map(([k, l], i) => <li key={k} data-state={i < idx ? 'done' : i === idx ? 'now' : 'next'}><i aria-hidden="true" />{l}</li>)}</ol>
          <div className="pld-nowrow"><p className="pld-now">{selectedQueue.current.step}</p>
            <button type="button" className="pld-histbtn" aria-pressed={reviewStage === 'history'} onClick={() => setReviewStage(reviewStage === 'history' ? 'all' : 'history')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>
              {reviewStage === 'history' ? 'Back to tasks' : 'History'}</button></div>
        </header>; })()}
      <div className="placement-detail-body">

    <details className="placement-stage-section" open={selectedQueue?.current.stage === "placement" || (false)} style={{order:selectedQueue?.current.stage === "placement" ? 0 : 1}} hidden={reviewStage !== 'all' || !items.some(item=>item.studentId===selectedQueueStudent)}><summary>Placement details</summary>
    <div className="review-section-heading"><h3>Review placement</h3><p>Confirm the company, supervisor, and schedule before assigning an official placement.</p></div>
    {sortedReviews(items).length === 0 && <div className="review-empty">No company placement requests match this view.</div>}
    {recordCursors.placement && <button type="button" disabled={recordsBusy} onClick={()=>loadMoreRecords("placement")}>Load older records</button>}<RecordPagination pagination={placementPage} label="Company requests" />
    {placementPage.items.map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><h3 style={{ margin: 0 }}>{item.companyName || 'Unnamed company'}</h3><div style={{ color: '#64748B', marginTop: 4 }}>{item.studentName || item.studentId} · {item.internshipRole || 'Role not specified'}</div></div><strong>{placementStatusLabel(item.status)}</strong></div>
      <dl className="pld-facts"><div><dt>Address</dt><dd>{item.companyAddress || '—'}</dd></div><div><dt>Supervisor</dt><dd>{item.supervisorName || '—'}{item.supervisorEmail ? ` · ${item.supervisorEmail}` : ''}</dd></div><div><dt>Dates</dt><dd>{item.startDate || '—'} – {item.endDate || '—'}{item.workArrangement ? ` · ${item.workArrangement}` : ''}</dd></div></dl>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      {item.status === 'pending_review' && <>
        {(() => { const chosen = companySelections[item.id] || item.companyId || ''; const co = matchCompanies.find(c => c.id === chosen);
          return <label className="pld-match">Match to company
            <select aria-label={`Official company assignment for ${item.studentName || item.studentId}`} value={chosen} onChange={e => setCompanySelections(previous => ({ ...previous, [item.id]: e.target.value }))}>
              <option value="">Pick the company from your list</option>
              {item.companyId && !matchCompanies.some(c => c.id === item.companyId) && <option value={item.companyId}>{item.companyName}</option>}
              {matchCompanies.map(c => <option key={c.id} value={c.id}>{c.name}{c.availableSlots != null ? ` · ${c.availableSlots} open` : ''}</option>)}
            </select>
            {chosen ? <small data-ok>{co ? `✓ ${co.availableSlots == null ? 'No slot limit' : `${co.availableSlots} open slot${co.availableSlots === 1 ? '' : 's'}`}` : '✓ Matched'}</small> : <small>“{item.companyName || 'This company'}” isn’t matched yet. Pick it from your list to approve.</small>}
          </label>; })()}
        <div className="review-decision pld-bar"><label>Note to student<input aria-label={`Placement feedback for ${reviewStudentName(item)}`} data-reason-key={`placement:${item.id}`} aria-invalid={reasonError === `placement:${item.id}` || undefined} value={reasons[`placement:${item.id}`] || ''} onChange={e => { setReasonError(''); setReasons(previous => ({ ...previous, [`placement:${item.id}`]: e.target.value })); }} placeholder="Reason for changes or rejection" />{reasonError === `placement:${item.id}` && <em className="pld-err" role="alert">Write a short reason so the student knows what to fix.</em>}</label><div className="review-actions"><button type="button" className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected')}>Say no</button><button type="button" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision')}>Request changes</button><button type="button" className="review-approve" disabled={busy === item.id || !(companySelections[item.id] || item.companyId)} onClick={() => requestReviewConfirmation(item, 'approved')}>✓ Approve</button></div></div>
      </>}
    </article>)}
    </details>
    <details className="placement-stage-section" open={selectedQueue?.current.stage === "final" || (false)} style={{order:selectedQueue?.current.stage === "final" ? 0 : 1}} hidden={reviewStage !== 'all' || !finalItems.some(item=>item.studentId===selectedQueueStudent)}><summary>Final approval</summary>
    <div className="review-section-heading"><h3>Review internship tracking access</h3><p>Review the saved submission before granting access to internship tracking.</p></div>
    {sortedReviews(finalItems).length === 0 && <div className="review-empty">No final review requests match this view.</div>}
    {recordCursors.final && <button type="button" disabled={recordsBusy} onClick={()=>loadMoreRecords("final")}>Load older records</button>}<RecordPagination pagination={finalPage} label="Final approvals" />
    {finalPage.items.map(item => <article className="review-card" key={item.id}>
      <h3 style={{ margin: 0 }}>{item.companySnapshot?.companyName || 'Final check'}</h3><dl className="pld-facts"><div><dt>Supervisor</dt><dd>{item.companySnapshot?.supervisorName || '—'}</dd></div><div><dt>Documents</dt><dd>✓ {item.requirementSnapshot?.filter(docItem => ['submitted', 'approved'].includes(docItem.status)).length || 0} of {item.requirementSnapshot?.length || 0} in</dd></div></dl>
      <strong>{placementStatusLabel(item.status)}</strong>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      <details className="review-documents"><summary>Show documents</summary>{(item.requirementSnapshot || []).map((requirement, index) => <div key={requirement.id || index}><span>{requirement.name || requirement.title || requirement.id || 'Requirement'}</span><strong>{requirement.status || 'Not submitted'}</strong></div>)}</details>
      {item.status === 'pending_review' && <div className="review-decision pld-bar"><label>Note to student<input aria-label={`Final review feedback for ${reviewStudentName(item)}`} data-reason-key={`final:${item.id}`} aria-invalid={reasonError === `final:${item.id}` || undefined} value={reasons[`final:${item.id}`] || ''} onChange={e => { setReasonError(''); setReasons(previous => ({ ...previous, [`final:${item.id}`]: e.target.value })); }} placeholder="Reason for changes or rejection" />{reasonError === `final:${item.id}` && <em className="pld-err" role="alert">Write a short reason so the student knows what to fix.</em>}</label><div className="review-actions"><button type="button" className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected', true)}>Say no</button><button type="button" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision', true)}>Request changes</button><button type="button" className="review-approve" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'approved', true)}>✓ Approve tracking</button></div></div>}
    </article>)}
    </details>
    <details className="placement-stage-section" open={selectedQueue?.current.stage === "endorsement" || (selectedQueue?.current.stage === "verified")} style={{order:["endorsement","verified"].includes(selectedQueue?.current.stage) ? 0 : 1}} hidden={reviewStage !== 'all' || ![...endorsementItems,...verifiedEndorsementItems].some(item=>item.studentId===selectedQueueStudent)}><summary>Endorsement letter</summary>
    {(() => {
      const when = v => { const t = Date.parse(v); return t ? new Date(t).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''; };
      const day = v => { const t = Date.parse(v); return t ? new Date(t).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''; };
      const card = (item, verified) => {
        const sent = verified && item.deliveryStatus === 'sent';
        const chip = !verified ? (item.draftVersion > 0 ? ['Waiting for signed copy', 'amber'] : ['Draft needed', 'mute']) : sent ? ['Sent', 'green'] : item.deliveryStatus === 'sending' ? ['Checking email', 'amber'] : ['Ready to email', 'blue'];
        const hint = !verified ? (item.draftVersion > 0 ? 'Print and sign the draft. The student uploads the signed copy in their Requirements, then you approve it there.' : 'Prepare the draft, then print and sign it.') : sent ? 'The email service accepted the letter. Inbox delivery isn’t confirmed.' : 'Only the verified signed copy can be emailed.';
        const steps = [
          ['Placement approved', true, day(item.createdAt)],
          ['Prepare the draft', item.draftVersion > 0 || verified, item.draftVersion > 0 ? `v${item.draftVersion} · ${day(item.draftPreparedAt)}` : ''],
          ['Signed copy approved', verified, verified ? day(item.signedCopyVerifiedAt) : ''],
          ['Emailed to student & company', sent, sent ? day(item.deliverySentAt || item.updatedAt) : ''],
        ];
        const now = steps.findIndex(x => !x[1]);
        const rcp = item.deliveryRecipients || {};
        return <article className="pld-letter" key={item.id}>
          <div className="pld-letter-head"><h3>Endorsement letter</h3><b className="lb-chip" data-tone={chip[1]}>{chip[0]}</b></div>
          <p className="pld-hint">{hint}</p>
          <dl className="pld-facts">
            <div><dt>Company</dt><dd>{item.companyName || 'Not recorded'}{item.internshipRole ? ` · ${item.internshipRole}` : ''}</dd></div>
            <div><dt>Supervisor</dt><dd>{item.supervisorName || '—'}</dd></div>
            <div><dt>Dates</dt><dd>{item.startDate ? `${day(item.startDate)} – ${day(item.endDate)}` : '—'}</dd></div>
            <div><dt>Approved</dt><dd>{when(item.createdAt) || '—'}</dd></div>
          </dl>
          <ol className="pld-journey">{steps.map(([label, done, meta], i) => <li key={label} data-state={done ? 'done' : i === now ? 'now' : 'next'}><i aria-hidden="true" /><span>{label}</span>{i === now && !meta ? <em>you are here</em> : meta ? <small>{meta}</small> : null}</li>)}</ol>
          {item.deliveryStatus === 'sending' && <p className="pld-warn">Ask an administrator to check whether the email service accepted the message before retrying.</p>}
          <div className="pld-bar pld-letter-bar">
            {!verified && <>
              {item.draftVersion > 0 && <span className="pld-meta">Draft v{item.draftVersion}{item.draftPreparedAt ? ` · ${day(item.draftPreparedAt)}` : ''}{item.draftPreparedByName ? ` by ${item.draftPreparedByName}` : ''}</span>}
              <div className="review-actions">
                {item.draftVersion > 0 && <button type="button" onClick={() => viewPreparedDraft(item)}>View draft v{item.draftVersion}</button>}
                {item.draftVersion > 0 && <button type="button" className="review-approve" onClick={() => navigate('/coordinator/requirements', { state: { sectionId: selectedSection?.id, openStudentId: item.studentId || selectedQueueStudent } })}>Review signed copy</button>}
                <button type="button" className={item.draftVersion > 0 ? 'pld-quiet' : 'review-approve'} disabled={draftBusy === item.id} onClick={() => prepareEndorsementDraft(item)}>{draftBusy === item.id ? 'Preparing…' : item.draftVersion > 0 ? 'Prepare new version' : 'Prepare draft'}</button>
              </div>
            </>}
            {verified && <>
              <span className="pld-rcpts">{['student', 'company'].map(k => { const st = rcp[k]?.status || 'not sent'; return <b key={k} className="lb-chip" data-tone={/sent|accept/i.test(st) && !/not/i.test(st) ? 'green' : /fail/i.test(st) ? 'red' : 'mute'}>{k === 'student' ? 'Student' : 'Company'} · {st}{rcp[k]?.sentAt ? ` ${day(rcp[k].sentAt)}` : ''}</b>; })}</span>
              {['not_sent', 'failed', 'partial_failed', undefined].includes(item.deliveryStatus) && <div className="review-actions"><button type="button" className="review-approve" disabled={deliveryBusy === item.id} onClick={() => setDeliveryConfirm(item)}>{deliveryBusy === item.id ? 'Sending…' : item.deliveryStatus === 'failed' || item.deliveryStatus === 'partial_failed' ? 'Retry failed emails' : '✉ Email signed letter'}</button></div>}
            </>}
          </div>
        </article>;
      };
      const pending = endorsementItems.filter(matchesReview); const ver = verifiedEndorsementItems.filter(matchesReview);
      return <>
        {deliveryNotice && <div role="status" className="pld-notice">{deliveryNotice}</div>}
        {!pending.length && !ver.length && <div className="review-empty">No endorsement letter yet.</div>}
        {endorsementPage.items.map(item => card(item, false))}
        {verifiedPage.items.map(item => card(item, true))}
        {(recordCursors.endorsement || recordCursors.verified) && <button type="button" className="plt-link" disabled={recordsBusy} onClick={() => loadMoreRecords(recordCursors.endorsement ? 'endorsement' : 'verified')}>Load older letters</button>}
        <RecordPagination pagination={endorsementPage} label="Endorsements" /><RecordPagination pagination={verifiedPage} label="Verified endorsements" />
      </>;
    })()}
    </details>
    <section className="pld-history" hidden={reviewStage !== 'history'}>
    <h3>Placement history</h3>
    {!currentHistory && <p role="status">Loading placement history…</p>}
    {currentHistory?.error && <p role="alert">{currentHistory.error}</p>}
    <p className="pld-history-sub">Every company you approved for this student.</p>
    {currentHistory?.items && historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })).length === 0 && <div className="review-empty">No approved placements yet. Once you approve a company, it shows up here.</div>}
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
    <footer className="pl-foot">
      <span className="pl-links">
        {[['action', 'To finish'], ['completed', 'Finished'], ['history', 'History']].map(([v, l]) => <button key={v} type="button" className="rq-link" aria-pressed={workspace === 'reviews' && queueFilter === v} onClick={() => { setWorkspace('reviews'); setRequestsOnly(false); setQueueFilter(v); setSelectedQueueStudent(null); }}>{l}</button>)}
      </span>
      {workspace === 'reviews' && (queueCursors.length > 1 || nextQueueCursor) && <nav aria-label="Placement students pagination"><button type="button" className="rq-btn" aria-label="Previous page" disabled={queueCursors.length===1} onClick={()=>setQueueCursors(v=>v.slice(0,-1))}>‹</button><span>Page {queueCursors.length}</span><button type="button" className="rq-btn" aria-label="Next page" disabled={!nextQueueCursor} onClick={()=>setQueueCursors(v=>[...v,nextQueueCursor])}>›</button></nav>}
    </footer>
    {emailOpen && <PortalFormDialog className="cei-dialog" label="Company email" closeOnBackdrop onCancel={()=>setEmailOpen(false)}><CompanyEmailInbox onClose={()=>setEmailOpen(false)} /></PortalFormDialog>}
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
      open={Boolean(declineAsk)}
      tone="danger"
      title={declineAsk ? `Say no to ${declineAsk.name}'s request?` : ''}
      description={declineAsk ? `${declineAsk.name} asked to train at ${declineAsk.item.companyName || 'this company'}. They'll be notified and can suggest another company.` : ''}
      confirmLabel="Say no"
      confirmDisabled={!declineAsk?.reason.trim()}
      busy={Boolean(declineAsk && busy === declineAsk.item.id)}
      onCancel={() => setDeclineAsk(null)}
      onConfirm={async () => { if (declineAsk && await review(declineAsk.item, 'rejected', declineAsk.reason)) setDeclineAsk(null); }}>
      <label className="pl-decline-reason">Reason for the student
        <textarea rows={3} autoFocus value={declineAsk?.reason || ''} maxLength={500} placeholder="e.g. This company has no slots left. Please choose another."
          onChange={e => setDeclineAsk(previous => ({ ...previous, reason: e.target.value }))} /></label>
    </AlertDialog>
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
