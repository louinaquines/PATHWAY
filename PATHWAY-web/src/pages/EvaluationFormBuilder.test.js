import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationFormBuilder, { defaultEvaluationForm } from './EvaluationFormBuilder';
test('coordinator edits title, type, optional status, ordering and removes questions', () => {
  function Harness() { const [form, setForm] = useState(defaultEvaluationForm); return <EvaluationFormBuilder value={form} onChange={setForm} />; }
  render(<Harness />);
  fireEvent.change(screen.getByLabelText('Evaluation title'), { target: { value: 'My review' } });
  expect(screen.getByLabelText('Evaluation title')).toHaveValue('My review');
  fireEvent.change(screen.getAllByLabelText('Answer type')[0], { target: { value: 'text' } });
  expect(screen.getAllByLabelText('Answer type')[0]).toHaveValue('text');
  fireEvent.click(screen.getAllByLabelText('Required')[0]);
  expect(screen.getAllByLabelText('Required')[0]).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
  expect(screen.getByLabelText('Question 2')).toHaveValue('Technical Skills');
  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
  expect(screen.getAllByLabelText('Answer type')).toHaveLength(5);
});
