import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { adminRequest } from '../adminApi';
import './JournalAiAnalysis.css';
const newId = () => globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4))).join('-');
const assetIdentity = r => [r.cloudinaryAssetId || '', r.cloudinaryPublicId || '', r.cloudinaryVersion || '', r.submittedAt || '', r.fileName || ''];
export default function DocumentTriagePanel({ studentId, requirementId, text, context }) {
  const [excerpt, setExcerpt] = useState(text.slice(0, 6000)), [consent, setConsent] = useState(false), [reviewed, setReviewed] = useState(false);
  const [result, setResult] = useState(context.result || null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [reason, setReason] = useState(''), [sent, setSent] = useState(false), [invalid, setInvalid] = useState(false);
  const generation = useRef(0), pending = useRef(false), requestId = useRef(newId()), decisionId = useRef(newId());
  const root = `/coordinator/students/${encodeURIComponent(studentId)}/requirements/${encodeURIComponent(requirementId)}`;
  useEffect(() => {
    const invalidate = () => { generation.current++; setResult(null); setConsent(false); setReviewed(false); setReason(''); setInvalid(true); setBusy(false); setError('Reload the document preview: its source or your access changed.'); };
    const unsubscribe = onSnapshot(doc(db, 'users', studentId), snapshot => {
      const profile = snapshot.data();
      if (!profile || profile.sectionId !== context.sectionId || profile.disabled === true
        || JSON.stringify(assetIdentity(profile.requirements?.[requirementId] || {})) !== JSON.stringify(context.assetIdentity)) invalidate();
    }, invalidate);
    return () => { generation.current++; unsubscribe(); };
  }, [studentId, requirementId, context.version, context.sectionId]); // parent remounts on source change
  async function analyze() {
    if (pending.current || invalid || !reviewed || !consent || !excerpt.trim()) return;
    const run = generation.current; pending.current = true; setBusy(true); setError('');
    try {
      const value = await adminRequest(`${root}/triage`, { method: 'POST', deadlineMs: 45000,
        body: JSON.stringify({ sourceVersion: context.version, text: excerpt, reviewed: true, consent: true, requestId: requestId.current }) });
      if (generation.current === run) setResult(value);
    } catch (failure) {
      if (generation.current === run) {
        if ([403,409].includes(failure.status)) { setInvalid(true); setError('Reload the document preview before continuing.'); }
        else setError('AI triage unavailable. Manual review remains available. This request will not be automatically resent.');
      }
    } finally { pending.current = false; if (generation.current === run) setBusy(false); }
  }
  async function replace() {
    if (pending.current || invalid || result?.color !== 'red' || !reason.trim() || sent) return;
    const run = generation.current; pending.current = true; setBusy(true); setError('');
    try {
      await adminRequest(`${root}/decision`, { method: 'POST', body: JSON.stringify({ status: 'rejected', reason: reason.trim(),
        sourceVersion: context.version, requestId: decisionId.current }) });
      if (generation.current === run) setSent(true);
    } catch (failure) {
      if (generation.current === run) setError([403,409].includes(failure.status)
        ? 'Reload the document preview before requesting replacement.' : 'Could not confirm replacement. Your reason is preserved; retrying uses the same request identity.');
    } finally { pending.current = false; if (generation.current === run) setBusy(false); }
  }
  return <section className="journal-ai" aria-label="Document triage"><div className="journal-ai__body">
    <h3>Advisory document check</h3>
    <p>Expected document: {context.label}. This checks only the reviewed excerpt. Green does not certify completeness or authenticity. AI can be wrong.</p>
    <label>Reviewed document excerpt<textarea rows={5} maxLength={6000} disabled={busy || invalid} value={excerpt} onChange={event => {
      setExcerpt(event.target.value); setReviewed(false); setConsent(false); setResult(null); requestId.current = newId();
    }} /></label>
    {text.length > 6000 && <p>Only the first 6,000 characters are prefilled. Omitted content is not analyzed.</p>}
    <label><input type="checkbox" checked={reviewed} disabled={busy || invalid} onChange={event => setReviewed(event.target.checked)} /> I checked and corrected this excerpt against the original document.</label>
    <label><input type="checkbox" checked={consent} disabled={busy || invalid} onChange={event => setConsent(event.target.checked)} /> I have permission to share this excerpt with AI and removed unnecessary personal information.</label>
    <button type="button" onClick={analyze} disabled={busy || invalid || !reviewed || !consent || !excerpt.trim()}>Analyze document type</button>
    {busy && <p role="status">Working…</p>}{error && <p role="alert">{error}</p>}
    {result && <section><h4>{({ green: 'Green', yellow: 'Yellow', red: 'Red' })[result.color]} — manual review required</h4>
      <p>{result.reason}</p>{result.evidence && <blockquote>{result.evidence}</blockquote>}
      {result.color === 'red' && <><p>Red sends advisory guidance but does not officially reject the file. Request replacement only after your own review.</p>
        <label>Reason for replacement<textarea maxLength={2000} value={reason} disabled={busy || sent || invalid} onChange={event => { setReason(event.target.value); decisionId.current = newId(); }} /></label>
        <button type="button" onClick={replace} disabled={busy || invalid || sent || !reason.trim()}>Confirm and request replacement</button>
      </>}
    </section>}
    {sent && <p role="status">Replacement requested. The student was notified.</p>}
  </div></section>;
}
