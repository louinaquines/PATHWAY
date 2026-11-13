import { useEffect, useRef, useState } from 'react';
import EvaluationFormBuilder from './EvaluationFormBuilder';

export default function EvaluationBuilderDialog({ value, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => ({ ...value, questions: value.questions.map(q => ({ ...q })) }));
  const [preview, setPreview] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current.showModal(); }, []);
  const save = event => {
    event.preventDefault();
    const incomplete = draft.questions.find(q => !q.label.trim());
    if (!draft.title.trim() || incomplete) {
      setPreview(false);
      setOpenId(incomplete?.id || null);
      setError(!draft.title.trim() ? 'Enter an evaluation title.' : 'Enter text for the open question.');
      return;
    }
    onSave(draft);
    onClose();
  };
  return <dialog ref={dialog} className="evaluation-builder-dialog" aria-labelledby="evaluation-builder-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form noValidate onSubmit={save}>
      <header className="evaluation-builder-dialog-header">
        <h2 id="evaluation-builder-title">Evaluation questions</h2>
        <div className="evaluation-editor-actions">
          <button type="button" onClick={() => setPreview(!preview)}>{preview ? 'Back to editing' : 'Preview'}</button>
          <button type="button" aria-label="Close evaluation builder" onClick={onClose}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
      </header>
      <div className="evaluation-builder-dialog-content">
        {error && <p role="alert">{error}</p>}
        {preview ? <section className="evaluation-builder" aria-label="Supervisor form preview">
          <h3>{draft.title || 'Untitled evaluation'}</h3>
          <p>{draft.instructions}</p>
          {draft.questions.map(q => <label key={q.id}>{q.label || 'Untitled question'}{q.required ? ' *' : ''}
            {q.type === 'rating' ? <select required={q.required} defaultValue=""><option value="">Select rating</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}{n === 1 ? ' — Poor' : n === 5 ? ' — Excellent' : ''}</option>)}</select>
              : <textarea rows={3} maxLength={4000} required={q.required} />}
          </label>)}
        </section> : <EvaluationFormBuilder value={draft} onChange={next => { setDraft(next); setError(''); }} openId={openId} setOpenId={setOpenId} />}
      </div>
      <footer><small>Changes apply to future invitations.</small><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="evaluation-builder-save">Save questions</button></footer>
    </form>
  </dialog>;
}
