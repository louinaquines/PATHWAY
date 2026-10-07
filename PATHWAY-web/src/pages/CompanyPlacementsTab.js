import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import AlertDialog from '../components/AlertDialog';
import EndorsementDraftDialog from '../components/EndorsementDraftDialog';
import { adminRequest } from '../adminApi';
import PlacementCompanies from '../components/PlacementCompanies';
import './PlacementReviews.css';

const labels = { draft: 'Draft', pending_review: 'Pending review', needs_revision: 'Needs revision', rejected: 'Rejected', approved: 'Approved', superseded: 'Superseded by placement change' };

export default function CompanyPlacementsTab({ department, selectedSection, students = [] }) {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [workspace, setWorkspace] = useState('reviews');
  const [companySelections, setCompanySelections] = useState({});
  const [finalItems, setFinalItems] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [endorsementItems, setEndorsementItems] = useState([]);
  const [verifiedEndorsementItems, setVerifiedEndorsementItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [draftBusy, setDraftBusy] = useState('');
  const [deliveryBusy, setDeliveryBusy] = useState('');
  const [deliveryConfirm, setDeliveryConfirm] = useState(null);
  const [deliveryNotice, setDeliveryNotice] = useState('');
  const [endorsementDraft, setEndorsementDraft] = useState(null);
  const [reasons, setReasons] = useState({});
  const [reviewStage, setReviewStage] = useState('all');
  const [reviewSearch, setReviewSearch] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [reviewConfirm, setReviewConfirm] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!selectedSection?.id) {
        setCompanies([]);
        setAssignedStudents([]);
        setItems([]);
        setFinalItems([]);
        setHistoryItems([]);
        setEndorsementItems([]);
        setVerifiedEndorsementItems([]);
        return;
      }
      const scopedFilters = [where('sectionId', '==', selectedSection.id), where('department', '==', department)];
      const [snap, finalSnap, endorsementSnap, directory, history, studentSnap] = await Promise.all([
        getDocs(query(collection(db, 'companyProposals'), ...scopedFilters)),
        getDocs(query(collection(db, 'finalReviewRequests'), ...scopedFilters)),
        getDocs(query(collection(db, 'endorsements'), ...scopedFilters)),
        adminRequest('/coordinator/company-directory'),
        adminRequest(`/coordinator/placement-history?sectionId=${encodeURIComponent(selectedSection.id)}`),
        getDocs(query(collection(db, 'users'), ...scopedFilters, where('role', '==', 'student'))),
      ]);
      const proposals = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !selectedSection || item.sectionId === selectedSection.id);
      setItems(proposals);
      setCompanies(directory.companies || []);
      setAssignedStudents(studentSnap.docs.map(item => ({ ...item.data(), id: item.id })));
      setHistoryItems(history.history || []);
      const endorsements = endorsementSnap.docs.map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      setEndorsementItems(endorsements.filter(item => item.status === 'awaiting_document'));
      setVerifiedEndorsementItems(endorsements.filter(item => item.status === 'signed_copy_verified'));
      setCompanySelections(previous => Object.fromEntries(proposals.map(item => [item.id, previous[item.id] || item.companyId || ''])));
      setFinalItems(finalSnap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !selectedSection || item.sectionId === selectedSection.id));
    } catch (loadError) {
      console.error('Company placement load error:', loadError);
      setError(loadError.code === 'permission-denied'
        ? 'You do not have permission to view placement requests for this section. Confirm that the deployed Firestore rules are current.'
        : loadError.message || 'Could not load company placement requests. Check your connection and try again.');
      setItems([]);
      setCompanies([]);
      setAssignedStudents([]);
      setHistoryItems([]);
      setEndorsementItems([]);
      setVerifiedEndorsementItems([]);
      setFinalItems([]);
    } finally { setLoading(false); }
  }, [selectedSection, department]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEndorsementDraft(null); }, [selectedSection?.id]);
  useEffect(() => { setDeliveryConfirm(null); setDeliveryNotice(''); }, [selectedSection?.id]);
  useEffect(() => { setReasons({}); setReviewConfirm(null); setReviewSearch(''); setReviewStatus('all'); }, [selectedSection?.id]);

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
    return (!term || [reviewStudentName(item), item.studentId, item.companyName, item.companySnapshot?.companyName, item.supervisorName, item.companySnapshot?.supervisorName].some(value => String(value || '').toLowerCase().includes(term)))
      && (reviewStatus === 'all' || item.status === reviewStatus);
  };
  const sortedReviews = records => [...records].filter(matchesReview).sort((a, b) =>
    Number(b.status === 'pending_review') - Number(a.status === 'pending_review')
    || String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')));
  const pendingPlacements = items.filter(item => item.status === 'pending_review').length;
  const pendingFinalReviews = finalItems.filter(item => item.status === 'pending_review').length;

  if (loading) return <div style={{ padding: 32 }}>Loading company placements...</div>;
  return <div className="placement-page" style={{ padding: 28, overflowY: 'auto', flex: 1, background: '#F8FAFC' }}>
    <div className="placement-page-header">
      <div><h2 style={{ margin: 0 }}>Company Placements</h2>
      <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>Company details, assigned students, and placement reviews for {selectedSection ? selectedSection.name : 'your selected section'}.</p></div>
      <button type="button" className="placement-refresh" onClick={load} disabled={!selectedSection}>Refresh placements</button>
    </div>
    <div className="placement-workspace-tabs" role="group" aria-label="Placement workspace">
      <button type="button" aria-pressed={workspace === 'companies'} onClick={() => setWorkspace('companies')}>Companies</button>
      <button type="button" aria-pressed={workspace === 'reviews'} onClick={() => setWorkspace('reviews')}>Placement Reviews{items.filter(item => item.status === 'pending_review').length ? ` (${items.filter(item => item.status === 'pending_review').length})` : ''}</button>
    </div>
    {error && <div role="alert" style={{ padding: 14, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginTop: 14 }}>{error}</div>}
    {workspace === 'companies' && selectedSection && !error && <PlacementCompanies key={selectedSection.id} companies={companies} students={assignedStudents} sectionName={selectedSection.name} />}
    {workspace === 'companies' && items.some(item => item.status === 'pending_review') && <div style={{ marginTop: 16, padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, background: '#FFF' }}>
      <p style={{ margin: '0 0 12px', color: '#475569' }}>Submitted requests appear in Placement Reviews. Students appear under a company after their placement is approved.</p>
      <button type="button" className="placement-refresh" onClick={() => setWorkspace('reviews')}>Review pending placements ({items.filter(item => item.status === 'pending_review').length})</button>
    </div>}
    {!selectedSection && <p>Select a section to view company placements.</p>}
    <div className="placement-reviews" hidden={workspace !== 'reviews'}>
    <div className="review-overview">
      <div><span>Company requests</span><strong>{pendingPlacements}</strong><small>Awaiting your decision</small><button type="button" onClick={() => { setReviewStage('placement'); setReviewStatus('pending_review'); setReviewSearch(''); }}>Open company queue</button></div>
      <div><span>Final approvals</span><strong>{pendingFinalReviews}</strong><small>Pre-deployment submissions</small><button type="button" onClick={() => { setReviewStage('final'); setReviewStatus('pending_review'); setReviewSearch(''); }}>Open final approval queue</button></div>
      <div><span>Endorsement paperwork</span><strong>{endorsementItems.length}</strong><small>Awaiting a verified signed copy</small><button type="button" onClick={() => { setReviewStage('endorsement'); setReviewStatus('all'); setReviewSearch(''); }}>Open endorsements</button></div>
    </div>
    <div className="review-toolbar">
      <label className="review-search">Search reviews<input type="search" value={reviewSearch} onChange={event => setReviewSearch(event.target.value)} placeholder="Student, company, or supervisor" /></label>
      <label>Status<select value={reviewStatus} onChange={event => setReviewStatus(event.target.value)}><option value="all">All statuses</option>{Object.entries({ ...labels, awaiting_document: 'Awaiting signed copy', signed_copy_verified: 'Signed copy verified' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="review-stage-tabs" role="group" aria-label="Review stages">{[['all', 'All stages'], ['placement', `Company requests (${pendingPlacements})`], ['final', `Final approvals (${pendingFinalReviews})`], ['endorsement', 'Endorsements'], ['history', 'History']].map(([value, label]) => <button key={value} type="button" aria-pressed={reviewStage === value} onClick={() => { setReviewStage(value); setReviewStatus('all'); }}>{label}</button>)}</div>
    <section hidden={!['all', 'placement'].includes(reviewStage)}>
    <div className="review-section-heading"><h3>Company placement requests</h3><p>Confirm the company, supervisor, and schedule before assigning an official placement.</p></div>
    {sortedReviews(items).length === 0 && <div className="review-empty">No company placement requests match this view.</div>}
    {sortedReviews(items).map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><h3 style={{ margin: 0 }}>{item.companyName || 'Unnamed company'}</h3><div style={{ color: '#64748B', marginTop: 4 }}>{item.studentName || item.studentId} · {item.internshipRole || 'Role not specified'}</div></div><strong>{labels[item.status] || item.status}</strong></div>
      <p><b>Address:</b> {item.companyAddress || '—'}<br /><b>Supervisor:</b> {item.supervisorName || '—'} ({item.supervisorEmail || '—'})<br /><b>Schedule:</b> {item.startDate || '—'} to {item.endDate || '—'} · {item.workArrangement || '—'}</p>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      {item.status === 'pending_review' && <>
        <label style={{ display: 'block', margin: '12px 0 8px', fontWeight: 700 }}>
          Official company assignment
          <select aria-label={`Official company assignment for ${item.studentName || item.studentId}`} value={companySelections[item.id] || ''}
            onChange={event => setCompanySelections(previous => ({ ...previous, [item.id]: event.target.value }))}
            style={{ display: 'block', width: '100%', maxWidth: 560, marginTop: 6, padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: 8, background: '#fff' }}>
            <option value="">Select an active directory company</option>
            {companies.filter(company => company.active).map(company => {
              const full = company.availableSlots === 0 && company.id !== item.companyId;
              const unavailable = company.capacity === null;
              const slotLabel = unavailable ? 'capacity not configured' : `${company.availableSlots} slot${company.availableSlots === 1 ? '' : 's'} available`;
              return <option key={company.id} value={company.id} disabled={full || unavailable}>
                {company.name} · {unavailable ? slotLabel : full ? 'at capacity' : slotLabel}
              </option>;
            })}
          </select>
        </label>
        <div className="review-decision"><label>Feedback for this student<input aria-label={`Placement feedback for ${reviewStudentName(item)}`} value={reasons[`placement:${item.id}`] || ''} onChange={e => setReasons(previous => ({ ...previous, [`placement:${item.id}`]: e.target.value }))} placeholder="Reason for changes or rejection" /></label><div className="review-actions"><button className="review-approve" disabled={busy === item.id || !(companySelections[item.id] || item.companyId)} onClick={() => requestReviewConfirmation(item, 'approved')}>Approve</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision')}>Request changes</button><button className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected')}>Reject</button></div></div>
      </>}
    </article>)}
    </section>
    <section hidden={!['all', 'final'].includes(reviewStage)}>
    <div className="review-section-heading"><h3>Final review requests</h3><p>Review the saved submission before granting access to OJT tracking.</p></div>
    {sortedReviews(finalItems).length === 0 && <div className="review-empty">No final review requests match this view.</div>}
    {sortedReviews(finalItems).map(item => <article className="review-card" key={item.id}>
      <h3 style={{ margin: 0 }}>Student final review</h3><p><b>Student:</b> {reviewStudentName(item)}<br /><b>Company:</b> {item.companySnapshot?.companyName || '—'}<br /><b>Supervisor:</b> {item.companySnapshot?.supervisorName || '—'}<br /><b>Requirements:</b> {item.requirementSnapshot?.filter(docItem => ['submitted', 'approved'].includes(docItem.status)).length || 0} submitted</p>
      <strong>{labels[item.status] || item.status}</strong>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      <details className="review-documents"><summary>Review document statuses</summary>{(item.requirementSnapshot || []).map((requirement, index) => <div key={requirement.id || index}><span>{requirement.name || requirement.title || requirement.id || 'Requirement'}</span><strong>{requirement.status || 'Not submitted'}</strong></div>)}</details>
      {item.status === 'pending_review' && <div className="review-decision"><label>Feedback for this student<input aria-label={`Final review feedback for ${reviewStudentName(item)}`} value={reasons[`final:${item.id}`] || ''} onChange={e => setReasons(previous => ({ ...previous, [`final:${item.id}`]: e.target.value }))} placeholder="Reason for changes or rejection" /></label><div className="review-actions"><button className="review-approve" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'approved', true)}>Approve final review</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision', true)}>Request changes</button><button className="review-reject" disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected', true)}>Reject</button></div></div>}
    </article>)}
    </section>
    <section hidden={!['all', 'endorsement'].includes(reviewStage)}>
    <h3 style={{ marginTop: 30 }}>Endorsement paperwork to prepare</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Approved placements awaiting a signed endorsement letter. These records are not issued documents or email deliveries.</p>
    {endorsementItems.filter(matchesReview).length === 0 && <div className="review-empty">No pending endorsement paperwork matches this view.</div>}
    {endorsementItems.filter(matchesReview).map(item => <article className="review-card" key={item.id}>
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
    <h3 style={{ marginTop: 30 }}>Signed endorsement copies verified</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Only the verified private signed copy can be emailed to the student and official company contact. Email-server acceptance is recorded separately for each recipient.</p>
    {deliveryNotice && <div role="status" style={{ padding: 12, marginBottom: 10, border: '1px solid #BAE6FD', borderRadius: 8, background: '#F0F9FF' }}>{deliveryNotice}</div>}
    {verifiedEndorsementItems.filter(matchesReview).length === 0 && <div className="review-empty">No verified signed copies match this view.</div>}
    {verifiedEndorsementItems.filter(matchesReview).map(item => <article className="review-card" key={item.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{item.studentName || item.studentId}</strong>
        <span style={{ color: '#047857', fontWeight: 700, fontSize: 13 }}>Signed copy verified</span>
      </div>
      <p style={{ margin: '10px 0 5px' }}><b>{item.companyName || 'Company not recorded'}</b> · {item.internshipRole || 'Role not specified'}</p>
      <div style={{ color: '#475569', fontSize: 13 }}>Supervisor: {item.supervisorName || '—'} · {item.startDate || '—'} to {item.endDate || '—'}</div>
      <div style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>
        Verified {item.signedCopyVerifiedAt && !Number.isNaN(Date.parse(item.signedCopyVerifiedAt)) ? new Date(item.signedCopyVerifiedAt).toLocaleString() : 'date unavailable'} · Delivery: {({ not_sent: 'Not sent', sending: 'Sending or needs reconciliation', sent: 'Accepted by email server', partial_failed: 'Partially failed', failed: 'Failed' })[item.deliveryStatus] || item.deliveryStatus || 'Not sent'}
      </div>
      {item.deliveryRecipients && <div style={{ color: '#475569', fontSize: 13, marginTop: 8 }}>
        {['student', 'company'].map(kind => <div key={kind}>{kind === 'student' ? 'Student' : 'Company'}: {item.deliveryRecipients[kind]?.status || 'Not attempted'}{item.deliveryRecipients[kind]?.sentAt ? ` · ${new Date(item.deliveryRecipients[kind].sentAt).toLocaleString()}` : ''}</div>)}
      </div>}
      {item.deliveryStatus === 'sending' && <p style={{ color: '#9A3412', fontSize: 13 }}>Do not retry yet. Ask an administrator to reconcile this attempt against the mail provider; a previous email may have been accepted.</p>}
      {['not_sent', 'failed', 'partial_failed', undefined].includes(item.deliveryStatus) && <button type="button"
        disabled={deliveryBusy === item.id}
        onClick={() => setDeliveryConfirm(item)}
        style={{ border: 0, borderRadius: 8, padding: '10px 14px', marginTop: 12, background: deliveryBusy === item.id ? '#94A3B8' : '#0284C7', color: '#fff', fontWeight: 700, cursor: deliveryBusy === item.id ? 'wait' : 'pointer' }}>
        {deliveryBusy === item.id ? 'Sending…' : item.deliveryStatus === 'failed' || item.deliveryStatus === 'partial_failed' ? 'Retry failed recipients' : 'Email verified signed copy'}
      </button>}
    </article>)}
    </section>
    <section hidden={!['all', 'history'].includes(reviewStage)}>
    <h3 style={{ marginTop: 30 }}>Approved placement history</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Coordinator-approved assignment snapshots for this section.</p>
    {historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })).length === 0 && <div className="review-empty">No approved placement history matches this view.</div>}
    {historyItems.filter(item => matchesReview({ ...item, status: 'approved', companyName: item.after?.companyName })).map(item => {
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
