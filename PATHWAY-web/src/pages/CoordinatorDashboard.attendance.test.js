import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CoordinatorDashboard from './CoordinatorDashboard';
import { adminRequest } from '../adminApi';
import { getDocs, getDocsFromServer, getDoc } from 'firebase/firestore';
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'coordinator' } } }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn(), onAuthStateChanged: jest.fn(() => () => {}) }));
jest.mock('firebase/firestore', () => ({ getDocs: jest.fn(), getDocsFromServer: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), collection: jest.fn(), query: jest.fn(), where: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn(), adminDownload: jest.fn() }));
jest.mock('../components/PdfPreview', () => ({ __esModule: true, default: () => null }));

test('a notice opens a freshly assigned section absent from the initial dashboard list', async () => {
  window.localStorage.setItem('pathway.coordinator.activeTab', 'notifications');
  getDocs.mockResolvedValue({ docs: [] });
  getDoc.mockResolvedValue({ data: () => ({ role: 'coordinator', department: 'IT' }) });
  getDocsFromServer.mockResolvedValue({ docs: [{ id: 'new-section', data: () => ({ name: 'New section', department: 'IT', coordinatorId: 'coordinator' }) }] });
  adminRequest.mockImplementation(async path => path.endsWith('/analytics') ? {
    students: [{ id: 'student', name: 'Assigned student', riskTier: 'Medium', progressStatus: 'In progress', dataStatus: 'Ready' }],
  } : { records: [{ id: 'notice', title: 'Attendance risk update', studentId: 'student', sectionId: 'new-section', kind: 'assigned', riskTier: 'Medium', progressStatus: 'In progress', dataStatus: 'Ready', reasonCodes: [], read: false }], hasMore: false, cursor: null });
  const view = render(<MemoryRouter><CoordinatorDashboard /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'View attendance analytics' }));
  expect(await screen.findByText('Assigned student')).toBeInTheDocument();
  expect(screen.getByText('Assigned student').closest('tr')).toHaveAttribute('id', 'attendance-student-student');
  expect(screen.queryByText(/no longer in your assigned sections/)).not.toBeInTheDocument();
  view.unmount(); window.localStorage.clear();
});
