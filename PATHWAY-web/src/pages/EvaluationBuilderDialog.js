import { useEffect, useRef, useState } from 'react';
import EvaluationFormBuilder from './EvaluationFormBuilder';

export default function EvaluationBuilderDialog({ value, onSave, onClose }) {
  const dialog = useRef(null);
  const [draft, setDraft] = useState(() => ({ ...value, questions: value.questions.map(q => ({ ...q })) }));
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} className="evaluation-builder-dialog" aria-labelledby="evaluation-builder-title" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); onSave(draft); onClose(); }}>
      <header className="evaluation-builder-dialog-header"><div><h2 id="evaluation-builder-title">Create evaluation</h2><p>Design the form your supervisor will receive.</p></div><button type="button" aria-label="Close evaluation builder" onClick={onClose}>✕</button></header>
      <div className="evaluation-builder-dialog-content"><EvaluationFormBuilder value={draft} onChange={setDraft} /></div>
      <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="evaluation-builder-save">Save evaluation</button></footer>
    </form>
  </dialog>;
}
