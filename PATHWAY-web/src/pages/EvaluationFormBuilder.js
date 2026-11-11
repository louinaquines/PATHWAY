import { useState } from 'react';

export const defaultEvaluationForm = () => ({
  title: 'OJT Supervisor Evaluation', instructions: 'Evaluate the intern’s performance. Ratings: 1 = Poor, 5 = Excellent.',
  questions: ['Technical Skills', 'Work Quality', 'Professionalism', 'Communication', 'Attendance'].map((label, index) => ({ id: 'q_' + index, label, type: 'rating', required: true })).concat({ id: 'q_feedback', label: 'Overall feedback', type: 'text', required: true }),
});

export default function EvaluationFormBuilder({ value, onChange, openId, setOpenId }) {
  const [menuId, setMenuId] = useState(null);
  const update = (index, patch) => onChange({ ...value, questions: value.questions.map((q, i) => i === index ? { ...q, ...patch } : q) });
  const move = (index, offset) => {
    const questions = [...value.questions];
    [questions[index], questions[index + offset]] = [questions[index + offset], questions[index]];
    onChange({ ...value, questions });
    setMenuId(null);
  };
  return <div className="evaluation-builder">
    <h3>Form details</h3>
    <label>Evaluation title<input required maxLength={160} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></label>
    <label>Instructions<textarea rows={2} maxLength={2000} value={value.instructions} onChange={e => onChange({ ...value, instructions: e.target.value })} /></label>
    <h3>Questions <small>{value.questions.length}/20</small></h3>
    {value.questions.map((q, index) => <section className="evaluation-question-row" key={q.id}>
      <div className="evaluation-question-summary">
        <button type="button" aria-expanded={openId === q.id} onClick={() => { setOpenId(openId === q.id ? null : q.id); setMenuId(null); }}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{q.label || 'Untitled question'}</strong>
          <small>{q.type === 'rating' ? 'Rating (1–5)' : 'Text answer'} · {q.required ? 'Required' : 'Optional'}</small>
        </button>
        <button type="button" aria-label={'Actions for question ' + (index + 1)} aria-expanded={menuId === q.id} onClick={() => setMenuId(menuId === q.id ? null : q.id)}>⋯</button>
      </div>
      {menuId === q.id && <div className="evaluation-question-menu" role="group" aria-label="Question actions">
        <button type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button>
        <button type="button" disabled={index === value.questions.length - 1} onClick={() => move(index, 1)}>Move down</button>
        <button type="button" disabled={value.questions.length === 1} onClick={() => {
          onChange({ ...value, questions: value.questions.filter(item => item.id !== q.id) });
          if (openId === q.id) setOpenId(null);
          setMenuId(null);
        }}>Remove</button>
      </div>}
      {openId === q.id && <div className="evaluation-builder-question">
        <label className="evaluation-question-label">Question {index + 1}<input required maxLength={300} value={q.label} onChange={e => update(index, { label: e.target.value })} /></label>
        <label>Answer type<select value={q.type} onChange={e => update(index, { type: e.target.value })}><option value="rating">Rating (1–5)</option><option value="text">Text answer</option></select></label>
        <label className="evaluation-required"><input type="checkbox" checked={q.required} onChange={e => update(index, { required: e.target.checked })} />Required</label>
      </div>}
    </section>)}
    <button type="button" disabled={value.questions.length >= 20} onClick={() => {
      const question = { id: 'q_' + crypto.randomUUID(), label: '', type: 'rating', required: true };
      onChange({ ...value, questions: [...value.questions, question] });
      setOpenId(question.id);
      setMenuId(null);
    }}>+ Add question</button>
  </div>;
}
