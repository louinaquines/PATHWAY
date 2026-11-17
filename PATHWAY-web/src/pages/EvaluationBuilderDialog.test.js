import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationBuilderDialog from './EvaluationBuilderDialog';
import { defaultEvaluationForm } from './EvaluationFormBuilder';
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
test('overlay saves edits without modifying the original definition', () => {
  const value = defaultEvaluationForm(); const onSave = jest.fn(); const onClose = jest.fn();
  render(<EvaluationBuilderDialog value={value} onSave={onSave} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Evaluation questions' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Evaluation title'), { target: { value: 'Updated review' } });
  expect(value.title).toBe('OJT Supervisor Evaluation');
  fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
  expect(onSave.mock.calls[0][0].title).toBe('Updated review'); expect(onClose).toHaveBeenCalled();
});
test('cancel dismisses without saving', () => {
  const onSave = jest.fn(); const onClose = jest.fn();
  render(<EvaluationBuilderDialog value={defaultEvaluationForm()} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onSave).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalled();
});

test('edits and reorders questions, previews the draft, then saves it', () => {
  const onSave = jest.fn();
  render(<EvaluationBuilderDialog value={defaultEvaluationForm()} onSave={onSave} onClose={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'Technical knowledge' } });
  fireEvent.click(screen.getByRole('button', { name: 'Move question 1 down' }));
  expect(screen.getByText(/2\. Technical knowledge/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save questions' }));
  expect(onSave.mock.calls[0][0].questions[1].label).toBe('Technical knowledge');
});

test('asks before discarding unsaved changes', () => {
  const onClose = jest.fn();
  render(<EvaluationBuilderDialog value={defaultEvaluationForm()} onSave={jest.fn()} onClose={onClose} />);
  expect(screen.getByRole('button', { name: 'Save questions' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Evaluation title'), { target: { value: 'X' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close evaluation builder' }));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
  expect(onClose).toHaveBeenCalled();
});
