import { act, fireEvent, render, screen } from '@testing-library/react';
import JournalAiAnalysis from './JournalAiAnalysis';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => adminRequest.mockReset());
test('no automatic request; consent required; findings are discardable', async () => {
  adminRequest.mockResolvedValue({ completeness: [{ finding: 'Describe outcome', evidence: 'I tested software.' }], competencies: [], sentiment: [], limitation: 'Human review required.' });
  render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="I tested software." />);
  expect(adminRequest).not.toHaveBeenCalled();
  expect(screen.getByText('Analyze this journal').disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('Describe outcome');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student/logbook/entry/ai-analysis', { method: 'POST', body: '{"consent":true}' });
  fireEvent.click(screen.getByText('Discard findings'));
  expect(screen.queryByText('Describe outcome')).toBeNull();
});
test('failure keeps free checks available and hides provider details', async () => {
  adminRequest.mockRejectedValue(new Error('secret provider detail'));
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('AI review unavailable. Free journal checks remain available.');
  expect(screen.queryByText('secret provider detail')).toBeNull();
});
test('changed journal ignores an older pending result', async () => {
  let resolve;
  adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="old" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  view.rerender(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="new" />);
  await act(async () => resolve({ completeness: [{ finding: 'Old result', evidence: 'old' }], competencies: [], sentiment: [] }));
  expect(screen.queryByText('Old result')).toBeNull();
  expect(screen.getByRole('checkbox').checked).toBe(false);
});
