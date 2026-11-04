import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PlacementPreferences from '../../PATHWAY-master/components/PlacementPreferences';

jest.mock('react-native', () => ({
  View: ({ children }) => <div>{children}</div>,
  TouchableOpacity: ({ children, onPress, disabled, accessibilityLabel, accessibilityState }) => <button aria-label={accessibilityLabel} aria-checked={accessibilityState?.checked} disabled={disabled} onClick={onPress}>{children}</button>,
  StyleSheet: { create: value => value },
}), { virtual: true });
jest.mock('../../PATHWAY-master/components/AppText', () => ({
  AppText: ({ children }) => <span>{children}</span>,
  AppTextInput: ({ value, onChangeText, editable, accessibilityLabel }) => <input aria-label={accessibilityLabel} value={value} disabled={!editable} onChange={event => onChangeText(event.target.value)} />,
}));
jest.mock('../../PATHWAY-master/theme', () => ({ COLORS: {}, SHADOWS: {} }));
jest.mock('../../PATHWAY-master/firebaseConfig', () => ({ auth: { currentUser: { uid: 'student', getIdToken: async () => 'token' } } }));
jest.mock('../../PATHWAY-master/services/backendApi', () => ({ BACKEND_URL: 'https://backend.test' }));

const data = { preferences: { companyIds: ['a'], location: 'Manila' }, companies: ['a', 'b', 'c', 'd'].map(id => ({ id, name: `Company ${id}`, location: 'Metro Manila' })), locked: false };
const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
beforeEach(() => { global.fetch = jest.fn().mockResolvedValue(response(data)); });
afterEach(() => { delete global.fetch; });
const open = async () => { const result = render(<PlacementPreferences studentId="student" />); await screen.findByLabelText('Preferred city or area (optional)'); return result; };

test('loads saved preferences with authenticated bodyless GET and never auto-saves', async () => {
  await open();
  expect(screen.getByLabelText('Preferred city or area (optional)')).toHaveValue('Manila');
  expect(screen.getByRole('button', { name: 'Company a' })).toHaveAttribute('aria-checked', 'true');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer token' } });
  expect(fetch.mock.calls[0][1]).not.toHaveProperty('body');
  expect(screen.getByText(/do not guarantee assignment/)).toBeInTheDocument();
});

test('caps selection at three, allows removal, and saves only the explicit payload once', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Company b' }));
  fireEvent.click(screen.getByRole('button', { name: 'Company c' }));
  expect(screen.getByRole('button', { name: 'Company d' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Company a' }));
  fireEvent.click(screen.getByRole('button', { name: 'Company d' }));
  fireEvent.change(screen.getByLabelText('Preferred city or area (optional)'), { target: { value: ' Quezon City ' } });
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByText('Save preferences'));
  fireEvent.click(screen.getByText('Saving...'));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[1][0]).toBe('https://backend.test/student/placement-preferences');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ companyIds: ['b', 'c', 'd'], location: 'Quezon City' }) });
  await act(async () => finish(response({})));
  expect(screen.getByText('Preferences saved.')).toBeInTheDocument();
});

test('empty preferences are optional and may be saved', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Company a' }));
  fireEvent.change(screen.getByLabelText('Preferred city or area (optional)'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Save preferences'));
  await screen.findByText('Preferences saved.');
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ companyIds: [], location: '' });
});

test('locked preferences remain visible with save and editing disabled', async () => {
  fetch.mockResolvedValue(response({ ...data, locked: true }));
  await open();
  expect(screen.getByText('Save preferences').closest('button')).toBeDisabled();
  expect(screen.getByLabelText('Preferred city or area (optional)')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Company a' })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('load failure offers manual retry without writing', async () => {
  fetch.mockRejectedValueOnce(new Error('Offline'));
  render(<PlacementPreferences studentId="student" />);
  await screen.findByText(/Offline/);
  expect(screen.queryByText('Save preferences')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Retry preferences'));
  await screen.findByLabelText('Preferred city or area (optional)');
  expect(fetch.mock.calls.map(call => call[1].method)).toEqual(['GET', 'GET']);
});

test('save failure preserves edits without automatic retries and respects a new server lock', async () => {
  await open();
  fetch.mockResolvedValueOnce(response({ error: 'Placement locked', locked: true }, false, 409));
  fireEvent.change(screen.getByLabelText('Preferred city or area (optional)'), { target: { value: 'Cebu' } });
  fireEvent.click(screen.getByText('Save preferences'));
  await screen.findByText(/Placement locked/);
  expect(screen.getByLabelText('Preferred city or area (optional)')).toHaveValue('Cebu');
  expect(screen.getByText('Save preferences').closest('button')).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test.each(['GET', 'PUT'])('unmount cancels pending %s and ignores late results', async method => {
  let finish;
  if (method === 'GET') fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<PlacementPreferences studentId="student" />);
  if (method === 'PUT') {
    await screen.findByText('Save preferences');
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByText('Save preferences'));
  }
  await waitFor(() => expect(finish).toEqual(expect.any(Function)));
  const signal = fetch.mock.calls.at(-1)[1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(response(data)));
  expect(screen.queryByText('Preferences saved.')).not.toBeInTheDocument();
});
