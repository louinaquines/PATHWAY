import { fireEvent, render, screen } from '@testing-library/react';
import PlacementCompanies, { groupPlacementCompanies } from './PlacementCompanies';

const companies = [
  { id: 'one', name: 'Northwind Labs', address: 'Main Road', industry: 'Technology', active: true, capacity: 5, occupiedSlots: 1, availableSlots: 4 },
  { id: 'two', name: 'Coastal Hotel', active: true },
];
const students = [
  { id: 's1', firstName: 'Taylor', lastName: 'Student', placementStatus: 'approved', companyId: 'one' },
  { id: 's2', firstName: 'Pending', lastName: 'Student', placementStatus: 'pending_review', companyId: 'two' },
];

test('groups only approved placements and preserves inactive assigned companies', () => {
  const result = groupPlacementCompanies(companies, [...students, { id: 's3', companyId: 'old', company: 'Legacy Company', placementStatus: 'approved' }]);
  expect(result.find(item => item.id === 'one').students).toHaveLength(1);
  expect(result.find(item => item.id === 'two').students).toHaveLength(0);
  expect(result.find(item => item.id === 'old').name).toBe('Legacy Company');
});

test('searches company and student names and switches grid/list display', () => {
  const { container } = render(<PlacementCompanies companies={companies} students={students} sectionName="Section A" />);
  expect(screen.getByText('Taylor Student')).toBeInTheDocument();
  expect(screen.queryByText('Pending Student')).not.toBeInTheDocument();
  const search = screen.getByRole('searchbox', { name: 'Search company or student name' });
  fireEvent.change(search, { target: { value: 'taylor' } });
  expect(screen.getByText('Northwind Labs')).toBeInTheDocument();
  expect(screen.queryByText('Coastal Hotel')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(container.querySelector('.placement-company-layout--list')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.change(search, { target: { value: 'coastal' } });
  expect(screen.getByText('Coastal Hotel')).toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'unknown' } });
  expect(screen.getByText('No matching companies or students')).toBeInTheDocument();
});
