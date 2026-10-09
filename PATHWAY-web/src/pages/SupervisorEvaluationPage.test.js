import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SupervisorEvaluationPage from './SupervisorEvaluationPage';
jest.mock('../firebase', () => ({}));
jest.mock('../pageMetadata', () => ({ setPageMetadata: jest.fn() }));
test('renders saved custom questions and submits typed answers', async () => {
  window.history.replaceState({}, '', '/evaluate?token=test');
  global.fetch = jest.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ studentName: 'Avery', formDefinition: { title: 'Custom review', instructions: 'Please answer', questions: [{ id: 'q_1', label: 'Teamwork', type: 'rating', required: true }, { id: 'q_2', label: 'Strengths', type: 'text', required: false }] } }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
  render(<SupervisorEvaluationPage />);
  expect(await screen.findByRole('heading', { name: 'Custom review' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Teamwork (required)'), { target: { value: '4' } });
  fireEvent.change(screen.getByLabelText('Strengths (optional)'), { target: { value: 'Helpful' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Official Evaluation' }));
  await screen.findByText('Evaluation Submitted');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ answers: { q_1: 4, q_2: 'Helpful' } });
  delete global.fetch;
});
test('existing invitations retain the legacy evaluation form', async () => {
  window.history.replaceState({}, '', '/evaluate?token=legacy');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ studentName: 'Avery' }) });
  render(<SupervisorEvaluationPage />);
  await waitFor(() => expect(screen.getAllByRole('combobox')).toHaveLength(5));
  expect(screen.getByText('Supervisor Comments & Overall Assessment')).toBeInTheDocument();
  delete global.fetch;
});
