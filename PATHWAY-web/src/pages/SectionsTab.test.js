import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import SectionsTab from './SectionsTab';
import { adminRequest } from '../adminApi';

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
  fireEvent.click(await screen.findByRole('button', { name: /^Section A/ }));
  expect(await screen.findByText('Taylor Student')).toBeInTheDocument();
});

test('a legacy placeholder is hidden and the coordinator can replace it with a Messenger invite', async () => {
  const messengerLink = 'https://m.me/j/example-invite/';
  adminRequest.mockResolvedValueOnce({ messengerLink });
  render(<SectionsTab coordinatorId="coord-a" selectedSection={{ ...section, messengerLink: 'N/a' }} />);
  const input = await screen.findByLabelText('Group chat link');
  expect(screen.queryByRole('link', { name: 'Open Group Chat' })).toBeNull();
  fireEvent.change(input, { target: { value: messengerLink } });
  fireEvent.click(screen.getByRole('button', { name: 'Save group chat link' }));
  expect(await screen.findByRole('link', { name: 'Open Group Chat' })).toHaveAttribute('href', messengerLink);
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/sections/section-a/group-chat', {
    method: 'PATCH', body: JSON.stringify({ messengerLink }),
  });
});

test('year and section choices update the name and use the assigned department', async () => {
  adminRequest.mockResolvedValue({});
  render(<SectionsTab coordinatorId="coord-a" department="Computer Studies" selectedSection={section} />);
  fireEvent.click(await screen.findByRole('button', { name: /New Section/ }));
  const name = screen.getByLabelText('Section name');
  fireEvent.change(name, { target: { value: 'BSIT' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Year level' }), { target: { value: '4' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Section letter' }), { target: { value: 'A' } });
  expect(name).toHaveValue('BSIT - 4A');
  fireEvent.change(screen.getByRole('combobox', { name: 'Section letter' }), { target: { value: 'B' } });
  expect(name).toHaveValue('BSIT - 4B');
  expect(screen.queryByText('Department / College')).not.toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('e.g. 486'), { target: { value: '480' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create Section' }));
  await waitFor(() => expect(screen.queryByText('Create New Section')).not.toBeInTheDocument());
  expect(adminRequest).toHaveBeenCalledWith('/coordinator/sections', { method: 'POST', body: JSON.stringify({ name: 'BSIT - 4B', department: 'Computer Studies', hoursRequired: 480, messengerLink: '' }) });
});
