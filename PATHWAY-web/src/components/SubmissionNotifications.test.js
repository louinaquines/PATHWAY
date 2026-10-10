import { fireEvent, render, screen } from '@testing-library/react';
import SubmissionNotifications, { receivedRequirements } from './SubmissionNotifications';
import { onSnapshot } from 'firebase/firestore';
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn(), query: jest.fn(), where: jest.fn(), onSnapshot: jest.fn() }));
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
test('only received requirements are included and replacements have new identities', () => {
  const student = { id: 's', requirements: { a: { submittedAt: '2026-10-10', status: 'submitted', fileName: 'new.pdf' }, b: { status: 'not_submitted' } } };
  expect(receivedRequirements(student)).toHaveLength(1);
  expect(receivedRequirements(student)[0].title).toBe('new.pdf');
  expect(receivedRequirements(student)[0].id).not.toBe(receivedRequirements({ ...student, requirements: { a: { ...student.requirements.a, submittedAt: '2026-10-11' } } })[0].id);
});
test('overlay opens submission, acknowledges locally without approving, and closes', () => {
  onSnapshot.mockImplementation((_, success) => { success({ docs: [{ id: 's', data: () => ({ firstName: 'Dexter', requirements: { a: { submittedAt: '2026-10-10', status: 'submitted', fileName: 'replacement.pdf' } } }) }] }); return jest.fn(); });
  const onOpen = jest.fn();
  render(<SubmissionNotifications kind="requirements" coordinatorId="c" section={{ id: 'g', name: 'BSIT 4G', coordinatorId: 'c' }} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: /Requirement notifications/ }));
  expect(screen.getByRole('dialog', { name: 'Requirement notifications' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /replacement.pdf/ }));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 's' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('pathway.received.c.g.requirements'))).toHaveLength(1);
});
test('does not subscribe to another coordinator section', () => {
  render(<SubmissionNotifications kind="logbook" coordinatorId="c" section={{ id: 'other', coordinatorId: 'someone-else' }} onOpen={jest.fn()} />);
  expect(onSnapshot).not.toHaveBeenCalled();
});
test('logbook notifications show journals only and open the student records', () => {
  onSnapshot.mockImplementationOnce((_, success) => {
    success({ docs: [{ id: 's', data: () => ({ firstName: 'Janeil' }) }] }); return jest.fn();
  }).mockImplementationOnce((_, success) => {
    success({ docs: [{ id: 'week6', data: () => ({ status: 'pending', weekNum: 6, createdAt: '2026-10-11' }) }, { id: 'draft', data: () => ({ status: 'draft', weekNum: 7 }) }] }); return jest.fn();
  });
  const onOpen = jest.fn();
  render(<SubmissionNotifications kind="logbook" coordinatorId="c" section={{ id: 'g', name: 'BSIT 4G', coordinatorId: 'c' }} onOpen={onOpen} />);
  fireEvent.click(screen.getByRole('button', { name: /Logbook notifications/ }));
  expect(screen.queryByText('Week 7 journal')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Week 6 journal/ }));
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 's' }));
});
