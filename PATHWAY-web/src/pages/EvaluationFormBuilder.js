import { useState } from 'react';

export const defaultEvaluationForm = () => ({
  title: 'OJT Supervisor Evaluation', instructions: 'Evaluate the intern’s performance. Ratings: 1 = Poor, 5 = Excellent.',
  questions: ['Technical Skills', 'Work Quality', 'Professionalism', 'Communication', 'Attendance'].map((label, index) => ({ id: 'q_' + index, label, type: 'rating', required: true })).concat({ id: 'q_feedback', label: 'Overall feedback', type: 'text', required: true }),
});

const MAX_QUESTIONS = 20;

/* Edit questions in place: text, answer type, required, order (drag or arrows), delete. */
export default function EvaluationFormBuilder({ value, onChange, focusId }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const update = (index, patch) => onChange({ ...value, questions: value.questions.map((q, i) => i === index ? { ...q, ...patch } : q) });
  const move = (from, to) => {
    if (to < 0 || to >= value.questions.length || from === to) return;
    const questions = [...value.questions];
    const [item] = questions.splice(from, 1);
    questions.splice(to, 0, item);
    onChange({ ...value, questions });
  };
  return <div className="eqb">
    <label className="eqb-field">Evaluation title<input required maxLength={160} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></label>
    <label className="eqb-field">Instructions<textarea rows={2} maxLength={2000} value={value.instructions} onChange={e => onChange({ ...value, instructions: e.target.value })} /></label>
    <div className="eqb-qhead"><h3>Questions</h3><span>{value.questions.length} of {MAX_QUESTIONS}</span></div>
    <ol className="eqb-list">
      {value.questions.map((q, index) => <li key={q.id} className="eqb-q" data-drop={overIndex === index && dragIndex !== index || undefined} data-dragging={dragIndex === index || undefined}
        onDragOver={event => { if (dragIndex == null) return; event.preventDefault(); setOverIndex(index); }}
        onDrop={event => { event.preventDefault(); if (dragIndex != null) move(dragIndex, index); setDragIndex(null); setOverIndex(null); }}>
        <span className="eqb-handle" draggable aria-hidden="true" title="Drag to reorder"
          onDragStart={event => { setDragIndex(index); event.dataTransfer.effectAllowed = 'move'; try { event.dataTransfer.setData('text/plain', String(index)); } catch (_) { /* some browsers */ } }}
          onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>
        </span>
        <span className="eqb-num">{index + 1}</span>
        <div className="eqb-body">
          <input className="eqb-text" aria-label={`Question ${index + 1}`} placeholder="Type the question" required maxLength={300} value={q.label}
            autoFocus={focusId === q.id} data-empty={!q.label.trim() || undefined} onChange={e => update(index, { label: e.target.value })} />
          <div className="eqb-controls">
            <div className="eqb-type" role="group" aria-label={`Answer type for question ${index + 1}`}>
              <button type="button" aria-pressed={q.type === 'rating'} onClick={() => update(index, { type: 'rating' })}>Rating 1–5</button>
              <button type="button" aria-pressed={q.type === 'text'} onClick={() => update(index, { type: 'text' })}>Written</button>
            </div>
            <label className="eqb-req"><input type="checkbox" role="switch" aria-label={`Required for question ${index + 1}`} checked={q.required} onChange={e => update(index, { required: e.target.checked })} /><i aria-hidden="true" />Required</label>
            <span className="eqb-spacer" />
            <button type="button" className="eqb-icon" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 15 6-6 6 6" /></svg></button>
            <button type="button" className="eqb-icon" aria-label={`Move question ${index + 1} down`} disabled={index === value.questions.length - 1} onClick={() => move(index, index + 1)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
            <button type="button" className="eqb-icon eqb-del" aria-label={`Remove question ${index + 1}`} disabled={value.questions.length === 1} onClick={() => onChange({ ...value, questions: value.questions.filter(item => item.id !== q.id) })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" /></svg></button>
          </div>
        </div>
      </li>)}
    </ol>
    <button type="button" className="eqb-add" disabled={value.questions.length >= MAX_QUESTIONS} onClick={() => {
      const question = { id: 'q_' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36)), label: '', type: 'rating', required: true };
      onChange({ ...value, questions: [...value.questions, question] }, question.id);
    }}>+ Add a question{value.questions.length >= MAX_QUESTIONS ? ' (limit reached)' : ''}</button>
  </div>;
}
