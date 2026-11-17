import { useEffect, useRef, useState } from 'react';
import EvaluationFormBuilder, { defaultEvaluationForm } from './EvaluationFormBuilder';
import './EvaluationBuilder.css';

const clone = form => ({ ...form, questions: form.questions.map(q => ({ ...q })) });

export default function EvaluationBuilderDialog({ value, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => clone(value));
  const [focusId, setFocusId] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('edit');
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  useEffect(() => { dialog.current.showModal(); }, []);
  const requestClose = () => { if (dirty) setConfirmClose(true); else onClose(); };
  const save = event => {
    event.preventDefault();
    const incomplete = draft.questions.find(q => !q.label.trim());
    if (!draft.title.trim() || incomplete) {
      setTab('edit'); setFocusId(incomplete?.id || null);
      setError(!draft.title.trim() ? 'Enter an evaluation title.' : `Type the text for question ${draft.questions.indexOf(incomplete) + 1}.`);
      return;
    }
    onSave(draft);
    onClose();
  };
  return <dialog ref={dialog} className="eqb-dialog" aria-labelledby="evaluation-builder-title" onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <form noValidate onSubmit={save}>
      <header className="eqb-head">
        <div><h2 id="evaluation-builder-title">Evaluation questions</h2><p>Changes apply to invitations you send from now on.</p></div>
        <button type="button" className="eqb-close" aria-label="Close evaluation builder" onClick={requestClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
      </header>
      <div className="eqb-tabs" role="tablist" aria-label="View">
        <button type="button" role="tab" aria-selected={tab === 'edit'} onClick={() => setTab('edit')}>Edit</button>
        <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => setTab('preview')}>Preview</button>
      </div>
      <div className="eqb-content" data-tab={tab}>
        <section className="eqb-edit" aria-label="Edit questions">
          {error && <p className="eqb-error" role="alert">{error}</p>}
          <EvaluationFormBuilder value={draft} focusId={focusId} onChange={(next, newId) => { setDraft(next); setError(''); if (newId) setFocusId(newId); }} />
        </section>
        <section className="eqb-preview" aria-label="Supervisor form preview">
          <span className="eqb-preview-label">What the supervisor sees</span>
          <div className="eqb-paper">
            <h3>{draft.title || 'Untitled evaluation'}</h3>
            {draft.instructions && <p>{draft.instructions}</p>}
            {draft.questions.map((q, i) => <div key={q.id} className="eqb-pq">
              <span>{i + 1}. {q.label || <em>Untitled question</em>}{q.required && <b aria-label="required"> *</b>}</span>
              {q.type === 'rating'
                ? <div className="eqb-scale" aria-hidden="true">{[1, 2, 3, 4, 5].map(n => <i key={n}>{n}</i>)}<small>Poor</small><small>Excellent</small></div>
                : <div className="eqb-box" aria-hidden="true" />}
            </div>)}
          </div>
        </section>
      </div>
      <footer className="eqb-foot">
        <button type="button" className="eqb-link" onClick={() => { setDraft(clone(defaultEvaluationForm())); setError(''); }}>Reset to default</button>
        <span className="eqb-spacer" />
        {confirmClose ? <>
          <span className="eqb-confirm">Discard your changes?</span>
          <button type="button" className="eqb-btn" onClick={() => setConfirmClose(false)}>Keep editing</button>
          <button type="button" className="eqb-btn eqb-danger" onClick={onClose}>Discard</button>
        </> : <>
          <button type="button" className="eqb-btn" onClick={() => onClose()}>Cancel</button>
          <button type="submit" className="eqb-btn eqb-primary" disabled={!dirty}>Save questions</button>
        </>}
      </footer>
    </form>
  </dialog>;
}
