import { fireEvent, render, screen } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import SectionsTab from './SectionsTab';

jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, name) => ({ name })),
  where: jest.fn((field, op, value) => ({ field, value })),
  query: jest.fn((collection, ...filters) => ({ ...collection, filters })),
  getDocs: jest.fn(),
}));

const section = { id: 'section-a', name: 'Section A', department: 'Computer Studies', hoursRequired: 540 };
const students = [{ id: 'student-a', data: () => ({ firstName: 'Taylor', lastName: 'Student', idNumber: '123' }) }];

beforeEach(() => {
  jest.clearAllMocks();
  getDocs.mockImplementation(async q => {
    if (q.name === 'sections') return { docs: [{ id: section.id, data: () => section }] };
    if (q.filters.some(f => f.field === 'sectionId' && f.value === section.id)) {
      if (!q.filters.some(f => f.field === 'role' && f.value === 'student')
        || !q.filters.some(f => f.field === 'department' && f.value === section.department)) {
        throw new Error('Missing or insufficient permissions');
      }
      return { docs: students };
    }
    return { docs: [] };
  });
});

test('shared section loads enrolled students with rule-compatible query scope', async () => {
  render(<SectionsTab coordinatorId="coord-a" selectedSection={section} />);
  expect(await screen.findByText('Taylor Student')).toBeInTheDocument();
  expect(screen.queryByText('No enrolled students yet')).not.toBeInTheDocument();
});

test('selecting a section loads the same enrolled roster', async () => {
  render(<SectionsTab coordinatorId="coord-a" />);
  fireEvent.click(await screen.findByRole('button', { name: /Section A Computer Studies/ }));
  expect(await screen.findByText('Taylor Student')).toBeInTheDocument();
});
