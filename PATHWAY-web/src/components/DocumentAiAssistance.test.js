import { act, fireEvent, render, screen } from '@testing-library/react';
import DocumentAiAssistance from './DocumentAiAssistance';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => adminRequest.mockReset());
function agree() { screen.getAllByRole('checkbox').forEach(input => fireEvent.click(input)); }
test('requires review and consent, sends only redacted excerpt and allows discard', async () => {
  adminRequest.mockResolvedValue({ findings: [{ finding: 'Check this field', evidence: 'TEST ONLY' }], limitation: 'Human review required.' });
  render(<DocumentAiAssistance studentId="student" requirementId="certificate" text="TEST ONLY personal detail" />);
  expect(adminRequest).not.toHaveBeenCalled(); expect(screen.getByText('Review with AI').disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Reviewed excerpt'), { target: { value: 'TEST ONLY' } }); agree();
  fireEvent.click(screen.getByText('Review with AI')); await screen.findByText('Check this field');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student/requirements/certificate/ai-assistance', { method: 'POST', body: '{"text":"TEST ONLY","reviewed":true,"consent":true}' });
  fireEvent.click(screen.getByText('Discard findings')); expect(screen.queryByText('Check this field')).toBeNull();
});
test('source changes clear confirmations and ignore stale response', async () => {
  let resolve; adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<DocumentAiAssistance studentId="student" requirementId="dtr" text="old" />);
  agree(); fireEvent.click(screen.getByText('Review with AI'));
  view.rerender(<DocumentAiAssistance studentId="student" requirementId="dtr" text="new" />);
  await act(async () => resolve({ findings: [{ finding: 'Old result', evidence: 'old' }] }));
  expect(screen.queryByText('Old result')).toBeNull(); expect(screen.getAllByRole('checkbox').every(input => !input.checked)).toBe(true);
});
test('errors retain manual workflow without exposing provider details', async () => {
  adminRequest.mockRejectedValue(new Error('secret'));
  render(<DocumentAiAssistance studentId="student" requirementId="dtr" text="source" />);
  agree(); fireEvent.click(screen.getByText('Review with AI'));
  await screen.findByText('AI assistance unavailable. Manual checks and comparison remain available.');
});
