import { useCallback, useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import AlertDialog from '../components/AlertDialog';
import EndorsementDraftDialog from '../components/EndorsementDraftDialog';
import { adminRequest } from '../adminApi';

const labels = { draft: 'Draft', pending_review: 'Pending review', needs_revision: 'Needs revision', rejected: 'Rejected', approved: 'Approved', superseded: 'Superseded by placement change' };

export default function CompanyPlacementsTab({ department, selectedSection, students = [] }) {
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
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
  const [reason, setReason] = useState('');
  const [reviewConfirm, setReviewConfirm] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!selectedSection?.id) {
        setItems([]);
        setFinalItems([]);
        setHistoryItems([]);
        setEndorsementItems([]);
        setVerifiedEndorsementItems([]);
        return;
      }
      const scopedFilters = [where('sectionId', '==', selectedSection.id), where('department', '==', department)];
      const [snap, finalSnap, endorsementSnap, directory, history] = await Promise.all([
        getDocs(query(collection(db, 'companyProposals'), ...scopedFilters)),
        getDocs(query(collection(db, 'finalReviewRequests'), ...scopedFilters)),
        getDocs(query(collection(db, 'endorsements'), ...scopedFilters)),
        adminRequest('/coordinator/companies'),
        adminRequest(`/coordinator/placement-history?sectionId=${encodeURIComponent(selectedSection.id)}`),
      ]);
      const proposals = snap.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => !selectedSection || item.sectionId === selectedSection.id);
      setItems(proposals);
      setCompanies(directory.companies || []);
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
        : 'Could not load company placement requests. Check your connection and try again.');
      setItems([]);
      setCompanies([]);
      setHistoryItems([]);
      setEndorsementItems([]);
      setVerifiedEndorsementItems([]);
      setFinalItems([]);
    } finally { setLoading(false); }
  }, [selectedSection, department]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setEndorsementDraft(null); }, [selectedSection?.id]);
  useEffect(() => { setDeliveryConfirm(null); setDeliveryNotice(''); }, [selectedSection?.id]);

  const review = async (item, status) => {
    const note = reason.trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { window.alert('Enter a reason before returning this proposal.'); return; }
    setBusy(item.id);
    try {
      const companyId = companySelections[item.id] || item.companyId || '';
      if (status === 'approved' && !companyId) {
        window.alert('Assign this proposal to an active company in the directory before approving it.');
        return;
      }
      await adminRequest(`/coordinator/company-placements/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST', body: JSON.stringify({ status, reason: note, ...(status === 'approved' ? { companyId } : {}) }),
      });
      setReason('');
      if (status === 'approved') setEndorsementDraft(null);
      await load();
    } catch (error) { window.alert(error.message || 'Unable to review placement.'); } finally { setBusy(''); }
  };

  const reviewFinal = async (item, status) => {
    const note = reason.trim();
    if ((status === 'needs_revision' || status === 'rejected') && !note) { window.alert('Enter a reason before returning this review.'); return; }
    setBusy(item.id);
    try {
      await adminRequest(`/coordinator/final-reviews/${encodeURIComponent(item.id)}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status, reason: note }),
      });
      setReason(''); await load();
    } catch (error) { window.alert(error.message || 'Unable to review final request.'); } finally { setBusy(''); }
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
    const note = reason.trim();
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

  if (loading) return <div style={{ padding: 32 }}>Loading company placements...</div>;
  return <div style={{ padding: 28, overflowY: 'auto', flex: 1 }}>
    <h2 style={{ marginTop: 0 }}>Company Placements</h2>
    <p style={{ color: '#64748B' }}>Review placement requests for {selectedSection ? selectedSection.name : 'your assigned sections'}.</p>
    {error && <div role="alert" style={{ padding: 14, border: '1px solid #FDA4AF', borderRadius: 10, background: '#FFF1F2', color: '#9F1239', marginTop: 14 }}>{error}</div>}
    {items.length === 0 && <div style={{ padding: 24, border: '1px solid #E2E8F0', borderRadius: 12 }}>No company placement requests found for this section.</div>}
    {items.map(item => <article key={item.id} style={{ border: '1px solid #E2E8F0', borderRadius: 14, padding: 18, marginTop: 14, background: '#FFF' }}>
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
            {companies.map(company => {
              const full = company.availableSlots === 0 && company.id !== item.companyId;
              const unavailable = company.capacity === null;
              const slotLabel = unavailable ? 'capacity not configured' : `${company.availableSlots} slot${company.availableSlots === 1 ? '' : 's'} available`;
              return <option key={company.id} value={company.id} disabled={full || unavailable}>
                {company.name} · {unavailable ? slotLabel : full ? 'at capacity' : slotLabel}
              </option>;
            })}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'approved')}>Approve</button><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for changes or rejection" /><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision')}>Request changes</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected')}>Reject</button></div>
      </>}
    </article>)}
    <h3 style={{ marginTop: 30 }}>Final review requests</h3>
    {finalItems.length === 0 && <div style={{ padding: 24, border: '1px solid #E2E8F0', borderRadius: 12 }}>No final review requests found for this section.</div>}
    {finalItems.map(item => <article key={item.id} style={{ border: '1px solid #BAE6FD', borderRadius: 14, padding: 18, marginTop: 14, background: '#F0F9FF' }}>
      <h3 style={{ margin: 0 }}>Student final review</h3><p><b>Student:</b> {reviewStudentName(item)}<br /><b>Company:</b> {item.companySnapshot?.companyName || '—'}<br /><b>Supervisor:</b> {item.companySnapshot?.supervisorName || '—'}<br /><b>Requirements:</b> {item.requirementSnapshot?.filter(docItem => ['submitted', 'approved'].includes(docItem.status)).length || 0} submitted</p>
      <strong>{labels[item.status] || item.status}</strong>
      {item.reviewReason && <p style={{ color: '#B91C1C' }}><b>Previous reason:</b> {item.reviewReason}</p>}
      {item.status === 'pending_review' && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'approved', true)}>Approve final review</button><input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for changes or rejection" /><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'needs_revision', true)}>Request changes</button><button disabled={busy === item.id} onClick={() => requestReviewConfirmation(item, 'rejected', true)}>Reject</button></div>}
    </article>)}
    <h3 style={{ marginTop: 30 }}>Endorsement paperwork to prepare</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Approved placements awaiting a signed endorsement letter. These records are not issued documents or email deliveries.</p>
    {endorsementItems.length === 0 && <div style={{ padding: 20, border: '1px solid #E2E8F0', borderRadius: 12, background: '#fff' }}>No endorsement paperwork is pending for this section.</div>}
    {endorsementItems.map(item => <article key={item.id} style={{ border: '1px solid #BAE6FD', borderRadius: 12, padding: 16, marginTop: 10, background: '#fff' }}>
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
    {verifiedEndorsementItems.length === 0 && <div style={{ padding: 20, border: '1px solid #E2E8F0', borderRadius: 12, background: '#fff' }}>No signed endorsement copies have been verified for this section.</div>}
    {verifiedEndorsementItems.map(item => <article key={item.id} style={{ border: '1px solid #A7F3D0', borderRadius: 12, padding: 16, marginTop: 10, background: '#fff' }}>
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
    <h3 style={{ marginTop: 30 }}>Approved placement history</h3>
    <p style={{ color: '#64748B', marginTop: -8 }}>Coordinator-approved assignment snapshots for this section.</p>
    {historyItems.length === 0 && <div style={{ padding: 20, border: '1px solid #E2E8F0', borderRadius: 12, background: '#fff' }}>No approved placement changes recorded yet.</div>}
    {historyItems.map(item => {
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
        if (reviewConfirm.finalReview) await reviewFinal(reviewConfirm.item, reviewConfirm.status);
        else await review(reviewConfirm.item, reviewConfirm.status);
        setReviewConfirm(null);
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
