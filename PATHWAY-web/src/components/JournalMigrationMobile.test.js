import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

// Render the actual mobile component with host-element shims, not a mock consent component.
const moduleSource = fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master/components/JournalAnalysisConsent.js'), 'utf8');
const compiled = babel.transformSync(moduleSource, { configFile: false, babelrc: false,
  presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
const box = ({ children }) => <div>{children}</div>;
const text = ({ children, accessibilityRole }) => <p role={accessibilityRole}>{children}</p>;
const button = ({ children, onPress, disabled }) => <button onClick={onPress} disabled={disabled}>{children}</button>;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', compiled)(name => ({ react: React,
  'react-native': { View: box, TouchableOpacity: button, StyleSheet: { create: value => value } },
  './AppText': { AppText: text }, '../theme': { COLORS: {}, RADIUS: {} },
}[name]), loaded, loaded.exports);
const JournalAnalysisConsent = loaded.exports.default;

test('consent loads off with no automatic grant and explicit choice sends versioned consent', async () => {
  const client = { readConsent: jest.fn().mockResolvedValue({ granted: false, revision: 0 }),
    saveConsent: jest.fn().mockResolvedValue({ granted: true, revision: 1 }) };
  render(<JournalAnalysisConsent client={client} />);
  await screen.findByText('Your choice: analysis off.');
  expect(client.saveConsent).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Allow future analysis' }));
  await screen.findByText('Your choice: allowed for future submissions.');
  expect(client.saveConsent).toHaveBeenCalledWith({ granted: true, expectedRevision: 0, disclosureVersion: 'workplace-journal-consent-v2' });
  expect(screen.getByText(/Anthropic for token counting and workplace-concern analysis/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Withdraw consent' })).toBeInTheDocument();
});
test('consent load failure remains unknown and permits a refresh instead of an implicit choice', async () => {
  const client = { readConsent: jest.fn().mockRejectedValueOnce(Error('network')).mockResolvedValue({ granted: false, revision: 0 }), saveConsent: jest.fn() };
  render(<JournalAnalysisConsent client={client} />);
  await screen.findByText(/Consent status unavailable/);
  expect(screen.queryByRole('button', { name: 'Allow future analysis' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh consent status' }));
  await screen.findByText('Your choice: analysis off.'); expect(client.saveConsent).not.toHaveBeenCalled();
});
test('withdrawal failure and stale consent cannot silently overwrite another choice', async () => {
  const client = { readConsent: jest.fn().mockResolvedValue({ granted: true, revision: 2 }),
    saveConsent: jest.fn().mockRejectedValue(Object.assign(Error('Conflict'), { status: 409 })) };
  render(<JournalAnalysisConsent client={client} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Withdraw consent' }));
  await screen.findByText(/Your choice changed/);
  expect(screen.queryByRole('button', { name: 'Withdraw consent' })).toBeNull();
  expect(screen.getByText('Your current consent choice is not loaded.')).toBeInTheDocument();
});
test('uncertain withdrawal followed by failed refresh displays unknown rather than stale consent', async () => {
  const client = { readConsent: jest.fn().mockResolvedValueOnce({ granted: true, revision: 2 }).mockRejectedValue(Error('network')),
    saveConsent: jest.fn().mockRejectedValue(Error('response lost')) };
  render(<JournalAnalysisConsent client={client} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Withdraw consent' }));
  await screen.findByText(/Could not confirm the change/);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh consent status' }));
  await screen.findByText(/Consent status unavailable/);
  expect(screen.queryByText('Your choice: allowed for future submissions.')).toBeNull();
  expect(screen.getByText('Your current consent choice is not loaded.')).toBeInTheDocument();
});

function mobileScreenFixture(enabled, failSubmission = false) {
  const input = ({ value, onChangeText, placeholder, multiline }) => multiline
    ? <textarea value={value} placeholder={placeholder} onChange={e => onChangeText(e.target.value)} />
    : <input value={value} placeholder={placeholder} onChange={e => onChangeText(e.target.value)} />;
  const press = ({ children, onPress, disabled, accessibilityLabel }) => <button aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>{children}</button>;
  const native = { View: box, TouchableOpacity: press, KeyboardAvoidingView: box, StatusBar: () => null, ActivityIndicator: () => null, Platform: { OS: 'android' }, StyleSheet: { create: x => x } };
  let serial = 0;
  const firestore = { collection: () => ({}), doc: () => ({ id: `opaque-${++serial}` }), query: () => ({}), orderBy: () => ({}), where: () => ({}), sum: () => ({}),
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }), getAggregateFromServer: async () => ({ data: () => ({ hours: 0 }) }), addDoc: jest.fn().mockResolvedValue({ id: 'legacy' }) };
  const post = jest.fn(async route => {
    if (route.endsWith('/read')) return { granted: false, revision: 0 };
    if (failSubmission) throw Error('Synthetic network failure');
    return { entryId: 'saved', revision: 1, analysisStatus: 'not-enabled' };
  });
  const success = jest.fn(), alert = jest.fn();
  function pure(file, name) {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master/services', file), 'utf8').replace(/export /g, '');
    return new Function(`${source};return ${name}`)();
  }
  const modules = {
    react: React, 'react-native': native, 'firebase/firestore': firestore,
    '../components/BackdropModal': ({ visible, children }) => visible ? <div>{children}</div> : null,
    '../services/recordPagination': { readRecordPage: async () => ({ records: [], cursor: null, hasMore: false }), mergeRecords: (a, b) => [...a, ...b] },
    '../services/logbookLoadError': { logbookLoadErrorMessage: () => 'Unavailable' },
    '../services/journalWeekRange': { journalWeekRange: pure('journalWeekRange.js', 'journalWeekRange') },
    '../components/LoadMore': () => null, '../services/studentSuccess': { showStudentSuccess: success },
    '../firebaseConfig': { auth: { currentUser: { uid: 'synthetic-student' } }, db: {} },
    '../services/backendApi': { postBackend: post },
    '../services/journalSubmission': { createJournalMigrationClient: pure('journalSubmission.js', 'createJournalMigrationClient'), journalRevisionExpectation: pure('journalSubmission.js', 'journalRevisionExpectation') },
    '../components/JournalAnalysisConsent': JournalAnalysisConsent,
    '../services/usePlacementEligibility': { __esModule: true, default: () => ({ eligible: true }), PLACEMENT_REQUIRED: 'Placement required' },
    '../services/studentAlert': { studentAlert: { alert } }, '../theme': { COLORS: {}, SHADOWS: {}, RADIUS: {} },
    '../components/Motion': { MotionTouchableOpacity: press }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../components/AppText': { AppText: text, AppTextInput: input }, '../components/StudentScreenSkeleton': () => null,
    '../components/RefreshableScrollView': box, '../components/Icons': new Proxy({}, { get: () => () => null }),
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master/screens/LogbookScreen.js'), 'utf8');
  const code = babel.transformSync(source, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', 'process', code)(name => {
    if (!(name in modules)) throw Error(`Unexpected screen dependency: ${name}`);
    return modules[name];
  }, mod, mod.exports, { env: { EXPO_PUBLIC_JOURNAL_BACKEND_SUBMISSION: enabled ? '1' : undefined } });
  return { Component: mod.exports.default, post, firestore, success, alert };
}
test.each([false, true])('actual LogbookScreen uses exactly the selected submission path (backend=%s)', async enabled => {
  const f = mobileScreenFixture(enabled);
  render(<f.Component navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Add new log entry' }));
  fireEvent.change(screen.getByPlaceholderText('e.g. 40'), { target: { value: '32' } });
  fireEvent.change(screen.getByPlaceholderText(/Describe what you accomplished/), { target: { value: 'Synthetic original activities' } });
  fireEvent.click(screen.getByText('Submit Log'));
  await screen.findByRole('button', { name: 'Add new log entry' });
  // Flush async submission through the visible modal closing rather than asserting a helper mock exists.
  await require('@testing-library/react').waitFor(() => expect(screen.queryByText('New Weekly Entry')).toBeNull());
  expect(f.firestore.addDoc).toHaveBeenCalledTimes(enabled ? 0 : 1);
  expect(f.post.mock.calls.filter(([route]) => route === '/student/journals')).toHaveLength(enabled ? 1 : 0);
  if (!enabled) expect(f.post).not.toHaveBeenCalled();
});
