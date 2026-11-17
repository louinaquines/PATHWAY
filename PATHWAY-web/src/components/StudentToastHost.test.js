import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
const babel = require('@babel/core');
const path = require('node:path');

function fixture() {
  const auth = { currentUser: { uid: 'student' } };
  let authChanged, profileChanged, preferenceChanged, appChanged;
  const feeds = [];
  const modules = {
    react: React,
    'react-native': { AppState: { currentState: 'active', addEventListener: (_, fn) => { appChanged = fn; return { remove: jest.fn() }; } }, StyleSheet: { create: x => x }, View: ({ children }) => <div>{children}</div> },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, left: 0, right: 0 }) },
    'firebase/auth': { onAuthStateChanged: (_, fn) => { authChanged = fn; fn(auth.currentUser); return jest.fn(); } },
    'firebase/firestore': { doc: () => ({}), onSnapshot: (_, fn) => { profileChanged = fn; return jest.fn(); } },
    '../firebaseConfig': { auth, db: {} },
    '../services/studentPreferences': { getStudentNotificationsEnabled: async () => true, subscribeStudentNotificationPreference: (_, fn) => { preferenceChanged = fn; return jest.fn(); } },
    '../services/studentToasts': { subscribeStudentToasts: (uid, emit) => { const feed = { uid, emit, stop: jest.fn() }; feeds.push(feed); return feed.stop; } },
    './Motion': { MotionTouchableOpacity: ({ children, onPress, accessibilityLabel }) => <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button> },
    './AppText': { AppText: ({ children }) => <span>{children}</span> }, './StudentGuidePose': { __esModule: true, default: () => <span>Notification character</span> },
    './Icons': { CloseIcon: () => null }, '../theme': { COLORS: {} },
  };
  const compiled = babel.transformFileSync(path.resolve(__dirname, '../../../PATHWAY-master/components/StudentToastHost.js'), { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const loaded = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => { if (!modules[name]) throw Error(name); return modules[name]; }, loaded, loaded.exports);
  const mounted = render(React.createElement(loaded.exports.default, { enabled: true }));
  return { auth, feeds, mounted, profile: data => act(() => profileChanged({ data: () => data })), preference: value => act(() => preferenceChanged(value)), app: value => act(() => appChanged(value)), logout: () => act(() => { auth.currentUser = null; authChanged(null); }), emit: (title, feed = feeds.at(-1)) => act(() => feed.emit({ id: title, title, message: 'Coordinator update' })) };
}

test.each([false, true])('student toast works with accountApproved=%s and dismisses', async accountApproved => {
  const f = fixture();
  await act(async () => {});
  expect(f.feeds).toHaveLength(0);
  f.profile({ role: 'student', accountApproved });
  f.emit('New coordinator message');
  expect(screen.getByText('New coordinator message')).toBeInTheDocument();
  expect(screen.getByText('Notification character')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
  expect(screen.queryByText('New coordinator message')).toBeNull();
});

test('notification setting stops the feed, removes queued text, and rejects late callbacks', async () => {
  const f = fixture(); await act(async () => {}); f.profile({ role: 'student' });
  const feed = f.feeds[0]; f.emit('Private update'); f.preference(false);
  expect(feed.stop).toHaveBeenCalled();
  f.emit('Late update', feed);
  expect(screen.queryByText('Private update')).toBeNull();
  expect(screen.queryByText('Late update')).toBeNull();
});

test('logout and backgrounding remove queued messages and unsubscribe', async () => {
  const f = fixture(); await act(async () => {}); f.profile({ role: 'student' });
  const feed = f.feeds[0]; f.emit('Private update'); f.app('background');
  expect(feed.stop).toHaveBeenCalled();
  expect(screen.queryByText('Private update')).toBeNull();
  f.emit('Late private update', feed);
  expect(screen.queryByText('Late private update')).toBeNull();
  f.app('active'); await act(async () => {}); f.profile({ role: 'student' }); f.emit('Restored update');
  f.logout();
  expect(screen.queryByText('Restored update')).toBeNull();
});

test('staff and password-change accounts never start notification feeds', async () => {
  const f = fixture(); await act(async () => {});
  f.profile({ role: 'coordinator' }); f.profile({ role: 'student', passwordChangeRequired: true });
  expect(f.feeds).toHaveLength(0);
});
