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
  await screen.findByText('Analysis unavailable. Free journal checks remain available.');
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

const scoring = { version: 'journal-completeness-v1', status: 'Needs more detail', total: 72.5, criteria: [
  { id: 'tasks', label: 'Tasks performed', points: 30, weight: 30, level: 'full', reason: 'The task is clearly described.', evidence: 'I tested software.' },
  { id: 'metadata', label: 'Reporting dates and hours', points: 5, weight: 10, level: 'partial', reason: 'Reporting dates could not be validated.', evidence: '' },
] };
test('renders advisory points, explanations and evidence without presenting an academic grade', async () => {
  adminRequest.mockResolvedValue({ completeness: [], competencies: [{ name: 'Testing', evidence: 'tested software' }], sentiment: [], scoring, limitation: 'Human review required.' });
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('72.5/100 — Needs more detail');
  expect(screen.getByText('Tasks performed — 30/30 (full)')).toBeInTheDocument();
  expect(screen.getByText('The task is clearly described.')).toBeInTheDocument();
  expect(screen.getByText('Reporting dates could not be validated.')).toBeInTheDocument();
  expect(screen.getByText('journal-completeness-v1')).toBeInTheDocument();
  expect(screen.getByText(/not an academic grade or verified competency/i)).toBeInTheDocument();
  expect(screen.getByText('Possible competencies')).toBeInTheDocument();
});

test('unavailable original has no numeric zero or invented score', async () => {
  adminRequest.mockResolvedValue({ completeness: [], competencies: [], sentiment: [], scoring: { ...scoring, status: 'Analysis unavailable', total: null, criteria: [] } });
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('Analysis unavailable');
  expect(screen.queryByText(/\/100/)).toBeNull();
});

test('high journal score displays Sufficient detail without implying approval', async () => {
  adminRequest.mockResolvedValue({ completeness: [], competencies: [], sentiment: [], scoring: { ...scoring, total: 80, status: 'Sufficient detail' } });
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('80/100 — Sufficient detail');
  expect(screen.queryByText('80/100 — Complete')).toBeNull();
  expect(screen.getByText(/does not approve or change the journal/i)).toBeInTheDocument();
});

test('failed retry clears the previous score instead of leaving stale results visible', async () => {
  adminRequest.mockResolvedValueOnce({ completeness: [], competencies: [], sentiment: [], scoring }).mockRejectedValueOnce(new Error('private'));
  render(<JournalAiAnalysis studentId="student" entryId="entry" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('72.5/100 — Needs more detail');
  fireEvent.click(screen.getByText('Analyze this journal'));
  expect(screen.queryByText('72.5/100 — Needs more detail')).toBeNull();
  await screen.findByText(/Analysis unavailable/);
});

test.each([{ hours: 0, weekRange: '2026-10-19 – 2026-10-25' }, { hours: 40, weekRange: 'Week 1' }])('metadata refresh discards completed scores for unchanged notes: %j', async metadata => {
  adminRequest.mockResolvedValue({ completeness: [], competencies: [], sentiment: [], scoring });
  const view = render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="same" hours={40} weekRange="2026-10-19 – 2026-10-25" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  await screen.findByText('72.5/100 — Needs more detail');
  view.rerender(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="same" {...metadata} />);
  expect(screen.queryByText('72.5/100 — Needs more detail')).toBeNull();
  expect(screen.getByRole('checkbox').checked).toBe(false);
});

test.each([{ hours: 0, weekRange: '2026-10-19 – 2026-10-25' }, { hours: 40, weekRange: 'Week 1' }])('metadata refresh ignores an outstanding old score: %j', async metadata => {
  let resolve;
  adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  const view = render(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="same" hours={40} weekRange="2026-10-19 – 2026-10-25" />);
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByText('Analyze this journal'));
  view.rerender(<JournalAiAnalysis studentId="student" entryId="entry" sourceText="same" {...metadata} />);
  await act(async () => resolve({ completeness: [], competencies: [], sentiment: [], scoring }));
  expect(screen.queryByText('72.5/100 — Needs more detail')).toBeNull();
  expect(screen.getByRole('checkbox').checked).toBe(false);
});
