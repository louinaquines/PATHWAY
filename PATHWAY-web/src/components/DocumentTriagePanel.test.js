import { fireEvent, render, screen, act } from '@testing-library/react';
import DocumentTriagePanel from './DocumentTriagePanel';
import { adminRequest } from '../adminApi';
import { onSnapshot } from 'firebase/firestore';
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
const context = { version: 'a'.repeat(64), label: 'Medical certificate', sectionId: 'section', assetIdentity: ['asset','file',1,'date','test.pdf'], result: null };
const props = { studentId: 'student', requirementId: 'certificate', text: 'Driving permit TEST ONLY', context };
beforeEach(() => { adminRequest.mockReset(); onSnapshot.mockClear(); });
test('does not analyze on opening and requires reviewed source plus consent', async () => {
  adminRequest.mockResolvedValue({ color: 'red', reason: 'Apparent wrong type.', evidence: 'Driving permit' });
  render(<DocumentTriagePanel {...props} />);
  expect(adminRequest).not.toHaveBeenCalled(); expect(screen.getByText('Analyze document type').disabled).toBe(true);
  screen.getAllByRole('checkbox').forEach(input => fireEvent.click(input));
  fireEvent.click(screen.getByText('Analyze document type'));
  await screen.findByText('Red — manual review required');
  const body = JSON.parse(adminRequest.mock.calls[0][1].body); expect(body.sourceVersion).toBe(context.version); expect(body.consent).toBe(true);
  expect(screen.getByText(/does not officially reject/)).toBeInTheDocument();
  expect(screen.getByText('Confirm and request replacement').disabled).toBe(true);
});
test('replacement is a separate explicit reasoned and version-bound coordinator action', async () => {
  adminRequest.mockResolvedValue({ success: true });
  render(<DocumentTriagePanel {...props} context={{ ...context, result: { color: 'red', reason: 'Check type.', evidence: 'Driving permit' } }} />);
  fireEvent.change(screen.getByLabelText('Reason for replacement'), { target: { value: 'Please upload the medical certificate instead.' } });
  fireEvent.click(screen.getByText('Confirm and request replacement'));
  await screen.findByText('Replacement requested. The student was notified.');
  expect(adminRequest.mock.calls[0][0]).toBe('/coordinator/students/student/requirements/certificate/decision');
  expect(JSON.parse(adminRequest.mock.calls[0][1].body)).toMatchObject({ status: 'rejected', sourceVersion: context.version });
});
test('assignment/source invalidation clears evidence and rejects late analysis', async () => {
  let resolve; adminRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  render(<DocumentTriagePanel {...props} />);
  screen.getAllByRole('checkbox').forEach(input => fireEvent.click(input)); fireEvent.click(screen.getByText('Analyze document type'));
  const denied = onSnapshot.mock.calls[0][2]; act(() => denied());
  await act(async () => resolve({ color: 'red', reason: 'Stale result.', evidence: 'Driving permit' }));
  expect(screen.queryByText('Stale result.')).toBeNull(); expect(screen.getByText(/Reload the document preview/)).toBeInTheDocument();
});
