const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
function validateForm(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Create an evaluation form.');
  const { title, instructions, questions } = value;
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || typeof instructions !== 'string' || instructions.length > 2000) invalid('Enter a title up to 160 characters and instructions up to 2,000 characters.');
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 20) invalid('Add between 1 and 20 questions.');
  const ids = new Set();
  const clean = questions.map(q => {
    if (!q || typeof q.id !== 'string' || !/^q_[a-zA-Z0-9_-]{1,60}$/.test(q.id) || ids.has(q.id)
      || !['rating', 'text'].includes(q.type) || typeof q.required !== 'boolean'
      || typeof q.label !== 'string' || !q.label.trim() || q.label.length > 300) invalid('Each question needs a unique ID, valid type, and label up to 300 characters.');
    ids.add(q.id);
    return { id: q.id, type: q.type, required: q.required, label: q.label.trim() };
  });
  return { version: 1, title: title.trim(), instructions: instructions.trim(), questions: clean };
}
function validateAnswers(form, answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) invalid('Enter your evaluation answers.');
  const ids = new Set(form.questions.map(q => q.id));
  if (Object.keys(answers).some(id => !ids.has(id))) invalid('Answers contain an unknown question.');
  const clean = {};
  for (const q of form.questions) {
    const value = answers[q.id];
    if (value === undefined || value === null || value === '') {
      if (q.required) invalid(`Answer the required question: ${q.label}`);
      continue;
    }
    if (q.type === 'rating') {
      if (!Number.isInteger(value) || value < 1 || value > 5) invalid('Ratings must be whole numbers from 1 to 5.');
      clean[q.id] = value;
    } else {
      if (typeof value !== 'string' || value.length > 4000 || (q.required && !value.trim())) invalid('Required text answers cannot be blank; maximum 4,000 characters.');
      if (value.trim()) clean[q.id] = value.trim();
    }
  }
  return clean;
}
module.exports = { validateForm, validateAnswers };
