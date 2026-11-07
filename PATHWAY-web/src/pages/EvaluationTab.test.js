import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { getDocs } from 'firebase/firestore';
import EvaluationTab from './EvaluationTab';

jest.mock('../firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: jest.fn().mockResolvedValue('test-token') } } }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((db, name) => name), where: jest.fn(),
  query: jest.fn(path => path), getDocs: jest.fn(),
}));
jest.mock('./EvaluationBuilderDialog', () => () => null);
const section = { id: 'section', name: 'Section A' };
const roster = [
  { id: 'amy', firstName: 'Amy', companyId: 'host', company: 'Host Company', placementStatus: 'approved', supervisorName: 'Supervisor', supervisorEmail: 'supervisor@example.test' },
  { id: 'ben', firstName: 'Ben', companyId: 'host', company: 'Host Company', placementStatus: 'approved', supervisorName: 'Supervisor', supervisorEmail: 'supervisor@example.test' },
  { id: 'other', firstName: 'Other', companyId: 'elsewhere', company: 'Elsewhere', placementStatus: 'approved' },
  { id: 'waiting', firstName: 'Waiting', company: 'Host Company', placementStatus: 'pending_review' },
];
const snapshot = records => ({ docs: records.map(record => ({ id: record.id, data: () => record })) });
beforeEach(() => {
  getDocs.mockImplementation(path => Promise.resolve(snapshot(path === 'sections' ? [section] : roster)));
  global.fetch = jest.fn().mockImplementation((url, options) => {
    if (url.endsWith('/coordinator-evaluations')) return Promise.resolve({ ok: true, json: async () => ({ evaluations: [] }) });
    const studentId = JSON.parse(options.body).studentId;
    return Promise.resolve({ ok: true, json: async () => ({ id: studentId, token: studentId + '-token' }) });
  });
});
test('select all only prepares invitations for students assigned to the chosen company', async () => {
  render(<EvaluationTab coordinatorId="coordinator" selectedSection={section} sections={[section]} />);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Company' }), { target: { value: 'id:host' } });
  fireEvent.click(screen.getByRole('button', { name: 'Students' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  expect(screen.getByRole('textbox', { name: 'Supervisor email address' })).toHaveValue('supervisor@example.test');
  fireEvent.submit(screen.getByRole('button', { name: 'Prepare invitations' }).closest('form'));
  await waitFor(() => expect(screen.getAllByRole('button', { name: /^(Amy|Ben)$/ })).toHaveLength(2));
  const requests = fetch.mock.calls.filter(([url]) => url.endsWith('/create-evaluation-token'));
  expect(requests.map(([, options]) => JSON.parse(options.body).studentId)).toEqual(['amy', 'ben']);
  expect(fetch.mock.calls.some(([url]) => url.endsWith('/email'))).toBe(false);
});

test('changing company clears the previous students and supervisor', async () => {
  render(<EvaluationTab coordinatorId="coordinator" selectedSection={section} sections={[section]} />);
  const company = await screen.findByRole('combobox', { name: 'Company' });
  fireEvent.change(company, { target: { value: 'id:host' } });
  fireEvent.click(screen.getByRole('button', { name: 'Students' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  fireEvent.change(company, { target: { value: 'id:elsewhere' } });
  expect(screen.getByRole('textbox', { name: 'Supervisor email address' })).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Prepare invitations' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Students' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});

test('a preparation failure retains the completed invitations so retry only prepares the remaining student', async () => {
  let benAttempts = 0;
  fetch.mockImplementation((url, options) => {
    if (url.endsWith('/coordinator-evaluations')) return Promise.resolve({ ok: true, json: async () => ({ evaluations: [] }) });
    const id = JSON.parse(options.body).studentId;
    if (id === 'ben' && benAttempts++ === 0) return Promise.resolve({ ok: false, json: async () => ({ error: 'Temporary failure' }) });
    return Promise.resolve({ ok: true, json: async () => ({ id, token: id + '-token' }) });
  });
  render(<EvaluationTab coordinatorId="coordinator" selectedSection={section} sections={[section]} />);
  fireEvent.change(await screen.findByRole('combobox', { name: 'Company' }), { target: { value: 'id:host' } });
  fireEvent.click(screen.getByRole('button', { name: 'Students' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
  const submit = screen.getByRole('button', { name: 'Prepare invitations' });
  fireEvent.submit(submit.closest('form'));
  await screen.findByText('Temporary failure');
  fireEvent.submit(submit.closest('form'));
  await screen.findByRole('button', { name: 'Ben' });
  const requests = fetch.mock.calls.filter(([url]) => url.endsWith('/create-evaluation-token'));
  expect(requests.map(([, options]) => JSON.parse(options.body).studentId)).toEqual(['amy', 'ben', 'ben']);
});

test('evaluation-history failure does not hide the assigned-company roster', async () => {
  fetch.mockImplementation((url) => {
    if (url.endsWith('/coordinator-evaluations')) return Promise.resolve({ ok: false, status: 503,
      json: async () => ({ error: 'The server could not verify access. Please try again shortly.' }) });
    throw new Error('Unexpected request');
  });
  render(<EvaluationTab coordinatorId="coordinator" selectedSection={section} sections={[section]} />);
  const company = await screen.findByRole('combobox', { name: 'Company' });
  expect(screen.getByRole('option', { name: 'Host Company' })).toBeInTheDocument();
  fireEvent.change(company, { target: { value: 'id:host' } });
  fireEvent.click(screen.getByRole('button', { name: 'Students' }));
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  expect(await screen.findByText('The server could not verify access. Please try again shortly.')).toBeVisible();
});
