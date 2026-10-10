import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationBuilderDialog from './EvaluationBuilderDialog';
import { defaultEvaluationForm } from './EvaluationFormBuilder';
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
test('overlay saves edits without modifying the original definition', () => {
  const value = defaultEvaluationForm(); const onSave = jest.fn(); const onClose = jest.fn();
  render(<EvaluationBuilderDialog value={value} onSave={onSave} onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: 'Create evaluation' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Evaluation title'), { target: { value: 'Updated review' } });
  expect(value.title).toBe('OJT Supervisor Evaluation');
  fireEvent.click(screen.getByRole('button', { name: 'Save evaluation' }));
  expect(onSave.mock.calls[0][0].title).toBe('Updated review'); expect(onClose).toHaveBeenCalled();
});
test('cancel dismisses without saving', () => {
  const onSave = jest.fn(); const onClose = jest.fn();
  render(<EvaluationBuilderDialog value={defaultEvaluationForm()} onSave={onSave} onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onSave).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalled();
});
