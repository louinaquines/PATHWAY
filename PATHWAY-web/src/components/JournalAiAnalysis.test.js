import { act, fireEvent, render, screen } from '@testing-library/react';
import JournalAiAnalysis from './JournalAiAnalysis';
import { adminRequest } from '../adminApi';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
beforeEach(() => adminRequest.mockReset());
test('no automatic request; consent required; shows mood headline and summary', async () => {
  adminRequest.mockResolvedValue({ mood: 'positive', headline: 'Positive work experience', summary: 'Got clear feedback.' });
  const { container } = render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="I tested software." />);
  expect(adminRequest).not.toHaveBeenCalled();
  expect(screen.getByText('Analyze').disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Analyze'));
  await screen.findByText('Positive work experience');
  screen.getByText('Got clear feedback.');
  expect(container.querySelector('.journal-ai').dataset.tone).toBe('green');
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student/logbook/entry/ai-analysis', { method: 'POST', body: '{"consent":true}' });
});
test('negative mood is red, unclear is gray', async () => {
  adminRequest.mockResolvedValueOnce({ mood: 'negative', headline: 'Struggling with workload', summary: 'Long hours.' });
  const { container } = render(<JournalAiAnalysis studentId="s" entryId="e" sourceText="x" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze'));
  await screen.findByText('Struggling with workload');
  expect(container.querySelector('.journal-ai').dataset.tone).toBe('red');
  adminRequest.mockResolvedValueOnce({ mood: 'unclear', headline: 'Not enough to tell', summary: 'Short.' });
  fireEvent.click(screen.getByText('Analyze again'));
  await screen.findByText('Not enough to tell');
  expect(container.querySelector('.journal-ai').dataset.tone).toBe('gray');
});
test('failure hides provider details', async () => {
  adminRequest.mockRejectedValue(new Error('secret provider detail'));
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze'));
  await screen.findByText('AI review unavailable. Try again later.');
  expect(screen.queryByText('secret provider detail')).toBeNull();
});
test('changed journal ignores an older pending result', async () => {
  let resolve;
  adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="old" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze'));
  view.rerender(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="new" />);
  await act(async () => resolve({ mood: 'positive', headline: 'Old result', summary: 'old' }));
  expect(screen.queryByText('Old result')).toBeNull();
  expect(screen.getByRole('checkbox').checked).toBe(false);
});
