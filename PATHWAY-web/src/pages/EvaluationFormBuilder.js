export const defaultEvaluationForm = () => ({
  title: 'OJT Supervisor Evaluation', instructions: 'Evaluate the intern’s performance. Ratings: 1 = Poor, 5 = Excellent.',
  questions: ['Technical Skills', 'Work Quality', 'Professionalism', 'Communication', 'Attendance'].map((label, index) => ({ id: `q_${index}`, label, type: 'rating', required: true })).concat({ id: 'q_feedback', label: 'Overall feedback', type: 'text', required: true }),
});

export default function EvaluationFormBuilder({ value, onChange, disabled }) {
  const changeQuestion = (index, patch) => onChange({ ...value, questions: value.questions.map((q, i) => i === index ? { ...q, ...patch } : q) });
  const move = (index, direction) => {
    const questions = [...value.questions];
    [questions[index], questions[index + direction]] = [questions[index + direction], questions[index]];
    onChange({ ...value, questions });
  };
  return <fieldset className="evaluation-builder" disabled={disabled}>
    <legend>Build the supervisor’s evaluation</legend>
    <p>Customize this form before preparing the email. Each invitation saves its own copy; later edits won’t change existing invitations.</p>
    <label>Evaluation title<input required maxLength={160} value={value.title} onChange={e => onChange({ ...value, title: e.target.value })} /></label>
    <label>Instructions<textarea rows={2} maxLength={2000} value={value.instructions} onChange={e => onChange({ ...value, instructions: e.target.value })} /></label>
    {value.questions.map((q, index) => <div className="evaluation-builder-question" key={q.id}>
      <label className="evaluation-question-label">Question {index + 1}<input required maxLength={300} value={q.label} onChange={e => changeQuestion(index, { label: e.target.value })} /></label>
      <label>Answer type<select value={q.type} onChange={e => changeQuestion(index, { type: e.target.value })}><option value="rating">Rating (1–5)</option><option value="text">Text answer</option></select></label>
      <label className="evaluation-required"><input type="checkbox" checked={q.required} onChange={e => changeQuestion(index, { required: e.target.checked })} />Required</label>
      <div className="evaluation-question-actions"><button type="button" aria-label={`Move question ${index + 1} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" aria-label={`Move question ${index + 1} down`} disabled={disabled || index === value.questions.length - 1} onClick={() => move(index, 1)}>↓</button><button type="button" disabled={disabled || value.questions.length === 1} onClick={() => onChange({ ...value, questions: value.questions.filter((_, i) => i !== index) })}>Remove</button></div>
    </div>)}
    <button type="button" disabled={disabled || value.questions.length >= 20} onClick={() => onChange({ ...value, questions: [...value.questions, { id: `q_${crypto.randomUUID()}`, label: '', type: 'rating', required: true }] })}>+ Add question</button>
    <span className="evaluation-question-limit"> {value.questions.length}/20 questions</span>
  </fieldset>;
}
