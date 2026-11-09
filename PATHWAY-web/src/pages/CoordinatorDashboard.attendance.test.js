import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CoordinatorDashboard from './CoordinatorDashboard';
import { adminRequest } from '../adminApi';
import { getDocs, getDocsFromServer, getDoc, collection, query, where, limit } from 'firebase/firestore';
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'coordinator' } } }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn(), onAuthStateChanged: jest.fn(() => () => {}) }));
jest.mock('firebase/firestore', () => ({ getDocs: jest.fn(), getDocsFromServer: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), collection: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(), startAfter: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
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
  const view = render(<MemoryRouter initialEntries={['/coordinator/notifications']}><Routes><Route path="/coordinator/:page?" element={<CoordinatorDashboard />} /></Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'View attendance analytics' }));
  expect(await screen.findByText('Assigned student')).toBeInTheDocument();
  expect(screen.getByText('Assigned student').closest('tr')).toHaveAttribute('id', 'attendance-student-student');
  expect(screen.queryByText(/no longer in your assigned sections/)).not.toBeInTheDocument();
  view.unmount(); window.localStorage.clear();
});

test.each([
  ['overview', 'Dashboard'],
  ['requirements', 'Student Requirements'],
  ['logbook', 'Attendance & Journals'],
  ['evaluations', 'Supervisor Evaluations'],
  ['clearance', 'Student Clearance'],
  ['placements', 'Student Placements'],
  ['companies', 'Partner Companies'],
  ['sections', 'Sections & Students'],
  ['registrations', 'Student Accounts'],
  ['analytics', 'Internship Progress'],
  ['messages', 'Messages'],
  ['notifications', 'Announcements & Alerts'],
  ['classlist', 'Class List & Accounts'],
  ['profile', 'Coordinator Profile'],
])('the %s route shows a title without a subtitle', async (route, title) => {
  getDocs.mockResolvedValue({ docs: [] });
  getDoc.mockResolvedValue({ data: () => ({ role: 'coordinator', department: 'IT' }) });
  adminRequest.mockResolvedValue({ records: [], hasMore: false });
  const { container } = render(
    <MemoryRouter initialEntries={['/coordinator/' + route]}>
      <Routes><Route path="/coordinator/:page" element={<CoordinatorDashboard />} /></Routes>
    </MemoryRouter>
  );
  const heading = await screen.findByRole('heading', { level: 1, name: title });
  expect(heading.closest('header').querySelector('p')).toBeNull();
  expect(container.querySelector('.requirements-header-description')).toBeNull();
  expect(document.title).toBe('PATHWAY · ' + title);
});

test.each([1000, 10000])('Requirements finds and approves a student in a section of %i without loading the roster', async size => {
  const section = { id: 'section', name: 'QA Section', department: 'IT' };
  const lastId = String(26000000 + size - 1);
  const roster = Array.from({ length: size }, (_, index) => ({
    id: 'student-' + index,
    firstName: index === 0 ? 'First' : index === size - 1 ? 'Last' : 'Student ' + index,
    lastName: 'Student',
    idNumber: String(26000000 + index),
    requirements: { form: { status: 'submitted' } },
  }));
  adminRequest.mockResolvedValue({});
  collection.mockImplementation((_db, ...path) => path.join('/'));
  query.mockImplementation((base, ...constraints) => ({
    path: base.path || base, constraints: [...(base.constraints || []), ...constraints.filter(Boolean)],
  }));
  where.mockImplementation((field, operator, value) => ({ field, operator, value }));
  limit.mockImplementation(size => ({ size }));
  getDoc.mockResolvedValue({ data: () => ({ role: 'coordinator', department: 'IT' }) });
  getDocs.mockImplementation(async request => {
    if (request === 'sections/section/requirements') return { docs: [{ id: 'form', data: () => ({ label: 'Application form', category: 'Pre-OJT' }) }] };
    if (request.path === 'sections') return { docs: [{ id: section.id, data: () => section }] };
    if (request.path !== 'users' || !request.constraints.some(item => item.value === section.id)) return { docs: [] };
    const maximum = request.constraints.find(item => item.size)?.size;
    if (!maximum) throw new Error('An unbounded roster query was issued.');
    const exact = request.constraints.find(item => item.field === 'idNumber');
    const results = exact ? roster.filter(student => student.idNumber === exact.value) : roster;
    return { docs: results.slice(0, maximum).map(student => ({ id: student.id, data: () => student })) };
  });
  render(<MemoryRouter initialEntries={['/coordinator/requirements']}>
    <Routes><Route path="/coordinator/:page" element={<CoordinatorDashboard />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByText('First Student')).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search students' }), { target: { value: lastId } });
  expect(await screen.findByText('Last Student')).toBeVisible();
  expect(screen.queryByText('First Student')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Last Student/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  await screen.findByText('Approved', { selector: '.requirements-document-status' });
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/students/student-' + (size - 1) + '/requirements/form/decision',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ status: 'approved', reason: '' }) }));
  expect(screen.getByRole('searchbox', { name: 'Search students' })).toHaveValue(lastId);
  expect(screen.getByRole('button', { name: /Last Student/ })).toBeVisible();
  const rosterRequests = getDocs.mock.calls.map(([request]) => request)
    .filter(request => request?.path === 'users' && request.constraints.some(item => item.value === section.id));
  expect(rosterRequests.length).toBeGreaterThan(0);
  expect(rosterRequests.every(request => request.constraints.some(item => item.size === 26))).toBe(true);
});
