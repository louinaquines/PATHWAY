import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CoordinatorDashboard from './CoordinatorDashboard';
import { auth } from '../firebase';
import { adminRequest } from '../adminApi';
import { getDocs, getDoc, doc, onSnapshot } from 'firebase/firestore';
jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { uid: 'coordinator' } } }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn(), onAuthStateChanged: jest.fn(() => () => {}) }));
jest.mock('firebase/firestore', () => ({ getDocs: jest.fn(), getDocsFromServer: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), collection: jest.fn(), query: jest.fn(), where: jest.fn(), updateDoc: jest.fn(), onSnapshot: jest.fn(() => () => {}) }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn(), adminDownload: jest.fn() }));
jest.mock('../components/PdfPreview', () => ({ __esModule: true, default: () => null }));
const keys = ['REACT_APP_WORKPLACE_REVIEW_LOCAL','REACT_APP_LOCAL_EMULATOR','REACT_APP_FIREBASE_PROJECT_ID','REACT_APP_BACKEND_URL'];
const original = Object.fromEntries(keys.map(k => [k,process.env[k]]));
let watchers;
beforeEach(() => {
  jest.clearAllMocks(); window.localStorage.clear(); auth.currentUser = { uid: 'coordinator' };
  Object.assign(process.env,{ REACT_APP_WORKPLACE_REVIEW_LOCAL: '1',REACT_APP_LOCAL_EMULATOR: '1',REACT_APP_FIREBASE_PROJECT_ID: 'demo-pathway-security',REACT_APP_BACKEND_URL: 'http://127.0.0.1:3100' });
  getDocs.mockResolvedValue({ docs: [] }); getDoc.mockResolvedValue({ data: () => ({ role: 'coordinator',accountApproved: true,department: 'IT' }) });
  watchers = []; doc.mockImplementation((_db,col,id) => ({ col,id }));
  onSnapshot.mockImplementation((ref,optionsOrNext,nextOrError,error) => {
    watchers.push({ ref,next: typeof optionsOrNext === 'function' ? optionsOrNext : nextOrError,error: typeof optionsOrNext === 'function' ? nextOrError : error });
    return () => {};
  });
  adminRequest.mockImplementation(async path => {
    if (path.endsWith('/list')) return { records: [],hasMore: false,cursor: null };
    throw Error('Unexpected request');
  });
});
afterEach(() => { window.localStorage.clear(); for (const k of keys) { if (original[k] === undefined) delete process.env[k]; else process.env[k] = original[k]; } });
test('local dashboard navigation mounts the real private review through authenticated POST APIs', async () => {
  render(<MemoryRouter><CoordinatorDashboard /></MemoryRouter>);
  const nav = screen.getByRole('navigation',{ name: 'Coordinator navigation' });
  fireEvent.click(await within(nav).findByRole('button',{ name: 'Workplace concerns' }));
  const panel = await screen.findByRole('region',{ name: 'Workplace concern review' });
  expect(await within(panel).findByText(/No concern cases loaded/)).toBeInTheDocument();
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/workplace-concerns/list',expect.objectContaining({ method: 'POST' }));
  expect(within(panel).getByText(/No automatic analysis/)).toBeInTheDocument();
});
test.each([
  ['REACT_APP_WORKPLACE_REVIEW_LOCAL','0'],['REACT_APP_LOCAL_EMULATOR','0'],
  ['REACT_APP_FIREBASE_PROJECT_ID','pathway-57400'],['REACT_APP_BACKEND_URL','https://example.invalid'],
])('disabled local guard hides navigation and discards a saved concerns tab (%s)', async (key,value) => {
  process.env[key] = value; window.localStorage.setItem('pathway.coordinator.activeTab','concerns');
  render(<MemoryRouter><CoordinatorDashboard /></MemoryRouter>);
  await screen.findByRole('heading',{ name: 'Requirements Approval' });
  expect(screen.queryByRole('button',{ name: 'Workplace concerns' })).toBeNull();
  expect(adminRequest.mock.calls.some(([path]) => path.includes('workplace-concerns'))).toBe(false);
});
test('denied concern access removes the private component with a concern-specific message', async () => {
  adminRequest.mockRejectedValue(Object.assign(Error('Denied'),{ status: 403 }));
  window.localStorage.setItem('pathway.coordinator.activeTab','concerns');
  render(<MemoryRouter><CoordinatorDashboard /></MemoryRouter>);
  expect(await screen.findByText(/Workplace concern access changed/)).toBeInTheDocument();
  expect(screen.queryByRole('region',{ name: 'Workplace concern review' })).toBeNull();
});
test('student reassignment clears already displayed private evidence without waiting for another action', async () => {
  const row = { id: 'case-one',studentId: 'synthetic-student',title: 'Potential concern',state: 'open',priority: 'high',version: 1 };
  let finish;
  adminRequest.mockImplementation(async path => path.endsWith('/notices/list') ? { records: [{ id: 'notice',title: 'Private synthetic notice',read: true }],hasMore: false } : path.endsWith('/list')
    ? { records: [row],hasMore: false } : path.endsWith('/action') ? new Promise(resolve => { finish = resolve; }) : { ...row,findings: [{ quote: 'PRIVATE synthetic evidence',reason: 'Review needed' }],history: [] });
  window.localStorage.setItem('pathway.coordinator.activeTab','concerns');
  render(<MemoryRouter><CoordinatorDashboard /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{ name: 'Open concern details' }));
  await screen.findByText('PRIVATE synthetic evidence');
  fireEvent.change(screen.getByLabelText('Review note or reason'),{ target: { value: 'PRIVATE draft' } });
  fireEvent.click(screen.getByRole('button',{ name: 'Record review' }));
  const emit = sectionId => watchers.filter(w => w.ref?.col === 'users' && w.ref.id === 'synthetic-student')
    .forEach(w => w.next({ data: () => ({ role: 'student',sectionId }),metadata: { fromCache: false } }));
  act(() => { emit('old-section'); emit('new-section'); });
  expect(screen.queryByText('PRIVATE synthetic evidence')).toBeNull();
  expect(screen.queryByLabelText('Review note or reason')).toBeNull();
  expect(screen.queryByText(/Private synthetic notice/)).toBeNull();
  expect(screen.getByText(/Workplace concern access changed/)).toBeInTheDocument();
  await act(async () => { finish({ id: 'case-one',version: 2 }); });
  expect(screen.queryByRole('region',{ name: 'Workplace concern review' })).toBeNull();
});
