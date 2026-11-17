import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');

function fixture(signIn, profile = async () => ({ profile: { role: 'student' } })) {
  const box = ({ children, accessibilityRole }) => <div role={accessibilityRole}>{children}</div>;
  const text = ({ children, accessibilityRole }) => <p role={accessibilityRole}>{children}</p>;
  const button = ({ children, onPress, disabled, accessibilityLabel }) => <button aria-label={accessibilityLabel} onClick={onPress} disabled={disabled}>{children}</button>;
  const input = React.forwardRef(({ value, onChangeText, accessibilityLabel, editable }, ref) => <input ref={ref} aria-label={accessibilityLabel} value={value} disabled={editable === false} onChange={e => onChangeText(e.target.value)} />);
  const reset = jest.fn();
  const signOut = jest.fn();
  const source = fs.readFileSync(path.resolve(__dirname, '../../../PATHWAY-master/screens/LoginScreen.js'), 'utf8');
  const compiled = babel.transformSync(source, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const modules = {
    react: React,
    'react-native': { View: box, TouchableOpacity: button, StyleSheet: { create: x => x }, ActivityIndicator: () => <span>Signing in</span>, KeyboardAvoidingView: box, Platform: { OS: 'web' }, StatusBar: () => null, ScrollView: box, useWindowDimensions: () => ({ width: 440, height: 956 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'firebase/auth': { signInWithEmailAndPassword: signIn }, '../firebaseConfig': { auth: { signOut } },
    '../services/authDestination': { destinationForProfile: p => p.role === 'student' ? 'StudentDashboard' : null },
    '../services/backendApi': { postBackend: profile }, '../theme': { COLORS: {}, SHADOWS: {}, RADIUS: {} },
    '../components/Motion': { MotionTouchableOpacity: button }, '../components/AuthHero': { __esModule: true, default: () => null, AuthPanel: box },
    '../components/DashboardLoading': { __esModule: true, default: () => <p>Opening your dashboard</p> },
    '../components/AppText': { AppText: text, AppTextInput: input },
    '../components/Icons': new Proxy({}, { get: () => () => null }),
  };
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => { if (!modules[name]) throw Error(`Missing fixture ${name}`); return modules[name]; }, loaded, loaded.exports);
  render(React.createElement(loaded.exports.default, { navigation: { reset, navigate: jest.fn() } }));
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'synthetic@pathway.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  return { reset, signOut };
}

test('pending and invalid credentials stay on Login without dashboard animation', async () => {
  let reject;
  const { reset } = fixture(() => new Promise((_, no) => { reject = no; }));
  expect(screen.queryByText('Opening your dashboard')).toBeNull();
  expect(screen.getByLabelText('Username')).toBeDisabled();
  await act(async () => reject(Object.assign(Error('invalid'), { code: 'auth/invalid-credential' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Username or password is incorrect.');
  expect(screen.queryByText('Opening your dashboard')).toBeNull();
  expect(reset).not.toHaveBeenCalled();
});

test('profile failure does not show dashboard animation', async () => {
  const { reset } = fixture(async () => {}, async () => { throw Error('offline'); });
  await screen.findByRole('alert');
  expect(screen.queryByText('Opening your dashboard')).toBeNull();
  expect(reset).not.toHaveBeenCalled();
});

test('confirmed credentials and profile show animation before dashboard navigation', async () => {
  jest.useFakeTimers();
  try {
    const { reset } = fixture(async () => {});
    await act(async () => {});
    expect(screen.getByText('Opening your dashboard')).toBeInTheDocument();
    expect(reset).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(1500));
    expect(reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'StudentDashboard' }] });
  } finally { jest.useRealTimers(); }
});
