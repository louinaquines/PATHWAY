import { fireEvent, render, screen } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import ClassListTab from './ClassListTab';
jest.mock('../firebase', () => ({ db: {} }));
jest.mock('../adminApi', () => ({ adminRequest: jest.fn() }));
jest.mock('firebase/firestore', () => ({ collection: jest.fn((db, name) => ({ name })), where: jest.fn((field, op, value) => ({ field, value })), query: jest.fn((collection, ...filters) => ({ ...collection, filters })), getDocs: jest.fn() }));
test('roster keeps a section selector, import tools and searchable students together', async () => {
  getDocs.mockImplementation(async q => ({ docs: q.name === 'sections' ? ['A','B'].map(id => ({ id, data: () => ({ name: `Section ${id}` }) })) : [{ id: q.filters.find(f => f.field === 'sectionId').value === 'A' ? '1001' : '2002', data: () => ({ username: 'sample' }) }] }));
  render(<ClassListTab department="IT" coordinatorId="coord" selectedSection={{ id: 'A', name: 'Section A' }} />);
  expect(await screen.findByText('1001')).toBeInTheDocument();
  expect(screen.getByText('Import class list')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Assigned section' }), { target: { value: 'B' } });
  expect(await screen.findByText('2002')).toBeInTheDocument();
  expect(screen.queryByText('1001')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
  expect(screen.getByText('No matching students.')).toBeInTheDocument();
});
