import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
const fs = require('node:fs'), path = require('node:path'), babel = require('@babel/core');
function compile(file, modules = {}) {
  const code = babel.transformSync(fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master', file), 'utf8'), { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => { if (!modules[name]) throw Error(`Missing module ${name}`); return modules[name]; }, loaded, loaded.exports);
  return loaded.exports;
}
function fixture() {
  let settings = { department: 'IT', frequency: 'daily', revision: 1, periodStart: '2026-10-22', periodEnd: '2026-10-22' };
  const box = ({ children }) => <div>{children}</div>;
  const button = ({ children, onPress, disabled, accessibilityLabel }) => <button aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>{children}</button>;
  const input = ({ value, onChangeText, placeholder, multiline }) => React.createElement(multiline ? 'textarea' : 'input', { value, placeholder, onChange: e => onChangeText(e.target.value) });
  const alert = jest.fn(), submit = jest.fn(async () => ({ entryId: 'saved', revision: 1, analysisStatus: 'not-enabled' }));
  const modules = {
    react: React,
    'react-native': { View: box, TouchableOpacity: button, StyleSheet: { create: x => x }, ActivityIndicator: () => <span>Loading</span>, KeyboardAvoidingView: box, Platform: { OS: 'web' }, StatusBar: () => null, AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'firebase/firestore': { collection: jest.fn(), doc: () => ({ id: 'request-one' }), query: jest.fn(), orderBy: jest.fn(), where: jest.fn(), sum: jest.fn(), getCountFromServer: async () => ({ data: () => ({ count: 0 }) }), getAggregateFromServer: async () => ({ data: () => ({ hours: 0 }) }) },
    '../firebaseConfig': { auth: { currentUser: { uid: 'synthetic' } }, db: {} },
    '../services/backendApi': { requestBackend: async () => ({ ...settings }), postBackend: submit },
    '../services/recordPagination': { readRecordPage: async () => ({ records: [], hasMore: false }), mergeRecords: (a, b) => [...a, ...b] },
    '../services/logbookLoadError': { logbookLoadErrorMessage: e => e.message },
    '../services/journalPresentation': compile('services/journalPresentation.js'),
    '../services/journalSubmission': compile('services/journalSubmission.js'),
    '../services/studentSuccess': { showStudentSuccess: jest.fn() },
    '../services/studentAlert': { studentAlert: { alert } },
    '../services/usePlacementEligibility': { __esModule: true, default: () => ({ eligible: true }) },
    '../theme': { COLORS: {}, SHADOWS: {}, RADIUS: {} },
    '../components/AppText': { AppText: box, AppTextInput: input },
    '../components/Motion': { MotionTouchableOpacity: button },
    '../components/Icons': new Proxy({}, { get: () => () => null }),
    '../components/BackdropModal': { __esModule: true, default: ({ visible, children }) => visible ? <div role="dialog">{children}</div> : null },
    '../components/RefreshableScrollView': { __esModule: true, default: box },
  };
  for (const name of ['LoadMore', 'JournalAnalysisConsent', 'StudentScreenSkeleton', 'StudentSurface', 'JournalHeaderArtwork']) modules[`../components/${name}`] = { __esModule: true, default: () => null };
  const Component = compile('screens/LogbookScreen.js', modules).default;
  render(<Component navigation={{ goBack() {}, navigate() {} }} />);
  return { alert, submit, change: next => { settings = next; } };
}
test('daily student form and submission use current department policy without direct writes', async () => {
  const f = fixture();
  fireEvent.click(await screen.findByRole('button', { name: 'New daily entry' }));
  await screen.findByText('New Daily Entry');
  expect(screen.getByText('Hours Rendered That Day')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('e.g. 8'), { target: { value: '8' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe what you accomplished today/), { target: { value: 'Daily notes preserved.' } });
  fireEvent.click(screen.getByText('Submit Log'));
  await waitFor(() => expect(f.submit).toHaveBeenCalledWith('/student/period-journals', expect.objectContaining({ frequency: 'daily', settingsRevision: 1, periodStart: '2026-10-22', rawNotes: 'Daily notes preserved.' })));
});
test('changed frequency preserves text and requires explicit draft confirmation before submission', async () => {
  const f = fixture();
  fireEvent.click(await screen.findByRole('button', { name: 'New daily entry' }));
  await screen.findByText('New Daily Entry');
  fireEvent.change(screen.getByPlaceholderText('e.g. 8'), { target: { value: '8' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe what you accomplished today/), { target: { value: 'Keep these notes.' } });
  f.change({ department: 'IT', frequency: 'weekly', revision: 2, periodStart: '2026-10-19', periodEnd: '2026-10-25' });
  fireEvent.click(screen.getByText('Submit Log'));
  await waitFor(() => expect(f.alert).toHaveBeenCalledWith('Review updated reporting period', expect.any(String), expect.any(Array)));
  expect(f.submit).not.toHaveBeenCalled();
  await act(async () => f.alert.mock.calls.at(-1)[2].find(item => item.text === 'Use updated period').onPress());
  expect(screen.getByDisplayValue('Keep these notes.')).toBeInTheDocument();
  expect(screen.getByText('New Weekly Entry')).toBeInTheDocument();
});
test('uncertain submissions retry the original identity before changed settings are considered', async () => {
  const f = fixture(); f.submit.mockRejectedValueOnce(Error('Response lost'));
  fireEvent.click(await screen.findByRole('button', { name: 'New daily entry' }));
  await screen.findByText('New Daily Entry');
  fireEvent.change(screen.getByPlaceholderText('e.g. 8'), { target: { value: '8' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe what you accomplished today/), { target: { value: 'Recover these notes.' } });
  fireEvent.click(screen.getByText('Submit Log'));
  await waitFor(() => expect(f.alert).toHaveBeenCalledWith('Could not submit', 'Response lost'));
  expect(screen.getByRole('button', { name: 'Request optional AI journal refinement' })).toBeDisabled();
  f.change({ department: 'IT', frequency: 'weekly', revision: 2, periodStart: '2026-10-19', periodEnd: '2026-10-25' });
  fireEvent.click(screen.getByText('Retry submission'));
  await waitFor(() => expect(f.submit).toHaveBeenCalledTimes(2));
  expect(f.submit.mock.calls[1]).toEqual(f.submit.mock.calls[0]);
});
