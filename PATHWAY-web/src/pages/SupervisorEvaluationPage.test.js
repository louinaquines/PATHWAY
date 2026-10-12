import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SupervisorEvaluationPage from './SupervisorEvaluationPage';
jest.mock('../firebase', () => ({}));
jest.mock('../pageMetadata', () => ({ setPageMetadata: jest.fn() }));

test('keeps form private until OTP verification and sends session on submission', async () => {
  window.history.replaceState({}, '', '/evaluate?token=fixture');
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ verificationRequired: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ session: 'verified-fixture' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ studentName: 'TEST ONLY', formDefinition: { title: 'TEST ONLY evaluation', questions: [] } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
  render(<SupervisorEvaluationPage />);
  await screen.findByRole('heading', { name: 'Verify your email' });
  expect(screen.queryByRole('button', { name: 'Submit Official Evaluation' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Send verification code' }));
  await screen.findByText('Check your email for the six-digit code. It expires in 10 minutes.');
  fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and open evaluation' }));
  await screen.findByRole('heading', { name: 'TEST ONLY evaluation' });
  expect(fetch.mock.calls[3][1].headers['X-Evaluation-Session']).toBe('verified-fixture');
  fireEvent.click(screen.getByRole('button', { name: 'Submit Official Evaluation' }));
  await screen.findByText('Evaluation Submitted');
  expect(fetch.mock.calls[4][1].headers['X-Evaluation-Session']).toBe('verified-fixture');
  delete global.fetch;
});
test('expired verification returns to the code screen and preserves answers', async () => {
  window.history.replaceState({}, '', '/evaluate?token=fixture');
  const form = { formDefinition: { title: 'TEST ONLY', questions: [{ id: 'q_1', label: 'Comments', type: 'text', required: false }] } };
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => form })
    .mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Verification expired.' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ session: 'renewed' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => form });
  render(<SupervisorEvaluationPage />);
  fireEvent.change(await screen.findByLabelText('Comments (optional)'), { target: { value: 'TEST ONLY saved answer' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit Official Evaluation' }));
  await screen.findByRole('heading', { name: 'Verify your email' });
  expect(screen.queryByLabelText('Comments (optional)')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify and open evaluation' }));
  expect(await screen.findByLabelText('Comments (optional)')).toHaveValue('TEST ONLY saved answer');
  delete global.fetch;
});

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
